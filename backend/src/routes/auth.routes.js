const express = require('express');
const axios = require('axios');
const ebayService = require('../services/ebay.service');
const db = require('../db/database');
const router = express.Router();

// Get live inventory from eBay
router.get('/ebay/inventory', async (req, res) => {
  try {
    const inventory = await ebayService.getInventoryItems();
    res.json(inventory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific item details
router.get('/ebay/inventory/:sku', async (req, res) => {
  try {
    const item = await ebayService.getInventoryItem(req.params.sku);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update specific item
router.put('/ebay/inventory/:sku', async (req, res) => {
  try {
    const result = await ebayService.updateInventoryItem(req.params.sku, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete specific item
router.delete('/ebay/inventory/:sku', async (req, res) => {
  try {
    const sku = req.params.sku;
    if (sku.startsWith('TRADITIONAL-')) {
      const listingId = sku.replace('TRADITIONAL-', '');
      const result = await ebayService.endTraditionalListing(listingId);
      res.json(result);
    } else {
      const result = await ebayService.deleteInventoryItem(sku);
      res.json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get the eBay authorization URL
router.get('/ebay/login', (req, res) => {
  const url = ebayService.getAuthUrl();
  res.json({ url });
});

// Callback for eBay OAuth
router.get('/listings/ebay/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('No code provided');
  }

  try {
    const tokens = await ebayService.exchangeCodeForToken(code);
    // In a real app, we would save these tokens to a secure session or DB
    // For local dev, we'll keep them in the service memory for now
    res.send('eBay Authentication Successful! You can close this window.');
  } catch (error) {
    console.error('eBay Callback Error:', error);
    res.status(500).send('Authentication failed');
  }
});

// Get all settings
router.get('/settings', (req, res) => {
  db.all('SELECT key, value FROM settings', [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to retrieve settings' });
    }
    const settings = {};
    rows.forEach(row => {
      settings[row.key] = row.value;
    });
    res.json(settings);
  });
});

// Update settings
router.post('/settings', (req, res) => {
  const updates = req.body;
  const keys = Object.keys(updates);
  
  if (keys.length === 0) {
    return res.status(400).json({ error: 'No settings updates provided' });
  }

  let completed = 0;
  let hasError = false;

  keys.forEach(key => {
    db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?',
      [key, updates[key], updates[key]],
      async function(err) {
        if (err) {
          console.error(err);
          hasError = true;
        }
        
        completed++;
        if (completed === keys.length) {
          if (hasError) {
            return res.status(500).json({ error: 'Failed to update some settings' });
          }
          
          try {
            await ebayService.refreshConfig();
            res.json({ status: 'success', message: 'Settings updated successfully' });
          } catch (e) {
            res.status(500).json({ error: 'Settings saved but failed to reload eBay config' });
          }
        }
      }
    );
  });
});

// Submit new feedback
router.post('/feedback', (req, res) => {
  const { message, rating } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Feedback message is required' });
  }

  db.run(
    'INSERT INTO feedback (message, rating) VALUES (?, ?)',
    [message, rating || null],
    async function(err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error saving feedback' });
      }

      const feedbackId = this.lastID;

      // Automatically create a GitHub issue if GITHUB_TOKEN is configured
      if (process.env.GITHUB_TOKEN) {
        try {
          const ratingSmileys = {
            1: '😡 Mad',
            2: '🙁 Sad',
            3: '😐 Meh',
            4: '🙂 Good',
            5: '😍 Love!'
          };
          const ratingLabel = rating ? ratingSmileys[rating] : 'N/A';
          const issueTitle = `[Wife Feedback #${feedbackId}] Rating: ${ratingLabel}`;
          
          await axios.post(
            'https://api.github.com/repos/fixyourprinter/marketmaven/issues',
            {
              title: issueTitle,
              body: `${message}\n\n---\n*Submitted via MarketMaven App Feedback Box (ID: #${feedbackId})*`
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'MarketMaven-App'
              }
            }
          );
          console.log(`Successfully created GitHub issue for feedback #${feedbackId}`);
        } catch (gitErr) {
          console.error('Failed to create GitHub issue:', gitErr.response?.data || gitErr.message);
        }
      }

      res.json({ id: feedbackId, status: 'success' });
    }
  );
});

// Retrieve all feedback
router.get('/feedback', (req, res) => {
  db.all('SELECT * FROM feedback ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error fetching feedback' });
    }
    res.json(rows);
  });
});

// Resolve feedback item
router.post('/feedback/:id/resolve', (req, res) => {
  const { id } = req.params;
  db.run(
    "UPDATE feedback SET status = 'resolved' WHERE id = ?",
    [id],
    function(err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error updating feedback' });
      }
      res.json({ status: 'success' });
    }
  );
});

// Delete feedback item
router.delete('/feedback/:id', (req, res) => {
  const { id } = req.params;
  db.run(
    'DELETE FROM feedback WHERE id = ?',
    [id],
    function(err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error deleting feedback' });
      }
      res.json({ status: 'success' });
    }
  );
});

module.exports = router;
