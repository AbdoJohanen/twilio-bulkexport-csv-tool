require('dotenv').config();
const axios = require('axios');
const fsExtra = require('fs-extra');
const path = require('path');
const { join } = path;

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const auth = { username: accountSid, password: authToken };

// Parse command-line arguments for date filtering
const jobIdentifier = process.argv[2]; // First argument is Job SID or name in quotes
const userStart = process.argv[3]; // Second argument is start date (YYYY-MM-DD)
const userEnd = process.argv[4];   // Third argument is end date (YYYY-MM-DD)

// Validate job identifier is provided
if (!jobIdentifier) {
  console.error("Error: Job identifier (SID or name) is required.");
  console.log("Usage: node script.js <jobSID_or_name> [YYYY-MM-DD] [YYYY-MM-DD]");
  process.exit(1);
}

// Configuration options
const downloadsFolder = join(__dirname, 'downloads');

// Create downloads folder if it doesn't exist
fsExtra.ensureDirSync(downloadsFolder);

// Date validation needs updating to check argv[3] and argv[4]
if ((userStart && !userEnd) || (!userStart && userEnd)) {
  console.error("Error: You must provide both start and end dates or neither.");
  console.log("Usage: node script.js <jobSID_or_name> [YYYY-MM-DD] [YYYY-MM-DD]");
  process.exit(1);
}

// Function to sanitize job name for folder creation
function sanitizeFolderName(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_{2,}/g, '_');
}

if (userStart && userEnd) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(userStart) || !dateRegex.test(userEnd)) {
    console.error("Error: Dates must be in YYYY-MM-DD format.");
    console.log("Usage: node script.js [YYYY-MM-DD] [YYYY-MM-DD]");
    process.exit(1);
  }
  
  console.log(`Date range filter: ${userStart} to ${userEnd}`);
}

