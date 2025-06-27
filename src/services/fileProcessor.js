const fs = require('fs');
const fsExtra = require('fs-extra');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const logger = require('../utils/logger');

/**
 * Process downloaded .json.gz files:
 * - Reads files from the "files" subfolder of the job folder,
 * - Decompresses each file,
 * - Parses each JSON record (each line),
 * - Combines records from all files,
 * - Sorts records so that records from the oldest date file appear first,
 * - Generates a semicolon-separated CSV file and saves it in the job folder.
 *
 * @param {string} jobFolder - The folder where the job data is stored.
 * @returns {Promise<{path: string, count: number}>} - Path to the CSV file and record count
 * @throws {Error} If file processing fails
 */
async function processFiles(jobFolder) {
  try {
    logger.info(`Processing files in folder: ${jobFolder}`);

    // Check if job folder exists
    if (!await fsExtra.pathExists(jobFolder)) {
      throw new Error(`Job folder ${jobFolder} does not exist`);
    }

    // Files are located in the "files" subfolder
    const filesDir = path.join(jobFolder, 'files');
    
    // Check if files folder exists
    if (!await fsExtra.pathExists(filesDir)) {
      throw new Error(`Files folder ${filesDir} does not exist`);
    }
    
    const files = await fsExtra.readdir(filesDir);
    const jsonGzFiles = files.filter(file => file.endsWith('.json.gz'));
    
    if (jsonGzFiles.length === 0) {
      logger.warn(`No .json.gz files found in ${filesDir}`);
      return { path: null, count: 0 };
    }
    
    logger.info(`Found ${jsonGzFiles.length} .json.gz files to process.`);

    // Process each file concurrently.
    const fileProcessPromises = jsonGzFiles.map(async (filename, index) => {
      const filePath = path.join(filesDir, filename);
      // Extract the date from the filename (expects format: export_YYYY-MM-DD.json.gz)
      const match = filename.match(/export_(\d{4}-\d{2}-\d{2})\.json\.gz/);
      let fileDate = match ? match[1] : null;
      const records = [];
      
      logger.debug(`Processing file ${index + 1}/${jsonGzFiles.length}: ${filename}`);
      
      try {
        // Create a read stream and pipe it through gunzip.
        const fileStream = fs.createReadStream(filePath);
        const gunzip = zlib.createGunzip();
        const stream = fileStream.pipe(gunzip);
        
        // Use readline to process the file line by line.
        const rl = readline.createInterface({
          input: stream,
          crlfDelay: Infinity
        });
        
        let lineCount = 0;
        let errorCount = 0;
        
        for await (const line of rl) {
          lineCount++;
          if (line.trim().length === 0) continue;
          try {
            const record = JSON.parse(line);
            // Attach the file's date (for later sorting)
            record.fileDate = fileDate;
            records.push(record);
          } catch (err) {
            errorCount++;
            logger.error(`Error parsing JSON in file ${filename} at line ${lineCount}: ${err.message}`, {
              file: filename,
              line: lineCount,
              error: err.message
            });
            // Only log up to 10 parse errors per file
            if (errorCount >= 10) {
              logger.warn(`Too many parse errors in file ${filename}, suppressing further errors`);
              break;
            }
          }
        }
        
        logger.debug(`Processed ${filename}: ${records.length} records extracted`, {
          file: filename,
          records: records.length,
          date: fileDate
        });
        
        return records;
      } catch (err) {
        logger.error(`Error processing file ${filename}: ${err.message}`, {
          file: filename,
          error: err.message,
          stack: err.stack
        });
        return []; // Return empty array to continue with other files
      }
    });

    // Wait for all files to finish processing and flatten the results.
    const recordsArrays = await Promise.all(fileProcessPromises);
    let allRecords = recordsArrays.flat();

    if (allRecords.length === 0) {
      logger.warn('No valid records found in any of the files');
      return { path: null, count: 0 };
    }

    // Sort records so that those from the oldest date file come first.
    allRecords.sort((a, b) => {
      if (a.fileDate < b.fileDate) return -1;
      if (a.fileDate > b.fileDate) return 1;
      return 0;
    });

    logger.info(`Total records processed: ${allRecords.length}`);

    // Determine CSV columns based on union of keys across all records.
    const allKeys = new Set();
    allRecords.forEach(record => {
      Object.keys(record).forEach(key => allKeys.add(key));
    });
    const columns = Array.from(allKeys);

    // Build CSV content with a header row.
    const headerLine = columns.join(';');
    const csvLines = [headerLine];

    // Convert each record into a CSV row.
    allRecords.forEach((record, index) => {
      try {
        const row = columns.map(col => {
          let cell = record[col] !== undefined && record[col] !== null ? record[col] : '';
          // If the cell is an object, stringify it.
          if (typeof cell === 'object') {
            cell = JSON.stringify(cell);
          }
          if (typeof cell === 'string') {
            // Replace newline characters with a space.
            cell = cell.replace(/\r?\n|\r/g, ' ');
            // Escape double quotes.
            cell = cell.replace(/"/g, '""');
            
            // If this column is a phone number field, wrap it to force text formatting in Excel.
            if (col === 'to' || col === 'from') {
              // Wrap in formula syntax: ="value"
              cell = `="` + cell + `"`;
            } else if (cell.includes(';') || cell.includes('"')) {
              // Wrap in quotes if the cell contains semicolons or quotes.
              cell = `"${cell}"`;
            }

            if (col === 'price') {
              // Replace period with comma for the price.
              cell = cell.replace('.', ',');
            }
          }
          return cell;
        }).join(';');
        csvLines.push(row);
      } catch (err) {
        logger.error(`Error formatting record at index ${index}: ${err.message}`, {
          recordIndex: index,
          error: err.message
        });
        // Add a placeholder row with an error indicator
        csvLines.push(`"ERROR_FORMATTING_RECORD_${index}"`);
      }
    });

    const csvContent = csvLines.join('\n');
    // Save the CSV file in the main job folder (not in the "files" subfolder)
    const outputPath = path.join(jobFolder, 'export.csv');
    
    try {
      await fsExtra.writeFile(outputPath, csvContent);
      logger.info(`CSV file has been written to: ${outputPath}`, {
        path: outputPath,
        records: allRecords.length,
        sizeKB: Math.round(csvContent.length / 1024)
      });
      return { path: outputPath, count: allRecords.length };
    } catch (err) {
      logger.error(`Error writing CSV file: ${err.message}`, {
        path: outputPath,
        error: err.message,
        stack: err.stack
      });
      throw new Error(`Failed to write CSV file: ${err.message}`);
    }
  } catch (error) {
    logger.error('Error in processFiles', {
      error: error.message,
      stack: error.stack,
      jobFolder
    });
    throw error; // Re-throw to be handled by the caller
  }
}

module.exports = { processFiles };