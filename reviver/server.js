/**
 * server.js - Fly.io Reviver Service
 * 
 * This service triggers the GitHub Actions bot workflow.
 */

const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const {
  GITHUB_PAT,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_WORKFLOW,
  REVIVER_SECRET
} = process.env;

// Simple in-memory rate limiting
const lastRevival = {
  timestamp: 0,
  count: 0
};

app.post('/revive', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  // 1. Authenticate
  if (!authHeader || authHeader !== `Bearer ${REVIVER_SECRET}`) {
    console.warn('Unauthorized revival attempt blocked.');
    return res.status(401).send('Unauthorized');
  }

  // 2. Rate Limiting (prevent spamming GH API)
  const now = Date.now();
  if (now - lastRevival.timestamp < 30000) { // 30 second cooldown
    console.warn('Revival requested too soon. Rate limited.');
    return res.status(429).send('Too many requests. Please wait.');
  }

  console.log(`Received revival request for ${GITHUB_OWNER}/${GITHUB_REPO}`);

  // 3. Trigger GitHub Actions workflow_dispatch
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_PAT}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        ref: 'main', // Or your default branch
      }),
    });

    if (response.status === 204) {
      lastRevival.timestamp = now;
      lastRevival.count++;
      console.log(`Successfully triggered workflow. Total revivals: ${lastRevival.count}`);
      return res.status(200).send('Resurrection triggered.');
    } else {
      const errorData = await response.text();
      console.error('GitHub API Error:', errorData);
      return res.status(500).send(`Failed to trigger workflow: ${response.status}`);
    }
  } catch (error) {
    console.error('Error calling GitHub API:', error);
    return res.status(500).send('Internal Server Error');
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', revivals: lastRevival.count });
});

app.listen(PORT, () => {
  console.log(`Reviver service listening on port ${PORT}`);
});
