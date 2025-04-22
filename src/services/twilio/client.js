const twilio = require('twilio');
const config = require('../../config/config');

/**
 * Initializes and exports the Twilio client instance using credentials from config.
 * Also exports the base URL for direct API access.
 */
const client = twilio(config.accountSid, config.authToken);
const BASE_URL = 'https://bulkexports.twilio.com/v1/Exports';

module.exports = {
  client,
  BASE_URL
};