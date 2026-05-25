/**
 * resurrection.js - Reviver Service Trigger Utility
 */

const dotenv = require('dotenv');
dotenv.config();

const { REVIVER_URL, REVIVER_SECRET } = process.env;

/**
 * Triggers the Fly.io reviver service to restart the GitHub Actions workflow.
 */
async function triggerResurrection() {
  if (!REVIVER_URL || !REVIVER_SECRET) {
    console.warn('Reviver configuration missing. Cannot trigger resurrection.');
    return;
  }

  console.log(`Triggering resurrection at ${REVIVER_URL}...`);
  try {
    const response = await fetch(`${REVIVER_URL}/revive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${REVIVER_SECRET}`,
      },
    });

    if (response.ok) {
      console.log('Resurrection signal sent successfully.');
    } else {
      const errorText = await response.text();
      console.error(`Failed to trigger resurrection: ${response.status} ${errorText}`);
    }
  } catch (error) {
    console.error('Error triggering resurrection:', error);
  }
}

module.exports = {
  triggerResurrection,
};
