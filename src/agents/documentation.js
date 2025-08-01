import { BaseAgent } from './base-agent.js';

/**
 * Agent specialized in analyzing code documentation quality across multiple dimensions.
 * Evaluates README completeness, inline code comments, JSDoc coverage, API documentation,
 * and provides specific recommendations for improving documentation standards.
 * 
 * @class DocumentationAgent
 * @extends BaseAgent
 * 
 * @example
 * const docAgent = new DocumentationAgent();
 * await docAgent.analyze();
 * // Analyzes README quality, JSDoc coverage, API docs, and suggests improvements
 */
export class DocumentationAgent extends BaseAgent {
  constructor(config = {}) {
    super('documentation', {
      systemPrompt: `You are a documentation expert analyzing code documentation quality. Focus on:
- README completeness and clarity
- Inline code comments and JSDoc
- API documentation (OpenAPI, Swagger)
- Setup and installation instructions
- Usage examples and tutorials
- Contributing guidelines
- Code documentation standards
- Architecture documentation

Evaluate documentation quality, identify gaps, and suggest improvements with specific examples.`,
      maxTokens: 3000,
      ...config
    });
  }

  async analyze() {
    this.logProgress('Starting documentation analysis...');
    
    try {
      // Analyze different types of documentation
      const readmeAnalysis = await this.analyzeReadme();
      const inlineDocsAnalysis = await this.analyzeInlineDocumentation();
      const apiDocsAnalysis = await this.analyzeApiDocumentation();
      const configDocsAnalysis = await this.analyzeConfigDocumentation();
      
      const overallAnalysis = this.formatAnalysis('Documentation Quality Analysis', {
        'README Analysis': readmeAnalysis,
        'Inline Documentation': inlineDocsAnalysis,
        'API Documentation': apiDocsAnalysis,
        'Configuration Documentation': configDocsAnalysis,
        'Recommendations': await this.generateRecommendations()
      });
      
      this.updateAnalysisSection(overallAnalysis);
      this.logProgress('Documentation analysis completed');
      
    } catch (error) {
      this.logError('Documentation analysis failed', error);
      this.updateAnalysisSection(`Analysis failed: ${error.message}`);
    }
  }

  async analyzeReadme() {
    const readmeFiles = await this.findFiles('README*');
    if (readmeFiles.length === 0) {
      return '❌ **No README file found** - This is critical for project understanding';
    }

    let analysis = '';
    for (const readmeFile of readmeFiles) {
      try {
        const content = await this.readFile(readmeFile);
        const readmeScore = this.scoreReadme(content);
        
        analysis += `**${readmeFile}** (Score: ${readmeScore.score}/10)\n\n`;
        analysis += readmeScore.analysis + '\n\n';
        
      } catch (error) {
        analysis += `**${readmeFile}**: Error reading file - ${error.message}\n\n`;
      }
    }

    return analysis;
  }

  scoreReadme(content) {
    const checks = {
      hasTitle: { 
        test: () => /^#\s+/.test(content),
        points: 1,
        description: 'Project title'
      },
      hasDescription: {
        test: () => content.length > 200 && /description|about|overview/i.test(content),
        points: 1,
        description: 'Project description'
      },
      hasInstallation: {
        test: () => /install|setup|getting started/i.test(content),
        points: 2,
        description: 'Installation instructions'
      },
      hasUsage: {
        test: () => /usage|example|how to/i.test(content),
        points: 2,
        description: 'Usage examples'
      },
      hasApiDocs: {
        test: () => /api|endpoint|route/i.test(content),
        points: 1,
        description: 'API documentation'
      },
      hasContributing: {
        test: () => /contribut|develop|build/i.test(content),
        points: 1,
        description: 'Contributing guidelines'
      },
      hasLicense: {
        test: () => /license|copyright/i.test(content),
        points: 1,
        description: 'License information'
      },
      hasTesting: {
        test: () => /test|spec|jest|mocha/i.test(content),
        points: 1,
        description: 'Testing information'
      }
    };

    let score = 0;
    let analysis = '';
    const passed = [];
    const failed = [];

    for (const [key, check] of Object.entries(checks)) {
      if (check.test()) {
        score += check.points;
        passed.push(`✅ ${check.description}`);
      } else {
        failed.push(`❌ ${check.description}`);
      }
    }

    analysis += `**Strengths:**\n${passed.join('\n')}\n\n`;
    analysis += `**Missing:**\n${failed.join('\n')}\n\n`;

    if (score >= 8) analysis += '🎉 Excellent documentation!';
    else if (score >= 6) analysis += '👍 Good documentation with room for improvement';
    else if (score >= 4) analysis += '⚠️ Basic documentation, needs significant improvement';
    else analysis += '🚨 Poor documentation, major gaps need addressing';

    return { score, analysis };
  }

