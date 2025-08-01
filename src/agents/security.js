import { BaseAgent } from './base-agent.js';

/**
 * Security analysis agent that scans for vulnerabilities and security issues.
 * Focuses on OWASP Top 10, authentication, input validation, and other security concerns.
 * 
 * @class SecurityAgent
 * @extends BaseAgent
 * @example
 * const securityAgent = new SecurityAgent();
 * await securityAgent.initialize('/path/to/repo');
 * await securityAgent.analyze();
 */
export class SecurityAgent extends BaseAgent {
  /**
   * Creates a new SecurityAgent instance.
   * 
   * @param {Object} [config={}] - Agent configuration
   */
  constructor(config = {}) {
    super('security', {
      systemPrompt: `You are a security expert analyzing Node.js/TypeScript applications for vulnerabilities. Focus on:
- Common security vulnerabilities (OWASP Top 10)
- Authentication and authorization flaws
- Input validation and sanitization
- SQL injection and NoSQL injection risks
- Cross-site scripting (XSS) vulnerabilities
- Cross-site request forgery (CSRF) protection
- Dependency security and known vulnerabilities
- Secrets management and exposure
- Security headers and HTTPS configuration
- Rate limiting and DoS protection

Provide specific security recommendations with severity levels and remediation steps.`,
      maxTokens: 4000,
      ...config
    });
  }

  async analyze() {
    this.logProgress('Starting security analysis...');
    
    try {
      // Determine project context for appropriate recommendations
      const projectContext = await this.analyzeProjectContext();
      
      // Perform various security checks
      const vulnerabilityAnalysis = await this.analyzeVulnerabilities(projectContext);
      const authSecurityAnalysis = await this.analyzeAuthSecurity();
      const inputValidationAnalysis = await this.analyzeInputValidation();
      const dependencyAnalysis = await this.analyzeDependencies();
      const secretsAnalysis = await this.analyzeSecretsExposure();
      
      const overallAnalysis = this.formatAnalysis('Security Analysis', {
        'Vulnerability Assessment': vulnerabilityAnalysis,
        'Authentication & Authorization': authSecurityAnalysis,
        'Input Validation': inputValidationAnalysis,
        'Dependency Security': dependencyAnalysis,
        'Secrets Management': secretsAnalysis,
        'Security Recommendations': await this.generateSecurityRecommendations(projectContext)
      });
      
      this.updateAnalysisSection(overallAnalysis);
      this.logProgress('Security analysis completed');
      
    } catch (error) {
      this.logError('Security analysis failed', error);
      this.updateAnalysisSection(`Analysis failed: ${error.message}`);
    }
  }

  /**
   * Analyze the project context to provide appropriate security recommendations
   * @returns {Object} Project context information
   */
  async analyzeProjectContext() {
    const packageJsonFiles = await this.findFiles('**/package.json');
    const dockerFiles = await this.findFiles('**/Dockerfile');
    const serverFiles = await this.findFiles('**/*{server,app,index}.{js,ts}');
    const cliFiles = await this.findFiles('**/cli.{js,ts}');
    const webFiles = await this.findFiles('**/*{express,koa,fastify}*.{js,ts}');
    
    let projectType = 'unknown';
    let deploymentContext = 'development';
    let userFacing = false;
    
    // Determine project type
    if (cliFiles.length > 0 || await this.hasCliPatterns()) {
      projectType = 'cli-tool';
    } else if (webFiles.length > 0 || await this.hasWebServerPatterns()) {
      projectType = 'web-service';
      userFacing = true;
    } else if (await this.hasLibraryPatterns()) {
      projectType = 'library';
    }
    
    // Determine deployment context
    if (dockerFiles.length > 0) {
      deploymentContext = 'containerized';
    } else if (await this.hasProductionPatterns()) {
      deploymentContext = 'production';
    }
    
    return {
      projectType,
      deploymentContext,
      userFacing,
      isCliTool: projectType === 'cli-tool',
      isWebService: projectType === 'web-service',
      isLibrary: projectType === 'library',
      isProduction: deploymentContext !== 'development'
    };
  }

  async hasCliPatterns() {
    const files = await this.findFiles('**/*.{js,ts}');
    for (const file of files) {
      try {
        const content = await this.readFile(file);
        if (/process\.argv|commander|yargs|cli/.test(content)) {
          return true;
        }
      } catch (e) {
        continue;
      }
    }
    return false;
  }

