const { exit } = require('process');

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
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(userStart) || !dateRegex.test(userEnd)) {
      console.error('Error: Dates must be in YYYY-MM-DD format.');
      console.log('Usage: node index.js [YYYY-MM-DD] [YYYY-MM-DD]');
      exit(1);
    }
    console.log(`Date range filter: ${userStart} to ${userEnd}`);
  }

  return { jobIdentifier, userStart, userEnd };
}

module.exports = { parseArguments };
