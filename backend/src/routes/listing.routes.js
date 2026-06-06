const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Jimp = require('jimp');
const { processImages, extractAspectsFromText } = require('../services/ai.service');
const ebayService = require('../services/ebay.service');
const db = require('../db/database');
const authenticateUser = require('../middleware/auth.middleware');

const router = express.Router();

// Helper to delete local files on disk
function deleteItemImages(imagesJson) {
  if (!imagesJson) return;
  try {
    const filePaths = JSON.parse(imagesJson);
    if (Array.isArray(filePaths)) {
      for (const filePath of filePaths) {
        const resolvedPath = path.resolve(__dirname, '../../', filePath);
        fs.unlink(resolvedPath, (err) => {
          if (err) {
            if (err.code !== 'ENOENT') {
              console.error(`Failed to delete local file ${resolvedPath}:`, err.message);
            }
          } else {
            console.log(`Deleted local image asset: ${resolvedPath}`);
          }
        });
      }
    }
  } catch (e) {
    console.error('Error parsing images for deletion:', e.message);
  }
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

// Route to handle multiple image uploads and process them
router.post('/process', authenticateUser, upload.array('images', 10), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No images uploaded' });
    }

    const filePaths = files.map(file => file.path);
    const imagesJson = JSON.stringify(filePaths);

    // Save item details draft with 'processing' status and respond immediately
    db.run(
      `INSERT INTO items (
        title, status, images, user_id
      ) VALUES (?, ?, ?, ?)`,
      ['AI Analysis in progress...', 'processing', imagesJson, req.userId],
      function(err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Database error' });
        }
        const newItemId = this.lastID;

        // Respond immediately so user can continue using the app
        res.json({ id: newItemId, status: 'processing', title: 'AI Analysis in progress...', images: filePaths });

        // Run the background cropping and AI analysis
        setImmediate(async () => {
          try {
            console.log(`[Jimp] Starting background cropping for item #${newItemId}...`);
            // Crop all uploaded files to square in the background
            for (const file of files) {
              const image = await Jimp.read(file.path);
              await image.cover(1000, 1000).writeAsync(file.path);
            }
            console.log(`[Jimp] Background cropping completed for item #${newItemId}`);

            // Run AI analysis
            processImages(filePaths)
              .then((aiResult) => {
                db.run(
                  `UPDATE items SET 
                    title = ?, condition = ?, material = ?, measurements_note = ?, 
                    style_details = ?, country_of_origin = ?, age = ?, retail_price = ?, 
                    etsy_tags = ?, brand = ?, size = ?, weight = ?, inventory_code = ?, category = ?, 
                    status = 'draft'
                   WHERE id = ? AND user_id = ?`,
                  [
                    aiResult.title,
                    aiResult.condition,
                    aiResult.material,
                    aiResult.measurements_note,
                    aiResult.style_details,
                    aiResult.country_of_origin,
                    aiResult.age,
                    aiResult.retail_price,
                    aiResult.etsy_tags,
                    aiResult.brand,
                    aiResult.size,
                    aiResult.weight,
                    aiResult.inventory_code || `LM-${newItemId}`,
                    aiResult.category,
                    newItemId,
                    req.userId
                  ],
                  (updateErr) => {
                    if (updateErr) {
                      console.error(`Failed to update item #${newItemId} with AI results:`, updateErr.message);
                    } else {
                      console.log(`[AI] Background processing completed successfully for item #${newItemId}`);
                    }
                  }
                );
              })
              .catch((aiError) => {
                console.error(`[AI] Background processing failed for item #${newItemId}:`, aiError.message);
                db.run(
                  "UPDATE items SET title = 'AI Processing Failed. Please try again.', status = 'error' WHERE id = ? AND user_id = ?",
                  [newItemId, req.userId]
                );
              });

          } catch (cropErr) {
            console.error(`[Jimp] Background cropping failed for item #${newItemId}:`, cropErr.message);
            db.run(
              "UPDATE items SET title = 'Image cropping failed. Please try again.', status = 'error' WHERE id = ? AND user_id = ?",
              [newItemId, req.userId]
            );
          }
        });
      }
    );

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Processing failed' });
  }
});

