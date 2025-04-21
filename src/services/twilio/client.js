const twilio = require('twilio');
const config = require('../../config/config');

const client = twilio(config.accountSid, config.authToken);
const BASE_URL = 'https://bulkexports.twilio.com/v1/Exports';

module.exports = {
  client,
  BASE_URL
};