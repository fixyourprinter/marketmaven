const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const dbPath = path.join(__dirname, 'db.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('GITHUB_TOKEN is not configured in backend/.env');
    db.close();
    process.exit(1);
  }

  // Fetch all feedback items
  db.all('SELECT * FROM feedback ORDER BY id ASC', async (err, rows) => {
    if (err) {
      console.error('Failed to query feedback:', err);
      db.close();
      process.exit(1);
    }

    if (rows.length === 0) {
      console.log('No feedback items found in the database.');
      db.close();
      process.exit(0);
    }

    console.log(`Found ${rows.length} feedback items in database. Syncing to GitHub...`);

    const ratingSmileys = {
      1: '😡 Mad',
      2: '🙁 Sad',
      3: '😐 Meh',
      4: '🙂 Good',
      5: '😍 Love!'
    };

    let successCount = 0;
    let failCount = 0;

    for (const row of rows) {
      const ratingLabel = row.rating ? ratingSmileys[row.rating] : 'N/A';
      const statusLabel = row.status === 'resolved' ? '✅ Resolved' : '⏳ Pending';
      const issueTitle = `[Wife Feedback #${row.id}] Rating: ${ratingLabel} (${statusLabel})`;

      console.log(`Syncing Feedback #${row.id}: "${row.message.substring(0, 40).replace(/\n/g, ' ')}..."`);

      try {
        await axios.post(
          'https://api.github.com/repos/fixyourprinter/marketmaven/issues',
          {
            title: issueTitle,
            body: `${row.message}\n\n---\n*Synced via MarketMaven Feedback Sync Script (Local ID: #${row.id}, Status: ${row.status})*`
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'MarketMaven-Sync-Script'
            }
          }
        );
        successCount++;
        console.log(` -> SUCCESS: Created GitHub issue for feedback #${row.id}`);
      } catch (gitErr) {
        failCount++;
        console.error(` -> FAILED for feedback #${row.id}:`, gitErr.response?.data?.message || gitErr.message);
      }
      
      // Sleep slightly to respect API rate limits
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`\nSync Completed! Successfully synced: ${successCount}, Failed: ${failCount}`);
    db.close();
  });
});
