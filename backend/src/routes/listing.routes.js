const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Jimp = require('jimp');
const { processImages } = require('../services/ai.service');
const ebayService = require('../services/ebay.service');
const db = require('../db/database');

const router = express.Router();

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
router.post('/process', upload.array('images', 10), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No images uploaded' });
    }

    // Crop all uploaded files to square and overwrite them
    for (const file of files) {
      const image = await Jimp.read(file.path);
      await image.cover(1000, 1000).writeAsync(file.path);
    }

    const filePaths = files.map(file => file.path);
    const imagesJson = JSON.stringify(filePaths);

    // Save item details draft with 'processing' status and respond immediately
    db.run(
      `INSERT INTO items (
        title, status, images
      ) VALUES (?, ?, ?)`,
      ['AI Analysis in progress...', 'processing', imagesJson],
      function(err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Database error' });
        }
        const newItemId = this.lastID;

        // Respond immediately so user can continue using the app
        res.json({ id: newItemId, status: 'processing', title: 'AI Analysis in progress...', images: filePaths });

        // Run the AI analysis in the background
        processImages(filePaths)
          .then((aiResult) => {
            db.run(
              `UPDATE items SET 
                title = ?, condition = ?, material = ?, measurements_note = ?, 
                style_details = ?, country_of_origin = ?, age = ?, retail_price = ?, 
                etsy_tags = ?, brand = ?, weight = ?, inventory_code = ?, category = ?, 
                status = 'draft'
               WHERE id = ?`,
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
                aiResult.weight,
                aiResult.inventory_code || `LM-${newItemId}`,
                aiResult.category,
                newItemId
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
              "UPDATE items SET title = 'AI Processing Failed. Please try again.', status = 'error' WHERE id = ?",
              [newItemId]
            );
          });
      }
    );

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Processing failed' });
  }
});

// Get all items
router.get('/items', (req, res) => {
  db.all('SELECT * FROM items ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// List an item on eBay
router.post('/items/:id/ebay', async (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM items WHERE id = ?', [id], async (err, item) => {
    if (err || !item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    try {
      const result = await ebayService.createDraft(item);
      if (result.status === 'success') {
        db.run('UPDATE items SET status = ? WHERE id = ?', ['listed', id]);
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
});

// Route to append additional images to an existing item
router.post('/items/:id/images', upload.array('images', 10), async (req, res) => {
  try {
    const { id } = req.params;
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No images uploaded' });
    }

    // Crop all uploaded files to square and overwrite them
    for (const file of files) {
      const image = await Jimp.read(file.path);
      await image.cover(1000, 1000).writeAsync(file.path);
    }

    const newFilePaths = files.map(file => file.path);

    // Retrieve existing images from DB
    db.get('SELECT images FROM items WHERE id = ?', [id], (err, item) => {
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
        'UPDATE items SET images = ? WHERE id = ?',
        [JSON.stringify(updatedImages), id],
        function(err) {
          if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
          }
          res.json({ id: parseInt(id), images: updatedImages });
        }
      );
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Appending images failed' });
  }
});

// Delete a local item
router.delete('/items/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM items WHERE id = ?', [id], function(err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to delete item from database' });
    }
    res.json({ status: 'success', message: 'Item deleted successfully' });
  });
});

module.exports = router;
