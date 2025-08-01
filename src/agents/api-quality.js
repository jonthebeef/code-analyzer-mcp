import { BaseAgent } from './base-agent.js';

/**
 * API Quality analysis agent that evaluates REST API design and implementation.
 * Analyzes endpoints, error handling, validation, documentation, and security.
 * 
 * @class ApiQualityAgent
 * @extends BaseAgent
 * @example
 * const apiAgent = new ApiQualityAgent();
 * await apiAgent.initialize('/path/to/repo');
 * await apiAgent.analyze();
 */
export class ApiQualityAgent extends BaseAgent {
  /**
   * Creates a new ApiQualityAgent instance.
   * 
   * @param {Object} [config={}] - Agent configuration
   */
  constructor(config = {}) {
    super('api-quality', {
      systemPrompt: `You are an API quality expert analyzing Node.js/TypeScript APIs. Focus on:
- REST API design patterns and best practices
- Error handling and HTTP status codes
- Input validation and sanitization
- Rate limiting and security headers
- API documentation and OpenAPI specs
- Request/response structure consistency
- Authentication and authorization patterns
- Performance considerations (caching, pagination)

Provide specific, actionable recommendations with file locations and code examples.`,
      maxTokens: 4000,
      ...config
    });
  }

  async analyze() {
    this.logProgress('Starting API quality analysis...');
    
    try {
      // Find API-related files
      const apiFiles = await this.findApiFiles();
      if (apiFiles.length === 0) {
        this.updateAnalysisSection('No API files detected in this repository.');
        return;
      }

      this.logProgress(`Found ${apiFiles.length} API files to analyze`);

      // Read API files
      const fileContents = await this.readFiles(apiFiles);
      
      // Analyze API patterns
      const analysis = await this.performApiAnalysis(fileContents);
      
      // Update working memory with results
      this.updateAnalysisSection(analysis);
      
      this.logProgress('API quality analysis completed');
      
    } catch (error) {
      this.logError('API analysis failed', error);
      this.updateAnalysisSection(`Analysis failed: ${error.message}`);
    }
  }

