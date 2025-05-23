const axios = require('axios');
const fsExtra = require('fs-extra');
const { join } = require('path');
const config = require('../../config/config');
const { generateDaysBetweenDates } = require('../../utils/dateUtils');
const { colors, cliProgress } = require('../../utils/progress');
const logger = require('../../utils/logger');

/**
 * Lists custom export jobs for Messages from Twilio.
 */
async function listExportCustomJobs() {
  try {
    const jobsUrl = `${config.twilioBaseUrl}/Jobs?PageSize=1000`;
    const response = await axios.get(jobsUrl, { auth: config.auth });
    const jobs = response.data.jobs || response.data;
    return jobs;
  } catch (error) {
    logger.error("Error listing export custom jobs:", error.message);
    throw error;
  }
}


/**
 * Converts a job name into a safe folder name by replacing non-alphanumeric characters.
 */
function sanitizeFolderName(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_{2,}/g, '_');
}


/**
 * Extracts days with data and empty days from a job's details.
 */
function extractDaysFromJob(job) {
  try {
    const daysWithData = new Set();
    const emptyDays = new Set();

    if (job.details && Array.isArray(job.details)) {
      job.details.forEach(detail => {
        if (detail.status === 'Completed' && Array.isArray(detail.days)) {
          detail.days.forEach(day => {
            if (typeof day === 'string') {
              daysWithData.add(day);
            }
          });
        } else if (detail.status === 'CompletedEmptyRecords' && Array.isArray(detail.days)) {
          detail.days.forEach(day => {
            if (typeof day === 'string') {
              emptyDays.add(day);
            }
          });
        }
      });
    }

    return {
      daysWithData: [...daysWithData],
      emptyDays: [...emptyDays]
    };
  } catch (error) {
    logger.error("Error extracting days from job:", error.message);
    return { daysWithData: [], emptyDays: [] };
  }
}


/**
 * Download a single day's export file with retry functionality.
 */