  async analyzeInlineDocumentation() {
    const codeFiles = await this.findFiles('**/*.{js,ts}');
    if (codeFiles.length === 0) {
      return 'No code files found to analyze';
    }

    let totalFunctions = 0;
    let documentedFunctions = 0;
    let filesWithGoodDocs = 0;
    const issues = [];

    for (const file of codeFiles.slice(0, 20)) { // Limit to avoid overwhelming analysis
      try {
        const content = await this.readFile(file);
        const analysis = this.analyzeFileDocumentation(file, content);
        
        totalFunctions += analysis.totalFunctions;
        documentedFunctions += analysis.documentedFunctions;
        
        if (analysis.documentationScore > 0.7) {
          filesWithGoodDocs++;
        }
        
        if (analysis.issues.length > 0) {
          issues.push(`**${file}:**\n${analysis.issues.join('\n')}`);
        }
        
      } catch (error) {
        issues.push(`**${file}:** Error reading file - ${error.message}`);
      }
    }

    const docCoverage = totalFunctions > 0 ? (documentedFunctions / totalFunctions * 100).toFixed(1) : 0;
    
    let analysis = `**Documentation Coverage:** ${docCoverage}% (${documentedFunctions}/${totalFunctions} functions)\n`;
    analysis += `**Files with Good Documentation:** ${filesWithGoodDocs}/${Math.min(codeFiles.length, 20)}\n\n`;
    
    if (issues.length > 0) {
      analysis += `**Issues Found:**\n${issues.slice(0, 10).join('\n\n')}\n\n`;
    }

    analysis += this.getDocumentationRecommendations(docCoverage);

    return analysis;
  }

