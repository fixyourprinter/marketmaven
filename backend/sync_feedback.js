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

  const repoOwner = 'fixyourprinter';
  const repoName = 'marketmaven';

  // Fetch all issues (both open and closed) from GitHub first
  let gitIssues = [];
  try {
    console.log('Fetching existing issues from GitHub...');
    // Use an IIFE wrapper to await in constructor callback
    (async () => {
      const gitResponse = await axios.get(
        `https://api.github.com/repos/${repoOwner}/${repoName}/issues?state=all&per_page=100`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'MarketMaven-Sync-Script'
          }
        }
      );
      gitIssues = gitResponse.data;
      console.log(`Found ${gitIssues.length} issues in GitHub repository.`);

      // Fetch all feedback items from SQLite
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
          const targetTitle = `[Wife Feedback #${row.id}] Rating: ${ratingLabel} (${statusLabel})`;
          const targetBody = `${row.message}\n\n---\n*Synced via MarketMaven Feedback Sync Script (Local ID: #${row.id}, Status: ${row.status})*`;
          const targetState = row.status === 'resolved' ? 'closed' : 'open';

          // Find all matching issues on GitHub for this local ID
          const matchingIssues = gitIssues.filter(issue => 
            issue.title.startsWith(`[Wife Feedback #${row.id}]`)
          );

          console.log(`Syncing Local Feedback #${row.id} (status: ${row.status}) - Found ${matchingIssues.length} matches on GitHub...`);

          if (matchingIssues.length > 0) {
            // Issue exists! Let's update it. If there are duplicates, we keep the first one and close the rest.
            for (let i = 0; i < matchingIssues.length; i++) {
              const issue = matchingIssues[i];
              const isDuplicate = i > 0;
              const finalState = (isDuplicate || targetState === 'closed') ? 'closed' : 'open';
              const finalTitle = isDuplicate ? `[DUPLICATE CLOSED] ${issue.title}` : targetTitle;

              const needsUpdate = issue.title !== finalTitle || issue.state.toLowerCase() !== finalState;

              if (needsUpdate) {
                try {
                  await axios.patch(
                    `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issue.number}`,
                    {
                      title: finalTitle,
                      state: finalState
                    },
                    {
                      headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/vnd.github+json',
                        'User-Agent': 'MarketMaven-Sync-Script'
                      }
                    }
                  );
                  console.log(` -> UPDATED: GitHub Issue #${issue.number} state set to "${finalState}"`);
                  successCount++;
                } catch (patchErr) {
                  failCount++;
                  console.error(` -> FAILED to update GitHub Issue #${issue.number}:`, patchErr.response?.data?.message || patchErr.message);
                }
              } else {
                console.log(` -> UP TO DATE: GitHub Issue #${issue.number} is already correct.`);
                successCount++;
              }
            }
          } else {
            // Issue does not exist! Create a new one.
            try {
              const createResponse = await axios.post(
                `https://api.github.com/repos/${repoOwner}/${repoName}/issues`,
                {
                  title: targetTitle,
                  body: targetBody
                },
                {
                  headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github+json',
                    'User-Agent': 'MarketMaven-Sync-Script'
                  }
                }
              );
              
              const newIssue = createResponse.data;
              console.log(` -> CREATED: GitHub Issue #${newIssue.number} for Feedback #${row.id}`);

              if (targetState === 'closed') {
                // Close it immediately if status is resolved
                await axios.patch(
                  `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${newIssue.number}`,
                  {
                    state: 'closed'
                  },
                  {
                    headers: {
                      Authorization: `Bearer ${token}`,
                      Accept: 'application/vnd.github+json',
                      'User-Agent': 'MarketMaven-Sync-Script'
                    }
                  }
                );
                console.log(` -> CLOSED: GitHub Issue #${newIssue.number} closed successfully.`);
              }
              successCount++;
            } catch (createErr) {
              failCount++;
              console.error(` -> FAILED to create GitHub Issue for Feedback #${row.id}:`, createErr.response?.data?.message || createErr.message);
            }
          }

          // Respect GitHub API rate limits
          await new Promise(r => setTimeout(r, 300));
        }

        console.log(`\nSync Completed! Successfully processed: ${successCount}, Failed: ${failCount}`);
        db.close();
      });
    })();
  } catch (gitErr) {
    console.error('Failed to fetch existing issues from GitHub:', gitErr.response?.data?.message || gitErr.message);
    db.close();
    process.exit(1);
  }
});
