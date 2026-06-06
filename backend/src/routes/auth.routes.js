const express = require('express');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ebayService = require('../services/ebay.service');
const db = require('../db/database');
const authenticateUser = require('../middleware/auth.middleware');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'listing-helper-secret-key-12345';

// Setup Required check (checks if users table is empty)
router.get('/auth/setup-required', (req, res) => {
  db.get("SELECT COUNT(*) as count FROM users", [], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database check failed' });
    }
    res.json({ setupRequired: !row || row.count === 0 });
  });
});

// Register User
router.post('/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    db.get("SELECT COUNT(*) as count FROM users", [], async (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Database check failed' });
      }

      const isFirstUser = !row || row.count === 0;
      const role = isFirstUser ? 'admin' : 'user';

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      db.run(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        [username, passwordHash, role],
        function(insertErr) {
          if (insertErr) {
            if (insertErr.message.includes('UNIQUE constraint failed')) {
              return res.status(400).json({ error: 'Username already exists' });
            }
            return res.status(500).json({ error: 'Failed to create user' });
          }

          const userId = this.lastID;
          const token = jwt.sign({ userId, username, role }, JWT_SECRET, { expiresIn: '7d' });
          res.json({ status: 'success', token, user: { id: userId, username, role } });
        }
      );
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Login User
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database query failed' });
    }
    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ status: 'success', token, user: { id: user.id, username: user.username, role: user.role } });
  });
});

// Get Current User
router.get('/auth/me', authenticateUser, (req, res) => {
  db.get("SELECT id, username, role, created_at FROM users WHERE id = ?", [req.userId], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  });
});

// Get live inventory from eBay
router.get('/ebay/inventory', authenticateUser, async (req, res) => {
  try {
    const inventory = await ebayService.getInventoryItems(req.userId);
    res.json(inventory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get sales dashboard data
router.get('/ebay/sales-dashboard', authenticateUser, async (req, res) => {
  try {
    const dashboardData = await ebayService.getSalesDashboard(req.userId);
    res.json(dashboardData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific item details
router.get('/ebay/inventory/:sku', authenticateUser, async (req, res) => {
  try {
    const sku = req.params.sku;
    if (sku.startsWith('TRADITIONAL-')) {
      const listingId = sku.replace('TRADITIONAL-', '');
      const details = await ebayService.fetchExternalItemDetails(listingId, req.userId);
      res.json({
        price: details.price,
        description: details.description,
        specifics: details.specifics
      });
    } else {
      const item = await ebayService.getInventoryItem(sku, req.userId);
      res.json(item);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update specific item
router.put('/ebay/inventory/:sku', authenticateUser, async (req, res) => {
  try {
    const result = await ebayService.updateInventoryItem(req.params.sku, req.body, req.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete specific item
router.delete('/ebay/inventory/:sku', authenticateUser, async (req, res) => {
  try {
    const sku = req.params.sku;
    if (sku.startsWith('TRADITIONAL-')) {
      const listingId = sku.replace('TRADITIONAL-', '');
      const result = await ebayService.endTraditionalListing(listingId, req.userId);
      res.json(result);
    } else {
      const result = await ebayService.deleteInventoryItem(sku, req.userId);
      res.json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get the eBay authorization URL
router.get('/ebay/login', authenticateUser, async (req, res) => {
  try {
    const url = await ebayService.getAuthUrl(req.userId);
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Callback for eBay OAuth
router.get('/listings/ebay/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) {
    return res.status(400).send('No code provided');
  }

  const userId = parseInt(state, 10);
  if (!userId) {
    return res.status(400).send('No user context (state) provided by eBay redirect');
  }

  try {
    await ebayService.exchangeCodeForToken(code, userId);
    res.send('eBay Authentication Successful! You can close this window.');
  } catch (error) {
    console.error('eBay Callback Error:', error);
    res.status(500).send('Authentication failed');
  }
});

// Get all settings
router.get('/settings', authenticateUser, (req, res) => {
  db.all('SELECT key, value FROM settings WHERE user_id = ?', [req.userId], (err, rows) => {
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
router.post('/settings', authenticateUser, (req, res) => {
  const updates = req.body;
  const keys = Object.keys(updates);
  
  if (keys.length === 0) {
    return res.status(400).json({ error: 'No settings updates provided' });
  }

  let completed = 0;
  let hasError = false;

  keys.forEach(key => {
    db.run(
      'INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = ?',
      [req.userId, key, updates[key], updates[key]],
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
          res.json({ status: 'success', message: 'Settings updated successfully' });
        }
      }
    );
  });
});

// Submit new feedback
router.post('/feedback', authenticateUser, (req, res) => {
  const { message, rating } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Feedback message is required' });
  }

  db.run(
    'INSERT INTO feedback (message, rating, user_id) VALUES (?, ?, ?)',
    [message, rating || null, req.userId],
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
router.get('/feedback', authenticateUser, (req, res) => {
  db.all('SELECT * FROM feedback WHERE user_id = ? ORDER BY created_at DESC', [req.userId], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error fetching feedback' });
    }
    res.json(rows);
  });
});

// Resolve feedback item
router.post('/feedback/:id/resolve', authenticateUser, (req, res) => {
  const { id } = req.params;
  db.run(
    "UPDATE feedback SET status = 'resolved' WHERE id = ? AND user_id = ?",
    [id, req.userId],
    async function(err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error updating feedback' });
      }

      // Automatically close the issue on GitHub if GITHUB_TOKEN is configured
      if (process.env.GITHUB_TOKEN) {
        try {
          const repoOwner = 'fixyourprinter';
          const repoName = 'marketmaven';
          const token = process.env.GITHUB_TOKEN;
          
          const gitResponse = await axios.get(
            `https://api.github.com/repos/${repoOwner}/${repoName}/issues?state=open&per_page=100`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'MarketMaven-App'
              }
            }
          );
          
          const matchingIssues = gitResponse.data.filter(issue => 
            issue.title.startsWith(`[Wife Feedback #${id}]`)
          );
          
          for (const issue of matchingIssues) {
            const resolvedTitle = issue.title.includes('(✅ Resolved)') 
              ? issue.title 
              : `${issue.title} (✅ Resolved)`;
              
            await axios.patch(
              `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issue.number}`,
              {
                state: 'closed',
                title: resolvedTitle
              },
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: 'application/vnd.github+json',
                  'User-Agent': 'MarketMaven-App'
                }
              }
            );
            console.log(`Successfully closed GitHub issue #${issue.number} on resolve`);
          }
        } catch (gitErr) {
          console.error('Failed to close GitHub issue on resolve:', gitErr.response?.data || gitErr.message);
        }
      }

      res.json({ status: 'success' });
    }
  );
});

// Delete feedback item
router.delete('/feedback/:id', authenticateUser, (req, res) => {
  const { id } = req.params;
  db.run(
    'DELETE FROM feedback WHERE id = ? AND user_id = ?',
    [id, req.userId],
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
