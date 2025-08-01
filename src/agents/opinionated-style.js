import { BaseAgent } from './base-agent.js';

/**
 * Opinionated Style Agent - Enforces clean, readable, maintainable code patterns.
 * 
 * Core Philosophy: Clean, readable, maintainable code through consistent patterns and principles.
 * 
 * Key Focus Areas:
 * - Functional style preferences (pure functions, immutability)
 * - Code organization (Extract Method, Extract Class principles)  
 * - Boundary management (separation of concerns)
 * - Modern JavaScript/TypeScript patterns
 * - Law of Demeter, Tell Don't Ask principles
 * 
 * @class OpinionatedStyleAgent
 * @extends BaseAgent
 * 
 * @example
 * const styleAgent = new OpinionatedStyleAgent();
 * await styleAgent.analyze();
 * // Provides opinionated recommendations for clean code patterns
 */
export class OpinionatedStyleAgent extends BaseAgent {
  constructor(config = {}) {
    super('opinionated-style', {
      systemPrompt: `You are an opinionated code style expert who champions clean, readable, maintainable code.

Core Philosophy: Every line of code should be intentional, readable, and maintainable.

Your expertise covers:
- Functional programming principles (pure functions, immutability, composition)
- Code organization patterns (single responsibility, extract method/class)
- Modern JavaScript/TypeScript idioms and best practices
- Design principles (Law of Demeter, Tell Don't Ask, DRY)
- Boundary management and separation of concerns

You provide strong opinions backed by clear reasoning about why certain patterns improve maintainability, readability, and reduce bugs. Include specific code examples and refactoring suggestions.

Focus on actionable improvements that make code more maintainable and less prone to errors.`,
      maxTokens: 4000,
      ...config
    });
  }

  async analyze() {
    this.logProgress('Starting opinionated style analysis...');
    
    try {
      // Find all source code files
      const sourceFiles = await this.findSourceFiles();
      if (sourceFiles.length === 0) {
        this.updateAnalysisSection('No source code files found to analyze.');
        return;
      }

      this.logProgress(`Analyzing style patterns in ${sourceFiles.length} source files`);

      // Perform comprehensive style analysis
      const functionalStyleAnalysis = await this.analyzeFunctionalStyle(sourceFiles);
      const codeOrganizationAnalysis = await this.analyzeCodeOrganization(sourceFiles);
      const boundaryManagementAnalysis = await this.analyzeBoundaryManagement(sourceFiles);
      const modernJSAnalysis = await this.analyzeModernJavaScript(sourceFiles);
      const designPrinciplesAnalysis = await this.analyzeDesignPrinciples(sourceFiles);
      
      const overallAnalysis = this.formatAnalysis('Opinionated Style Analysis', {
        'Functional Style Preferences': functionalStyleAnalysis,
        'Code Organization': codeOrganizationAnalysis,
        'Boundary Management': boundaryManagementAnalysis,
        'Modern JavaScript/TypeScript': modernJSAnalysis,
        'Design Principles': designPrinciplesAnalysis,
        'Priority Recommendations': await this.generatePriorityRecommendations()
      });
      
      this.updateAnalysisSection(overallAnalysis);
      this.logProgress('Opinionated style analysis completed');
      
    } catch (error) {
      this.logError('Opinionated style analysis failed', error);
      this.updateAnalysisSection(`Analysis failed: ${error.message}`);
    }
  }

  async findSourceFiles() {
    const jsFiles = await this.findFiles('**/*.js');
    const tsFiles = await this.findFiles('**/*.ts');
    
    // Combine and filter out test files and dependencies
    const allFiles = [...jsFiles, ...tsFiles];
    return allFiles.filter(file => 
      !file.includes('node_modules') &&
      !file.includes('dist/') &&
      !file.includes('build/') &&
      !file.includes('.test.') &&
      !file.includes('.spec.') &&
      !file.includes('.min.')
    );
  }

