const moment = require('moment');

/**
 * Gets the start and end dates for the previous week (Monday to Sunday)
 * @returns {{monday: string, sunday: string}} Dates in YYYY-MM-DD format
 */
function getPreviousWeekDates() {
  const monday = moment().subtract(1, 'weeks').startOf('isoWeek');
  const sunday = moment(monday).endOf('isoWeek');
  return {
      monday: monday.format('YYYY-MM-DD'),
      sunday: sunday.format('YYYY-MM-DD')
  };
}


/**
* Gets the start and end dates for the previous month
* @returns {{start: string, end: string}} Dates in YYYY-MM-DD format
*/
function getPreviousMonthDates() {
  const lastMonth = moment().subtract(1, 'month');
  return {
      start: lastMonth.startOf('month').format('YYYY-MM-DD'),
      end: lastMonth.endOf('month').format('YYYY-MM-DD')
  };
}


/**
 * Generates an array of date strings (YYYY-MM-DD) between two given dates (inclusive).
 * 
 * @param {string} startDay - Start date in YYYY-MM-DD format.
 * @param {string} endDay - End date in YYYY-MM-DD format.
 * @returns {string[]} An array of date strings.
 */
function generateDaysBetweenDates(startDay, endDay) {
  let days = [];
  let current = new Date(`${startDay}T12:00:00`);
  const final = new Date(`${endDay}T12:00:00`);
  final.setDate(final.getDate() + 1);

  while (current < final) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    days.push(`${year}-${month}-${day}`);
    current.setDate(current.getDate() + 1);
  }
  return days;
}

module.exports = {
  getPreviousWeekDates,
  getPreviousMonthDates,
  generateDaysBetweenDates
};