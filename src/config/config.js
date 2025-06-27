const path = require('path');
const { join } = path;
const fs = require('fs-extra');

// Load environment variables from .env file
try {
  const dotenvResult = require('dotenv').config();
  if (dotenvResult.error) {
    console.error('Error loading .env file:', dotenvResult.error.message);
    console.error('Make sure you have a .env file in the project root with the required variables.');
    process.exit(1);
  }
} catch (error) {
  console.error('Failed to load environment variables:', error.message);
  console.error('Make sure you have a .env file in the project root and have installed dotenv package.');
  process.exit(1);
}

/**
 * Configuration constants loaded from environment variables and defaults.
 * Requires a `.env` file in the root directory.
 * 
 * @property {string} accountSid - Twilio Account SID
 * @property {string} authToken - Twilio Auth Token
 * @property {object} auth - Basic auth object used in HTTP requests
 * @property {string} downloadsFolder - Absolute path to the local downloads directory
 * @property {string} twilioBaseUrl - Base URL for Twilio Bulk Exports API
 * @property {number} maxRetries - Max number of retries per file
 * @property {number} timeout - HTTP request timeout in milliseconds
 */

// Validate required environment variables
if (!process.env.TWILIO_ACCOUNT_SID) {
  throw new Error('TWILIO_ACCOUNT_SID environment variable is required. Please set it in your .env file.');
}

if (!process.env.TWILIO_AUTH_TOKEN) {
  throw new Error('TWILIO_AUTH_TOKEN environment variable is required. Please set it in your .env file.');
}

// Ensure downloads directory exists
const downloadsFolder = join(__dirname, '../../downloads');
fs.ensureDirSync(downloadsFolder);

module.exports = {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  auth: { username: process.env.TWILIO_ACCOUNT_SID, password: process.env.TWILIO_AUTH_TOKEN },
  downloadsFolder,
  twilioBaseUrl: 'https://bulkexports.twilio.com/v1/Exports/Messages',
  maxRetries: 3, // Increased retries
  timeout: 45000, // Increased timeout
  apiVersion: 'v1' // Added API version for better flexibility
};