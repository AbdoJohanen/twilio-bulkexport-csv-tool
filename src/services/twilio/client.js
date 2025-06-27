const twilio = require('twilio');
const config = require('../../config/config');
const logger = require('../../utils/logger');

/**
 * Validates Twilio credentials and throws an error if they're invalid
 * @throws {Error} If credentials are invalid
 */
function validateCredentials() {
  if (!config.accountSid || config.accountSid.trim() === '') {
    throw new Error('TWILIO_ACCOUNT_SID is missing or empty. Check your .env file.');
  }
  
  if (!config.authToken || config.authToken.trim() === '') {
    throw new Error('TWILIO_AUTH_TOKEN is missing or empty. Check your .env file.');
  }
  
  // Verify that Account SID starts with 'AC'
  if (!config.accountSid.startsWith('AC')) {
    logger.warn('TWILIO_ACCOUNT_SID does not start with "AC" - this may not be a valid Account SID.');
  }
  
  logger.info('Twilio credentials validated');
}

/**
 * Tests the Twilio API connection by making a simple request.
 * This is useful for diagnosing authentication issues.
 * 
 * @returns {Promise<boolean>} True if connection is successful
 */
async function testConnection() {
  try {
    logger.info('Testing Twilio API connection...');
    
    // Try to list just one job to verify API access
    const jobs = await client.bulkexports.v1
      .exports('Messages')
      .exportCustomJobs
      .list({ limit: 1 });
    
    logger.info('Twilio API connection successful');
    return true;
  } catch (error) {
    logger.error('Twilio API connection test failed', { 
      error: error.message,
      code: error.code,
      status: error.status,
      moreInfo: error.moreInfo,
      details: error.details
    });
    return false;
  }
}

// Validate credentials immediately
validateCredentials();

/**
 * Initializes and exports the Twilio client instance using credentials from config.
 * Also exports the base URL for direct API access.
 */
const client = twilio(config.accountSid, config.authToken);
const BASE_URL = 'https://bulkexports.twilio.com/v1/Exports';

logger.info('Twilio client initialized successfully');

module.exports = {
  client,
  BASE_URL,
  validateCredentials,
  testConnection
};