  async hasWebServerPatterns() {
    const files = await this.findFiles('**/*.{js,ts}');
    for (const file of files) {
      try {
        const content = await this.readFile(file);
        if (/express\(\)|app\.listen|server\.listen|http\.createServer/.test(content)) {
          return true;
        }
      } catch (e) {
        continue;
      }
    }
    return false;
  }

  async hasLibraryPatterns() {
    try {
      const packageJson = await this.readFile('package.json');
      const parsed = JSON.parse(packageJson);
      return parsed.main || parsed.exports || parsed.module;
    } catch (e) {
      return false;
    }
  }

  async hasProductionPatterns() {
    const files = await this.findFiles('**/*.{js,ts,json}');
    for (const file of files) {
      try {
        const content = await this.readFile(file);
        if (/NODE_ENV.*production|pm2|cluster|load.*balance/.test(content)) {
          return true;
        }
      } catch (e) {
        continue;
      }
    }
    return false;
  }

  async analyzeVulnerabilities(projectContext = {}) {
    // First try AI-powered analysis
    const aiAnalysis = await this.performAIVulnerabilityAnalysis();
    if (aiAnalysis) {
      return aiAnalysis;
    }

    // Fallback to pattern matching if no API key
    if (this.consoleUtils) {
      this.consoleUtils.verboseInfo(`${this.name}: Using basic pattern matching for vulnerability detection`);
      this.consoleUtils.verboseInfo(`${this.name}: Results may contain false positives - use with caution`);
    } else {
      console.warn(`⚠️ ${this.name}: Using basic pattern matching for vulnerability detection`);
      console.warn(`⚠️ ${this.name}: Results may contain false positives - use with caution`);
    }
    
    return this.performFallbackVulnerabilityAnalysis(projectContext);
  }

  async performFallbackVulnerabilityAnalysis(projectContext = {}) {
    const sourceFiles = await this.findFiles('**/*.{js,ts}');
    const vulnerabilities = [];
    const positivePatterns = [];

    for (const file of sourceFiles.slice(0, 20)) {
      try {
        const content = await this.readFile(file);
        const fileVulns = this.detectCommonVulnerabilities(file, content, projectContext);
        const filePositives = this.detectPositiveSecurityPatterns(file, content);
        vulnerabilities.push(...fileVulns);
        positivePatterns.push(...filePositives);
        
      } catch (error) {
        continue;
      }
    }

    let analysis = '';

    // Add positive security findings first
    if (positivePatterns.length > 0) {
      analysis += '## ✅ Positive Security Findings\n\n';
      const groupedPositives = {};
      positivePatterns.forEach(pattern => {
        if (!groupedPositives[pattern.type]) groupedPositives[pattern.type] = [];
        groupedPositives[pattern.type].push(pattern);
      });
      
      Object.entries(groupedPositives).forEach(([type, patterns]) => {
        analysis += `**${type}:**\n`;
        patterns.forEach(pattern => {
          analysis += `- ${pattern.description} (${pattern.file})\n`;
        });
        analysis += '\n';
      });
      analysis += '---\n\n';
    }

    if (vulnerabilities.length === 0) {
      return analysis + '✅ No common vulnerability patterns detected in analyzed files\n\n**Note:** Pattern-matching analysis used (no API key). Results may be incomplete.';
    }

    // Group vulnerabilities by severity
    const critical = vulnerabilities.filter(v => v.severity === 'Critical');
    const high = vulnerabilities.filter(v => v.severity === 'High');
    const medium = vulnerabilities.filter(v => v.severity === 'Medium');
    const low = vulnerabilities.filter(v => v.severity === 'Low');

    analysis += `**Vulnerability Summary:**\n`;
    analysis += `- Critical: ${critical.length}\n`;
    analysis += `- High: ${high.length}\n`;
    analysis += `- Medium: ${medium.length}\n`;
    analysis += `- Low: ${low.length}\n\n`;

    // Report critical and high severity issues
    if (critical.length > 0) {
      analysis += `🚨 **Critical Vulnerabilities:**\n`;
      critical.forEach(vuln => {
        analysis += `- **${vuln.file}**: ${vuln.description}\n`;
        analysis += `  - Type: ${vuln.type}\n`;
        analysis += `  - Fix: ${vuln.remediation}\n\n`;
      });
    }

    if (high.length > 0) {
      analysis += `⚠️ **High Severity Issues:**\n`;
      high.slice(0, 5).forEach(vuln => {
        analysis += `- **${vuln.file}**: ${vuln.description}\n`;
        analysis += `  - Fix: ${vuln.remediation}\n\n`;
      });
    }

    analysis += `\n\n**⚠️ IMPORTANT:** This analysis used basic pattern matching due to missing API key.\n`;
    analysis += `**Results may contain false positives and should be manually verified.**\n`;
    analysis += `**Set ANTHROPIC_API_KEY for accurate AI-powered security analysis.**\n`;
    
    return analysis;
  }