async function downloadWithRetry(dayStr, targetFolder, index, total, progressBar, maxRetries = config.maxRetries) {
  let attempts = 0;
  let lastError = null;

  while (attempts <= maxRetries) {
    try {
      attempts++;
      if (attempts > 1) {
        logger.info(`⟳ [${index + 1}/${total}] Retry attempt ${attempts - 1}/${maxRetries} for ${dayStr}...`);
      }

      const dayUrl = `${config.twilioBaseUrl}/Days/${encodeURIComponent(dayStr)}`;
      const response = await axios.get(dayUrl, {
        responseType: 'stream',
        auth: config.auth,
        validateStatus: status => status < 400,
        timeout: config.timeout
      });
      const contentLength = response.headers['content-length'];
      // Save into the targetFolder (which will be the "files" subfolder)
      const filename = `export_${dayStr}.json.gz`;
      const filePath = join(targetFolder, filename);
      const writer = fsExtra.createWriteStream(filePath);
      response.data.pipe(writer);

      const result = await new Promise((resolve, reject) => {
        writer.on('finish', () => resolve({ dayStr, filePath, size: contentLength }));
        writer.on('error', (err) => reject(err));
      });
      return result;
    } catch (error) {
      lastError = error;
      if (attempts > maxRetries) {
        logger.info(`✗ [${index + 1}/${total}] Failed to download ${dayStr} after ${maxRetries + 1} attempts: ${error.message}`);
      }
      if (attempts <= maxRetries) {
        const delay = 1000 * attempts;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError || new Error(`Failed to download ${dayStr} after ${maxRetries + 1} attempts`);
}


/**
 * Downloads export files for the given job.
 * Accepts an object with jobIdentifier, userStart, and userEnd.
 * 
 * Files will be saved in downloads/job_name/files and the job folder itself is returned.
 */
async function downloadCustomJobExports({ jobIdentifier, userStart, userEnd }) {
  logger.info("Starting Twilio export download...");

  const jobs = await listExportCustomJobs();
  logger.info(`Found ${jobs.length} job(s).`);

  const myJob = jobs.find(job =>
    job.job_sid === jobIdentifier ||
    (job.friendly_name && job.friendly_name.includes(jobIdentifier))
  );

  if (!myJob) {
    logger.error(`Job not found with identifier: ${jobIdentifier}`);
    logger.info("Available jobs:");
    jobs.forEach(job => logger.info(` - ${job.friendly_name} (${job.job_sid})`));
    return;
  }

  logger.info(`Using job: "${myJob.friendly_name}" (SID: ${myJob.job_sid})`);

  // Create the main job folder (downloads/job_name)
  const jobFolderName = myJob.friendly_name ? sanitizeFolderName(myJob.friendly_name) : myJob.job_sid;
  const jobFolder = join(config.downloadsFolder, jobFolderName);
  fsExtra.ensureDirSync(jobFolder);
  logger.info(`Created job folder: ${jobFolder}`);

  // Create a subfolder for the downloaded files (downloads/job_name/files)
  const filesFolder = join(jobFolder, 'files');
  fsExtra.ensureDirSync(filesFolder);
  logger.info(`Created files folder: ${filesFolder}`);

  const { daysWithData, emptyDays } = extractDaysFromJob(myJob);
  logger.info(`Job contains ${daysWithData.length} days with data and ${emptyDays.length} empty days.`);

  let daysToDownload = daysWithData;
  let emptyDaysInRange = [];
  let totalDaysInRange = 0;
  let daysOutsideJobScope = 0;

  if (userStart && userEnd) {
    const userDateRange = generateDaysBetweenDates(userStart, userEnd);
    totalDaysInRange = userDateRange.length;
    const userDateSet = new Set(userDateRange);

    daysToDownload = daysWithData.filter(day => userDateSet.has(day));
    emptyDaysInRange = emptyDays.filter(day => userDateSet.has(day));
    daysOutsideJobScope = totalDaysInRange - daysToDownload.length - emptyDaysInRange.length;

    logger.info(`Date range filter applied: ${daysToDownload.length} days to download between ${userStart} and ${userEnd}.`);
    if (emptyDaysInRange.length > 0) {
      logger.info(`Found ${emptyDaysInRange.length} days with no data in date range (will be skipped).`);
    }
    if (daysOutsideJobScope > 0) {
      logger.info(`Found ${daysOutsideJobScope} days in range that are not covered by the job.`);
    }
  } else {
    logger.info(`No date range specified - downloading all ${daysWithData.length} days with data from the job.`);
    if (daysWithData.length > 0) {
      const allDates = [...daysWithData].sort();
      const firstDate = allDates[0];
      const lastDate = allDates[allDates.length - 1];
      logger.info(`Available data spans from ${firstDate} to ${lastDate}.`);
    }
  }

  if (daysToDownload.length === 0) {
    logger.info("No days with data to download. Exiting.");
    return;
  }

  daysToDownload.sort();
  const startTime = Date.now();
  logger.info(`Starting ${daysToDownload.length} concurrent downloads...`);

  let completedCount = 0;
  let failedCount = 0;
  let totalBytes = 0;

  const progressBar = new cliProgress.SingleBar({
    format: `${colors.cyan('{bar}')} {percentage}% | {value}/{total} | ETA: {eta_formatted} | Speed: {speed} files/s | {size} MB`,
    hideCursor: true,
    clearOnComplete: false,
  }, cliProgress.Presets.shades_classic);

  progressBar.start(daysToDownload.length, 0, {
    speed: "0.0",
    size: "0.0"
  });

  // Download files into the filesFolder
  const downloadPromises = daysToDownload.map(async (dayStr, index) => {
    try {
      const result = await downloadWithRetry(dayStr, filesFolder, index, daysToDownload.length, progressBar);
      completedCount++;
      if (result.size) {
        totalBytes += parseInt(result.size);
      }
      const elapsedSecs = (Date.now() - startTime) / 1000;
      const speed = elapsedSecs > 0 ? (completedCount / elapsedSecs).toFixed(1) : '0.0';
      const mbSize = totalBytes / (1024 * 1024);
      progressBar.update(completedCount + failedCount, {
        speed: speed,
        size: mbSize.toFixed(1)
      });
      return result;
    } catch (error) {
      failedCount++;
      progressBar.update(completedCount + failedCount);
      return null;
    }
  });

  const results = await Promise.all(downloadPromises);
  progressBar.stop();

  if (failedCount > 0) {
    logger.info(colors.red(`✗ Completed with ${failedCount} failed downloads`));
  } else {
    logger.info(colors.green(`✓ All ${completedCount} downloads completed successfully`));
  }

  const successCount = results.filter(result => result !== null).length;
  const failedDays = daysToDownload.filter((day, index) => results[index] === null);
  const totalTimeSeconds = Math.round((Date.now() - startTime) / 1000);
  const filesPerSecond = totalTimeSeconds > 0 ? Math.round((successCount / totalTimeSeconds) * 10) / 10 : 'N/A';

  logger.info("=== Download Summary ===");
  logger.info(`Total days with data: ${daysWithData.length}`);
  logger.info(`Total days with no data (skipped): ${emptyDays.length}`);

  if (userStart && userEnd) {
    logger.info(`Total days in selected date range: ${totalDaysInRange}`);
    logger.info(`Days with data in range: ${daysToDownload.length}`);
    logger.info(`Days with no data in range (skipped): ${emptyDaysInRange.length}`);
  } else {
    logger.info(`Downloaded full job data (no date filter applied)`);
  }

  logger.info(`Total days to download: ${daysToDownload.length}`);
  logger.info(`Successfully downloaded: ${successCount}`);
  logger.info(`Failed downloads: ${failedDays.length}`);
  logger.info(`Time taken: ${totalTimeSeconds} seconds (${filesPerSecond} files/sec)`);

  if (failedDays.length > 0) {
    logger.info("Failed days:", failedDays.slice(0, 10).join(', ') +
      (failedDays.length > 10 ? ` and ${failedDays.length - 10} more...` : ''));
  }

  logger.info(`Files saved to: ${jobFolder}`);
  // Return the main job folder path (for further processing)
  return jobFolder;
}

module.exports = {
  downloadCustomJobExports,
  sanitizeFolderName,
  extractDaysFromJob,
  listExportCustomJobs
};