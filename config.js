const path = require('path');
const { join } = path;
require('dotenv').config();

module.exports = {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  auth: { username: process.env.TWILIO_ACCOUNT_SID, password: process.env.TWILIO_AUTH_TOKEN },
  downloadsFolder: join(__dirname, 'downloads'),
  twilioBaseUrl: 'https://bulkexports.twilio.com/v1/Exports/Messages',
  maxRetries: 2,
  timeout: 30000,
};
