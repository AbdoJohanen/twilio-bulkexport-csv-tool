const fs = require('fs');
const fsExtra = require('fs-extra');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');

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
 */
async function processFiles(jobFolder) {
  console.log(`Processing files in folder: ${jobFolder}`);

  // Files are located in the "files" subfolder
  const filesDir = path.join(jobFolder, 'files');
  const files = await fsExtra.readdir(filesDir);
  const jsonGzFiles = files.filter(file => file.endsWith('.json.gz'));
  console.log(`Found ${jsonGzFiles.length} .json.gz files to process.`);

  // Process each file concurrently.
  const fileProcessPromises = jsonGzFiles.map(async (filename) => {
    const filePath = path.join(filesDir, filename);
    // Extract the date from the filename (expects format: export_YYYY-MM-DD.json.gz)
    const match = filename.match(/export_(\d{4}-\d{2}-\d{2})\.json\.gz/);
    let fileDate = match ? match[1] : null;
    const records = [];
    
    // Create a read stream and pipe it through gunzip.
    const fileStream = fs.createReadStream(filePath);
    const gunzip = zlib.createGunzip();
    const stream = fileStream.pipe(gunzip);
    
    // Use readline to process the file line by line.
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity
    });
    
    for await (const line of rl) {
      if (line.trim().length === 0) continue;
      try {
        const record = JSON.parse(line);
        // Attach the file's date (for later sorting)
        record.fileDate = fileDate;
        records.push(record);
      } catch (err) {
        console.error(`Error parsing JSON in file ${filename}: ${err.message}`);
      }
    }
    return records;
  });

  // Wait for all files to finish processing and flatten the results.
  const recordsArrays = await Promise.all(fileProcessPromises);
  let allRecords = recordsArrays.flat();

  // Sort records so that those from the oldest date file come first.
  allRecords.sort((a, b) => {
    if (a.fileDate < b.fileDate) return -1;
    if (a.fileDate > b.fileDate) return 1;
    return 0;
  });

  console.log(`Total records processed: ${allRecords.length}`);

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
  allRecords.forEach(record => {
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
  });

  const csvContent = csvLines.join('\n');
  // Save the CSV file in the main job folder (not in the "files" subfolder)
  const outputPath = path.join(jobFolder, 'export.csv');
  await fsExtra.writeFile(outputPath, csvContent);
  console.log(`CSV file has been written to: ${outputPath}`);
}

module.exports = { processFiles };