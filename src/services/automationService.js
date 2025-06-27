const moment = require('moment');
const { downloadCustomJobExports } = require('./twilio/download');
const { createExportJob, findExistingJob, pollExportJobCompletion } = require('./twilio/export');
const { processFiles } = require('./fileProcessor');
const { getPreviousWeekDates, getPreviousMonthDates } = require('../utils/dateUtils');
const { validateDate, validateDateRange } = require('../utils/validation');
const logger = require('../utils/logger');
const { testConnection } = require('./twilio/client');

const resourceType = 'Messages';

/**
 * Main automation logic for orchestrating Twilio export job creation, polling, downloading, and processing.
 * 
 * @param {string[]} args - CLI arguments passed to the script.
 * @returns {Promise<{ success: boolean, jobFolder?: string, error?: string }>}
 */
async function runAutomation(args) {
  try {
    // First test Twilio API connectivity
    const connectionSuccess = await testConnection();
    if (!connectionSuccess) {
      throw new Error('Failed to connect to Twilio API. Please check your credentials and network connection.');
    }
    
    logger.info('Twilio API connection test passed successfully');
    
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

      logger.info(`Creating new export job with name: ${friendlyName}`);
      
      job = await createExportJob({
        resourceType: 'Messages',
        startDay: startDate,
        endDay: endDate,
        friendlyName,
      });

      logger.info('Waiting for export job to complete...');
      logger.info('This may take several minutes depending on the date range size.');
      logger.info('Twilio needs to process each day of data before it\'s available for download.');
      
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
    const processingResult = await processFiles(jobFolder);
    
    if (processingResult && processingResult.count > 0) {
      logger.info(`✔ Export automation completed successfully with ${processingResult.count} records`, {
        recordCount: processingResult.count,
        csvPath: processingResult.path,
        jobFolder
      });
      return { 
        success: true, 
        jobFolder,
        recordCount: processingResult.count,
        csvPath: processingResult.path
      };
    } else {
      logger.warn('Export completed, but no records were processed');
      return { success: true, jobFolder, recordCount: 0 };
    }

  } catch (error) {
    // Detailed error logging
    logger.error('✗ Export automation failed', { 
      error: error.message, 
      stack: error.stack,
      args: JSON.stringify(args)
    });
    
    // User-friendly error output
    console.error('\n===== ERROR DETAILS =====');
    console.error(error.message);
    
    // If it's an authentication error, provide more helpful information
    if (error.message.includes('unauthorized') || error.message.includes('auth')) {
      console.error('\nThis appears to be an authentication error. Please check:');
      console.error('1. Your Twilio credentials in the .env file are correct');
      console.error('2. Your account has access to the Bulk Exports API');
      console.error('3. Your account is not suspended or restricted');
    }
    
    // Return error for programmatic handling
    return { success: false, error: error.message };
  }
}

module.exports = { runAutomation };