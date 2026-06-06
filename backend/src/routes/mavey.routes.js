const express = require('express');
const axios = require('axios');
const db = require('../db/database');
const authenticateUser = require('../middleware/auth.middleware');
const ebayService = require('../services/ebay.service');
const router = express.Router();
const telemetryService = require('../services/telemetry.service');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const VISION_MODEL = process.env.VISION_MODEL || 'llava';

function cleanTitleFromHtml(description) {
  if (!description) return 'eBay Listing';
  let text = description
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  
  const splitIdx = text.search(/<br|<div|<p|<ul|<li|<span/i);
  if (splitIdx !== -1) {
    text = text.substring(0, splitIdx);
  }
  
  text = text.replace(/<[^>]*>/g, '');
  return text.trim().substring(0, 80) || 'eBay Listing';
}

function cleanHtmlText(html) {
  if (!html) return '';
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

function parseOllamaJsonResponse(content) {
  let cleanContent = content.trim();
  
  // 1. Strip markdown code fences if present
  if (cleanContent.startsWith('```')) {
    const firstNewlineIdx = cleanContent.indexOf('\n');
    if (firstNewlineIdx !== -1) {
      cleanContent = cleanContent.substring(firstNewlineIdx + 1);
    }
    if (cleanContent.endsWith('```')) {
      cleanContent = cleanContent.substring(0, cleanContent.length - 3).trim();
    }
  }
  
  // 2. Try standard parse first
  try {
    return JSON.parse(cleanContent);
  } catch (err) {
    console.warn('[Mavey] Standard JSON.parse failed, attempting repair:', err.message);
  }

  // 3. Repair unescaped control chars / newlines inside string values
  try {
    let insideString = false;
    let escaped = false;
    let repaired = '';
    
    for (let i = 0; i < cleanContent.length; i++) {
      const char = cleanContent[i];
      if (char === '"' && !escaped) {
        insideString = !insideString;
      }
      
      if (insideString) {
        if (char === '\n') {
          repaired += '\\n';
        } else if (char === '\r') {
          repaired += '\\r';
        } else if (char === '\t') {
          repaired += '\\t';
        } else {
          repaired += char;
        }
      } else {
        repaired += char;
      }
      
      if (char === '\\' && !escaped) {
        escaped = true;
      } else {
        escaped = false;
      }
    }
    
    return JSON.parse(repaired);
  } catch (err) {
    console.warn('[Mavey] Repaired JSON parsing also failed:', err.message);
  }

  // 4. Fallback: Extract response text via regex if JSON was truncated/cut off
  try {
    const responseMatch = cleanContent.match(/"response"\s*:\s*"((?:[^"\\]|\\.)*)/);
    if (responseMatch && responseMatch[1]) {
      let extractedResponse = responseMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      
      if (extractedResponse.endsWith('\\')) {
        extractedResponse = extractedResponse.substring(0, extractedResponse.length - 1);
      }
      
      return {
        response: extractedResponse + '\n\n*(Note: Mavey\'s JSON output was slightly truncated, but I recovered the response text successfully)*',
        action: null,
        actionParams: {}
      };
    }
  } catch (fallbackErr) {
    console.error('[Mavey] Regex fallback extraction failed:', fallbackErr.message);
  }

  throw new Error('Could not parse or recover JSON from Ollama response');
}

// GET all conversations for Mavey
router.get('/mavey/conversations', authenticateUser, (req, res) => {
  db.all(
    "SELECT * FROM mavey_conversations WHERE user_id = ? ORDER BY created_at DESC",
    [req.userId],
    (err, rows) => {
      if (err) {
        console.error('[Mavey] Error fetching conversations:', err);
        return res.status(500).json({ error: 'Failed to retrieve conversations' });
      }
      res.json(rows);
    }
  );
});

// POST start a new conversation
router.post('/mavey/conversations', authenticateUser, (req, res) => {
  const { title } = req.body;
  db.run(
    "INSERT INTO mavey_conversations (user_id, title) VALUES (?, ?)",
    [req.userId, title || 'New Chat'],
    function(err) {
      if (err) {
        console.error('[Mavey] Error creating conversation:', err);
        return res.status(500).json({ error: 'Failed to create conversation' });
      }
      res.json({ id: this.lastID, user_id: req.userId, title: title || 'New Chat' });
    }
  );
});