  async analyzeFunctionalStyle(sourceFiles) {
    let analysis = '';
    const functionalIssues = [];
    let purenessScan = { pure: 0, impure: 0, sideEffects: 0 };
    let immutabilityIssues = [];
    
    for (const file of sourceFiles.slice(0, 15)) {
      try {
        const content = await this.readFile(file);
        
        // Analyze functional patterns
        const fileIssues = this.detectFunctionalStyleIssues(file, content);
        functionalIssues.push(...fileIssues);
        
        // Analyze function purity
        const purityAnalysis = this.analyzeFunctionPurity(content);
        purenessScan.pure += purityAnalysis.pure;
        purenessScan.impure += purityAnalysis.impure;
        purenessScan.sideEffects += purityAnalysis.sideEffects;
        
        // Check immutability patterns
        const immutabilityCheck = this.checkImmutabilityPatterns(file, content);
        immutabilityIssues.push(...immutabilityCheck);
        
      } catch (error) {
        continue;
      }
    }

    analysis += `**Function Purity Analysis:**\n`;
    analysis += `- Functions with pure patterns: ${purenessScan.pure}\n`;
    analysis += `- Functions with side effects: ${purenessScan.sideEffects}\n`;
    analysis += `- Impure functions: ${purenessScan.impure}\n\n`;

    if (purenessScan.sideEffects > purenessScan.pure * 0.3) {
      analysis += `🚨 **High side effect ratio** - ${((purenessScan.sideEffects / (purenessScan.pure + purenessScan.sideEffects)) * 100).toFixed(1)}% of functions have side effects\n\n`;
    }

    if (immutabilityIssues.length > 0) {
      analysis += `**Immutability Issues:**\n`;
      for (const issue of immutabilityIssues.slice(0, 5)) {
        analysis += `- **${issue.file}**: ${issue.description}\n`;
      }
      analysis += '\n';
    }

    // Group functional issues
    const groupedIssues = {};
    for (const issue of functionalIssues) {
      if (!groupedIssues[issue.type]) {
        groupedIssues[issue.type] = [];
      }
      groupedIssues[issue.type].push(issue);
    }

    if (Object.keys(groupedIssues).length > 0) {
      analysis += `**Functional Style Issues:**\n`;
      for (const [type, issues] of Object.entries(groupedIssues)) {
        analysis += `- **${type}**: ${issues.length} instances\n`;
        for (const issue of issues.slice(0, 3)) {
          analysis += `  - ${issue.file}: ${issue.description}\n`;
        }
      }
      analysis += '\n';
    }

    if (functionalIssues.length === 0 && immutabilityIssues.length === 0) {
      analysis += '✅ Good functional programming patterns detected\n\n';
    }

    analysis += `**Recommendations:**\n`;
    analysis += `- Prefer \`map\`, \`filter\`, \`reduce\` over imperative loops\n`;
    analysis += `- Use pure functions that don't modify external state\n`;
    analysis += `- Prefer immutable data transformations\n`;
    analysis += `- Extract side effects to dedicated functions/modules\n`;

    return analysis;
  }

