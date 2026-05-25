/**
 * checkpoint.js - Cloudflare R2 State Management
 * 
 * This module handles saving and loading the bot's runtime state to Cloudflare R2.
 */

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const dotenv = require('dotenv');
dotenv.config();

const {
  R2_ENDPOINT,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
} = process.env;

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const CHECKPOINT_KEY = 'checkpoint/latest.json';

/**
 * Saves the current bot state to R2.
 * Includes exponential backoff retry logic.
 * @param {object} state - The state object to save.
 */
async function saveCheckpoint(state) {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      console.log(`Saving checkpoint (attempt ${attempt + 1})...`);
      const command = new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: CHECKPOINT_KEY,
        Body: JSON.stringify({
          ...state,
          lastHeartbeat: Date.now(),
        }),
        ContentType: 'application/json',
      });

      await s3.send(command);
      console.log('Checkpoint saved successfully.');
      return;
    } catch (error) {
      attempt++;
      console.error(`Checkpoint save failed: ${error.message}`);
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('Max retries reached. Checkpoint NOT saved.');
}

/**
 * Loads the latest checkpoint from R2.
 * @returns {Promise<object|null>}
 */
async function loadCheckpoint() {
  try {
    console.log('Loading checkpoint from R2...');
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: CHECKPOINT_KEY,
    });

    const response = await s3.send(command);
    const bodyContents = await response.Body.transformToString();
    return JSON.parse(bodyContents);
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      console.log('No checkpoint found. Initializing fresh state.');
      return null;
    }
    console.error('Error loading checkpoint:', error);
    return null;
  }
}

module.exports = {
  saveCheckpoint,
  loadCheckpoint,
};
