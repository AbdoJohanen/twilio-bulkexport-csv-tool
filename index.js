const fsExtra = require('fs-extra');
const config = require('./config');
const { parseArguments } = require('./cli');
const { downloadCustomJobExports } = require('./twilioClient');
const { processFiles } = require('./fileProcessor');

(async () => {
  // Parse CLI arguments
  const args = parseArguments();

  // Ensure downloads folder exists (from config)
  fsExtra.ensureDirSync(config.downloadsFolder);

  // Download the export files from Twilio and get the main job folder path
  const jobFolder = await downloadCustomJobExports(args);

  // Process the downloaded files: decompress, parse JSON, and convert to CSV.
  await processFiles(jobFolder);
})();