/**
  * Extract days with data and empty days from job details
*/
function extractDaysFromJob(job) {
  try {
    const daysWithData = new Set();
    const emptyDays = new Set();
    
    if (job.details && Array.isArray(job.details)) {
      job.details.forEach(detail => {
        if (detail.status === 'Completed' && detail.days && Array.isArray(detail.days)) {
          detail.days.forEach(day => {
            if (typeof day === 'string') {
              daysWithData.add(day);
            }
          });
        } 
        else if (detail.status === 'CompletedEmptyRecords' && detail.days && Array.isArray(detail.days)) {
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
    console.error("Error extracting days from job:", error.message);
    return { daysWithData: [], emptyDays: [] };
  }
}

/**
  * Function to generate an array of day strings between two dates (inclusive)
*/
function generateDaysBetweenDates(startDay, endDay) {
  let days = [];
  
  // Create dates at noon to avoid timezone issues
  let current = new Date(`${startDay}T12:00:00`);
  const final = new Date(`${endDay}T12:00:00`);
  
  // Add one more day to ensure the end date is included
  final.setDate(final.getDate() + 1);
  
  while (current < final) {
    // Extract date part in YYYY-MM-DD format
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const dayStr = `${year}-${month}-${day}`;
    
    days.push(dayStr);
    current.setDate(current.getDate() + 1);
  }
  
  return days;
}

/**
  * List all custom export jobs for Messages.
*/
async function listExportCustomJobs() {
  try {
    const jobsUrl = `https://bulkexports.twilio.com/v1/Exports/Messages/Jobs?PageSize=1000`;
    const response = await axios.get(jobsUrl, { auth });
    const jobs = response.data.jobs || response.data;
    return jobs;
  } catch (error) {
    console.error("Error listing export custom jobs:", error.message);
    throw error;
  }
}

/**
  * Download a day file directly from Twilio API with retry functionality
*/
async function downloadWithRetry(dayStr, jobFolder, index, total, maxRetries = 2) {
  let attempts = 0;
  let lastError = null;
  
  while (attempts <= maxRetries) {
    try {
      attempts++;
      
      // If this is a retry, log it
      if (attempts > 1) {
        console.log(`⟳ [${index+1}/${total}] Retry attempt ${attempts-1}/${maxRetries} for ${dayStr}...`);
      }
      
      // Attempt the download
      const dayUrl = `https://bulkexports.twilio.com/v1/Exports/Messages/Days/${encodeURIComponent(dayStr)}`;
      
      const response = await axios.get(dayUrl, {
        responseType: 'stream',
        auth,
        validateStatus: status => status < 400,
        timeout: 30000 
      });
      
      const contentLength = response.headers['content-length'];
      
      // Save the file to the job-specific folder
      const filename = `export_${dayStr}.json.gz`;
      const filePath = join(jobFolder, filename);
      const writer = fsExtra.createWriteStream(filePath);
      response.data.pipe(writer);
      
      // Wait for the file to finish writing
      const result = await new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log(`✓ [${index+1}/${total}] Downloaded ${dayStr} (${contentLength || 'unknown'} bytes)`);
          resolve({ dayStr, filePath, size: contentLength });
        });
        writer.on('error', (err) => {
          reject(err);
        });
      });
      
      // If we get here, download was successful
      return result;
      
    } catch (error) {
      // Store the error for later if all retries fail
      lastError = error;
      
      // If this was the last attempt, log the failure
      if (attempts > maxRetries) {
        console.log(`✗ [${index+1}/${total}] Failed to download ${dayStr} after ${maxRetries + 1} attempts: ${error.message}`);
      }
      
      // If there are more retries left, wait a bit before trying again
      if (attempts <= maxRetries) {
        const delay = 1000 * attempts; // Exponential backoff: 1s, 2s
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // If we get here, all retry attempts failed
  throw lastError || new Error(`Failed to download ${dayStr} after ${maxRetries + 1} attempts`);
}

/**
  * Main function to download export files
*/
async function downloadCustomJobExports() {
  try {
    console.log("Starting Twilio export download...");
    
    // List custom export jobs for Messages
    const jobs = await listExportCustomJobs();
    console.log(`Found ${jobs.length} job(s).`);
    
    // Find the job by SID or by name
    const myJob = jobs.find(job => 
      job.job_sid === jobIdentifier || 
      (job.friendly_name && job.friendly_name.includes(jobIdentifier))
    );
    
    if (!myJob) {
      console.error(`Job not found with identifier: ${jobIdentifier}`);
      console.log("Available jobs:");
      jobs.forEach(job => console.log(` - ${job.friendly_name} (${job.job_sid})`));
      return;
    }
    
    console.log(`Using job: "${myJob.friendly_name}" (SID: ${myJob.job_sid})`);
    
    // Create job-specific subfolder
    const jobFolderName = myJob.friendly_name ? 
      sanitizeFolderName(myJob.friendly_name) : 
      myJob.job_sid;
    
    const jobFolder = join(downloadsFolder, jobFolderName);
    fsExtra.ensureDirSync(jobFolder);
    console.log(`Created job folder: ${jobFolder}`);
    
    // Extract days with data and empty days from the job
    const { daysWithData, emptyDays } = extractDaysFromJob(myJob);
    
    console.log(`Job contains ${daysWithData.length} days with data and ${emptyDays.length} empty days.`);
    
    // Filter days based on user-specified date range if provided
    let daysToDownload = daysWithData;
    let emptyDaysInRange = [];
    let totalDaysInRange = 0;
    
    if (userStart && userEnd) {
      // User specified a date range - filter days
      const userDateRange = generateDaysBetweenDates(userStart, userEnd);
      totalDaysInRange = userDateRange.length;
      const userDateSet = new Set(userDateRange);
      
      // Filter days with data that are within date range
      daysToDownload = daysWithData.filter(day => userDateSet.has(day));
      
      // Find empty days that are within date range
      emptyDaysInRange = emptyDays.filter(day => userDateSet.has(day));
      
      // Calculate days not covered by job
      daysOutsideJobScope = totalDaysInRange - daysToDownload.length - emptyDaysInRange.length;
      
      console.log(`Date range filter applied: ${daysToDownload.length} days to download between ${userStart} and ${userEnd}.`);
      if (emptyDaysInRange.length > 0) {
        console.log(`Found ${emptyDaysInRange.length} days with no data in date range (will be skipped).`);
      }
      if (daysOutsideJobScope > 0) {
        console.log(`Found ${daysOutsideJobScope} days in range that are not covered by the job.`);
      }
    } else {
      // No date range specified - download all available days
      console.log(`No date range specified - downloading all ${daysWithData.length} days with data from the job.`);
      
      // Show date range info
      if (daysWithData.length > 0) {
        const allDates = [...daysWithData].sort();
        const firstDate = allDates[0];
        const lastDate = allDates[allDates.length - 1];
        console.log(`Available data spans from ${firstDate} to ${lastDate}.`);
      }
    }
    
    if (daysToDownload.length === 0) {
      console.log("No days with data to download. Exiting.");
      return;
    }
    
    // Sort days chronologically
    daysToDownload.sort();

    // Record start time for performance tracking
    const startTime = Date.now();
        
    // Process all days at once with maximum concurrency
    console.log(`Starting ${daysToDownload.length} concurrent downloads...`);
    
    // Create a promise for each day's download
    const downloadPromises = daysToDownload.map((dayStr, index) => {
      return downloadWithRetry(dayStr, jobFolder, index, daysToDownload.length)
        .catch(error => {
          // This will only be called if all retry attempts fail
          return null;
        });
    });
    
    // Process all downloads concurrently
    const results = await Promise.all(downloadPromises);
    
    // Calculate results
    const successCount = results.filter(result => result !== null).length;
    const failedDays = daysToDownload.filter((day, index) => results[index] === null);
    
    // Calculate performance statistics
    const totalTimeSeconds = Math.round((Date.now() - startTime) / 1000);
    const filesPerSecond = totalTimeSeconds > 0 ? Math.round((successCount / totalTimeSeconds) * 10) / 10 : 'N/A';
    
        // Summary
        console.log("\n=== Download Summary ===");
        console.log(`Total days with data: ${daysWithData.length}`);
        console.log(`Total days with no data (skipped): ${emptyDays.length}`);
        
        if (userStart && userEnd) {
          console.log(`Total days in selected date range: ${totalDaysInRange}`);
          console.log(`Days with data in range: ${daysToDownload.length}`);
          console.log(`Days with no data in range (skipped): ${emptyDaysInRange.length}`);
          console.log(`Days outside job scope: ${daysOutsideJobScope}`);
        } else {
          console.log(`Downloaded full job data (no date filter applied)`);
        }
        
        console.log(`Total days to download: ${daysToDownload.length}`);
        console.log(`Successfully downloaded: ${successCount}`);
        console.log(`Failed downloads: ${failedDays.length}`);
        console.log(`Time taken: ${totalTimeSeconds} seconds (${filesPerSecond} files/sec)`);
        
        if (failedDays.length > 0) {
          console.log("Failed days:", failedDays.slice(0, 10).join(', ') + 
            (failedDays.length > 10 ? ` and ${failedDays.length - 10} more...` : ''));
        }
        
        console.log(`\nFiles saved to: ${jobFolder}`);
        
      } catch (error) {
        console.error("Error downloading export files:", error.message);
      }
    }

downloadCustomJobExports();