  analyzeFileDocumentation(fileName, content) {
    // Improved patterns to reduce false positives
    const classRegex = /(?:export\s+)?class\s+(\w+)/g;
    const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
    const methodRegex = /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/gm;
    const arrowFunctionRegex = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g;
    const jsdocRegex = /\/\*\*[\s\S]*?\*\//g;
    
    const functions = [];
    const jsdocs = [];
    let match;

    // Find classes (most important to document)
    while ((match = classRegex.exec(content)) !== null) {
      // Skip if it's inside a comment or string
      if (!this.isInCommentOrString(content, match.index)) {
        functions.push({
          name: match[1],
          line: this.getLineNumber(content, match.index),
          type: 'class'
        });
      }
    }

    // Find standalone functions (export function name() {})
    while ((match = functionRegex.exec(content)) !== null) {
      if (!this.isInCommentOrString(content, match.index)) {
        functions.push({
          name: match[1],
          line: this.getLineNumber(content, match.index),
          type: 'function'
        });
      }
    }

    // Find exported arrow functions (const name = () => {})
    while ((match = arrowFunctionRegex.exec(content)) !== null) {
      if (!this.isInCommentOrString(content, match.index)) {
        functions.push({
          name: match[1],
          line: this.getLineNumber(content, match.index),
          type: 'function'
        });
      }
    }

    // Find class methods, but be more selective
    while ((match = methodRegex.exec(content)) !== null) {
      const methodName = match[1];
      // Skip constructor, common test patterns, and property functions
      if (!this.isInCommentOrString(content, match.index) && 
          !this.shouldSkipMethod(methodName, content, match.index) &&
          this.isLikelyClassMethod(content, match.index)) {
        functions.push({
          name: methodName,
          line: this.getLineNumber(content, match.index),
          type: 'method'
        });
      }
    }

    // Find all JSDoc comments
    while ((match = jsdocRegex.exec(content)) !== null) {
      jsdocs.push({
        content: match[0],
        line: this.getLineNumber(content, match.index)
      });
    }

    // Check which functions have documentation
    let documentedCount = 0;
    const issues = [];

    for (const func of functions) {
      const hasNearbyJSDoc = jsdocs.some(jsdoc => 
        Math.abs(jsdoc.line - func.line) <= 2
      );
      
      if (hasNearbyJSDoc) {
        documentedCount++;
      } else {
        issues.push(`- Missing documentation for ${func.type} \`${func.name}\` (line ${func.line})`);
      }
    }

    return {
      totalFunctions: functions.length,
      documentedFunctions: documentedCount,
      documentationScore: functions.length > 0 ? documentedCount / functions.length : 1,
      issues: issues.slice(0, 5) // Limit issues per file
    };
  }

  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }

  /**
   * Check if a match index is inside a comment or string literal
   * @param {string} content - The file content
   * @param {number} index - The match index
   * @returns {boolean} True if inside comment or string
   */
  isInCommentOrString(content, index) {
    const beforeMatch = content.substring(0, index);
    
    // Check if inside a string literal
    const singleQuotes = (beforeMatch.match(/'/g) || []).length;
    const doubleQuotes = (beforeMatch.match(/"/g) || []).length;
    const backticks = (beforeMatch.match(/`/g) || []).length;
    
    if (singleQuotes % 2 === 1 || doubleQuotes % 2 === 1 || backticks % 2 === 1) {
      return true;
    }
    
    // Check if inside a comment
    const lineStart = beforeMatch.lastIndexOf('\n');
    const lineContent = content.substring(lineStart, index);
    
    if (lineContent.includes('//')) {
      return true;
    }
    
    // Check for block comments (simple check)
    const lastBlockCommentStart = beforeMatch.lastIndexOf('/*');
    const lastBlockCommentEnd = beforeMatch.lastIndexOf('*/');
    
    if (lastBlockCommentStart > lastBlockCommentEnd) {
      return true;
    }
    
    return false;
  }

  /**
   * Determine if a method should be skipped from documentation requirements
   * @param {string} methodName - The method name
   * @param {string} content - The file content
   * @param {number} index - The match index
   * @returns {boolean} True if method should be skipped
   */
  shouldSkipMethod(methodName, content, index) {
    // Skip constructor and common lifecycle methods
    if (['constructor', 'componentDidMount', 'componentWillUnmount', 'render'].includes(methodName)) {
      return true;
    }
    
    // Skip test methods
    if (['test', 'it', 'describe', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll'].includes(methodName)) {
      return true;
    }
    
    // Skip control flow keywords and language constructs (major fix for false positives)
    if (['if', 'for', 'while', 'switch', 'case', 'do', 'try', 'catch', 'finally', 'else', 'return', 'throw'].includes(methodName)) {
      return true;
    }
    
    // Skip common JavaScript/Node.js methods that don't need documentation
    if (['length', 'push', 'pop', 'shift', 'slice', 'map', 'filter', 'reduce', 'forEach', 'find', 'includes'].includes(methodName)) {
      return true;
    }
    
    // Skip getter/setter methods
    if (methodName.startsWith('get') || methodName.startsWith('set')) {
      const contextBefore = content.substring(Math.max(0, index - 50), index);
      if (contextBefore.includes('get ') || contextBefore.includes('set ')) {
        return true;
      }
    }
    
    // Skip methods that are part of object literals (not class methods)
    const contextBefore = content.substring(Math.max(0, index - 100), index);
    const contextAfter = content.substring(index, index + 50);
    
    // If we see patterns like "test: function()" or "test: () =>" this is likely a property function
    if (contextBefore.includes(`${methodName}:`) || contextAfter.includes(': function') || contextAfter.includes(': async')) {
      return true;
    }
    
    // Skip very short method names (likely false positives)
    if (methodName.length <= 1) {
      return true;
    }
    
    // Skip methods that are clearly inside control structures
    const lineContext = content.substring(Math.max(0, index - 200), index + 50);
    if (lineContext.includes(`if (`) || lineContext.includes(`for (`) || lineContext.includes(`while (`)) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if a match is likely a class method rather than a control structure or other construct
   * @param {string} content - The file content
   * @param {number} index - The match index
   * @returns {boolean} True if likely a class method
   */
  isLikelyClassMethod(content, index) {
    const contextBefore = content.substring(Math.max(0, index - 200), index);
    const contextAfter = content.substring(index, index + 100);
    
    // Look for class context
    const hasClassContext = contextBefore.includes('class ') || contextBefore.includes('extends ');
    
    // Look for method-like patterns
    const hasMethodPattern = contextAfter.includes('() {') || contextAfter.includes(') {');
    
    // Avoid control structures
    const isControlStructure = contextBefore.includes('if ') || 
                              contextBefore.includes('for ') || 
                              contextBefore.includes('while ') ||
                              contextBefore.includes('switch ');
    
    // Avoid assignment patterns
    const isAssignment = contextBefore.includes(' = ') || contextAfter.includes(' = ');
    
    return hasClassContext && hasMethodPattern && !isControlStructure && !isAssignment;
  }

  async analyzeApiDocumentation() {
    // Look for OpenAPI/Swagger files
    const apiDocFiles = await this.findFiles('**/{swagger,openapi}*.{json,yaml,yml}');
    const postmanFiles = await this.findFiles('**/*postman*.json');
    
    let analysis = '';

    if (apiDocFiles.length > 0) {
      analysis += `✅ **API Documentation Found:**\n`;
      for (const file of apiDocFiles) {
        analysis += `- ${file}\n`;
      }
      analysis += '\n';
    } else {
      analysis += `❌ **No OpenAPI/Swagger documentation found**\n\n`;
    }

    if (postmanFiles.length > 0) {
      analysis += `✅ **Postman Collections Found:**\n`;
      for (const file of postmanFiles) {
        analysis += `- ${file}\n`;
      }
      analysis += '\n';
    }

    // Check for inline API documentation
    const apiFiles = await this.findFiles('**/*{route,api,controller}*.{js,ts}');
    let hasInlineApiDocs = false;

    for (const file of apiFiles.slice(0, 5)) {
      try {
        const content = await this.readFile(file);
        if (/@swagger|@openapi|@api/i.test(content)) {
          hasInlineApiDocs = true;
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (hasInlineApiDocs) {
      analysis += `✅ **Inline API documentation found** in route files\n\n`;
    } else if (apiFiles.length > 0) {
      analysis += `⚠️ **API routes found but no inline documentation**\n\n`;
    }

    return analysis || 'No API-related files found to analyze';
  }

  async analyzeConfigDocumentation() {
    const configFiles = await this.findFiles('**/*.{json,yaml,yml,env*,config*}');
    const docFiles = await this.findFiles('**/{docs,doc}/**/*.md');
    
    let analysis = '';

    if (configFiles.length > 0) {
      analysis += `**Configuration Files Found:** ${configFiles.length}\n`;
      
      // Check if config files are documented
      const undocumentedConfigs = [];
      for (const configFile of configFiles.slice(0, 10)) {
        const hasDocumentation = docFiles.some(doc => 
          doc.toLowerCase().includes('config') || 
          doc.toLowerCase().includes('setup')
        );
        
        if (!hasDocumentation && !configFile.includes('node_modules')) {
          undocumentedConfigs.push(configFile);
        }
      }

      if (undocumentedConfigs.length > 0) {
        analysis += `\n⚠️ **Potentially undocumented config files:**\n`;
        undocumentedConfigs.forEach(file => analysis += `- ${file}\n`);
      }
    }

    if (docFiles.length > 0) {
      analysis += `\n✅ **Documentation directory found** with ${docFiles.length} files\n`;
    }

    return analysis || 'No configuration files found';
  }

  getDocumentationRecommendations(coverage) {
    if (coverage >= 80) {
      return '🎉 Excellent documentation coverage! Consider adding more detailed examples.';
    } else if (coverage >= 60) {
      return '👍 Good documentation coverage. Focus on documenting complex functions and public APIs.';
    } else if (coverage >= 40) {
      return '⚠️ Moderate documentation coverage. Prioritize documenting public interfaces and complex logic.';
    } else {
      return '🚨 Low documentation coverage. Start with public APIs, then add JSDoc to all exported functions.';
    }
  }

  async generateRecommendations() {
    return `**Priority Actions:**
1. Ensure README includes installation, usage, and API examples
2. Add JSDoc comments to all public functions and classes
3. Document configuration options and environment variables
4. Consider adding OpenAPI/Swagger documentation for APIs
5. Include code examples for complex features
6. Add contributing guidelines for team projects

**Tools to Consider:**
- JSDoc for generating documentation from comments
- Swagger/OpenAPI for API documentation
- Docusaurus or GitBook for comprehensive documentation sites
- TypeScript for better inline documentation through types`;
  }
}