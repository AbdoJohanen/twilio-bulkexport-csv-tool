const { runAutomation } = require('./src/services/automationService');
const { helpText } = require('./src/utils/help');

// Show usage if --help is passed
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(helpText);
  process.exit(0);
}

runAutomation(process.argv.slice(2));