const helpText = `
Twilio Logs Download Automation
------------------------------
A tool for downloading and processing Twilio message logs

USAGE
  npm run download:last-week              # Download previous week's logs
  npm run download:last-month             # Download previous month's logs
  npm run download:job <jobId>            # Download specific job
  npm run download:custom <start> <end>   # Download custom date range

EXAMPLES
  # Download last week's data
  npm run download:last-week

  # Download last month's data
  npm run download:last-month

  # Download specific job by ID or name
  npm run download:job -- "JS123abc"
  npm run download:job -- "My_Custom_Job"

  # Download custom date range
  npm run download:custom -- 2025-04-01 2025-04-07

  # Download with custom name
  npm run download:custom -- --name quarterly_report 2025-04-01 2025-06-30

LIMITATIONS
  • Date range cannot exceed 366 days (Twilio API limitation)
  • Account and subaccounts limited to 366 days total per UTC calendar day
  • One data file generated per day in the range
  • All dates must be in YYYY-MM-DD format

OUTPUT
  Downloads: ./downloads/<job_name>/
  Processed: ./downloads/<job_name>/export.csv
`;

module.exports = { helpText };