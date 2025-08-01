import { MarkdownManager } from '../utils/markdown-manager.js';
import { AnthropicClient } from '../utils/anthropic-client.js';
import { EnvLoader } from '../utils/env-loader.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Base class for all analysis agents.
 * Provides common functionality for file operations, AI calls, and report generation.
 * 
 * @class BaseAgent
 * @abstract
 * @example
 * class MyAgent extends BaseAgent {
 *   async analyze() {
 *     const files = await this.findFiles('**\/*.js');
 *     return this.formatAnalysis('My analysis results');
 *   }
 * }
 */
export class BaseAgent {
  /**
   * Creates a new BaseAgent instance.
   * 
   * @param {string} name - Name of the agent
   * @param {Object} [config={}] - Agent configuration
   * @param {string} [config.systemPrompt=''] - System prompt for AI calls
   * @param {number} [config.maxTokens=4000] - Maximum tokens for AI responses
   * @param {Array} [config.tools=[]] - Available tools for the agent
   */
  constructor(name, config = {}) {
    this.name = name;
    this.config = {
      systemPrompt: '',
      maxTokens: 4000,
      tools: [],
      ...config
    };
    this.workingFile = null;
    this.repoPath = null;
    this.exclusionManager = null;
    this.consoleUtils = null; // Will be set by orchestrator
    this.model = null; // Will be set by orchestrator
    this.anthropicClient = new AnthropicClient(this.consoleUtils);
  }

  async initialize(repoPath, config = {}, outputDir = 'output') {
    this.repoPath = repoPath;
    this.config = { ...this.config, ...config };
    
    // Note: AnthropicClient will be updated after model is set by orchestrator
    // This is handled in updateAnthropicClient() method
    
    // Verify API key is available for real analysis
    this.validateApiAccess();
    
    // Create working file for this agent
    this.workingFile = MarkdownManager.createWorkingFile(this.name, repoPath, outputDir);
    
    if (this.consoleUtils) {
      this.consoleUtils.verboseInfo(`Initialized ${this.name} agent`);
      this.consoleUtils.verboseInfo(`Working file: ${this.workingFile}`);
    } else {
      console.log(`🤖 Initialized ${this.name} agent`);
      console.log(`📄 Working file: ${this.workingFile}`);
    }
  }

  async analyze() {
    throw new Error(`Agent ${this.name} must implement the analyze() method`);
  }

  /**
   * Update the AnthropicClient with current consoleUtils and model
   * Called by orchestrator after model is set
   */
  updateAnthropicClient() {
    this.anthropicClient = new AnthropicClient(this.consoleUtils, this.model);
  }

  readWorkingMemory() {
    if (!this.workingFile) {
      throw new Error('Agent not initialized. Call initialize() first.');
    }
    return MarkdownManager.readFile(this.workingFile);
  }

  writeWorkingMemory(content) {
    if (!this.workingFile) {
      throw new Error('Agent not initialized. Call initialize() first.');
    }
    MarkdownManager.writeFile(this.workingFile, content);
  }

  updateAnalysisSection(analysisContent) {
    try {
      const currentContent = this.readWorkingMemory();
      const resultsStart = currentContent.indexOf('## Analysis Results');
      const coordinationStart = currentContent.indexOf('## Coordination');
      
      if (this.consoleUtils) {
        this.consoleUtils.verboseInfo(`${this.name}: Updating analysis section (${analysisContent?.length || 0} chars)`);
      } else {
        console.log(`📝 ${this.name}: Updating analysis section...`, {
          contentLength: analysisContent?.length || 0,
          contentType: typeof analysisContent,
          resultsStart,
          coordinationStart,
          workingFileLength: currentContent?.length || 0
        });
      }
      
      if (resultsStart === -1 || coordinationStart === -1) {
        this.logError('Invalid working file format - missing required sections', new Error(`Missing sections: resultsStart=${resultsStart}, coordinationStart=${coordinationStart}`));
        throw new Error('Invalid working file format');
      }
      
      // Log if analysisContent is null or problematic
      if (!analysisContent) {
        this.logError('Attempting to update analysis section with null/undefined content');
        analysisContent = 'Analysis failed to generate content';
      }
      
      if (typeof analysisContent !== 'string') {
        this.logError('Analysis content is not a string', new Error(`Content type: ${typeof analysisContent}, Content: ${JSON.stringify(analysisContent)}`));
        analysisContent = String(analysisContent);
      }

      const beforeResults = currentContent.substring(0, resultsStart + '## Analysis Results'.length);
      const afterCoordination = currentContent.substring(coordinationStart);
      
      const newContent = beforeResults + '\n\n' + analysisContent + '\n\n' + afterCoordination;
      this.writeWorkingMemory(newContent);
      
      if (this.consoleUtils) {
        this.consoleUtils.verboseSuccess(`${this.name}: Analysis section updated successfully`);
      } else {
        console.log(`✅ ${this.name}: Analysis section updated successfully`);
      }
    } catch (error) {
      this.logError('Failed to update analysis section', error);
      throw error;
    }
  }