  detectFunctionalStyleIssues(fileName, content) {
    const issues = [];

    // Detect imperative loops that could be functional
    const forLoops = content.match(/for\s*\([^)]*\)\s*{[^{}]*}/g) || [];
    const whileLoops = content.match(/while\s*\([^)]*\)\s*{[^{}]*}/g) || [];
    
    if (forLoops.length > 2) {
      issues.push({
        type: 'Imperative Loops',
        file: fileName,
        description: `${forLoops.length} for-loops could potentially be replaced with map/filter/reduce`
      });
    }

    // Detect array mutations
    const arrayMutations = content.match(/\.push\(|\.pop\(|\.shift\(|\.unshift\(|\.splice\(/g) || [];
    if (arrayMutations.length > 0) {
      issues.push({
        type: 'Array Mutations',
        file: fileName,
        description: `${arrayMutations.length} array mutation methods detected`
      });
    }

    // Detect object mutations  
    const objectMutations = content.match(/Object\.assign\(|[a-zA-Z_]\w*\.[a-zA-Z_]\w*\s*=/g) || [];
    if (objectMutations.length > 3) {
      issues.push({
        type: 'Object Mutations',
        file: fileName,
        description: `${objectMutations.length} object property mutations detected`
      });
    }

    // Detect nested imperative patterns
    const nestedLoops = content.match(/for\s*\([^)]*\)\s*{[^{}]*for\s*\([^)]*\)/g) || [];
    if (nestedLoops.length > 0) {
      issues.push({
        type: 'Nested Imperative Logic',
        file: fileName,
        description: `${nestedLoops.length} nested loops that could benefit from functional composition`
      });
    }

    return issues;
  }

  analyzeFunctionPurity(content) {
    let pure = 0;
    let impure = 0;
    let sideEffects = 0;

    // Simple heuristic for function analysis
    const functionMatches = content.match(/(function\s+\w+\s*\([^)]*\)|const\s+\w+\s*=\s*\([^)]*\)\s*=>|async\s+function|\w+\s*\([^)]*\)\s*{)/g) || [];
    
    for (const func of functionMatches) {
      // Look for side effect indicators in the function context
      const funcStart = content.indexOf(func);
      const funcEnd = this.findFunctionEnd(content, funcStart);
      const funcBody = content.substring(funcStart, funcEnd);
      
      // Check for side effects
      if (this.hasSideEffects(funcBody)) {
        sideEffects++;
      } else if (this.isPureFunction(funcBody)) {
        pure++;
      } else {
        impure++;
      }
    }

    return { pure, impure, sideEffects };
  }

  hasSideEffects(funcBody) {
    const sideEffectPatterns = [
      /console\./,
      /document\./,
      /window\./,
      /localStorage/,
      /sessionStorage/,
      /fetch\(/,
      /axios\./,
      /process\.env/,
      /fs\./,
      /require\(/,
      /import\s+.*from/
    ];

    return sideEffectPatterns.some(pattern => pattern.test(funcBody));
  }

  isPureFunction(funcBody) {
    // Simple heuristic: functions that only do calculations and return values
    return funcBody.includes('return') && 
           !this.hasSideEffects(funcBody) &&
           !funcBody.includes('this.') &&
           !/(let|var)\s+\w+/.test(funcBody);
  }

  findFunctionEnd(content, start) {
    let braceCount = 0;
    let inString = false;
    let stringChar = '';
    
    for (let i = start; i < content.length; i++) {
      const char = content[i];
      
      if (!inString && (char === '"' || char === "'" || char === '`')) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar && content[i-1] !== '\\') {
        inString = false;
        stringChar = '';
      } else if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (braceCount === 0 && char === '}') {
          return i + 1;
        }
      }
    }
    return Math.min(start + 500, content.length); // Fallback
  }

  checkImmutabilityPatterns(fileName, content) {
    const issues = [];

    // Check for const usage vs let/var
    const constUsage = (content.match(/\bconst\s+/g) || []).length;
    const letUsage = (content.match(/\blet\s+/g) || []).length;
    const varUsage = (content.match(/\bvar\s+/g) || []).length;

    if (varUsage > 0) {
      issues.push({
        type: 'Variable Declaration',
        file: fileName,
        description: `${varUsage} var declarations - prefer const/let`
      });
    }

    if (letUsage > constUsage * 0.5) {
      issues.push({
        type: 'Mutability',
        file: fileName,
        description: `High let/const ratio (${letUsage}:${constUsage}) - prefer const when possible`
      });
    }

    // Check for spread operator usage (good for immutability)
    const spreadUsage = (content.match(/\.\.\.[\w\[\]]/g) || []).length;
    const directMutations = (content.match(/\w+\[\w+\]\s*=/g) || []).length;

    if (directMutations > spreadUsage && directMutations > 2) {
      issues.push({
        type: 'Direct Mutations',
        file: fileName,
        description: `${directMutations} direct property assignments detected`
      });
    }

    return issues;
  }

  async analyzeCodeOrganization(sourceFiles) {
    let analysis = '';
    const organizationIssues = [];
    let fileSizeIssues = [];
    let functionSizeIssues = [];
    
    for (const file of sourceFiles.slice(0, 10)) {
      try {
        const content = await this.readFile(file);
        const lines = content.split('\n');
        
        // Check file size (Extract Class principle)
        if (lines.length > 250) {
          fileSizeIssues.push({
            file,
            lines: lines.length,
            severity: lines.length > 400 ? 'high' : 'medium'
          });
        }
        
        // Analyze function sizes (Extract Method principle)
        const functionAnalysis = this.analyzeFunctionSizes(file, content);
        functionSizeIssues.push(...functionAnalysis);
        
        // Check for magic numbers and other organization issues
        const orgIssues = this.detectOrganizationIssues(file, content);
        organizationIssues.push(...orgIssues);
        
      } catch (error) {
        continue;
      }
    }

    // File size analysis
    if (fileSizeIssues.length > 0) {
      analysis += `**Large Files (Extract Class Candidates):**\n`;
      for (const issue of fileSizeIssues) {
        const severity = issue.severity === 'high' ? '🚨' : '⚠️';
        analysis += `${severity} **${issue.file}**: ${issue.lines} lines\n`;
      }
      analysis += '\n';
    }

    // Function size analysis
    const largeFunctions = functionSizeIssues.filter(f => f.lines > 30);
    if (largeFunctions.length > 0) {
      analysis += `**Large Functions (Extract Method Candidates):**\n`;
      for (const func of largeFunctions.slice(0, 5)) {
        analysis += `- **${func.file}**: Function with ${func.lines} lines\n`;
      }
      analysis += '\n';
    }

    // Organization issues
    const groupedOrgIssues = {};
    for (const issue of organizationIssues) {
      if (!groupedOrgIssues[issue.type]) {
        groupedOrgIssues[issue.type] = [];
      }
      groupedOrgIssues[issue.type].push(issue);
    }

    if (Object.keys(groupedOrgIssues).length > 0) {
      analysis += `**Code Organization Issues:**\n`;
      for (const [type, issues] of Object.entries(groupedOrgIssues)) {
        analysis += `- **${type}**: ${issues.length} instances\n`;
        for (const issue of issues.slice(0, 2)) {
          analysis += `  - ${issue.file}: ${issue.description}\n`;
        }
      }
      analysis += '\n';
    }

    analysis += `**Organization Principles:**\n`;
    analysis += `- **Single Responsibility**: Each function/class should do one thing well\n`;
    analysis += `- **Extract Method**: Functions > 20-30 lines should be broken down\n`;
    analysis += `- **Extract Class**: Files > 200-300 lines need splitting\n`;
    analysis += `- **Magic Numbers**: Replace with named constants\n`;

    return analysis;
  }

  analyzeFunctionSizes(fileName, content) {
    const functions = [];
    const functionRegex = /(function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|async\s+function|\w+\s*\([^)]*\)\s*\{)/g;
    
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      const functionStart = match.index;
      const functionEnd = this.findFunctionEnd(content, functionStart);
      const functionBody = content.substring(functionStart, functionEnd);
      const lines = functionBody.split('\n').length;
      
      if (lines > 20) {
        functions.push({
          file: fileName,
          lines,
          functionName: match[0].substring(0, 50) + '...'
        });
      }
    }
    
    return functions;
  }

  detectOrganizationIssues(fileName, content) {
    const issues = [];

    // Magic numbers
    const magicNumbers = content.match(/\b(?!0|1|-1|100|200|404|500)\d{2,}\b/g) || [];
    if (magicNumbers.length > 3) {
      issues.push({
        type: 'Magic Numbers',
        file: fileName,
        description: `${magicNumbers.length} magic numbers should be named constants`
      });
    }

    // Long parameter lists
    const longParams = content.match(/\([^)]{60,}\)/g) || [];
    if (longParams.length > 0) {
      issues.push({
        type: 'Long Parameter Lists',
        file: fileName,
        description: `${longParams.length} functions with >3 parameters - consider parameter objects`
      });
    }

    // Complex conditionals (Replace Conditional with Polymorphism)
    const complexConditionals = content.match(/(switch\s*\([^)]*\)\s*{[^{}]*case[^{}]*case[^{}]*case)|(if\s*\([^)]*\)\s*{[^{}]*}\s*else\s*if[^{}]*else\s*if)/g) || [];
    if (complexConditionals.length > 0) {
      issues.push({
        type: 'Complex Conditionals',
        file: fileName,
        description: `${complexConditionals.length} complex if/switch chains - consider polymorphism`
      });
    }

    // Duplicate string literals
    const stringLiterals = content.match(/"[^"]{10,}"|'[^']{10,}'/g) || [];
    const duplicates = stringLiterals.filter((str, index) => stringLiterals.indexOf(str) !== index);
    if (duplicates.length > 2) {
      issues.push({
        type: 'Duplicate Strings',
        file: fileName,
        description: `${duplicates.length} duplicate string literals - consider constants`
      });
    }

    return issues;
  }

  async analyzeBoundaryManagement(sourceFiles) {
    let analysis = '';
    const boundaryIssues = [];
    
    for (const file of sourceFiles.slice(0, 8)) {
      try {
        const content = await this.readFile(file);
        
        // Analyze separation of concerns
        const concerns = this.analyzeSeparationOfConcerns(file, content);
        boundaryIssues.push(...concerns);
        
      } catch (error) {
        continue;
      }
    }

    if (boundaryIssues.length > 0) {
      analysis += `**Boundary Management Issues:**\n`;
      
      const groupedIssues = {};
      for (const issue of boundaryIssues) {
        if (!groupedIssues[issue.type]) {
          groupedIssues[issue.type] = [];
        }
        groupedIssues[issue.type].push(issue);
      }

      for (const [type, issues] of Object.entries(groupedIssues)) {
        analysis += `- **${type}**: ${issues.length} instances\n`;
        for (const issue of issues.slice(0, 3)) {
          analysis += `  - ${issue.file}: ${issue.description}\n`;
        }
      }
      analysis += '\n';
    }

    analysis += `**Boundary Management Principles:**\n`;
    analysis += `- **Data Access**: Keep database/API calls in dedicated modules\n`;
    analysis += `- **Business Logic**: Separate from presentation and data layers\n`;
    analysis += `- **Presentation**: UI logic separate from business rules\n`;
    analysis += `- **Module Interfaces**: Clear, minimal public APIs\n`;

    return analysis;
  }

  analyzeSeparationOfConcerns(fileName, content) {
    const issues = [];

    // Check for mixed concerns in a single file
    const hasUILogic = /document\.|innerHTML|addEventListener|querySelector/.test(content);
    const hasDataAccess = /SELECT|INSERT|UPDATE|DELETE|fetch\(|axios|\.query\(/.test(content);
    const hasBusinessLogic = /validate|calculate|process|transform/.test(content);

    let concernCount = 0;
    if (hasUILogic) concernCount++;
    if (hasDataAccess) concernCount++;
    if (hasBusinessLogic) concernCount++;

    if (concernCount > 1) {
      const concerns = [];
      if (hasUILogic) concerns.push('UI');
      if (hasDataAccess) concerns.push('Data Access');
      if (hasBusinessLogic) concerns.push('Business Logic');
      
      issues.push({
        type: 'Mixed Concerns',
        file: fileName,
        description: `Multiple concerns in one file: ${concerns.join(', ')}`
      });
    }

    // Check for excessive external dependencies
    const imports = content.match(/import\s+.*from|require\(/g) || [];
    if (imports.length > 10) {
      issues.push({
        type: 'High Coupling',
        file: fileName,
        description: `${imports.length} imports - consider dependency injection or module splitting`
      });
    }

    return issues;
  }

  async analyzeModernJavaScript(sourceFiles) {
    let analysis = '';
    const modernJSIssues = [];
    let patternCounts = {
      constUsage: 0,
      letUsage: 0,
      varUsage: 0,
      destructuring: 0,
      templateLiterals: 0,
      asyncAwait: 0,
      promiseChains: 0,
      arrowFunctions: 0,
      classicFunctions: 0
    };
    
    for (const file of sourceFiles.slice(0, 10)) {
      try {
        const content = await this.readFile(file);
        
        // Count modern patterns
        patternCounts.constUsage += (content.match(/\bconst\s+/g) || []).length;
        patternCounts.letUsage += (content.match(/\blet\s+/g) || []).length;
        patternCounts.varUsage += (content.match(/\bvar\s+/g) || []).length;
        patternCounts.destructuring += (content.match(/\{[^}]*\}\s*=/g) || []).length;
        patternCounts.templateLiterals += (content.match(/`[^`]*`/g) || []).length;
        patternCounts.asyncAwait += (content.match(/async\s+function|await\s+/g) || []).length;
        patternCounts.promiseChains += (content.match(/\.then\(|\.catch\(/g) || []).length;
        patternCounts.arrowFunctions += (content.match(/=>\s*{|=>\s*\w/g) || []).length;
        patternCounts.classicFunctions += (content.match(/function\s+\w+/g) || []).length;
        
        // Detect anti-patterns
        const fileIssues = this.detectModernJSIssues(file, content);
        modernJSIssues.push(...fileIssues);
        
      } catch (error) {
        continue;
      }
    }

    analysis += `**Modern JavaScript Adoption:**\n`;
    analysis += `- \`const\` declarations: ${patternCounts.constUsage}\n`;
    analysis += `- \`let\` declarations: ${patternCounts.letUsage}\n`;
    analysis += `- \`var\` declarations: ${patternCounts.varUsage} ${patternCounts.varUsage > 0 ? '⚠️' : '✅'}\n`;
    analysis += `- Destructuring usage: ${patternCounts.destructuring}\n`;
    analysis += `- Template literals: ${patternCounts.templateLiterals}\n`;
    analysis += `- async/await: ${patternCounts.asyncAwait}\n`;
    analysis += `- Promise chains: ${patternCounts.promiseChains}\n`;
    analysis += `- Arrow functions: ${patternCounts.arrowFunctions}\n`;
    analysis += `- Classic functions: ${patternCounts.classicFunctions}\n\n`;

    // Analysis
    if (patternCounts.varUsage > 0) {
      analysis += `🚨 **Avoid \`var\`** - Use \`const\` (preferred) or \`let\` instead\n`;
    }
    
    if (patternCounts.promiseChains > patternCounts.asyncAwait && patternCounts.promiseChains > 5) {
      analysis += `⚠️ **Consider async/await** - Replace Promise chains for better readability\n`;
    }

    if (patternCounts.destructuring < patternCounts.constUsage * 0.2) {
      analysis += `💡 **Use more destructuring** - Improves readability and reduces property access\n`;
    }

    if (modernJSIssues.length > 0) {
      analysis += `\n**Modern JavaScript Issues:**\n`;
      const groupedIssues = {};
      for (const issue of modernJSIssues) {
        if (!groupedIssues[issue.type]) {
          groupedIssues[issue.type] = [];
        }
        groupedIssues[issue.type].push(issue);
      }

      for (const [type, issues] of Object.entries(groupedIssues)) {
        analysis += `- **${type}**: ${issues.length} instances\n`;
        for (const issue of issues.slice(0, 2)) {
          analysis += `  - ${issue.file}: ${issue.description}\n`;
        }
      }
    }

    return analysis;
  }

  detectModernJSIssues(fileName, content) {
    const issues = [];

    // String concatenation instead of template literals
    const stringConcatenation = content.match(/['"][^'"]*['"]\s*\+|['"]\s*\+\s*['"][^'"]*['"]/g) || [];
    if (stringConcatenation.length > 0) {
      issues.push({
        type: 'String Concatenation',
        file: fileName,
        description: `${stringConcatenation.length} string concatenations - use template literals`
      });
    }

    // Deep nesting instead of early returns
    const deepNesting = content.match(/{\s*if[^{}]*{\s*if[^{}]*{\s*if/g) || [];
    if (deepNesting.length > 0) {
      issues.push({
        type: 'Deep Nesting',
        file: fileName,
        description: `${deepNesting.length} deeply nested conditions - use early returns`
      });
    }

    // Callback hell patterns
    const callbackNesting = content.match(/function\s*\([^)]*\)\s*{\s*[^{}]*function\s*\([^)]*\)\s*{/g) || [];
    if (callbackNesting.length > 2) {
      issues.push({
        type: 'Callback Nesting',  
        file: fileName,
        description: `${callbackNesting.length} nested callbacks - consider async/await`
      });
    }

    // Property access that could be destructured
    const repetitiveAccess = content.match(/(\w+)\.(\w+)[^=\n]*\1\.\2/g) || [];
    if (repetitiveAccess.length > 3) {
      issues.push({
        type: 'Repetitive Property Access',
        file: fileName,
        description: `${repetitiveAccess.length} repetitive property accesses - use destructuring`
      });
    }

    return issues;
  }

  async analyzeDesignPrinciples(sourceFiles) {
    let analysis = '';
    const principleViolations = [];
    
    for (const file of sourceFiles.slice(0, 8)) {
      try {
        const content = await this.readFile(file);
        
        // Check various design principles
        const lawOfDemeterViolations = this.checkLawOfDemeter(file, content);
        const tellDontAskViolations = this.checkTellDontAsk(file, content);
        const primitiveObsessionIssues = this.checkPrimitiveObsession(file, content);
        
        principleViolations.push(...lawOfDemeterViolations);
        principleViolations.push(...tellDontAskViolations);
        principleViolations.push(...primitiveObsessionIssues);
        
      } catch (error) {
        continue;
      }
    }

    if (principleViolations.length > 0) {
      analysis += `**Design Principle Violations:**\n`;
      
      const groupedViolations = {};
      for (const violation of principleViolations) {
        if (!groupedViolations[violation.type]) {
          groupedViolations[violation.type] = [];
        }
        groupedViolations[violation.type].push(violation);
      }

      for (const [type, violations] of Object.entries(groupedViolations)) {
        analysis += `- **${type}**: ${violations.length} instances\n`;
        for (const violation of violations.slice(0, 2)) {
          analysis += `  - ${violation.file}: ${violation.description}\n`;
        }
      }
      analysis += '\n';
    } else {
      analysis += '✅ Good adherence to design principles detected\n\n';
    }

    analysis += `**Design Principles:**\n`;
    analysis += `- **Law of Demeter**: Don't chain more than one property access\n`;
    analysis += `- **Tell Don't Ask**: Objects should do work, not expose internal state\n`;
    analysis += `- **Primitive Obsession**: Use domain objects instead of primitives\n`;
    analysis += `- **Feature Envy**: Methods should primarily use their own class data\n`;

    return analysis;
  }

  checkLawOfDemeter(fileName, content) {
    const violations = [];
    
    // Find property chain violations (object.property.property.method())
    const chainViolations = content.match(/\w+\.\w+\.\w+\.\w+/g) || [];
    if (chainViolations.length > 0) {
      violations.push({
        type: 'Law of Demeter',
        file: fileName,
        description: `${chainViolations.length} property chain violations (a.b.c.d pattern)`
      });
    }

    return violations;
  }

  checkTellDontAsk(fileName, content) {
    const violations = [];
    
    // Look for getter-heavy patterns
    const getterPatterns = content.match(/\.get\w+\(\)[^=]*\.get\w+\(\)/g) || [];
    if (getterPatterns.length > 0) {
      violations.push({
        type: 'Tell Don\'t Ask',
        file: fileName,
        description: `${getterPatterns.length} potential getter chains - consider telling objects what to do`
      });
    }

    // Look for excessive property access followed by operations
    const askThenActPatterns = content.match(/if\s*\([^)]*\.\w+[^)]*\)\s*{[^{}]*\.\w+\s*=/g) || [];
    if (askThenActPatterns.length > 2) {
      violations.push({
        type: 'Ask Then Act',
        file: fileName,
        description: `${askThenActPatterns.length} ask-then-act patterns detected`
      });
    }

    return violations;
  }

  checkPrimitiveObsession(fileName, content) {
    const issues = [];
    
    // Look for functions that take many primitive parameters
    const primitiveParams = content.match(/\(\s*\w+\s*:\s*(string|number|boolean)[^)]*,\s*\w+\s*:\s*(string|number|boolean)[^)]*,\s*\w+\s*:\s*(string|number|boolean)/g) || [];
    if (primitiveParams.length > 0) {
      issues.push({
        type: 'Primitive Obsession',
        file: fileName,
        description: `${primitiveParams.length} functions with multiple primitive parameters - consider parameter objects`
      });
    }

    // Look for repetitive string/number validations
    const validationPatterns = content.match(/(typeof\s+\w+\s*===\s*['"]string['"]|typeof\s+\w+\s*===\s*['"]number['"])/g) || [];
    if (validationPatterns.length > 5) {
      issues.push({
        type: 'Type Validation',
        file: fileName,
        description: `${validationPatterns.length} primitive type validations - consider domain objects`
      }); 
    }

    return issues;
  }

  async generatePriorityRecommendations() {
    return `**Immediate Actions (High Impact):**
1. **Replace \`var\` with \`const/let\`** - Improves scoping and prevents reassignment bugs
2. **Extract large functions (>30 lines)** - Improves readability and testability  
3. **Use template literals** - Replace string concatenation for better readability
4. **Implement early returns** - Reduce nesting and improve code flow

**Medium Priority (Code Quality):**
1. **Add destructuring** - Reduce property access repetition
2. **Replace magic numbers** - Use named constants for better maintainability
3. **Break down large files (>250 lines)** - Improve separation of concerns
4. **Use async/await** - Replace Promise chains for better error handling

**Long-term (Architecture):**
1. **Separate concerns** - Keep data access, business logic, and UI separate
2. **Apply Law of Demeter** - Reduce property chaining dependencies
3. **Prefer immutable operations** - Use spread operator and array methods
4. **Implement Tell Don't Ask** - Objects should encapsulate behavior

**Philosophy Reminders:**
- **Every line should have a clear purpose**
- **Code is read more than written**
- **Favor explicit over clever**
- **Make invalid states unrepresentable**`;
  }
}