// Get all items
router.get('/items', authenticateUser, (req, res) => {
  db.all('SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC', [req.userId], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// List an item on eBay
router.post('/items/:id/ebay', authenticateUser, async (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM items WHERE id = ? AND user_id = ?', [id, req.userId], async (err, item) => {
    if (err || !item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    try {
      const result = await ebayService.createDraft(item, req.userId);
      if (result.status === 'success') {
        db.run('UPDATE items SET status = ? WHERE id = ? AND user_id = ?', ['listed', id, req.userId], (updateErr) => {
          if (updateErr) {
            console.error('Failed to update status to listed:', updateErr.message);
          } else {
            console.log(`[eBay] Item #${id} listed successfully. Deleting local image assets...`);
            deleteItemImages(item.images);
          }
        });
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
});

// Route to append additional images to an existing item
router.post('/items/:id/images', authenticateUser, upload.array('images', 10), async (req, res) => {
  try {
    const { id } = req.params;
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No images uploaded' });
    }

    const newFilePaths = files.map(file => file.path);

    // Retrieve existing images from DB
    db.get('SELECT images FROM items WHERE id = ? AND user_id = ?', [id, req.userId], (err, item) => {
      if (err || !item) {
        return res.status(404).json({ error: 'Item not found' });
      }

      let currentImages = [];
      try {
        currentImages = JSON.parse(item.images || '[]');
      } catch (e) {}

      if (!Array.isArray(currentImages)) {
        currentImages = [];
      }

      const updatedImages = [...currentImages, ...newFilePaths];

      db.run(
        'UPDATE items SET images = ? WHERE id = ? AND user_id = ?',
        [JSON.stringify(updatedImages), id, req.userId],
        function(updateErr) {
          if (updateErr) {
            console.error(updateErr);
            return res.status(500).json({ error: 'Database error' });
          }
          
          // Respond immediately with the saved file paths so the frontend transitions instantly
          res.json({ id: parseInt(id), images: updatedImages });

          // Crop the newly uploaded detail images in the background so they are ready for eBay
          setImmediate(async () => {
            try {
              for (const file of files) {
                const image = await Jimp.read(file.path);
                await image.cover(1000, 1000).writeAsync(file.path);
              }
              console.log(`[Jimp] Successfully cropped ${files.length} detail images for item #${id} in background`);
            } catch (cropErr) {
              console.error(`[Jimp] Background detail images cropping failed for item #${id}:`, cropErr.message);
            }
          });
        }
      );
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Appending images failed' });
  }
});

// Delete a local item
router.delete('/items/:id', authenticateUser, (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT images FROM items WHERE id = ? AND user_id = ?', [id, req.userId], (err, item) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    db.run('DELETE FROM items WHERE id = ? AND user_id = ?', [id, req.userId], function(deleteErr) {
      if (deleteErr) {
        console.error(deleteErr);
        return res.status(500).json({ error: 'Failed to delete item from database' });
      }
      
      if (item && item.images) {
        deleteItemImages(item.images);
      }
      
      res.json({ status: 'success', message: 'Item deleted successfully' });
    });
  });
});

// Update a local item
router.put('/items/:id', authenticateUser, (req, res) => {
  const { id } = req.params;
  const {
    title, brand, size, weight, material, country_of_origin,
    age, retail_price, etsy_tags, style_details, category, condition,
    sourcing_location_id, purchase_price
  } = req.body;

  db.run(
    `UPDATE items SET 
      title = ?, brand = ?, size = ?, weight = ?, material = ?, 
      country_of_origin = ?, age = ?, retail_price = ?, etsy_tags = ?, 
      style_details = ?, category = ?, condition = ?,
      sourcing_location_id = ?, purchase_price = ?
     WHERE id = ? AND user_id = ?`,
    [
      title, brand, size, weight, material, country_of_origin,
      age, retail_price, etsy_tags, style_details, category, condition,
      sourcing_location_id || null, purchase_price || 0.0,
      id, req.userId
    ],
    function(err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ status: 'success', message: 'Item updated successfully' });
    }
  );
});

// Import details from eBay sold/active comp by Item ID (updates cache too)
router.post('/import-comps', authenticateUser, async (req, res) => {
  const { itemId, draftId } = req.body;
  if (!itemId) {
    return res.status(400).json({ error: 'Item ID is required' });
  }

  try {
    const details = await ebayService.fetchExternalItemDetails(itemId, req.userId);
    
    // Cache the specifics, description, and price in local db
    db.run(
      `INSERT INTO ebay_cache (user_id, listing_id, specifics, description, price, last_updated)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, listing_id) DO UPDATE SET
         specifics = excluded.specifics,
         description = excluded.description,
         price = excluded.price,
         last_updated = CURRENT_TIMESTAMP`,
      [
        req.userId,
        itemId,
        JSON.stringify(details.specifics || {}),
        details.description || '',
        details.price ? JSON.stringify(details.price) : null
      ],
      (err) => {
        if (err) {
          console.error('[Database] Cache write error:', err.message);
        }
      }
    );
    
    // Map specifics to local listing fields
    const specs = details.specifics || {};
    const brand = specs['Brand'] || '';
    const size = specs['Size'] || specs["Size (Women's)"] || specs["Size (Men's)"] || specs['Size Type'] || '';
    const material = specs['Material'] || '';
    const country = specs['Country/Region of Manufacture'] || '';
    const style = specs['Style'] || '';

    // Collect all other aspects as comma-separated style details
    const styleDetailList = [];
    if (style) styleDetailList.push(`Style: ${style}`);
    for (const [k, v] of Object.entries(specs)) {
      if (!['Brand', 'Size', "Size (Women's)", "Size (Men's)", 'Material', 'Country/Region of Manufacture', 'Style'].includes(k)) {
        styleDetailList.push(`${k}: ${v}`);
      }
    }
    const styleDetails = styleDetailList.join(', ');

    // If draftId is provided, update it in SQLite directly
    if (draftId) {
      db.run(
        `UPDATE items SET 
          brand = ?,
          size = ?,
          material = ?,
          country_of_origin = ?,
          style_details = ?
         WHERE id = ? AND user_id = ?`,
        [
          brand || '',
          size || '',
          material || '',
          country || '',
          styleDetails || '',
          draftId,
          req.userId
        ],
        function(updateErr) {
          if (updateErr) {
            console.error(updateErr);
            return res.status(500).json({ error: 'Failed to update draft with comp details' });
          }
          // Fetch the updated item and return it
          db.get('SELECT * FROM items WHERE id = ? AND user_id = ?', [draftId, req.userId], (err, row) => {
            if (err || !row) {
              return res.status(500).json({ error: 'Failed to retrieve updated item' });
            }
            res.json({ status: 'success', item: row });
          });
        }
      );
    } else {
      // Just return the parsed details
      res.json({
        brand,
        size,
        material,
        country_of_origin: country,
        style_details: styleDetails,
        description: details.description,
        specifics: details.specifics,
        price: details.price
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk extract aspects using AI from title and description
router.post('/ebay/inventory/bulk-repair-extract', authenticateUser, async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Items array is required' });
  }

  const results = [];
  console.log(`[ListingRoutes] bulk-repair-extract for ${items.length} items...`);

  for (const item of items) {
    const { listingId, title, description } = item;
    try {
      console.log(`[ListingRoutes] Extracting aspects for Item ID ${listingId}...`);
      const specifics = await extractAspectsFromText(title, description);
      results.push({ listingId, status: 'success', specifics });
    } catch (err) {
      console.error(`[ListingRoutes] Failed to extract aspects for item ${listingId}:`, err.message);
      results.push({ listingId, status: 'error', error: err.message });
    }
  }

  res.json({ results });
});

// Bulk revise traditional listings
router.post('/ebay/inventory/bulk-revise', authenticateUser, async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Items array is required' });
  }

  try {
    const results = await ebayService.bulkReviseTraditionalListings(items, req.userId);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