  async performAIVulnerabilityAnalysis() {
    const sourceFiles = await this.findFiles('**/*.{js,ts}');
    if (sourceFiles.length === 0) {
      return 'No source files found for analysis';
    }

    // Read key files for AI analysis
    const filesToAnalyze = sourceFiles.slice(0, 10);
    const fileContents = {};
    
    for (const file of filesToAnalyze) {
      try {
        fileContents[file] = await this.readFile(file);
      } catch (error) {
        continue;
      }
    }

    const prompt = `Analyze these Node.js/TypeScript files for security vulnerabilities:

${Object.entries(fileContents).map(([file, content]) => 
      `## ${file}\n\`\`\`javascript\n${content.slice(0, 2000)}\n\`\`\`\n`
    ).join('\n')}

**IMPORTANT**: Look for BOTH vulnerabilities AND their security implementations. A vulnerability is only an issue if it's NOT properly mitigated.

Provide a detailed security analysis including:
1. **Actual unresolved security vulnerabilities** (not issues that are already properly secured)
2. **Security implementations found** (mention when security measures are correctly implemented)
3. Severity levels (Critical, High, Medium, Low) - only for UNRESOLVED issues
4. Specific remediation steps for unresolved issues only
5. **Positive security findings** - acknowledge good security practices

**Key Security Patterns to Recognize as SECURE:**
- Environment variables validated through SecureEnvManager.validateEnv()
- Input sanitized through SecureEnvManager.sanitizeValue()
- Sensitive data masked using SecureEnvManager.maskSensitive()
- Validation with proper error handling and sanitization
- Files using secure utility classes for sensitive operations

**Examples of FALSE POSITIVES to avoid:**
- Reporting "insecure environment variable handling" when SecureEnvManager is used
- Flagging process.env usage when it's wrapped in validation functions
- Warning about missing validation when validation is implemented through utility classes

