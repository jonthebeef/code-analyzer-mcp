import chalk from 'chalk';
import ora from 'ora';
import cliProgress from 'cli-progress';

/**
 * Enhanced console utilities for better user experience
 */
export class ConsoleUtils {
  constructor() {
    this.isTestEnvironment = process.env.NODE_ENV === 'test';
    this.spinner = null;
    this.progressBar = null;
    this.verbose = false; // Default to non-verbose mode
  }

  /**
   * Check if we're in a test environment to suppress visual elements
   */
  shouldSuppressVisuals() {
    return this.isTestEnvironment || process.env.CI === 'true';
  }

  /**
   * Create and start a spinner
   */
  startSpinner(text, options = {}) {
    if (this.shouldSuppressVisuals()) {
      console.log(`🔄 ${text}`);
      return { stop: () => {}, succeed: () => {}, fail: () => {} };
    }

    this.spinner = ora({
      text,
      color: 'blue',
      ...options
    }).start();

    return this.spinner;
  }

  /**
   * Stop current spinner
   */
  stopSpinner() {
    if (this.spinner && !this.shouldSuppressVisuals()) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  /**
   * Create a progress bar
   */
  createProgressBar(total, options = {}) {
    if (this.shouldSuppressVisuals()) {
      return {
        start: () => {},
        update: (current) => console.log(`Progress: ${current}/${total}`),
        stop: () => {}
      };
    }

    this.progressBar = new cliProgress.SingleBar({
      format: `${chalk.blue('Progress')} |${chalk.cyan('{bar}')}| {percentage}% | {value}/{total} agents`,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      ...options
    });

    return {
      start: () => this.progressBar.start(total, 0),
      update: (current) => this.progressBar.update(current),
      stop: () => {
        this.progressBar.stop();
        this.progressBar = null;
      }
    };
  }

  /**
   * Colored console output methods
   */
  success(message) {
    console.log(chalk.green(`✅ ${message}`));
  }

  info(message) {
    console.log(chalk.blue(`ℹ️  ${message}`));
  }

  warning(message) {
    console.log(chalk.yellow(`⚠️  ${message}`));
  }

  error(message) {
    console.log(chalk.red(`❌ ${message}`));
  }

  highlight(message) {
    console.log(chalk.cyan(message));
  }

  dim(message) {
    console.log(chalk.gray(message));
  }

  /**
   * Verbose-only console output methods
   */
  verboseInfo(message) {
    if (this.verbose) {
      console.log(chalk.blue(`ℹ️  ${message}`));
    }
  }

  verboseSuccess(message) {
    if (this.verbose) {
      console.log(chalk.green(`✅ ${message}`));
    }
  }

  verboseLog(message) {
    if (this.verbose) {
      console.log(message);
    }
  }

  verboseDim(message) {
    if (this.verbose) {
      console.log(chalk.gray(message));
    }
  }

  /**
   * Format analysis statistics
   */
  showAnalysisStats(stats) {
    console.log(chalk.blue('\n📊 Analysis Summary:'));
    console.log(chalk.gray('─'.repeat(40)));
    
    if (stats.filesAnalyzed) {
      console.log(chalk.white(`📁 Files analyzed: ${chalk.cyan(stats.filesAnalyzed)}`));
    }
    if (stats.agentsRun) {
      console.log(chalk.white(`🤖 Agents executed: ${chalk.cyan(stats.agentsRun)}`));
    }
    if (stats.duration) {
      console.log(chalk.white(`⏱️  Total time: ${chalk.cyan(stats.duration)}`));
    }
    if (stats.outputDir) {
      console.log(chalk.white(`📂 Reports saved to: ${chalk.cyan(stats.outputDir)}`));
    }
    
    console.log(chalk.gray('─'.repeat(40)));
  }

  /**
   * Clean up any active visual elements
   */
  cleanup() {
    this.stopSpinner();
    if (this.progressBar) {
      this.progressBar.stop();
      this.progressBar = null;
    }
  }
}

// Export a singleton instance
export const consoleUtils = new ConsoleUtils();