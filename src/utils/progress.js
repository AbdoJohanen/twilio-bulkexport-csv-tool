const cliProgress = require('cli-progress');
const colors = require('ansi-colors');

/**
 * Creates a progress bar for download tracking
 * @returns {cliProgress.SingleBar} Configured progress bar instance
 */
function createProgressBar() {
    try {
        return new cliProgress.SingleBar({
            format: `${colors.cyan('{bar}')} {percentage}% | {value}/{total} | ETA: {eta_formatted} | Speed: {speed} files/s | {size} MB`,
            hideCursor: true,
            clearOnComplete: false,
        }, cliProgress.Presets.shades_classic);
    } catch (error) {
        console.error('Failed to create progress bar:', error.message);
        // Return a dummy progress bar that does nothing
        return {
            start: () => {},
            update: () => {},
            stop: () => {}
        };
    }
}

module.exports = {
    createProgressBar,
    colors,
    cliProgress
};