  checkForComments() {
    const content = this.readWorkingMemory();
    const allComments = MarkdownManager.parseComments(content);
    
    // Find comments directed at this agent that are pending
    return allComments.filter(comment => 
      comment.targetAgent === this.name && 
      comment.status === 'pending'
    );
  }

  async addComment(targetAgent, question, context, round = 1) {
    if (!this.workingFile) {
      throw new Error('Agent not initialized. Call initialize() first.');
    }

    if (this.consoleUtils) {
      this.consoleUtils.verboseInfo(`${this.name} asking ${targetAgent}: ${question}`);
    } else {
      console.log(`💬 ${this.name} asking ${targetAgent}: ${question}`);
    }
    
    return MarkdownManager.addComment(
      this.workingFile,
      targetAgent,
      question,
      context,
      round
    );
  }

  async respondToQuestion(question, askingAgent) {
    if (this.consoleUtils) {
      this.consoleUtils.verboseInfo(`${this.name} responding to ${askingAgent}: ${question.question}`);
    } else {
      console.log(`🤔 ${this.name} responding to ${askingAgent}: ${question.question}`);
    }
    
    const responsePrompt = `
You are being asked a question by another analysis agent about the codebase you've been analyzing.

**Question from ${askingAgent}:** ${question.question}
**Context:** ${question.context}

Based on your analysis of the repository at ${this.repoPath}, please provide a helpful and specific response.
Your response should be concise but informative, focusing on practical insights.

If you need to examine specific files to answer this question, you can reference them by path.
`;

    try {
      const response = await this.callAnthropic(responsePrompt);
      return response;
    } catch (error) {
      if (this.consoleUtils) {
        this.consoleUtils.error(`Error generating response: ${error.message}`);
      } else {
        console.error(`❌ Error generating response: ${error.message}`);
      }
      return `I encountered an error while trying to respond: ${error.message}`;
    }
  }

  async callAnthropic(prompt, context = '') {
    const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;
    
    try {
      return await this.anthropicClient.call(
        fullPrompt,
        this.config.systemPrompt,
        this.config.maxTokens
      );
    } catch (error) {
      if (this.consoleUtils) {
        this.consoleUtils.error(`${this.name} AI call failed: ${error.message}`);
      } else {
        console.error(`❌ ${this.name} AI call failed: ${error.message}`);
      }
      throw error;
    }
  }

