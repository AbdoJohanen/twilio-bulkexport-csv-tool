const moment = require('moment');

/**
 * Validates that a date string is in YYYY-MM-DD format
 * @param {string} dateStr - The date string to validate
 * @throws {Error} If date format is invalid
 */
function validateDate(dateStr) {
    if (!moment(dateStr, 'YYYY-MM-DD', true).isValid()) {
        throw new Error(`Invalid date format: ${dateStr}. Use YYYY-MM-DD`);
    }
}


/**
 * Validates that a date range is valid and within Twilio's limits
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {number} Number of days in the range
 * @throws {Error} If date range is invalid or exceeds limits
 */
function validateDateRange(startDate, endDate) {
    const days = moment(endDate).diff(moment(startDate), 'days') + 1;
    if (days > 366) {
        throw new Error('Date range cannot exceed 366 days due to Twilio API limitations');
    }
    if (days < 1) {
        throw new Error('End date must be on or after start date');
    }
    return days;
}

module.exports = {
    validateDate,
    validateDateRange
};