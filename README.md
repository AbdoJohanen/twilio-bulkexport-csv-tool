# Twilio Bulk Export CSV Tool

Automate the download, validation, and transformation of Twilio message exports into CSV reports.

A command-line tool for downloading and processing message logs from Twilio's Bulk Exports API. The tool supports downloading logs for specific jobs, the previous week, the previous month, or a custom date range. It processes the exported data into a structured CSV format for further analysis.

## Features

- Download logs for a specific job by SID or name
- Automatically fetch logs for the previous week or month
- Download logs for a custom date range (with optional job naming)
- Converts `.json.gz` files into semicolon-separated `.csv` files
- Handles large data exports with retry and progress bar support
- Logs all actions to console and log files

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/AbdoJohanen/twilio-bulkexport-csv-tool.git
cd twilio-bulkexport-csv-tool
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the **root directory** of the project with the following content:

```env
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
```

You can find these credentials in your [Twilio Console](https://www.twilio.com/console).

> The `.env` file is used to authenticate requests to Twilio's Bulk Exports API.

---

## Usage

The following commands are available via `npm` scripts:

| Command                          | Description                              |
|----------------------------------|------------------------------------------|
| `npm run download:last-week`     | Download logs for the previous week      |
| `npm run download:last-month`    | Download logs for the previous month     |
| `npm run download:job -- <id>`   | Download logs for a specific job         |
| `npm run download:custom -- <start> <end>` | Download logs for a custom date range |
| `npm run download:custom -- --name <name> <start> <end>` | Custom job with a name |

### Examples

```bash
# You can display available commands and usage examples at any time by running:
npm run help

# Download last week's logs
npm run download:last-week

# Download last month's logs
npm run download:last-month

# Download a specific job by SID or friendly name
npm run download:job -- "JS123abc"
npm run download:job -- "Monthly_Report_March"

# Download a custom date range
npm run download:custom -- 2025-04-01 2025-04-07

# Download a custom date range with a job name
npm run download:custom -- --name quarterly_report 2025-04-01 2025-06-30
```

---

## Limitations

### File Availability

Twilio only keeps the downloadable export files available for a **limited time** (typically a few days). After that period, the job information will still appear in the API, but the actual files will return 404 errors when requested.

The tool handles this automatically by:
1. First checking if a job already exists for the requested date range
2. Verifying that the files are still available for download
3. Creating a new export job if the existing job's files have expired

This behavior ensures you always get the data, even if it means creating a new export job for a date range you've exported before.

### Rate Limits

Twilio has API rate limits that may affect large exports:
- Requests per second limits (on both job creation and file downloads)
- Maximum number of concurrent export jobs
- Maximum number of days per export job

The tool includes built-in retry logic and handles rate limiting gracefully.

---
- Terminal output is colorized for readability, but logs are saved as clean plain text

---

## Limitations

- Date ranges must not exceed **366 days**
- All dates must be in **YYYY-MM-DD** format
- One file is generated per day within the selected range
- Requires a valid Twilio account with Bulk Exports enabled

---

## License

This project is licensed under the **GNU General Public License v3.0**. See the [LICENSE](LICENSE) file for details.