Focus on real, unresolved vulnerabilities. Give credit when security measures are properly implemented.`;

    return await this.callAI(prompt, this.config.systemPrompt);
  }

  detectCommonVulnerabilities(fileName, content, projectContext = {}) {
    const vulnerabilities = [];

    // SQL Injection patterns
    const sqlInjectionPatterns = [
      /query\s*\(\s*["`'][^"`']*\$\{[^}]+\}[^"`']*["`']\s*\)/g,
      /\$\{[^}]+\}\s*\+\s*["`'].*["`']/g,
      /["`'][^"`']*\+\s*.*\+\s*["`']/g
    ];

    for (const pattern of sqlInjectionPatterns) {
      if (pattern.test(content)) {
        vulnerabilities.push({
          file: fileName,
          type: 'SQL Injection',
          severity: 'Critical',
          description: 'Potential SQL injection vulnerability in query construction',
          remediation: 'Use parameterized queries or prepared statements'
        });
        break;
      }
    }

    // Command Injection
    if (/exec\(|spawn\(|system\(/.test(content) && /\$\{|\+/.test(content)) {
      vulnerabilities.push({
        file: fileName,
        type: 'Command Injection',
        severity: 'Critical',
        description: 'Potential command injection in system calls',
        remediation: 'Sanitize input and use safe execution methods'
      });
    }

    // Path Traversal
    if (/readFile|writeFile|createReadStream/.test(content) && /\.\.|\/\.\.|\\\.\./.test(content)) {
      vulnerabilities.push({
        file: fileName,
        type: 'Path Traversal',
        severity: 'High',
        description: 'Potential path traversal vulnerability',
        remediation: 'Validate and sanitize file paths, use path.resolve()'
      });
    }

    // Hardcoded secrets (but not environment variable usage)
    const secretPatterns = [
      { pattern: /password\s*[:=]\s*["`'][^"`']{8,}["`']/gi, name: 'Hardcoded Password' },
      { pattern: /api[_-]?key\s*[:=]\s*["`'][^"`']{10,}["`']/gi, name: 'Hardcoded API Key' },
      { pattern: /secret\s*[:=]\s*["`'][^"`']{16,}["`']/gi, name: 'Hardcoded Secret' },
      { pattern: /token\s*[:=]\s*["`'][^"`']{20,}["`']/gi, name: 'Hardcoded Token' }
    ];

    for (const { pattern, name } of secretPatterns) {
      if (pattern.test(content)) {
        vulnerabilities.push({
          file: fileName,
          type: 'Information Disclosure',
          severity: 'High',
          description: `${name} found in source code`,
          remediation: this.getSecretsRemediation(projectContext)
        });
      }
    }

    // Environment variable usage - context-aware assessment
    if (/process\.env\.[A-Z_]+/.test(content)) {
      const envVarIssue = this.assessEnvironmentVariableUsage(fileName, content, projectContext);
      if (envVarIssue) {
        vulnerabilities.push(envVarIssue);
      }
    }

    // Insecure random number generation
    if (/Math\.random\(\)/.test(content) && /password|token|key|session/.test(content)) {
      vulnerabilities.push({
        file: fileName,
        type: 'Weak Cryptography',
        severity: 'Medium',
        description: 'Math.random() used for security-sensitive operations',
        remediation: 'Use crypto.randomBytes() for cryptographic operations'
      });
    }

    // Missing input validation on user inputs
    if (/req\.(body|params|query)/.test(content) && !/validate|sanitize|escape/.test(content)) {
      vulnerabilities.push({
        file: fileName,
        type: 'Input Validation',
        severity: 'Medium',
        description: 'User input used without apparent validation',
        remediation: 'Implement input validation and sanitization'
      });
    }

    // Eval usage
    if (/\beval\s*\(/.test(content)) {
      vulnerabilities.push({
        file: fileName,
        type: 'Code Injection',
        severity: 'Critical',
        description: 'Use of eval() function detected',
        remediation: 'Avoid eval() - use safer alternatives like JSON.parse()'
      });
    }

    // Insecure cookie settings
    if (/res\.cookie\(/.test(content) && !/secure.*httpOnly|httpOnly.*secure/.test(content)) {
      vulnerabilities.push({
        file: fileName,
        type: 'Session Management',
        severity: 'Medium',
        description: 'Cookies set without secure flags',
        remediation: 'Set secure and httpOnly flags on cookies'
      });
    }

    return vulnerabilities;
  }

  /**
   * Provide context-appropriate remediation for secrets management
   */
  getSecretsRemediation(projectContext) {
    if (projectContext.isCliTool) {
      return 'Use environment variables (.env file) or configuration files outside the repository';
    } else if (projectContext.isWebService && projectContext.isProduction) {
      return 'Use a secrets management service (AWS Secrets Manager, Azure Key Vault, or HashiCorp Vault)';
    } else {
      return 'Move secrets to environment variables or configuration files';
    }
  }

  /**
   * Assess environment variable usage appropriately for project context
   */
  assessEnvironmentVariableUsage(fileName, content, projectContext) {
    // Check if SecureEnvManager is being used - if so, environment variables are properly secured
    if (/SecureEnvManager\.(validateEnv|sanitizeValue|get)|EnvLoader\.get/.test(content)) {
      // Environment variables are properly secured through SecureEnvManager or EnvLoader
      return null;
    }

    // Check for missing validation on direct process.env usage
    if (/process\.env\.[A-Z_]+/.test(content) && !/if\s*\(.*process\.env|throw.*Error.*process\.env/.test(content)) {
      const severity = projectContext.isCliTool ? 'Low' : 'Medium';
      const description = projectContext.isCliTool 
        ? 'Environment variable used without validation - may cause runtime errors'
        : 'Environment variable used without validation - potential security issue';
      
      const remediation = projectContext.isCliTool
        ? 'Add validation: if (!process.env.API_KEY) throw new Error("API_KEY required") or use EnvLoader.get()'
        : 'Implement proper environment variable validation using SecureEnvManager or EnvLoader';

      return {
        file: fileName,
        type: 'Configuration',
        severity,
        description,
        remediation
      };
    }

    return null; // Environment variable usage is appropriate
  }

  /**
   * Detect positive security patterns that should be acknowledged
   */
  detectPositiveSecurityPatterns(fileName, content) {
    const positivePatterns = [];

    // SecureEnvManager usage
    if (/SecureEnvManager\.(validateEnv|sanitizeValue|maskSensitive)/.test(content)) {
      positivePatterns.push({
        file: fileName,
        type: 'Environment Variable Security',
        description: '✅ Uses SecureEnvManager for secure environment variable handling',
        implementation: 'Environment variables are validated, sanitized, and masked appropriately'
      });
    }

    // Input validation patterns
    if (/validate|sanitize|escape/.test(content) && !/console\.log/.test(content)) {
      positivePatterns.push({
        file: fileName,
        type: 'Input Validation',
        description: '✅ Implements input validation and sanitization',
        implementation: 'Input data is being validated before use'
      });
    }

    // Error handling patterns
    if (/try\s*\{[\s\S]*catch[\s\S]*finally|\.catch\(/.test(content)) {
      positivePatterns.push({
        file: fileName,
        type: 'Error Handling',
        description: '✅ Implements proper error handling',
        implementation: 'Errors are caught and handled appropriately'
      });
    }

    return positivePatterns;
  }

  async analyzeAuthSecurity() {
    const authFiles = await this.findFiles('**/*{auth,login,session}*.{js,ts}');
    const middlewareFiles = await this.findFiles('**/*middleware*.{js,ts}');
    
    if (authFiles.length === 0 && middlewareFiles.length === 0) {
      return 'No authentication-related files found to analyze';
    }

    let analysis = '';
    const issues = [];

    const relevantFiles = [...authFiles, ...middlewareFiles];
    
    for (const file of relevantFiles.slice(0, 10)) {
      try {
        const content = await this.readFile(file);
        const authIssues = this.analyzeAuthImplementation(file, content);
        issues.push(...authIssues);
        
      } catch (error) {
        continue;
      }
    }

    analysis += `**Authentication Files Analyzed:** ${relevantFiles.length}\n\n`;

    if (issues.length === 0) {
      analysis += '✅ No major authentication security issues detected\n';
    } else {
      analysis += `**Security Issues Found:**\n`;
      issues.forEach(issue => {
        analysis += `- **${issue.file}**: ${issue.description}\n`;
        analysis += `  - Severity: ${issue.severity}\n`;
        analysis += `  - Fix: ${issue.remediation}\n\n`;
      });
    }

    return analysis;
  }

  analyzeAuthImplementation(fileName, content) {
    const issues = [];

    // JWT without proper verification
    if (/jwt\.sign/.test(content) && !/jwt\.verify/.test(content)) {
      issues.push({
        file: fileName,
        severity: 'Medium',
        description: 'JWT signing found but no verification logic detected',
        remediation: 'Ensure JWT tokens are properly verified on protected routes'
      });
    }

    // Weak JWT secrets
    if (/jwt\.sign.*["`']secret["`']|jwt\.sign.*["`']123/.test(content)) {
      issues.push({
        file: fileName,
        severity: 'High',
        description: 'Weak JWT secret detected',
        remediation: 'Use strong, randomly generated secrets from environment variables'
      });
    }

    // Missing password hashing
    if (/password/.test(content) && !/bcrypt|scrypt|argon2/.test(content)) {
      issues.push({
        file: fileName,
        severity: 'Critical',
        description: 'Password handling without apparent hashing',
        remediation: 'Use bcrypt, scrypt, or argon2 for password hashing'
      });
    }

    // Session management issues
    if (/express-session/.test(content)) {
      if (!/resave.*false/.test(content)) {
        issues.push({
          file: fileName,
          severity: 'Low',
          description: 'Session resave not set to false',
          remediation: 'Set resave: false in session configuration'
        });
      }
      
      if (!/saveUninitialized.*false/.test(content)) {
        issues.push({
          file: fileName,
          severity: 'Low',
          description: 'saveUninitialized not set to false',
          remediation: 'Set saveUninitialized: false in session configuration'
        });
      }
    }

    // Missing CSRF protection
    if (/express/.test(content) && /post|put|delete/.test(content) && !/csrf/.test(content)) {
      issues.push({
        file: fileName,
        severity: 'Medium',
        description: 'State-changing operations without CSRF protection',
        remediation: 'Implement CSRF tokens for forms and state-changing operations'
      });
    }

    return issues;
  }

  async analyzeInputValidation() {
    const routeFiles = await this.findFiles('**/*{route,api,controller}*.{js,ts}');
    
    if (routeFiles.length === 0) {
      return 'No route files found to analyze input validation';
    }

    let analysis = '';
    let routesWithValidation = 0;
    let totalRoutes = 0;
    const validationIssues = [];

    for (const file of routeFiles.slice(0, 10)) {
      try {
        const content = await this.readFile(file);
        const routeAnalysis = this.analyzeRouteValidation(file, content);
        
        totalRoutes += routeAnalysis.totalRoutes;
        routesWithValidation += routeAnalysis.validatedRoutes;
        validationIssues.push(...routeAnalysis.issues);
        
      } catch (error) {
        continue;
      }
    }

    const validationCoverage = totalRoutes > 0 ? ((routesWithValidation / totalRoutes) * 100).toFixed(1) : 0;

    analysis += `**Input Validation Coverage:**\n`;
    analysis += `- Routes analyzed: ${totalRoutes}\n`;
    analysis += `- Routes with validation: ${routesWithValidation}\n`;
    analysis += `- Validation coverage: ${validationCoverage}%\n\n`;

    if (validationIssues.length > 0) {
      analysis += `**Validation Issues:**\n`;
      validationIssues.slice(0, 10).forEach(issue => {
        analysis += `- **${issue.file}**: ${issue.description}\n`;
      });
      analysis += '\n';
    }

    if (validationCoverage < 50) {
      analysis += '🚨 **Low validation coverage** - Implement input validation on all user-facing endpoints\n';
    } else if (validationCoverage < 80) {
      analysis += '⚠️ **Moderate validation coverage** - Expand validation to cover all endpoints\n';
    } else {
      analysis += '✅ **Good validation coverage** - Consider adding schema validation\n';
    }

    return analysis;
  }

  analyzeRouteValidation(fileName, content) {
    // Find route definitions
    const routePatterns = [
      /\.(get|post|put|delete|patch)\s*\(/g,
      /router\.(get|post|put|delete|patch)\s*\(/g,
      /app\.(get|post|put|delete|patch)\s*\(/g
    ];

    let totalRoutes = 0;
    for (const pattern of routePatterns) {
      const matches = content.match(pattern);
      if (matches) {
        totalRoutes += matches.length;
      }
    }

    // Check for validation libraries
    const hasValidation = /joi|yup|express-validator|ajv|zod/.test(content);
    const hasManualValidation = /validate|sanitize|escape/.test(content);
    
    const validatedRoutes = (hasValidation || hasManualValidation) ? Math.min(totalRoutes, 1) : 0;

    const issues = [];
    
    // Check for unvalidated input usage
    if (/req\.(body|params|query)/.test(content) && !hasValidation && !hasManualValidation) {
      issues.push({
        file: fileName,
        description: 'Routes use request data without apparent validation'
      });
    }

    // Check for direct database queries with user input
    if (/req\.(body|params|query).*\.(find|update|delete|save)/.test(content)) {
      issues.push({
        file: fileName,
        description: 'User input passed directly to database operations'
      });
    }

    return {
      totalRoutes,
      validatedRoutes,
      issues
    };
  }

  async analyzeDependencies() {
    let analysis = '';

    try {
      const packageJson = JSON.parse(await this.readFile('package.json'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      analysis += `**Dependencies Analyzed:** ${Object.keys(dependencies).length}\n\n`;

      // Check for known vulnerable packages (basic check)
      const potentiallyVulnerable = this.checkKnownVulnerablePackages(dependencies);
      
      if (potentiallyVulnerable.length > 0) {
        analysis += `⚠️ **Potentially Vulnerable Dependencies:**\n`;
        potentiallyVulnerable.forEach(pkg => {
          analysis += `- ${pkg.name}: ${pkg.reason}\n`;
        });
        analysis += '\n';
      } else {
        analysis += '✅ No obviously vulnerable dependencies detected\n\n';
      }

      // Check for outdated/unmaintained packages
      const oldPackages = this.checkOutdatedPatterns(dependencies);
      if (oldPackages.length > 0) {
        analysis += `📅 **Potentially Outdated Packages:**\n`;
        oldPackages.forEach(pkg => {
          analysis += `- ${pkg}\n`;
        });
        analysis += '\n';
      }

      analysis += `**Recommendations:**\n`;
      analysis += `- Run \`npm audit\` regularly to check for known vulnerabilities\n`;
      analysis += `- Use \`npm update\` to keep dependencies current\n`;
      analysis += `- Consider using automated dependency update tools (Dependabot, Renovate)\n`;
      analysis += `- Review and minimize the number of dependencies\n`;

    } catch (error) {
      analysis = 'Could not analyze dependencies - package.json not found or invalid';
    }

    return analysis;
  }

  checkKnownVulnerablePackages(dependencies) {
    const vulnerable = [];
    
    // This is a simplified check - in production, would use a vulnerability database
    const knownIssues = {
      'lodash': { version: '<4.17.21', reason: 'Prototype pollution vulnerabilities in older versions' },
      'moment': { version: '<2.29.0', reason: 'ReDoS vulnerability in older versions' },
      'request': { version: '*', reason: 'Deprecated package with security issues' },
      'morgan': { version: '<1.10.0', reason: 'Log injection vulnerability' }
    };

    for (const [pkg, version] of Object.entries(dependencies)) {
      if (knownIssues[pkg]) {
        vulnerable.push({
          name: pkg,
          version,
          reason: knownIssues[pkg].reason
        });
      }
    }

    return vulnerable;
  }

  checkOutdatedPatterns(dependencies) {
    const outdated = [];
    
    for (const [pkg, version] of Object.entries(dependencies)) {
      // Check for very old version patterns
      if (version.includes('^0.') || version.includes('~0.')) {
        outdated.push(`${pkg}@${version} (major version 0.x)`);
      }
      
      // Check for locked old versions
      if (/^[12]\.\d+\.\d+$/.test(version) && !version.includes('^') && !version.includes('~')) {
        outdated.push(`${pkg}@${version} (locked to old version)`);
      }
    }

    return outdated;
  }

  async analyzeSecretsExposure() {
    const allFiles = await this.findFiles('**/*.{js,ts,json,env*,config*}');
    const exposedSecrets = [];

    for (const file of allFiles.slice(0, 20)) {
      if (file.includes('node_modules')) continue;
      
      try {
        const content = await this.readFile(file);
        const secrets = this.findExposedSecrets(file, content);
        exposedSecrets.push(...secrets);
        
      } catch (error) {
        continue;
      }
    }

    let analysis = '';

    if (exposedSecrets.length === 0) {
      analysis += '✅ No obvious secrets exposed in source code\n\n';
    } else {
      analysis += `🚨 **Exposed Secrets Found:** ${exposedSecrets.length}\n\n`;
      exposedSecrets.forEach(secret => {
        analysis += `- **${secret.file}**: ${secret.type}\n`;
        analysis += `  - Pattern: ${secret.pattern}\n`;
        analysis += `  - Risk: ${secret.risk}\n\n`;
      });
    }

    // Check for .env file
    const envFiles = await this.findFiles('.env*');
    if (envFiles.length > 0) {
      analysis += `📋 **Environment Files Found:** ${envFiles.join(', ')}\n`;
      analysis += `⚠️ Ensure these files are in .gitignore and not committed\n\n`;
    }

    analysis += `**Best Practices:**\n`;
    analysis += `- Use environment variables for all secrets\n`;
    analysis += `- Add .env files to .gitignore\n`;
    analysis += `- Use secret management services in production\n`;
    analysis += `- Rotate secrets regularly\n`;
    analysis += `- Scan commits for accidentally committed secrets\n`;

    return analysis;
  }

  findExposedSecrets(fileName, content) {
    const secrets = [];
    
    const secretPatterns = [
      {
        pattern: /(['"`])(?:(?=(\\?))\2.)*?\1/g,
        test: /^[A-Za-z0-9+/]{40,}={0,2}$/,
        type: 'Base64 Token',
        risk: 'High - Potential API key or token'
      },
      {
        pattern: /sk_live_[a-zA-Z0-9]{24,}/g,
        type: 'Stripe Live Key',
        risk: 'Critical - Live payment processing key'
      },
      {
        pattern: /(?:password|pwd|pass)\s*[:=]\s*["`'][^"`']{8,}["`']/gi,
        type: 'Hardcoded Password',
        risk: 'High - Password in source code'
      },
      {
        pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["`'][^"`']{10,}["`']/gi,
        type: 'API Key',
        risk: 'High - API key in source code'
      },
      {
        pattern: /(?:secret|token)\s*[:=]\s*["`'][^"`']{16,}["`']/gi,
        type: 'Secret/Token',
        risk: 'High - Secret or token in source code'
      }
    ];

    for (const secretPattern of secretPatterns) {
      const matches = content.match(secretPattern.pattern);
      if (matches) {
        for (const match of matches) {
          if (!secretPattern.test || secretPattern.test.test(match)) {
            secrets.push({
              file: fileName,
              type: secretPattern.type,
              pattern: match.substring(0, 50) + (match.length > 50 ? '...' : ''),
              risk: secretPattern.risk
            });
          }
        }
      }
    }

    return secrets;
  }

  async generateSecurityRecommendations(projectContext = {}) {
    if (projectContext.isCliTool) {
      return this.generateCliSecurityRecommendations();
    } else if (projectContext.isWebService) {
      return this.generateWebServiceSecurityRecommendations(projectContext);
    } else if (projectContext.isLibrary) {
      return this.generateLibrarySecurityRecommendations();
    } else {
      return this.generateGeneralSecurityRecommendations();
    }
  }

  generateCliSecurityRecommendations() {
    return `**Priority Actions for CLI Tools:**
1. **Input Validation**: Validate command-line arguments and file paths to prevent injection attacks
2. **Environment Variables**: Use .env files for configuration, validate all required variables on startup
3. **File Operations**: Sanitize file paths to prevent directory traversal attacks
4. **Error Handling**: Avoid exposing sensitive information in error messages

**CLI-Specific Security Measures:**
1. Validate all user-provided file paths and arguments
2. Use environment variables for API keys and sensitive configuration
3. Implement proper error handling without information disclosure
4. Add input sanitization for any data processing
5. Keep dependencies updated with \`npm audit\`

**Recommended Tools:**
- \`dotenv\` for environment variable management
- \`yargs\` or \`commander\` for secure argument parsing
- \`joi\` or \`zod\` for input validation
- ESLint security plugins

**Configuration Security:**
- Create a \`.env.example\` file with placeholder values
- Add \`.env\` to \`.gitignore\`
- Document required environment variables in README
- Validate required environment variables on startup`;
  }

  generateWebServiceSecurityRecommendations(projectContext) {
    const productionRecommendations = projectContext.isProduction ? `
**Production Security:**
- Use secrets management service (AWS Secrets Manager, Azure Key Vault)
- Implement comprehensive logging and monitoring
- Set up Web Application Firewall (WAF)
- Regular security audits and penetration testing` : `
**Development Security:**
- Use \`.env\` files for local development
- Implement input validation early
- Set up basic rate limiting
- Use HTTPS in development when possible`;

    return `**Critical Actions for Web Services:**
1. **Fix Critical Vulnerabilities**: Address any SQL injection, XSS, and authentication bypasses
2. **Input Validation**: Implement validation on all API endpoints
3. **Authentication & Authorization**: Secure all protected endpoints
4. **Rate Limiting**: Prevent abuse and DoS attacks

**Web Service Security Measures:**
1. Implement HTTPS and security headers (HSTS, CSP, X-Frame-Options)
2. Add rate limiting and request size limits
3. Use CSRF protection for state-changing operations
4. Set secure flags on cookies (secure, httpOnly, sameSite)
5. Implement proper session management${productionRecommendations}

**Security Tools:**
- \`helmet\` for security headers
- \`express-rate-limit\` for rate limiting
- \`bcrypt\` for password hashing
- \`joi\` or \`express-validator\` for input validation
- \`csurf\` for CSRF protection`;
  }

  generateLibrarySecurityRecommendations() {
    return `**Priority Actions for Libraries:**
1. **Input Validation**: Validate all public API inputs and parameters
2. **Secure Defaults**: Provide secure default configurations
3. **Error Handling**: Avoid leaking sensitive information in error messages
4. **Dependencies**: Minimize and regularly audit dependencies

**Library Security Measures:**
1. Implement comprehensive input validation for all public methods
2. Use secure defaults for all configuration options
3. Document security considerations for users
4. Provide clear examples of secure usage
5. Regular security testing of public APIs

**Documentation:**
- Security section in README
- Examples of secure configuration
- Known security considerations
- Responsible disclosure policy`;
  }

  generateGeneralSecurityRecommendations() {
    return `**General Security Recommendations:**
1. **Fix Critical Vulnerabilities**: Address any high-severity issues found
2. **Input Validation**: Validate and sanitize all external inputs
3. **Dependencies**: Keep dependencies updated and scan for vulnerabilities
4. **Configuration**: Use environment variables for sensitive configuration

**Security Best Practices:**
1. Regular dependency updates with \`npm audit\`
2. Implement proper error handling
3. Use ESLint security plugins
4. Set up automated security scanning
5. Document security considerations`;
  }
}