const { client } = require('./client');
const logger = require('../../utils/logger');

/**
 * Retrieves the export job by its SID from Twilio.
 *
 * @param {string} resourceType - The resource type (e.g. 'Messages').
 * @param {string} jobSid - The SID of the export job to fetch.
 * @returns {Promise<Object>} The Twilio export job object.
 * @throws {Error} If the job is not found or API call fails.
 */
async function getJob(resourceType, jobSid) {
  try {
    logger.info(`Fetching job details for ${jobSid}`);
    
    if (!resourceType) {
      throw new Error('resourceType is required');
    }
    
    if (!jobSid) {
      throw new Error('jobSid is required');
    }
    
    const jobs = await client
      .bulkexports.v1
      .exports(resourceType)
      .exportCustomJobs
      .list({ limit: 20 }); // We only need recent jobs

    if (!Array.isArray(jobs)) {
      throw new Error(`Unexpected response format from Twilio API when listing jobs`);
    }
    
    logger.info(`Found ${jobs.length} recent jobs`);
    
    const job = jobs.find(j => j.jobSid === jobSid);
    if (!job) {
      logger.error(`Job ${jobSid} not found in the list of recent jobs`);
      throw new Error(`Job ${jobSid} not found`);
    }
    
    logger.info(`Successfully retrieved job ${jobSid}`);
    return job;
  } catch (error) {
    logger.error(`Error getting job ${jobSid}`, { 
      error: error.message, 
      resourceType,
      jobSid,
      stack: error.stack 
    });
    throw new Error(`Error getting job ${jobSid}: ${error.message}`);
  }
}


/**
 * Checks if a job is complete and has all expected days
 */
function isJobComplete(job, expectedDays) {
  if (!job.details || !Array.isArray(job.details)) {
    return { 
      isComplete: false, 
      message: 'Job details not available' 
    };
  }

  const completedDays = job.details.reduce((sum, detail) => {
    if (detail.status === 'Completed' || detail.status === 'CompletedEmptyRecords') {
      return sum + detail.count;
    }
    return sum;
  }, 0);

  const daysWithData = job.details.reduce((sum, detail) => {
    return detail.status === 'Completed' ? sum + detail.count : sum;
  }, 0);

  const emptyDays = job.details.reduce((sum, detail) => {
    return detail.status === 'CompletedEmptyRecords' ? sum + detail.count : sum;
  }, 0);

  const isComplete = completedDays >= expectedDays;

  return {
    isComplete,
    completedDays,
    daysWithData,
    emptyDays,
    message: isComplete 
      ? `Job complete with ${daysWithData} days with data and ${emptyDays} empty days`
      : `Job incomplete: ${completedDays}/${expectedDays} days ready`
  };
}


/**
 * Create a new export job for the given date range.
 */
async function createExportJob({ resourceType, startDay, endDay, friendlyName }) {
  try {
    logger.info(`Creating new export job for dates ${startDay} to ${endDay}`, {
      resourceType,
      startDay,
      endDay,
      friendlyName
    });
    
    if (!resourceType || !startDay || !endDay || !friendlyName) {
      throw new Error('Missing required parameters for export job creation');
    }
    
    const job = await client.bulkexports.v1.exports(resourceType).exportCustomJobs.create({
      startDay,
      endDay,
      friendlyName,
    });
    
    logger.info(`Successfully created export job with SID: ${job.jobSid}`);
    return job;
  } catch (error) {
    logger.error(`Failed to create export job`, {
      error: error.message,
      code: error.code,
      status: error.status,
      details: error.details,
      stack: error.stack
    });
    throw new Error(`Failed to create export job: ${error.message}`);
  }
}


/**
 * Poll until the export job is complete and has all expected days
 */
