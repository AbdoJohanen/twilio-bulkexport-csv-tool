const { exit } = require('process');
const { validateDate, validateDateRange } = require('./validation');

/**
 * Parse and validate command-line arguments.
 * Usage: node index.js <jobSID_or_name> [YYYY-MM-DD] [YYYY-MM-DD]
 */
function parseArguments() {
  const args = process.argv.slice(2);
  const jobIdentifier = args[0];
  const userStart = args[1];
  const userEnd = args[2];

  if (!jobIdentifier) {
    console.error('Error: Job identifier (SID or "name") is required.');
    console.log('Usage: node index.js <jobSID_or_name> [YYYY-MM-DD] [YYYY-MM-DD]');
    exit(1);
  }

  if ((userStart && !userEnd) || (!userStart && userEnd)) {
    console.error('Error: You must provide both start and end dates or neither.');
    console.log('Usage: node index.js <jobSID_or_name> [YYYY-MM-DD] [YYYY-MM-DD]');
    exit(1);
  }

  if (userStart && userEnd) {
    try {
      validateDate(userStart);
      validateDate(userEnd);
      validateDateRange(userStart, userEnd);
      console.log(`Date range filter: ${userStart} to ${userEnd}`);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      console.log('Usage: node index.js [YYYY-MM-DD] [YYYY-MM-DD]');
      exit(1);
    }
  }

  return { jobIdentifier, userStart, userEnd };
}

module.exports = { parseArguments };