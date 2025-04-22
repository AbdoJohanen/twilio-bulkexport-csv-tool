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
    const jobs = await client
      .bulkexports.v1
      .exports(resourceType)
      .exportCustomJobs
      .list({ limit: 20 }); // We only need recent jobs

    const job = jobs.find(j => j.jobSid === jobSid);
    if (!job) {
      throw new Error(`Job ${jobSid} not found`);
    }
    return job;
  } catch (error) {
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
    const job = await client.bulkexports.v1.exports(resourceType).exportCustomJobs.create({
      startDay,
      endDay,
      friendlyName,
    });
    
    logger.info("Created export job object:", JSON.stringify(job, null, 2));
    return job;
  } catch (error) {
    throw new Error(`Failed to create export job: ${error.message}`);
  }
}


/**
 * Poll until the export job is complete and has all expected days
 */
async function pollExportJobCompletion(resourceType, jobSid, expectedDays, maxWaitMinutes, opts = {}) {
  const pollIntervalMs = opts.pollIntervalMs ?? 5000;
  const maxWaitMs = maxWaitMinutes * 60 * 1000;
  let elapsed = 0;

  while (elapsed < maxWaitMs) {
    try {
      const job = await getJob(resourceType, jobSid);
      
      // Better job status logging
      if (job.details) {
        const completedDays = job.details.reduce((sum, detail) => {
          if (detail.status === 'Completed' || detail.status === 'CompletedEmptyRecords') {
            return sum + detail.count;
          }
          return sum;
        }, 0);
        
        const daysWithData = job.details.reduce((sum, detail) => {
          if (detail.status === 'Completed') {
            return sum + detail.count;
          }
          return sum;
        }, 0);

        const emptyDays = job.details.reduce((sum, detail) => {
          if (detail.status === 'CompletedEmptyRecords') {
            return sum + detail.count;
          }
          return sum;
        }, 0);

        logger.info(
          `Checking job ${jobSid}: ${completedDays}/${expectedDays} days ready ` +
          `(${daysWithData} with data, ${emptyDays} empty)`
        );

        if (completedDays >= expectedDays) {
          logger.info(`✔ Job ${jobSid} is now complete with all ${expectedDays} days ` +
                     `(${daysWithData} with data, ${emptyDays} empty)`);
          return job;
        }
      } else {
        logger.info(`Checking job ${jobSid}: Waiting for job to start processing...`);
      }

    } catch (e) {
      logger.error(`Error checking job: ${e.message}`);
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
    const jobs = await client
      .bulkexports.v1
      .exports(resourceType)
      .exportCustomJobs
      .list({ limit: 200 });

    for (const job of jobs) {
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
    return null;
  } catch (error) {
    logger.error(`Error listing export jobs: ${error.message}`);
    return null;
  }
}

module.exports = {
  createExportJob,
  pollExportJobCompletion,
  findExistingJob,
};