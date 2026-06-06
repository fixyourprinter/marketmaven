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

      // 4.5. Create prospect_locations table
      db.run(`CREATE TABLE IF NOT EXISTS prospect_locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT,
        type TEXT,
        address TEXT,
        latitude REAL,
        longitude REAL,
        notes TEXT,
        day_of_week TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Seed default locations
      db.get("SELECT COUNT(*) as count FROM prospect_locations", [], (err, row) => {
        if (!err && row && row.count === 0) {
          console.log("Seeding default prospect locations...");
          const stmt = db.prepare(`INSERT INTO prospect_locations (user_id, name, type, address, latitude, longitude, notes, day_of_week) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
          
          const defaults = [
            [3, 'Goodwill Store', 'thrift', '845 Blossom Hill Rd, San Jose, CA 95123', 37.248, -121.859, 'Great for Talbots and LOFT dresses. Go early on Wednesdays for tag sales.', 'Everyday'],
            [4, 'Goodwill Store', 'thrift', '845 Blossom Hill Rd, San Jose, CA 95123', 37.248, -121.859, 'Great for Talbots and LOFT dresses. Go early on Wednesdays for tag sales.', 'Everyday'],
            [5, 'Goodwill Store', 'thrift', '845 Blossom Hill Rd, San Jose, CA 95123', 37.248, -121.859, 'Great for Talbots and LOFT dresses. Go early on Wednesdays for tag sales.', 'Everyday'],
            [3, 'Savers Thrift Store', 'thrift', '1060 S Bascom Ave, San Jose, CA 95128', 37.311, -121.931, 'Excellent denim selection. Found several Kut from the Kloth and Lucky Brand jeans here.', 'Everyday'],
            [4, 'Savers Thrift Store', 'thrift', '1060 S Bascom Ave, San Jose, CA 95128', 37.311, -121.931, 'Excellent denim selection. Found several Kut from the Kloth and Lucky Brand jeans here.', 'Everyday'],
            [5, 'Savers Thrift Store', 'thrift', '1060 S Bascom Ave, San Jose, CA 95128', 37.311, -121.931, 'Excellent denim selection. Found several Kut from the Kloth and Lucky Brand jeans here.', 'Everyday'],
            [3, 'Hope Thrift', 'thrift', '707 Menlo Dr, San Jose, CA 95128', 37.319, -121.936, 'Nice vintage section. Check tags for half-price colors.', 'Everyday'],
            [4, 'Hope Thrift', 'thrift', '707 Menlo Dr, San Jose, CA 95128', 37.319, -121.936, 'Nice vintage section. Check tags for half-price colors.', 'Everyday'],
            [5, 'Hope Thrift', 'thrift', '707 Menlo Dr, San Jose, CA 95128', 37.319, -121.936, 'Nice vintage section. Check tags for half-price colors.', 'Everyday'],
            [3, 'Capitol Flea Market', 'auction', '3630 Monterey Rd, San Jose, CA 95111', 37.288, -121.839, 'Yard sale lots and estate liquidators. Need cash and arrive at 6 AM.', 'Sunday'],
            [4, 'Capitol Flea Market', 'auction', '3630 Monterey Rd, San Jose, CA 95111', 37.288, -121.839, 'Yard sale lots and estate liquidators. Need cash and arrive at 6 AM.', 'Sunday'],
            [5, 'Capitol Flea Market', 'auction', '3630 Monterey Rd, San Jose, CA 95111', 37.288, -121.839, 'Yard sale lots and estate liquidators. Need cash and arrive at 6 AM.', 'Sunday'],
            [3, 'Alum Rock Estate Sale', 'yard_sale', '2200 Alum Rock Ave, San Jose, CA 95116', 37.362, -121.838, 'Frequent yard sales and estate liquidations on weekends.', 'Saturday'],
            [4, 'Alum Rock Estate Sale', 'yard_sale', '2200 Alum Rock Ave, San Jose, CA 95116', 37.362, -121.838, 'Frequent yard sales and estate liquidations on weekends.', 'Saturday'],
            [5, 'Alum Rock Estate Sale', 'yard_sale', '2200 Alum Rock Ave, San Jose, CA 95116', 37.362, -121.838, 'Frequent yard sales and estate liquidations on weekends.', 'Saturday']
          ];
          
          defaults.forEach(item => {
            stmt.run(item);
          });
          stmt.finalize();
          console.log("SUCCESS: Seeded default prospect locations.");
        }
      });

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
          ['user_id', 'INTEGER DEFAULT 1'],
          ['sourcing_location_id', 'INTEGER'],
          ['purchase_price', 'REAL DEFAULT 0.0']
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

      // Migrate items: add private_notes, is_favorite, quantity, condition_description
      db.all("PRAGMA table_info(items)", (err, rows) => {
        if (!err && rows) {
          const existingColumns = rows.map(row => row.name);
          const migrations = [
            ['private_notes', 'TEXT'],
            ['is_favorite', 'INTEGER DEFAULT 0'],
            ['quantity', 'INTEGER DEFAULT 1'],
            ['condition_description', 'TEXT']
          ];
          migrations.forEach(([colName, colType]) => {
            if (!existingColumns.includes(colName)) {
              console.log(`Migrating items: Adding column ${colName}...`);
              db.run(`ALTER TABLE items ADD COLUMN ${colName} ${colType}`);
            }
          });
        }
      });

      // Create Mavey and Labels tables
      db.run(`CREATE TABLE IF NOT EXISTS labels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT,
        color TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS item_labels (
        item_id INTEGER,
        label_id INTEGER,
        PRIMARY KEY (item_id, label_id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS mavey_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS mavey_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER,
        sender TEXT,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
    });
  }
});

module.exports = db;
