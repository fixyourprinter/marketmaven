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
      // 1. Create users table
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 2. Create ebay_cache table
      db.run(`CREATE TABLE IF NOT EXISTS ebay_cache (
        user_id INTEGER,
        listing_id TEXT,
        specifics TEXT,
        description TEXT,
        price TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, listing_id)
      )`);

      // 3. Create items table if not exists (base structure)
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

      // 4. Create feedback table if not exists (base structure)
      db.run(`CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT,
        rating INTEGER,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 5. Run migrations inside callbacks in a serialized way
      db.all("PRAGMA table_info(items)", (err, rows) => {
        if (err) {
          console.error("Error checking items table info:", err);
          return;
        }
        const existingColumns = rows.map(row => row.name);
        const requiredColumns = [
          ['condition', 'TEXT'],
          ['material', 'TEXT'],
          ['measurements_note', 'TEXT'],
          ['style_details', 'TEXT'],
          ['country_of_origin', 'TEXT'],
          ['age', 'TEXT'],
          ['retail_price', 'TEXT'],
          ['etsy_tags', 'TEXT'],
          ['user_id', 'INTEGER DEFAULT 1']
        ];

        requiredColumns.forEach(([colName, colType]) => {
          if (!existingColumns.includes(colName)) {
            console.log(`Migrating items: Adding column ${colName}...`);
            db.run(`ALTER TABLE items ADD COLUMN ${colName} ${colType}`);
          }
        });
      });

      db.all("PRAGMA table_info(feedback)", (err, rows) => {
        if (err) {
          console.error("Error checking feedback table info:", err);
          return;
        }
        const existingColumns = rows.map(row => row.name);
        if (!existingColumns.includes('user_id')) {
          console.log("Migrating feedback: Adding column user_id...");
          db.run("ALTER TABLE feedback ADD COLUMN user_id INTEGER DEFAULT 1");
        }
      });

      // Migrate settings to composite key schema if needed, then seed defaults
      db.all("PRAGMA table_info(settings)", (err, rows) => {
        if (err) {
          // Table doesn't exist yet (first run)
          console.log("Settings table does not exist. Creating new per-user settings table...");
          db.serialize(() => {
            db.run(`CREATE TABLE settings (
              user_id INTEGER,
              key TEXT,
              value TEXT,
              PRIMARY KEY (user_id, key)
            )`);
            db.run(`INSERT OR IGNORE INTO settings (user_id, key, value) VALUES (1, 'theme', 'dark'), (1, 'ebay_env', 'sandbox')`);
          });
        } else if (rows && rows.length > 0) {
          const colNames = rows.map(r => r.name);
          if (!colNames.includes('user_id')) {
            console.log("Migrating settings: Migrating to composite key with user_id...");
            db.serialize(() => {
              db.run(`CREATE TABLE settings_new (
                user_id INTEGER,
                key TEXT,
                value TEXT,
                PRIMARY KEY (user_id, key)
              )`);
              
              db.run(`INSERT OR IGNORE INTO settings_new (user_id, key, value)
                      SELECT 1, key, value FROM settings`);
                      
              db.run(`DROP TABLE settings`);
              db.run(`ALTER TABLE settings_new RENAME TO settings`);
              db.run(`INSERT OR IGNORE INTO settings (user_id, key, value) VALUES (1, 'theme', 'dark'), (1, 'ebay_env', 'sandbox')`);
              console.log("SUCCESS: settings table migrated to per-user schema.");
            });
          } else {
            // Already has user_id, just insert defaults
            db.run(`INSERT OR IGNORE INTO settings (user_id, key, value) VALUES (1, 'theme', 'dark'), (1, 'ebay_env', 'sandbox')`);
          }
        } else {
          // Table exists but is empty or some other case
          db.serialize(() => {
            db.run(`DROP TABLE IF EXISTS settings`);
            db.run(`CREATE TABLE settings (
              user_id INTEGER,
              key TEXT,
              value TEXT,
              PRIMARY KEY (user_id, key)
            )`);
            db.run(`INSERT OR IGNORE INTO settings (user_id, key, value) VALUES (1, 'theme', 'dark'), (1, 'ebay_env', 'sandbox')`);
          });
        }
      });
    });
  }
});

module.exports = db;
