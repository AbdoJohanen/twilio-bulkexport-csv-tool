const path = require('path');
const { join } = path;
require('dotenv').config();

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

module.exports = {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  auth: { username: process.env.TWILIO_ACCOUNT_SID, password: process.env.TWILIO_AUTH_TOKEN },
  downloadsFolder: join(__dirname, '../../downloads'),
  twilioBaseUrl: 'https://bulkexports.twilio.com/v1/Exports/Messages',
  maxRetries: 2,
  timeout: 30000,
};