async function pollExportJobCompletion(resourceType, jobSid, expectedDays, maxWaitMinutes, opts = {}) {
  const pollIntervalMs = opts.pollIntervalMs ?? 5000;
  const initialWaitMs = opts.initialWaitMs ?? 0;
  const maxWaitMs = maxWaitMinutes * 60 * 1000;
  let elapsed = 0;
  
  // Initial wait before first check (useful for large jobs)
  if (initialWaitMs > 0) {
    logger.info(`Initial wait of ${initialWaitMs/1000} seconds before checking job status...`);
    await new Promise(r => setTimeout(r, initialWaitMs));
  }

  const startTime = Date.now();
  let progressCount = 0;
  let lastCompletedDays = 0;
  
  while (elapsed < maxWaitMs) {
    try {
      const job = await getJob(resourceType, jobSid);
      
      // Track completion progress 
      let completedDays = 0;
      let daysWithData = 0;
      let emptyDays = 0;
      let failedDays = 0;
      let pendingDays = 0;
      let totalDetailDays = 0;
      
      // Better job status logging
      if (job.details) {
        job.details.forEach(detail => {
          const count = detail.count || 0;
          totalDetailDays += count;
          
          if (detail.status === 'Completed') {
            completedDays += count;
            daysWithData += count;
          } else if (detail.status === 'CompletedEmptyRecords') {
            completedDays += count;
            emptyDays += count;
          } else if (detail.status === 'Failed') {
            failedDays += count;
          } else if (detail.status === 'Pending' || detail.status === 'InProgress') {
            pendingDays += count;
          }
        });
        
        // Check if progress has been made since last poll
        const progressMade = completedDays > lastCompletedDays;
        lastCompletedDays = completedDays;
        
        // Calculate time elapsed
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        const elapsedMinutes = Math.floor(elapsedSeconds / 60);
        const remainingSeconds = elapsedSeconds % 60;
        const timeString = `${elapsedMinutes}m ${remainingSeconds}s`;
        
        // Log with a progress indicator to show activity
        const progressIndicator = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'][progressCount % 10];
        progressCount++;
        
        logger.info(
          `${progressIndicator} Job ${jobSid}: ${completedDays}/${expectedDays} days ready ` +
          `(${daysWithData} with data, ${emptyDays} empty) - ${timeString} elapsed`, 
          {
            jobSid,
            completedDays,
            expectedDays,
            daysWithData,
            emptyDays,
            failedDays,
            pendingDays,
            elapsedSeconds,
            progressMade
          }
        );

        // Check if complete
        if (completedDays >= expectedDays) {
          logger.info(`✔ Job ${jobSid} is now complete with all ${expectedDays} days ` +
                     `(${daysWithData} with data, ${emptyDays} empty, ${failedDays} failed)`, {
                       jobSid,
                       completedDays,
                       expectedDays,
                       daysWithData,
                       emptyDays,
                       failedDays,
                       elapsedSeconds,
                       timeElapsed: timeString
                     });
          return job;
        }
        
        // If we have failures, consider ending the wait
        if (failedDays > 0 && completedDays + failedDays >= expectedDays) {
          logger.warn(`Job ${jobSid} has ${failedDays} failed days, but we'll continue with the available data`, {
            jobSid,
            failedDays,
            completedDays,
            expectedDays
          });
          return job;
        }
        
      } else {
        logger.info(`${jobSid}: Waiting for job to start processing...`);
      }

    } catch (e) {
      logger.error(`Error checking job: ${e.message}`, {
        jobSid,
        error: e.message,
        stack: e.stack
      });
    }

    await new Promise(r => setTimeout(r, pollIntervalMs));
    elapsed += pollIntervalMs;
  }

  throw new Error(`Job ${jobSid} didn't complete within ${maxWaitMinutes} minutes`);
}


/**
 * Check for an existing export job for the given date range that has all days (data or empty).
 */
async function findExistingJob(resourceType, startDate, endDate, expectedDays) {
  try {
    logger.info(`Looking for existing job for date range ${startDate} to ${endDate}`);
    
    if (!resourceType || !startDate || !endDate) {
      throw new Error('Missing required parameters when finding existing job');
    }
    
    const jobs = await client
      .bulkexports.v1
      .exports(resourceType)
      .exportCustomJobs
      .list({ limit: 200 });
    
    logger.info(`Found ${jobs.length} jobs to check`);

    for (const job of jobs) {
      // Use the correct property names based on Twilio client
      if (job.startDay === startDate && job.endDay === endDate) {
        const status = isJobComplete(job, expectedDays);
        
        logger.info(
          `Found existing job "${job.friendlyName}" (${job.jobSid}) for ${startDate}–${endDate}`
        );
        logger.info(`Status: ${status.message}`);

        if (!status.isComplete) {
          logger.info('Job exists but is not complete - will wait for completion');
          return { job, needsWaiting: true };
        }

        return { job, needsWaiting: false };
      }
    }
    
    logger.info(`No existing job found for date range ${startDate} to ${endDate}`);
    return null;
  } catch (error) {
    logger.error(`Error finding existing job`, { 
      error: error.message,
      code: error.code,
      status: error.status,
      details: error.details,
      resourceType,
      startDate,
      endDate
    });
    
    throw new Error(`Error finding existing job: ${error.message}`);
  }
}

module.exports = {
  createExportJob,
  pollExportJobCompletion,
  findExistingJob,
};