  async readFile(filePath) {
    const fullPath = join(this.repoPath, filePath);
    if (!existsSync(fullPath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    return readFileSync(fullPath, 'utf8');
  }

  async readFiles(filePaths) {
    const results = {};
    for (const filePath of filePaths) {
      try {
        results[filePath] = await this.readFile(filePath);
      } catch (error) {
        results[filePath] = `Error reading file: ${error.message}`;
      }
    }
    return results;
  }

  async findFiles(pattern, options = {}) {
    const { glob } = await import('glob');
    try {
      let globOptions = { 
        cwd: this.repoPath,
        ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**']
      };
      
      // Use exclusion manager if available and not bypassed
      if (this.exclusionManager && !options.bypassExclusions) {
        globOptions.ignore = this.exclusionManager.getAllExclusions();
      }
      
      const files = await glob(pattern, globOptions);
      return files;
    } catch (error) {
      if (this.consoleUtils) {
        this.consoleUtils.verboseDim(`Error finding files with pattern ${pattern}: ${error.message}`);
      } else {
        console.error(`Error finding files with pattern ${pattern}: ${error.message}`);
      }
      return [];
    }
  }

  logProgress(message) {
    if (this.consoleUtils) {
      this.consoleUtils.verboseInfo(`${this.name}: ${message}`);
    } else {
      console.log(`📊 ${this.name}: ${message}`);
    }
  }

  logError(message, error = null) {
    const timestamp = new Date().toISOString();
    const errorId = Math.random().toString(36).substr(2, 9);
    
    if (this.consoleUtils) {
      this.consoleUtils.error(`${this.name}: ${message} [${errorId}]`);
    } else {
      console.error(`❌ ${this.name}: ${message} [${errorId}]`);
    }
    
    let errorDetails = {
      timestamp,
      errorId,
      agent: this.name,
      message,
      repoPath: this.repoPath,
      usingFallbackAnalysis: this.usingFallbackAnalysis
    };
    
    if (error) {
      if (this.consoleUtils) {
        this.consoleUtils.verboseDim(`${this.name}: Error details [${errorId}]: ${error.message}`);
        this.consoleUtils.verboseDim(`${this.name}: Stack trace [${errorId}]: ${error.stack}`);
      } else {
        console.error(`❌ ${this.name}: Error details [${errorId}]:`, error);
        console.error(`❌ ${this.name}: Stack trace [${errorId}]:`, error.stack);
      }
      
      errorDetails.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code
      };
    }
    
    this.logToErrorFile(errorDetails);
  }

  async logToErrorFile(errorDetails) {
    try {
      const { writeFileSync, existsSync, appendFileSync } = await import('fs');
      const { join, dirname } = await import('path');
      
      const outputDir = this.workingFile ? dirname(this.workingFile) : 'output';
      const errorLogPath = join(outputDir, 'error-log.md');
      const errorEntry = `
## Error ${errorDetails.errorId}

**Agent:** ${errorDetails.agent}  
**Timestamp:** ${errorDetails.timestamp}  
**Message:** ${errorDetails.message}  
**Using Fallback:** ${errorDetails.usingFallbackAnalysis}  
**Repo Path:** ${errorDetails.repoPath}  

`;
      
      if (errorDetails.error) {
        const errorInfo = `**Error Details:**
- **Type:** ${errorDetails.error.name}
- **Message:** ${errorDetails.error.message}
- **Code:** ${errorDetails.error.code || 'N/A'}

**Stack Trace:**
\`\`\`
${errorDetails.error.stack}
\`\`\`

---
`;
        
        const fullEntry = errorEntry + errorInfo;
        
        if (!existsSync(errorLogPath)) {
          const header = `# Code Analyzer Error Log

Generated: ${new Date().toISOString()}

---
`;
          writeFileSync(errorLogPath, header + fullEntry);
        } else {
          appendFileSync(errorLogPath, fullEntry);
        }
      } else {
        const simpleEntry = errorEntry + '---\n';
        if (!existsSync(errorLogPath)) {
          const header = `# Code Analyzer Error Log

Generated: ${new Date().toISOString()}

---
`;
          writeFileSync(errorLogPath, header + simpleEntry);
        } else {
          appendFileSync(errorLogPath, simpleEntry);
        }
      }
    } catch (loggingError) {
      if (this.consoleUtils) {
        this.consoleUtils.verboseDim(`${this.name}: Failed to write to error log: ${loggingError.message}`);
      } else {
        console.error(`❌ ${this.name}: Failed to write to error log:`, loggingError);
      }
    }
  }

  validateApiAccess() {
    // Always use fallback mode during testing to prevent API calls and costs
    if (this.isTestEnvironment()) {
      if (this.consoleUtils) {
        this.consoleUtils.verboseInfo(`${this.name}: Test environment detected - using fallback analysis`);
      } else {
        console.log(`🧪 ${this.name}: Test environment detected - using fallback analysis`);
      }
      this.usingFallbackAnalysis = true;
      return;
    }

    // Try to load .env file if not already loaded (in case agent is used directly)
    EnvLoader.load('.env', { silent: true });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      if (this.consoleUtils) {
        this.consoleUtils.warning(`No ANTHROPIC_API_KEY found!`);
        this.consoleUtils.warning(`Agent ${this.name} will use fallback pattern-matching instead of AI analysis`);
        this.consoleUtils.warning(`This may produce inaccurate results. Set ANTHROPIC_API_KEY for real analysis.`);
      } else {
        console.error(`🚨 WARNING: No ANTHROPIC_API_KEY found!`);
        console.error(`🚨 Agent ${this.name} will use fallback pattern-matching instead of AI analysis`);
        console.error(`🚨 This may produce inaccurate results. Set ANTHROPIC_API_KEY for real analysis.`);
      }
      this.usingFallbackAnalysis = true;
    } else {
      if (this.consoleUtils) {
        this.consoleUtils.verboseInfo(`${this.name}: Using real AI analysis with API key`);
      } else {
        console.log(`✅ ${this.name}: Using real AI analysis with API key`);
      }
      this.usingFallbackAnalysis = false;
    }
  }