// DELETE a conversation and its messages
router.delete('/mavey/conversations/:id', authenticateUser, (req, res) => {
  const { id } = req.params;
  db.serialize(() => {
    db.run("DELETE FROM mavey_messages WHERE conversation_id = ?", [id]);
    db.run(
      "DELETE FROM mavey_conversations WHERE id = ? AND user_id = ?",
      [id, req.userId],
      function(err) {
        if (err) {
          console.error('[Mavey] Error deleting conversation:', err);
          return res.status(500).json({ error: 'Failed to delete conversation' });
        }
        res.json({ status: 'success' });
      }
    );
  });
});

// GET all messages in a conversation
router.get('/mavey/conversations/:id/messages', authenticateUser, (req, res) => {
  const { id } = req.params;
  db.all(
    "SELECT * FROM mavey_messages WHERE conversation_id = ? ORDER BY created_at ASC",
    [id],
    (err, rows) => {
      if (err) {
        console.error('[Mavey] Error fetching messages:', err);
        return res.status(500).json({ error: 'Failed to retrieve messages' });
      }
      res.json(rows);
    }
  );
});

// POST send message and get completion from Mavey
router.post('/mavey/chat', authenticateUser, async (req, res) => {
  const { conversationId, message } = req.body;
  if (!conversationId || !message) {
    return res.status(400).json({ error: 'conversationId and message are required' });
  }

  try {
    // 1. Save user's message
    await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO mavey_messages (conversation_id, sender, content) VALUES (?, 'user', ?)",
        [conversationId, message],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // 2. Fetch recent conversation history
    const history = await new Promise((resolve) => {
      db.all(
        "SELECT sender, content FROM mavey_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 16",
        [conversationId],
        (err, rows) => {
          resolve(rows || []);
        }
      );
    });

    // Map history to Ollama message format (excluding the last message which we append as current user input)
    const historyMessages = history.slice(0, -1).map(h => ({
      role: h.sender === 'user' ? 'user' : 'assistant',
      content: h.content
    }));

    // Conditional context values are loaded dynamically below
    
    const lowerMessage = message.toLowerCase();
    
    // Detect intents to load context conditionally
    const isOptimizeIntent = lowerMessage.includes('unsold') || lowerMessage.includes('improve') || lowerMessage.includes('optimize') || lowerMessage.includes('suggest') || lowerMessage.includes('title') || lowerMessage.includes('description');
    const isSalesIntent = lowerMessage.includes('sales') || lowerMessage.includes('sold') || lowerMessage.includes('revenue') || lowerMessage.includes('aov') || lowerMessage.includes('earning') || lowerMessage.includes('analytics') || lowerMessage.includes('pick list');
    const isSettingsIntent = lowerMessage.includes('ebay') || lowerMessage.includes('connect') || lowerMessage.includes('token') || lowerMessage.includes('settings');
    const isLabelIntent = lowerMessage.includes('label') || lowerMessage.includes('tag');
    
    const isGenericOptimize = lowerMessage.includes('suggest improvements') || lowerMessage.includes('oldest unsold') || lowerMessage.includes('oldest unsold items');
    const isGenericSales = lowerMessage.includes('sales') || lowerMessage.includes('sales dashboard') || lowerMessage.includes('pick list');
    const isGeneralCommand = isGenericOptimize || isGenericSales || isSettingsIntent || isLabelIntent || lowerMessage.trim().split(' ').length < 2;

    // 3. Fetch Context: User Settings (conditional)
    const userSettings = isSettingsIntent ? await new Promise((resolve) => {
      db.all("SELECT key, value FROM settings WHERE user_id = ?", [req.userId], (err, rows) => {
        const settings = {};
        if (rows) {
          rows.forEach(r => settings[r.key] = r.value);
        }
        resolve(settings);
      });
    }) : {};

    // 4. Fetch Context: Labels (conditional)
    const userLabels = isLabelIntent ? await new Promise((resolve) => {
      db.all("SELECT * FROM labels WHERE user_id = ?", [req.userId], (err, rows) => {
        resolve(rows || []);
      });
    }) : [];

    // 5. Fetch Context: Local Sourced Items (using keyword filter based on user message, conditional)
    let searchRows = [];
    if (!isGeneralCommand) {
      const words = message.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(w => w.length > 2 && w !== 'item' && w !== 'items' && w !== 'show' && w !== 'find' && w !== 'search');
      if (words.length > 0) {
        const likeClauses = words.map(() => "(title LIKE ? OR brand LIKE ? OR inventory_code LIKE ?)").join(' OR ');
        const params = [req.userId];
        words.forEach(w => {
          params.push(`%${w}%`);
          params.push(`%${w}%`);
          params.push(`%${w}%`);
        });
        const query = `SELECT id, title, brand, size, inventory_code, status, retail_price FROM items WHERE user_id = ? AND (${likeClauses}) LIMIT 5`;
        searchRows = await new Promise((resolve) => {
          db.all(query, params, (err, rows) => {
            resolve(rows || []);
          });
        });
      }
    }

    // 5.5. Fetch Unsold Items from Local Database & eBay Inventory (conditional)
    let oldestUnsold = [];
    if (isOptimizeIntent) {
      const localUnsold = await new Promise((resolve) => {
        const query = "SELECT id, title, brand, size, inventory_code, category, status, retail_price, purchase_price, condition, style_details, created_at FROM items WHERE user_id = ? AND status != 'sold' ORDER BY created_at ASC LIMIT 5";
        db.all(query, [req.userId], (err, rows) => {
          resolve(rows || []);
        });
      });

      const mappedLocal = localUnsold.map(item => ({
        id: item.id,
        sku: item.inventory_code || '',
        title: item.title || '',
        brand: item.brand || '',
        size: item.size || '',
        price: item.retail_price || '',
        status: item.status || 'draft',
        condition: item.condition || '',
        style_details: cleanHtmlText(item.style_details || '').substring(0, 300),
        created_at: item.created_at,
        source: 'local'
      }));

      let ebayInventory = [];
      try {
        const ebayInv = await ebayService.getInventoryItems(req.userId);
        if (ebayInv && ebayInv.inventoryItems) {
          ebayInventory = ebayInv.inventoryItems.map(item => ({
            id: item.listingId || item.sku,
            sku: item.sku || '',
            title: cleanTitleFromHtml(item.product?.title || ''),
            brand: item.product?.aspects?.Brand?.[0] || '',
            size: item.product?.aspects?.Size?.[0] || '',
            price: item.price?.value || '',
            status: item.status || 'active',
            condition: item.condition || '',
            style_details: cleanHtmlText(item.product?.description || '').substring(0, 300),
            created_at: item.listingStartDate || new Date().toISOString(),
            source: 'ebay'
          }));
        }
      } catch (e) {
        console.log('[Mavey] Failed to fetch eBay inventory, falling back to cache:', e.message);
        
        const cachedEbay = await new Promise((resolve) => {
          const query = "SELECT * FROM ebay_cache WHERE user_id = ?";
          db.all(query, [req.userId], (err, rows) => {
            resolve(rows || []);
          });
        });
        
        ebayInventory = cachedEbay.map(r => {
          let priceVal = '';
          try { if (r.price) priceVal = JSON.parse(r.price).value || ''; } catch (e) {}
          let specs = {};
          try { if (r.specifics) specs = JSON.parse(r.specifics); } catch (e) {}
          
          return {
            id: r.listing_id,
            sku: r.listing_id,
            title: cleanTitleFromHtml(r.description),
            brand: specs.Brand || '',
            size: specs.Size || '',
            price: priceVal,
            status: 'active',
            condition: specs.Condition || '',
            style_details: cleanHtmlText(r.description).substring(0, 300),
            created_at: r.last_updated,
            source: 'ebay_cache'
          };
        });
      }

      const allUnsold = [...mappedLocal, ...ebayInventory];
      oldestUnsold = allUnsold.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).slice(0, 5);
    }

    // 5.6. Fetch Context: Recently Sold Items (conditional)
    const recentlySold = isSalesIntent ? await new Promise((resolve) => {
      const query = "SELECT id, title, brand, size, inventory_code, status, retail_price FROM items WHERE user_id = ? AND status = 'sold' ORDER BY created_at DESC LIMIT 5";
      db.all(query, [req.userId], (err, rows) => {
        resolve(rows || []);
      });
    }) : [];

    // 6. Fetch Context: Sales Dashboard overview (conditional)
    const salesStats = isSalesIntent ? await new Promise((resolve) => {
      const query = `SELECT 
             COUNT(id) as total_items,
             SUM(case when status='draft' then 1 else 0 end) as drafts,
             SUM(case when status='listed' then 1 else 0 end) as listed,
             SUM(case when status='sold' then 1 else 0 end) as sold,
             SUM(purchase_price) as total_spend
           FROM items WHERE user_id = ?`;
      db.get(query, [req.userId], (err, row) => {
        resolve(row || { total_items: 0, drafts: 0, listed: 0, sold: 0, total_spend: 0 });
      });
    }) : { total_items: 0, drafts: 0, listed: 0, sold: 0, total_spend: 0 };

    // 7. Compile System Prompt with full context
    const systemPrompt = `You are Mavey, the helpful, intelligent, friendly AI assistant for MarketMaven (the reseller smart assistant).
You help users manage their resell inventory, analyze sales, troubleshoot connections, and take actions on their behalf.

MarketMaven Features:
- Dashboard (/): View drafts and active items.
- Sales Dashboard (/sales): Unified revenue, AOV, active listings count, and recent sales.
- eBay Inventory (/ebay): Sync, update specifics, end listings.
- Sourcing Route (/prospecting): Saturday route builder, TSP nearest-neighbor route optimizer, Craigslist/FB Marketplace discover, visual comp search tags helper.
- Admin Console (/admin): User directory, resolve feedbacks, toggle public self-signup.

Current User Context:
- User Settings: ${JSON.stringify(userSettings)}
- Available Labels: ${JSON.stringify(userLabels)}
- Recent Sourced Items (Keyword Matches): ${JSON.stringify(searchRows)}
- Oldest Unsold Items (Drafts/Listed): ${JSON.stringify(oldestUnsold)}
- Recently Sold Items: ${JSON.stringify(recentlySold)}
- Sourced Items Count & Sales Overview: ${JSON.stringify(salesStats)}

Action Capabilities:
If the user asks you to modify items, add labels, edit attributes, or favorite items, you MUST return the corresponding action and actionParams in your JSON.

User Intent Guidance:
- If the user says something like "Apply improvements to item #ID: title: \"...\", price: \"...\"":
  1. You MUST set the JSON 'action' to 'EDIT_ITEM'.
  2. You MUST set 'actionParams' with the exact parameters: 'itemId' (integer/string from ID), 'title' (string), and 'price' (string).
  3. You MUST respond with a friendly message confirming that you have applied these edits to the item.
  Example JSON output:
  {
    "response": "I have successfully applied the proposed edits (optimized title and price) to item #4.",
    "action": "EDIT_ITEM",
    "actionParams": {
      "itemId": 4,
      "title": "Levi 501 Blue Cotton Jeans 32",
      "price": "45.00"
    }
  }

Optimization and Presentation Guidance:
When suggesting improvements for items (especially oldest unsold items):
1. Analyze their current title, brand, category, style details, and price from your context.
2. For each item, formulate:
   - **Suggested Title**: A highly optimized title. Standard: Brand + Category/Style + Color + Material + Size + Style Keywords (under 80 characters).
   - **Proposed Description (Aspects)**: Break it down into clear aspects: Brand, Size, Material, Style, Pattern, etc.
   - **Keywords**: Bullet points of relevant SEO keywords.
3. Formulate the response text using this exact structure to match Otto's premium styling:
   
   I've identified your oldest unsold items. To help them move, I've proposed SEO-optimized titles and descriptions.
   
   ### Proposed Improvements (Batch 1)
   
   1. **[Current Title of First Item]**
      - **Suggested Title**: [Show optimized title of first item]
      - **Description Aspects**: Brand: [Brand], Size: [Size], Color: [Color], Material: [Material], Style: [Style]
      - **Keywords**: [List of comma-separated SEO keywords here]
      - [Apply Edits to Item #ID1](action:apply?itemId=ID1&title=Suggested Title 1&price=Price1)

   2. **[Current Title of Second Item]**
      - **Suggested Title**: [Show optimized title of second item]
      - **Description Aspects**: Brand: [Brand], Size: [Size], Color: [Color], Material: [Material], Style: [Style]
      - **Keywords**: [List of comma-separated SEO keywords here]
      - [Apply Edits to Item #ID2](action:apply?itemId=ID2&title=Suggested Title 2&price=Price2)

   CRITICAL RULES:
   - Number the items sequentially (1., 2., 3., 4., 5.). Do NOT repeat "1." for every item. Use the template structure above to increment the sequence.
   - For the [Apply Edits to Item #ID](action:apply?...) link:
     - Replace ID with the actual item ID.
     - Replace Suggested Title and Price with the actual values.
     - Do NOT URL-encode the parameters in the query string. Write spaces normally (e.g. title=Levi 501 Jeans). The frontend will handle parsing raw spaces directly.
     - Example: [Apply Edits to Item #4](action:apply?itemId=4&title=Levi 501 Blue Cotton Jeans 32&price=45.00)

   4. Add a **Next Steps** section at the bottom of the response:
      ### Next Steps
      - **Review and Approve**: You can click the **[Apply Edits]** button next to each item to push the optimized details to your listings immediately.
      - **Pricing Check**: Compare your prices to current eBay comps to see if alignments will help sell faster.
      
   5. Add a **Sources** section:
      ### Sources
      - [Creating and Editing Items](action:help_edit)
      - [Search, Sort, and Filter](action:help_search)

   6. ACTION OUTPUT RULE:
      - When recommending or suggesting improvements for items, you are ONLY presenting suggestions in the 'response' text. You MUST set the JSON 'action' to null and 'actionParams' to {} (do not output EDIT_ITEM or itemId here). Only set 'action' to 'EDIT_ITEM' when the user explicitly asks you to apply/edit the item, or says 'Apply improvements to item #ID...'.

Empty Inventory Warning:
If the 'Recent Sourced Items', 'Oldest Unsold Items', and 'Recently Sold Items' are all empty (or contain 0 items), you MUST inform the user that their MarketMaven inventory is empty. Advise them to upload some drafts in the Dashboard or sync their active items in the eBay Inventory section first, so that you can retrieve their items and suggest optimizations.

You must respond ONLY with a JSON object strictly matching this format:
{
  "response": "Your structured markdown response text here following the layout above. Make sure to output the [Apply Edits to Item #ID](action:apply?...) links so the user can easily execute them.",
  "action": "CREATE_LABEL | ADD_LABEL_TO_ITEM | FAVORITE_ITEM | UPDATE_PRIVATE_NOTES | EDIT_ITEM | EDIT_CATEGORIES_ATTRIBUTES | null",
  "actionParams": {
    // for CREATE_LABEL: { "name": "label name", "color": "hex color e.g. #3b82f6" }
    // for ADD_LABEL_TO_ITEM: { "itemId": 123, "labelId": 456 }
    // for FAVORITE_ITEM: { "itemId": 123, "isFavorite": 1 or 0 }
    // for UPDATE_PRIVATE_NOTES: { "itemId": 123, "notes": "private notes text" }
    // for EDIT_ITEM: { "itemId": 123, "title": "new title", "price": "e.g. 29.99", "purchasePrice": 5.50, "quantity": 1, "sku": "LM-001", "condition": "New", "conditionDescription": "NWT" }
    // for EDIT_CATEGORIES_ATTRIBUTES: { "itemId": 123, "category": "Jeans", "attributes": "Closure: Zip, Fit: Skinny" }
  }
}`;

    // 8. Invoke Ollama Local LLM in JSON mode
    console.log(`[Mavey] Requesting completion from Ollama: "${VISION_MODEL}"`);
    const startTime = Date.now();
    let ollamaResponse;
    try {
      ollamaResponse = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model: VISION_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...historyMessages,
          { role: 'user', content: message }
        ],
        stream: false,
        format: 'json',
        options: {
          num_ctx: 3072,
          num_predict: 2048,
          temperature: 0.2
        }
      }, {
        timeout: 120000 // 2 min timeout
      });

      const durationMs = Date.now() - startTime;
      const promptTokens = ollamaResponse.data?.prompt_eval_count || 0;
      const evalTokens = ollamaResponse.data?.eval_count || 0;
      telemetryService.recordOllamaRequest(VISION_MODEL, 'Mavey Chat', promptTokens, evalTokens, durationMs, true);
    } catch (err) {
      const durationMs = Date.now() - startTime;
      telemetryService.recordOllamaRequest(VISION_MODEL, 'Mavey Chat', 0, 0, durationMs, false);
      throw err;
    }

    const parsed = parseOllamaJsonResponse(ollamaResponse.data.message.content);
    let finalResponse = parsed.response || "I couldn't process that request.";
    let actionLog = null;

    // 9. Execute Action on Behalf of User
    if (parsed.action && parsed.action !== 'null') {
      const action = parsed.action;
      const params = parsed.actionParams || {};
      
      console.log(`[Mavey] Executing action: "${action}" with params:`, params);

      try {
        if (action === 'CREATE_LABEL' && params.name) {
          const color = params.color || '#3b82f6';
          const newLabelId = await new Promise((resolve, reject) => {
            db.run(
              "INSERT INTO labels (user_id, name, color) VALUES (?, ?, ?)",
              [req.userId, params.name, color],
              function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
              }
            );
          });
          actionLog = `Created label "${params.name}" (ID: ${newLabelId})`;
        } 
        else if (action === 'ADD_LABEL_TO_ITEM' && params.itemId && params.labelId) {
          await new Promise((resolve, reject) => {
            db.run(
              "INSERT OR IGNORE INTO item_labels (item_id, label_id) VALUES (?, ?)",
              [params.itemId, params.labelId],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
          actionLog = `Added label #${params.labelId} to item #${params.itemId}`;
        }
        else if (action === 'FAVORITE_ITEM' && params.itemId) {
          const isFav = params.isFavorite ? 1 : 0;
          await new Promise((resolve, reject) => {
            db.run(
              "UPDATE items SET is_favorite = ? WHERE id = ? AND user_id = ?",
              [isFav, params.itemId, req.userId],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
          actionLog = `${isFav ? 'Favorited' : 'Unfavorited'} item #${params.itemId}`;
        }
        else if (action === 'UPDATE_PRIVATE_NOTES' && params.itemId && params.notes !== undefined) {
          await new Promise((resolve, reject) => {
            db.run(
              "UPDATE items SET private_notes = ? WHERE id = ? AND user_id = ?",
              [params.notes, params.itemId, req.userId],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
          actionLog = `Updated private notes for item #${params.itemId}`;
        }
        else if (action === 'EDIT_ITEM' && params.itemId) {
          const fields = [];
          const queryParams = [];
          
          if (params.title !== undefined) { fields.push('title = ?'); queryParams.push(params.title); }
          if (params.description !== undefined) { fields.push('style_details = ?'); queryParams.push(params.description); }
          if (params.price !== undefined) { fields.push('retail_price = ?'); queryParams.push(params.price); }
          if (params.purchasePrice !== undefined) { fields.push('purchase_price = ?'); queryParams.push(params.purchasePrice); }
          if (params.quantity !== undefined) { fields.push('quantity = ?'); queryParams.push(params.quantity); }
          if (params.sku !== undefined) { fields.push('inventory_code = ?'); queryParams.push(params.sku); }
          if (params.condition !== undefined) { fields.push('condition = ?'); queryParams.push(params.condition); }
          if (params.conditionDescription !== undefined) { fields.push('condition_description = ?'); queryParams.push(params.conditionDescription); }
          
          if (fields.length > 0) {
            queryParams.push(params.itemId, req.userId);
            await new Promise((resolve, reject) => {
              db.run(
                `UPDATE items SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
                queryParams,
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
            actionLog = `Updated details for item #${params.itemId}`;
          }
        }
        else if (action === 'EDIT_CATEGORIES_ATTRIBUTES' && params.itemId) {
          await new Promise((resolve, reject) => {
            db.run(
              "UPDATE items SET category = ?, style_details = ? WHERE id = ? AND user_id = ?",
              [params.category || '', params.attributes || '', params.itemId, req.userId],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
          actionLog = `Updated category and aspects for item #${params.itemId}`;
        }

        if (actionLog) {
          finalResponse += `\n\n*(Mavey executed action: ${actionLog})*`;
        }
      } catch (actErr) {
        console.error('[Mavey] Action execution failed:', actErr);
        finalResponse += `\n\n*(Error: I tried to take action but the database write failed)*`;
      }
    }

    // 10. Save Mavey's response message
    await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO mavey_messages (conversation_id, sender, content) VALUES (?, 'mavey', ?)",
        [conversationId, finalResponse],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({
      message: finalResponse,
      actionPerformed: actionLog
    });

  } catch (error) {
    console.error('[Mavey] Chat error:', error);
    res.status(500).json({ error: error.message || 'Mavey AI processing failed' });
  }
});

module.exports = router;
