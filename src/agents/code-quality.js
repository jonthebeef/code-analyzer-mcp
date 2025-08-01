import { BaseAgent } from './base-agent.js';

/**
 * Agent focused on analyzing code quality metrics including complexity, maintainability, and best practices.
 * Evaluates code structure, design patterns, error handling, performance considerations, and testing practices
 * to provide actionable recommendations for improving code quality.
 * 
 * @class CodeQualityAgent
 * @extends BaseAgent
 * 
 * @example
 * const qualityAgent = new CodeQualityAgent();
 * await qualityAgent.analyze();
 * // Analyzes complexity, code smells, testing practices, and provides improvement suggestions
 */
export class CodeQualityAgent extends BaseAgent {
  constructor(config = {}) {
    super('code-quality', {
      systemPrompt: `You are a code quality expert analyzing JavaScript/TypeScript code. Focus on:
- Code complexity and maintainability
- Function length and single responsibility
- Variable naming and code readability
- Error handling patterns
- Code duplication and DRY principles
- Design patterns and architecture
- Performance considerations
- Testing practices and coverage
- TypeScript usage and type safety

Provide specific recommendations with examples and severity levels.`,
      maxTokens: 4000,
      ...config
    });
  }

  async analyze() {
    this.logProgress('Starting code quality analysis...');
    
    try {
      // Find all source code files
      const sourceFiles = await this.findSourceFiles();
      if (sourceFiles.length === 0) {
        this.updateAnalysisSection('No source code files found to analyze.');
        return;
      }

      this.logProgress(`Analyzing ${sourceFiles.length} source files`);

      // Perform various quality checks
      const complexityAnalysis = await this.analyzeComplexity(sourceFiles);
      const codeSmellsAnalysis = await this.analyzeCodeSmells(sourceFiles);
      const testingAnalysis = await this.discoverTestCoverage(); // Use new test discovery
      const typeScriptAnalysis = await this.analyzeTypeScriptUsage(sourceFiles);
      
      const overallAnalysis = this.formatAnalysis('Code Quality Analysis', {
        'Complexity Analysis': complexityAnalysis,
        'Code Smells & Issues': codeSmellsAnalysis,
        'Testing Practices': testingAnalysis,
        'TypeScript Usage': typeScriptAnalysis,
        'Recommendations': await this.generateQualityRecommendations()
      });
      
      this.updateAnalysisSection(overallAnalysis);
      this.logProgress('Code quality analysis completed');
      
    } catch (error) {
      this.logError('Code quality analysis failed', error);
      this.updateAnalysisSection(`Analysis failed: ${error.message}`);
    }
  }

  async findSourceFiles() {
    const patterns = [
      '**/*.js',
      '**/*.ts',
      '!**/*.test.{js,ts}',
      '!**/*.spec.{js,ts}',
      '!**/node_modules/**',
      '!**/dist/**',
      '!**/build/**'
    ];

    const allFiles = [];
    for (const pattern of patterns) {
      if (pattern.startsWith('!')) {
        // Skip negative patterns for now - would need more sophisticated filtering
        continue;
      }
      const files = await this.findFiles(pattern);
      allFiles.push(...files);
    }

    // Filter out test files and common build directories manually
    return allFiles.filter(file => 
      !file.includes('node_modules') &&
      !file.includes('dist/') &&
      !file.includes('build/') &&
      !file.includes('.test.') &&
      !file.includes('.spec.')
    );
  }

  async analyzeComplexity(sourceFiles) {
    let analysis = '';
    const complexFiles = [];
    let totalFiles = 0;
    let totalLines = 0;

    for (const file of sourceFiles.slice(0, 15)) { // Limit to avoid overwhelming
      try {
        const content = await this.readFile(file);
        const metrics = this.calculateComplexityMetrics(file, content);
        
        totalFiles++;
        totalLines += metrics.lines;
        
        if (metrics.complexity > 10 || metrics.avgFunctionLength > 30) {
          complexFiles.push({
            file,
            ...metrics
          });
        }
        
      } catch (error) {
        continue;
      }
    }

    analysis += `**Overview:**\n`;
    analysis += `- Files analyzed: ${totalFiles}\n`;
    analysis += `- Total lines of code: ${totalLines}\n`;
    analysis += `- Average lines per file: ${Math.round(totalLines / totalFiles)}\n\n`;

    if (complexFiles.length > 0) {
      analysis += `**High Complexity Files:**\n`;
      for (const file of complexFiles) {
        analysis += `- **${file.file}**:\n`;
        analysis += `  - Cyclomatic complexity: ${file.complexity}\n`;
        analysis += `  - Average function length: ${file.avgFunctionLength} lines\n`;
        analysis += `  - Functions > 20 lines: ${file.longFunctions}\n\n`;
      }
    } else {
      analysis += `✅ **No high complexity files detected**\n\n`;
    }

    return analysis;
  }