  /**
   * Detects if the code is running in a test environment.
   * Uses multiple indicators to safely detect testing scenarios.
   * @private
   * @returns {boolean} True if running in test environment
   */
  isTestEnvironment() {
    // Check for explicit test environment variable
    if (process.env.NODE_ENV === 'test') {
      return true;
    }

    // Check if running with Node.js test runner
    if (process.argv.includes('--test')) {
      return true;
    }

    // Check for common test runners in process title or arguments
    // Be more specific to avoid false positives from exclusion patterns
    const testIndicators = ['jest', 'mocha', 'vitest', 'ava'];
    const processTitle = process.title?.toLowerCase() || '';
    const processArgs = process.argv.join(' ').toLowerCase();
    
    // Check for test runners in process title
    if (testIndicators.some(indicator => processTitle.includes(indicator))) {
      return true;
    }
    
    // Check for test runner commands (not just mentions of 'test')
    if (/\b(jest|mocha|vitest|ava)\b/.test(processArgs)) {
      return true;
    }
    
    // Check for npm test scripts specifically
    if (processArgs.includes('npm test') || processArgs.includes('npm run test')) {
      return true;
    }

    // Check for test file patterns in the process arguments
    // But exclude exclusion patterns (--exclude arguments)
    const testFileFound = process.argv.find((arg, index) => {
      // Skip exclusion patterns (--exclude arguments)
      if (process.argv[index - 1] === '--exclude' || process.argv[index - 1] === '-e') {
        return false;
      }
      
      // Only check actual file paths, not exclusion patterns
      return (arg.includes('.test.') || 
              arg.includes('.spec.') || 
              (arg.includes('test/') && !arg.includes('*')) ||  // Avoid glob patterns
              (arg.includes('spec/') && !arg.includes('*')))   // Avoid glob patterns
             && !arg.startsWith('-'); // Skip any option flags
    });
    
    if (testFileFound) {
      return true;
    }

    return false;
  }

  async callAI(prompt, systemPrompt = '') {
    const debugInfo = {
      agent: this.name,
      promptLength: prompt?.length || 0,
      systemPromptLength: systemPrompt?.length || 0,
      maxTokens: this.config.maxTokens,
      usingFallbackAnalysis: this.usingFallbackAnalysis
    };
    
    if (this.consoleUtils) {
      this.consoleUtils.verboseInfo(`${this.name}: Attempting AI analysis (${debugInfo.promptLength} chars)`);
    } else {
      console.log(`🤖 ${this.name}: Attempting AI analysis...`, {
        promptLength: debugInfo.promptLength,
        systemPromptLength: debugInfo.systemPromptLength,
        maxTokens: debugInfo.maxTokens
      });
    }
    
    if (this.usingFallbackAnalysis) {
      if (this.consoleUtils) {
        this.consoleUtils.verboseInfo(`${this.name}: Skipping AI analysis - no API key available`);
      } else {
        console.warn(`⚠️  ${this.name}: Skipping AI analysis - no API key available`);
      }
      this.logError('AI analysis skipped - using fallback mode');
      return null;
    }
    
    try {
      const { AnthropicClient } = await import('../utils/anthropic-client.js');
      const client = new AnthropicClient(this.consoleUtils, this.model);
      
      if (this.consoleUtils) {
        this.consoleUtils.verboseInfo(`${this.name}: Calling Anthropic API...`);
      } else {
        console.log(`🔄 ${this.name}: Calling Anthropic API...`);
      }
      const response = await client.call(prompt, systemPrompt, this.config.maxTokens);
      
      if (this.consoleUtils) {
        this.consoleUtils.verboseSuccess(`${this.name}: Successfully completed AI analysis (${response?.length || 0} chars)`);
      } else {
        console.log(`✅ ${this.name}: Successfully completed AI analysis`, {
          responseLength: response?.length || 0,
          responseType: typeof response
        });
      }
      
      // Log if response is null or empty
      if (!response || response.trim() === '') {
        this.logError('AI analysis returned empty or null response', new Error('Empty AI response'));
        return null;
      }
      
      return response;
    } catch (error) {
      this.logError(`AI analysis failed: ${error.message}`, error);
      if (this.consoleUtils) {
        this.consoleUtils.verboseInfo(`${this.name}: Falling back to pattern-matching analysis`);
      } else {
        console.error(`⚠️  ${this.name}: Falling back to pattern-matching analysis`);
      }
      this.usingFallbackAnalysis = true;
      return null;
    }
  }

  // Test discovery methods - bypass exclusions for accurate detection
  async discoverTestCoverage() {
    const packageJsonTests = await this.checkPackageJsonForTests();
    const testFiles = await this.countTestFiles();
    const testDirectories = await this.checkTestDirectories();
    
    return this.generateTestCoverageReport(packageJsonTests, testFiles, testDirectories);
  }