  async findApiFiles() {
    const patterns = [
      '**/*route*.js',
      '**/*route*.ts',
      '**/*api*.js',
      '**/*api*.ts',
      '**/*controller*.js',
      '**/*controller*.ts',
      '**/app.js',
      '**/app.ts',
      '**/server.js',
      '**/server.ts'
    ];

    const allFiles = [];
    for (const pattern of patterns) {
      const files = await this.findFiles(pattern);
      allFiles.push(...files);
    }

    // Remove duplicates and filter for actual API files
    const uniqueFiles = [...new Set(allFiles)];
    const apiFiles = [];

    for (const file of uniqueFiles) {
      try {
        const content = await this.readFile(file);
        if (this.containsApiPatterns(content)) {
          apiFiles.push(file);
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    return apiFiles;
  }

  containsApiPatterns(content) {
    const apiPatterns = [
      /app\.(get|post|put|delete|patch)/i,
      /router\.(get|post|put|delete|patch)/i,
      /fastify\.(get|post|put|delete|patch)/i,
      /\.route\(/i,
      /@(Get|Post|Put|Delete|Patch)\(/i,
      /express\(\)/i,
      /createServer/i,
      /app\.use\(/i,
      /middleware/i,
      /req\.(body|params|query)/i,
      /res\.(json|send|status)/i
    ];

    return apiPatterns.some(pattern => pattern.test(content));
  }

  async performBasicApiAnalysis(fileContents) {
    const analysis = [];
    analysis.push('**⚠️ FALLBACK ANALYSIS USED** - Set ANTHROPIC_API_KEY for detailed AI analysis\n');
    
    for (const [fileName, content] of Object.entries(fileContents)) {
      if (this.containsApiPatterns(content)) {
        analysis.push(`## ${fileName}`);
        analysis.push('- Contains API routes or endpoints');
        
        // Check for common API patterns
        if (this.hasErrorHandling(content)) {
          analysis.push('- ✅ Has error handling');
        } else {
          analysis.push('- ⚠️ Missing error handling');
        }
        
        if (this.hasInputValidation(content)) {
          analysis.push('- ✅ Has input validation');
        } else {
          analysis.push('- ⚠️ Missing input validation');
        }
        
        if (this.checkAuthPatterns(content)) {
          analysis.push('- ✅ Has authentication patterns');
        } else {
          analysis.push('- ⚠️ Missing authentication patterns');
        }
        
        analysis.push('');
      }
    }
    
    if (analysis.length === 1) { // Only the warning message
      return 'No significant API patterns found in the analyzed files.\n\n**Note:** Pattern-matching analysis used (no API key). Results may be incomplete.';
    }
    
    return analysis.join('\n');
  }

  async performApiAnalysis(fileContents) {
    if (this.consoleUtils) {
      this.consoleUtils.verboseInfo(`${this.name}: Starting performApiAnalysis with ${Object.keys(fileContents).length} files`);
    } else {
      console.log(`🧪 ${this.name}: Starting performApiAnalysis with ${Object.keys(fileContents).length} files`);
    }
    
    // First try AI-powered analysis
    if (this.consoleUtils) {
      this.consoleUtils.verboseInfo(`${this.name}: Attempting AI analysis...`);
    } else {
      console.log(`🤖 ${this.name}: Attempting AI analysis...`);
    }
    const aiAnalysis = await this.performAIApiAnalysis(fileContents);
    console.log(`🤖 ${this.name}: AI analysis result:`, {
      type: typeof aiAnalysis,
      length: aiAnalysis?.length || 0,
      isNull: aiAnalysis === null,
      isUndefined: aiAnalysis === undefined
    });
    
    if (aiAnalysis) {
      console.log(`✅ ${this.name}: Using AI analysis result`);
      return aiAnalysis;
    }

    // Fallback to pattern matching if no API key
    console.warn(`⚠️ ${this.name}: AI analysis failed/unavailable - using basic pattern matching`);
    console.warn(`⚠️ ${this.name}: Results may be incomplete - use with caution`);
    
    const basicAnalysis = this.performBasicApiAnalysis(fileContents);
    console.log(`🔄 ${this.name}: Basic analysis result:`, {
      type: typeof basicAnalysis,
      length: basicAnalysis?.length || 0
    });
    
    return basicAnalysis;
  }

  async performAIApiAnalysis(fileContents) {
    console.log(`🤖 ${this.name}: Starting AI API analysis...`);
    
    if (Object.keys(fileContents).length === 0) {
      console.log(`⚠️  ${this.name}: No file contents provided for AI analysis`);
      return 'No API files found for analysis';
    }

    console.log(`📝 ${this.name}: Building analysis prompt for ${Object.keys(fileContents).length} files`);
    const analysisPrompt = `Analyze the following API files for quality issues and best practices:

${Object.entries(fileContents).map(([file, content]) => 
  `**File: ${file}**\n\`\`\`javascript\n${content}\n\`\`\``
).join('\n\n')}

Please provide a comprehensive analysis covering:

1. **Route Design & REST Compliance**
   - RESTful routing patterns
   - HTTP method usage
   - URL structure and naming

2. **Error Handling**
   - Error middleware implementation
   - HTTP status code usage
   - Error response structure

3. **Input Validation**
   - Request validation patterns
   - Sanitization practices
   - Type checking

4. **Security Considerations**
   - Authentication/authorization checks
   - Security headers
   - Rate limiting implementation

5. **Performance & Scalability**
   - Caching strategies
   - Pagination implementation
   - Database query patterns

6. **Documentation & Standards**
   - API documentation presence
   - Response format consistency
   - OpenAPI/Swagger integration

For each issue found, provide:
- Specific file and line references
- Severity level (Critical/High/Medium/Low)
- Concrete improvement suggestions
- Code examples where helpful

Focus on practical, actionable recommendations.`;

    console.log(`🚀 ${this.name}: Calling AI with prompt (${analysisPrompt.length} chars)`);
    const result = await this.callAI(analysisPrompt, this.config.systemPrompt);
    console.log(`📝 ${this.name}: AI call completed, result:`, {
      type: typeof result,
      length: result?.length || 0,
      isNull: result === null,
      preview: result?.slice(0, 100) || 'N/A'
    });
    
    return result;
  }

  async checkAuthPatterns() {
    const authFiles = await this.findFiles('**/*auth*.{js,ts}');
    const middlewareFiles = await this.findFiles('**/*middleware*.{js,ts}');
    
    const relevantFiles = [...authFiles, ...middlewareFiles];
    if (relevantFiles.length === 0) {
      return 'No authentication patterns found.';
    }

    const fileContents = await this.readFiles(relevantFiles);
    
    const authPrompt = `Analyze these authentication/middleware files for security best practices:

${Object.entries(fileContents).map(([file, content]) => 
  `**${file}**:\n\`\`\`javascript\n${content.substring(0, 2000)}\n\`\`\``
).join('\n\n')}

Focus on:
- JWT implementation and security
- Session management
- Password handling
- Rate limiting
- CORS configuration
- Security headers`;

    return await this.callAnthropic(authPrompt);
  }

  async suggestImprovements(analysis) {
    // This method could ask other agents for insights
    await this.addComment(
      'security',
      'Are there any security vulnerabilities in the API endpoints I analyzed?',
      'API routes and middleware files'
    );

    await this.addComment(
      'documentation',
      'Is the API properly documented? Are there OpenAPI specs or similar?',
      'API documentation and route definitions'
    );
  }

  // Helper methods for pattern matching fallback analysis
  hasErrorHandling(content) {
    const errorPatterns = [
      /try\s*{[\s\S]*?catch/,
      /\.catch\s*\(/,
      /throw\s+new\s+Error/,
      /res\.status\(\d+\)\.json\(/,
      /next\([^)]*error/i,
      /error\s*=>/,
      /catch\s*\(/,
      /express-async-errors/,
      /async.*catch/
    ];
    return errorPatterns.some(pattern => pattern.test(content));
  }

  hasInputValidation(content) {
    const validationPatterns = [
      /joi\./,
      /yup\./,
      /express-validator/,
      /validate\(/,
      /validator\./,
      /req\.body\..*validate/,
      /req\.params\..*validate/,
      /req\.query\..*validate/,
      /check\(['"]/,
      /body\(['"]/,
      /param\(['"]/,
      /query\(['"]/, 
      /validationResult/,
      /typeof.*===.*['"]string['"]/,
      /isNaN\(/,
      /parseInt\(/,
      /parseFloat\(/
    ];
    return validationPatterns.some(pattern => pattern.test(content));
  }

  checkAuthPatterns(content) {
    const authPatterns = [
      /passport\./,
      /jwt\.sign/,
      /jwt\.verify/,
      /bcrypt\./,
      /req\.user/,
      /req\.session/,
      /authorization/i,
      /authenticate/,
      /middleware.*auth/i,
      /isAuthenticated/,
      /requireAuth/,
      /verifyToken/,
      /Bearer\s+token/i,
      /req\.headers\.authorization/,
      /cookie-parser/,
      /express-session/
    ];
    return authPatterns.some(pattern => pattern.test(content));
  }

  containsApiPatterns(content) {
    const apiPatterns = [
      /app\.(get|post|put|patch|delete|use)\s*\(/,
      /router\.(get|post|put|patch|delete|use)\s*\(/,
      /express\(\)/,
      /app\.listen/,
      /res\.(json|send|status)/,
      /req\.(body|params|query)/,
      /middleware/i,
      /route/i,
      /endpoint/i,
      /api/i,
      /server/i
    ];
    return apiPatterns.some(pattern => pattern.test(content));
  }
}