  calculateComplexityMetrics(fileName, content) {
    const lines = content.split('\n').length;
    
    // Simple cyclomatic complexity calculation
    const complexityPatterns = [
      /if\s*\(/g,
      /else\s+if\s*\(/g,
      /while\s*\(/g,
      /for\s*\(/g,
      /switch\s*\(/g,
      /case\s+/g,
      /catch\s*\(/g,
      /&&/g,
      /\|\|/g,
      /\?.*:/g // ternary
    ];

    let complexity = 1; // Base complexity
    for (const pattern of complexityPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    // Find functions and calculate their lengths
    const functionMatches = content.match(/(function\s+\w+|const\s+\w+\s*=\s*\([^)]*\)\s*=>|\w+\([^)]*\)\s*{)/g) || [];
    const functionCount = functionMatches.length;
    
    // Estimate function lengths by finding function blocks
    const functionBodies = content.match(/{[^{}]*}/g) || [];
    const functionLengths = functionBodies.map(body => body.split('\n').length);
    const avgFunctionLength = functionLengths.length > 0 
      ? Math.round(functionLengths.reduce((sum, len) => sum + len, 0) / functionLengths.length)
      : 0;
    
    const longFunctions = functionLengths.filter(len => len > 20).length;

    return {
      lines,
      complexity,
      functionCount,
      avgFunctionLength,
      longFunctions
    };
  }

  async analyzeCodeSmells(sourceFiles) {
    let analysis = '';
    const issues = [];

    for (const file of sourceFiles.slice(0, 10)) {
      try {
        const content = await this.readFile(file);
        const fileIssues = this.detectCodeSmells(file, content);
        issues.push(...fileIssues);
        
      } catch (error) {
        continue;
      }
    }

    if (issues.length === 0) {
      return '✅ No major code smells detected in analyzed files';
    }

    // Group issues by type
    const groupedIssues = {};
    for (const issue of issues) {
      if (!groupedIssues[issue.type]) {
        groupedIssues[issue.type] = [];
      }
      groupedIssues[issue.type].push(issue);
    }

    for (const [type, typeIssues] of Object.entries(groupedIssues)) {
      analysis += `**${type}** (${typeIssues.length} issues):\n`;
      for (const issue of typeIssues.slice(0, 5)) { // Limit per type
        analysis += `- ${issue.file}: ${issue.description}\n`;
      }
      analysis += '\n';
    }

    return analysis;
  }

  detectCodeSmells(fileName, content) {
    const issues = [];

    // Long parameter lists
    const longParamMatches = content.match(/\([^)]{50,}\)/g);
    if (longParamMatches && longParamMatches.length > 0) {
      issues.push({
        type: 'Long Parameter Lists',
        file: fileName,
        description: `${longParamMatches.length} functions with long parameter lists`
      });
    }

    // Magic numbers (numbers that aren't 0, 1, -1)
    const magicNumbers = content.match(/\b(?!0|1|-1)\d{2,}\b/g);
    if (magicNumbers && magicNumbers.length > 3) {
      issues.push({
        type: 'Magic Numbers',
        file: fileName,
        description: `${magicNumbers.length} potential magic numbers found`
      });
    }

    // Deeply nested code (more than 4 levels)
    const deepNesting = (content.match(/{[^{}]*{[^{}]*{[^{}]*{[^{}]*{/g) || []).length;
    if (deepNesting > 0) {
      issues.push({
        type: 'Deep Nesting',
        file: fileName,
        description: `${deepNesting} locations with >4 levels of nesting`
      });
    }

    // TODO comments
    const todoComments = content.match(/\/\/\s*TODO|\/\*\s*TODO/gi);
    if (todoComments && todoComments.length > 0) {
      issues.push({
        type: 'TODO Comments',
        file: fileName,
        description: `${todoComments.length} TODO comments need attention`
      });
    }

    // Console.log statements (potential debugging leftovers)
    const consoleLogs = content.match(/console\.(log|debug|warn)/g);
    if (consoleLogs && consoleLogs.length > 2) {
      issues.push({
        type: 'Console Statements',
        file: fileName,
        description: `${consoleLogs.length} console statements (debugging leftovers?)`
      });
    }

    // Very long lines (>120 characters)
    const longLines = content.split('\n').filter(line => line.length > 120);
    if (longLines.length > 3) {
      issues.push({
        type: 'Long Lines',
        file: fileName,
        description: `${longLines.length} lines exceed 120 characters`
      });
    }

    // Potential duplicated code (repeated string patterns)
    const lines = content.split('\n');
    const duplicatedLines = lines.filter((line, index) => 
      line.trim().length > 30 && 
      lines.indexOf(line) !== index
    );
    if (duplicatedLines.length > 5) {
      issues.push({
        type: 'Code Duplication',
        file: fileName,
        description: `${duplicatedLines.length} potentially duplicated lines`
      });
    }

    return issues;
  }

  async analyzeTestingPractices() {
    const testFiles = await this.findFiles('**/*.{test,spec}.{js,ts}');
    const sourceFiles = await this.findSourceFiles();
    
    let analysis = '';

    if (testFiles.length === 0) {
      analysis += '❌ **No test files found** - Testing is critical for code quality\n\n';
      return analysis;
    }

    const testCoverage = sourceFiles.length > 0 ? ((testFiles.length / sourceFiles.length) * 100).toFixed(1) : 0;
    
    analysis += `**Test File Coverage:**\n`;
    analysis += `- Test files: ${testFiles.length}\n`;
    analysis += `- Source files: ${sourceFiles.length}\n`;
    analysis += `- Coverage ratio: ${testCoverage}%\n\n`;

    // Analyze test file quality
    let totalTests = 0;
    const testFrameworks = new Set();

    for (const testFile of testFiles.slice(0, 5)) {
      try {
        const content = await this.readFile(testFile);
        
        // Detect test frameworks
        if (content.includes('jest') || content.includes('describe') || content.includes('it(')) {
          testFrameworks.add('Jest/Mocha');
        }
        if (content.includes('assert')) {
          testFrameworks.add('Node Assert');
        }
        
        // Count test cases
        const testCases = (content.match(/it\(|test\(/g) || []).length;
        totalTests += testCases;
        
      } catch (error) {
        continue;
      }
    }

    analysis += `**Test Quality:**\n`;
    analysis += `- Total test cases found: ${totalTests}\n`;
    analysis += `- Test frameworks detected: ${Array.from(testFrameworks).join(', ') || 'None detected'}\n\n`;

    // Recommendations based on analysis
    if (testCoverage < 30) {
      analysis += '🚨 **Low test coverage** - Add unit tests for critical functions\n';
    } else if (testCoverage < 70) {
      analysis += '⚠️ **Moderate test coverage** - Expand test suite for better reliability\n';
    } else {
      analysis += '✅ **Good test coverage** - Consider adding integration tests\n';
    }

    return analysis;
  }

  async analyzeTypeScriptUsage(sourceFiles) {
    const tsFiles = sourceFiles.filter(file => file.endsWith('.ts'));
    const jsFiles = sourceFiles.filter(file => file.endsWith('.js'));
    
    let analysis = '';

    if (tsFiles.length === 0) {
      analysis += '❌ **No TypeScript files found** - Consider migrating to TypeScript for better type safety\n\n';
      return analysis;
    }

    const tsPercentage = ((tsFiles.length / sourceFiles.length) * 100).toFixed(1);
    
    analysis += `**TypeScript Adoption:**\n`;
    analysis += `- TypeScript files: ${tsFiles.length}\n`;
    analysis += `- JavaScript files: ${jsFiles.length}\n`;
    analysis += `- TypeScript percentage: ${tsPercentage}%\n\n`;

    // Check for tsconfig.json
    const tsconfigFiles = await this.findFiles('tsconfig*.json');
    if (tsconfigFiles.length > 0) {
      analysis += `✅ **TypeScript configuration found:** ${tsconfigFiles.join(', ')}\n`;
    } else {
      analysis += `⚠️ **No tsconfig.json found** - TypeScript benefits limited without proper configuration\n`;
    }

    // Analyze TypeScript usage quality in a sample of files
    let typeAnnotationUsage = 0;
    let anyUsage = 0;

    for (const tsFile of tsFiles.slice(0, 5)) {
      try {
        const content = await this.readFile(tsFile);
        
        // Count type annotations
        const typeAnnotations = (content.match(/:\s*(string|number|boolean|object|\w+\[\]|\w+<)/g) || []).length;
        typeAnnotationUsage += typeAnnotations;
        
        // Count 'any' usage (should be minimized)
        const anyTypes = (content.match(/:\s*any\b/g) || []).length;
        anyUsage += anyTypes;
        
      } catch (error) {
        continue;
      }
    }

    if (anyUsage > 0) {
      analysis += `\n⚠️ **'any' type usage detected** - ${anyUsage} instances found, consider more specific types\n`;
    } else {
      analysis += `\n✅ **Good type safety** - No 'any' types detected in sampled files\n`;
    }

    return analysis;
  }

  async generateQualityRecommendations() {
    return `**Immediate Actions:**
1. **Complexity**: Break down functions >20 lines, reduce cyclomatic complexity >10
2. **Code Smells**: Address magic numbers, deep nesting, and TODO comments
3. **Testing**: Aim for >70% test coverage, add unit tests for complex functions
4. **TypeScript**: Migrate JavaScript files, avoid 'any' types, configure strict mode

**Long-term Improvements:**
1. Set up ESLint/TSLint with strict rules
2. Implement code review practices
3. Add pre-commit hooks for quality checks
4. Consider static analysis tools (SonarQube, CodeClimate)
5. Establish coding standards and documentation

**Tools to Consider:**
- ESLint for code quality rules
- Prettier for consistent formatting
- Husky for pre-commit hooks
- Jest for comprehensive testing
- TypeScript in strict mode`;
  }
}