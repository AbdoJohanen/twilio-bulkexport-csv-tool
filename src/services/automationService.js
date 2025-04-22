const moment = require('moment');
const { downloadCustomJobExports } = require('./twilio/download');
const { createExportJob, findExistingJob, pollExportJobCompletion } = require('./twilio/export');
const { processFiles } = require('./fileProcessor');
const { getPreviousWeekDates, getPreviousMonthDates } = require('../utils/dateUtils');
const { validateDate, validateDateRange } = require('../utils/validation');
const logger = require('../utils/logger');

const resourceType = 'Messages';

/**
 * Main automation logic for orchestrating Twilio export job creation, polling, downloading, and processing.
 * 
 * @param {string[]} args - CLI arguments passed to the script.
 * @returns {Promise<{ success: boolean, jobFolder?: string, error?: string }>}
 */
async function runAutomation(args) {
  try {
    let startDate, endDate, jobIdentifier, customJobName;
    let jobPrefix = 'Job_Week'; // Default prefix

    // Parse command line arguments
    if (args.length === 0 || args[0] === '--week') {
      // Default or explicit week flag: Previous week
      const dates = getPreviousWeekDates();
      startDate = dates.monday;
      endDate = dates.sunday;
      logger.info('Processing previous week\'s data');
    }
    else if (args[0] === '--month') {
      // Month flag: Previous month
      const dates = getPreviousMonthDates();
      startDate = dates.start;
      endDate = dates.end;
      jobPrefix = 'Job_Month';
      logger.info('Processing previous month\'s data');
    }
    else if (args.length === 1) {
      // Single argument: Job identifier
      jobIdentifier = args[0];
      logger.info(`Looking up specific job: ${jobIdentifier}`);
    }
    else if (args.length >= 2) {
      // Check if first argument is --name
      if (args[0] === '--name' && args.length >= 4) {
        customJobName = args[1];
        startDate = args[2];
        endDate = args[3];
      } else {
        // Original two argument case
        [startDate, endDate] = args;
      }
      
      validateDate(startDate);
      validateDate(endDate);
      validateDateRange(startDate, endDate);
    } 
    else {
      throw new Error('Invalid number of arguments');
    }

    if (jobIdentifier) {
      // Direct download of existing job
      logger.info(`Downloading job ${jobIdentifier}...`);
      const jobFolder = await downloadCustomJobExports({ jobIdentifier });
      await processFiles(jobFolder);
      return { success: true, jobFolder };
    }

    logger.info(`Looking for export job covering ${startDate} to ${endDate}...`);
    
    // Calculate expected days based on date range
    const expectedDays = moment(endDate).diff(moment(startDate), 'days') + 1;
    logger.info(`Expecting ${expectedDays} days of data...`);
    
    const existingJobResult = await findExistingJob(resourceType, startDate, endDate, expectedDays);
    let job;
    
    if (existingJobResult) {
      job = existingJobResult.job;
      
      if (existingJobResult.needsWaiting) {
        logger.info('Waiting for existing job to complete...');
        job = await pollExportJobCompletion(
          resourceType,
          job.jobSid,
          expectedDays,
          60,
          { 
            pollIntervalMs: 30000,
            initialWaitMs: 60000
          }
        );
      }
    } else {
      logger.info('No existing job found, creating new export job...');

      // Format the job name based on the type or custom name
      const jobDate = moment(startDate);
      const friendlyName = customJobName 
        ? `Job_Custom_${customJobName}`
        : args[0] === '--month' 
          ? `${jobPrefix}_${jobDate.format('YYYY_MM')}`
          : `${jobPrefix}_${startDate.replace(/-/g, '_')}`;

      job = await createExportJob({
        resourceType: 'Messages',
        startDay: startDate,
        endDay: endDate,
        friendlyName,
      });

      logger.info('Waiting for export job to complete...');
      job = await pollExportJobCompletion(
        resourceType,
        job.jobSid,
        expectedDays,
        60,
        { 
          pollIntervalMs: 30000,
          initialWaitMs: 60000
        }
      );
    }

    logger.info('Starting download of completed export job...');
    const jobFolder = await downloadCustomJobExports({
      jobIdentifier: job.jobSid,
      userStart: startDate,
      userEnd: endDate
    });

    logger.info('Processing downloaded files...');
    await processFiles(jobFolder);
    
    logger.info('✔ Export automation completed successfully');
    return { success: true, jobFolder };

  } catch (error) {
    logger.error('✗ Export automation failed:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { runAutomation };