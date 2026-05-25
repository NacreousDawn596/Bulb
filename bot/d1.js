/**
 * d1.js - Cloudflare D1 Relational Storage Helper
 * 
 * This module interacts with Cloudflare D1 via the REST API.
 */

const dotenv = require('dotenv');
dotenv.config();

const { D1_DATABASE_ID, D1_API_TOKEN, D1_ACCOUNT_ID } = process.env;

/**
 * Executes a SQL query against Cloudflare D1.
 * @param {string} sql - The SQL query to execute.
 * @param {any[]} params - Parameters for the SQL query.
 * @returns {Promise<any>} - The query result.
 */
async function queryD1(sql, params = []) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${D1_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${D1_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sql,
      params,
    }),
  });

  const data = await response.json();

  if (!data.success) {
    console.error('D1 Query Error:', JSON.stringify(data.errors));
    throw new Error(`D1 Query Failed: ${data.errors[0]?.message || 'Unknown error'}`);
  }

  return data.result[0];
}

/**
 * Initializes the D1 database schema.
 */
async function initD1() {
  console.log('Initializing D1 schema...');
  await queryD1(`
    CREATE TABLE IF NOT EXISTS stats (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

/**
 * Gets a stat value from D1.
 * @param {string} key - The stat key.
 * @returns {Promise<string|null>}
 */
async function getStat(key) {
  try {
    const result = await queryD1('SELECT value FROM stats WHERE key = ?', [key]);
    return result?.results?.[0]?.value || null;
  } catch (error) {
    console.error(`Error getting stat ${key}:`, error);
    return null;
  }
}

/**
 * Sets a stat value in D1.
 * @param {string} key - The stat key.
 * @param {string} value - The stat value.
 */
async function setStat(key, value) {
  try {
    await queryD1('INSERT OR REPLACE INTO stats (key, value) VALUES (?, ?)', [key, value]);
  } catch (error) {
    console.error(`Error setting stat ${key}:`, error);
  }
}

module.exports = {
  initD1,
  getStat,
  setStat,
};