  async checkPackageJsonForTests() {
    try {
      const packagePath = join(this.repoPath, 'package.json');
      if (!existsSync(packagePath)) {
        return { hasTestScript: false, testCommand: null };
      }
      
      const packageContent = JSON.parse(readFileSync(packagePath, 'utf8'));
      const scripts = packageContent.scripts || {};
      
      const testScript = scripts.test;
      const hasTestScript = testScript && testScript !== 'echo "Error: no test specified" && exit 1';
      
      return {
        hasTestScript,
        testCommand: testScript,
        hasOtherTestScripts: Object.keys(scripts).some(key => 
          key.includes('test') && key !== 'test'
        )
      };
    } catch (error) {
      return { hasTestScript: false, testCommand: null, error: error.message };
    }
  }

  async countTestFiles() {
    const testPatterns = [
      '**/*.test.js',
      '**/*.test.ts', 
      '**/*.spec.js',
      '**/*.spec.ts'
    ];
    
    let totalTestFiles = 0;
    const filesByPattern = {};
    
    for (const pattern of testPatterns) {
      const files = await this.findFiles(pattern, { bypassExclusions: true });
      filesByPattern[pattern] = files.length;
      totalTestFiles += files.length;
    }
    
    return {
      totalTestFiles,
      filesByPattern,
      hasTestFiles: totalTestFiles > 0
    };
  }

  async checkTestDirectories() {
    const testDirPatterns = [
      'test/**',
      'tests/**',
      'spec/**',
      '__tests__/**',
      'src/**/__tests__/**'
    ];
    
    const foundDirectories = [];
    let totalTestDirFiles = 0;
    
    for (const pattern of testDirPatterns) {
      const files = await this.findFiles(pattern, { bypassExclusions: true });
      if (files.length > 0) {
        foundDirectories.push({
          pattern,
          files: files.length
        });
        totalTestDirFiles += files.length;
      }
    }
    
    return {
      foundDirectories,
      totalTestDirFiles,
      hasTestDirectories: foundDirectories.length > 0
    };
  }

  generateTestCoverageReport(packageJsonTests, testFiles, testDirectories) {
    const hasAnyTests = packageJsonTests.hasTestScript || testFiles.hasTestFiles || testDirectories.hasTestDirectories;
    
    if (!hasAnyTests) {
      return '❌ **No test files found** - Testing is critical for code quality\n\n**Recommendations:**\n- Add test files (*.test.js, *.spec.js)\n- Set up testing framework (Jest, Mocha, etc.)\n- Add test script to package.json';
    }
    
    let report = '✅ **Testing Infrastructure Detected**\n\n';
    
    // Package.json test scripts
    if (packageJsonTests.hasTestScript) {
      report += `📦 **Test Script**: \`${packageJsonTests.testCommand}\`\n`;
      if (packageJsonTests.hasOtherTestScripts) {
        report += '📦 **Additional test scripts found** (test:unit, test:integration, etc.)\n';
      }
    } else {
      report += '⚠️ **No test script in package.json**\n';
    }
    
    // Test files
    if (testFiles.hasTestFiles) {
      report += `🧪 **Test Files**: ${testFiles.totalTestFiles} files found\n`;
      
      const patterns = Object.entries(testFiles.filesByPattern)
        .filter(([, count]) => count > 0)
        .map(([pattern, count]) => `  - ${pattern}: ${count} files`)
        .join('\n');
      
      if (patterns) {
        report += patterns + '\n';
      }
    }
    
    // Test directories
    if (testDirectories.hasTestDirectories) {
      report += `📁 **Test Directories**: ${testDirectories.foundDirectories.length} directories found\n`;
      
      const dirInfo = testDirectories.foundDirectories
        .map(dir => `  - ${dir.pattern}: ${dir.files} files`)
        .join('\n');
      
      report += dirInfo + '\n';
    }
    
    report += '\n**Note**: Tests are excluded from code quality analysis but detected for coverage reporting.';
    
    return report;
  }

  // Helper method to create structured analysis output
  formatAnalysis(title, sections) {
    let output = `### ${title}\n\n`;
    
    for (const [sectionTitle, content] of Object.entries(sections)) {
      output += `#### ${sectionTitle}\n\n`;
      if (Array.isArray(content)) {
        content.forEach(item => {
          output += `- ${item}\n`;
        });
      } else {
        output += `${content}\n`;
      }
      output += '\n';
    }
    
    return output;
  }
}