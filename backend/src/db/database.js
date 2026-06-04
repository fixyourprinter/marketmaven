const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const dbPath = process.env.DATABASE_URL || 'db.sqlite';

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err);
  } else {
    console.log('Connected to SQLite database at', dbPath);
    
    db.serialize(() => {
      // 1. Initial table creation
      db.run(`CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        brand TEXT,
        size TEXT,
        weight TEXT,
        inventory_code TEXT,
        category TEXT,
        status TEXT DEFAULT 'draft',
        images TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE,
        value TEXT
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT,
        rating INTEGER,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'dark'), ('ebay_env', 'sandbox')`);

      // 2. Check for missing columns and add them one by one
      const requiredColumns = [
        ['condition', 'TEXT'],
        ['material', 'TEXT'],
        ['measurements_note', 'TEXT'],
        ['style_details', 'TEXT'],
        ['country_of_origin', 'TEXT'],
        ['age', 'TEXT'],
        ['retail_price', 'TEXT'],
        ['etsy_tags', 'TEXT']
      ];

      // Use PRAGMA to check what columns we already have
      db.all("PRAGMA table_info(items)", (err, rows) => {
        if (err) {
          console.error("Error checking table info:", err);
          return;
        }

        const existingColumns = rows.map(row => row.name);
        
        requiredColumns.forEach(([colName, colType]) => {
          if (!existingColumns.includes(colName)) {
            console.log(`Migrating: Adding column ${colName}...`);
            db.run(`ALTER TABLE items ADD COLUMN ${colName} ${colType}`, (err) => {
              if (err) {
                console.error(`FAILED to add column ${colName}:`, err.message);
              } else {
                console.log(`SUCCESS: Added column ${colName}`);
              }
            });
          }
        });
      });
    });
  }
});

module.exports = db;
