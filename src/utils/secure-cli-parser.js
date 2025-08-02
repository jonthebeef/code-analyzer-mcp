/**
 * Secure CLI Argument Parser with comprehensive validation and sanitization.
 * Prevents command injection, validates inputs, and provides robust error handling.
 * 
 * @class SecureCLIParser
 * @example
 * const parser = new SecureCLIParser({
 *   allowedOptions: ['exclude', 'output-dir', 'model', 'verbose', 'help'],
 *   requiredArgs: ['repository-path']
 * });
 * const result = parser.parse(process.argv.slice(2));
 */
export class SecureCLIParser {
  /**
   * Creates a new SecureCLIParser with configuration.
   * 
   * @param {Object} config - Parser configuration
   * @param {string[]} config.allowedOptions - Whitelist of allowed CLI options
   * @param {string[]} config.requiredArgs - Required positional arguments
   * @param {Object} config.validationRules - Validation rules for each option
   * @param {boolean} config.strictMode - Enable strict validation mode
   */
  constructor(config = {}) {
    this.config = {
      allowedOptions: [],
      requiredArgs: [],
      validationRules: {},
      strictMode: true,
      maxArgLength: 1000,
      maxTotalArgs: 50,
      ...config
    };
    
    // Initialize validation patterns
    this.patterns = {
      // Safe characters for file paths (no shell metacharacters)
      safePath: /^[a-zA-Z0-9._\-\/\\:]+$/,
      // Safe characters for option values
      safeOption: /^[a-zA-Z0-9._\-*\/\\:,]+$/,
      // Pattern to detect potential command injection
      commandInjection: /[;&|`$(){}[\]<>'"\\]/,
      // Pattern for valid model names
      modelName: /^[a-zA-Z0-9\-\.]+$/,
      // Pattern for directory names
      directory: /^[a-zA-Z0-9._\-\/\\]+$/
    };
    
    // Security validation rules
    this.securityRules = {
      // Forbidden patterns that could indicate attacks
      forbiddenPatterns: [
        /[;&|`]/g,           // Command injection
        /\$\(/g,             // Command substitution
        /\${/g,              // Variable expansion
        /<\(/g,              // Process substitution
        />\(/g,              // Process substitution
        /\|\|/g,             // Command chaining
        /&&/g,               // Command chaining
        /\\\w/g,             // Escape sequences
        /[\x00-\x1f\x7f]/g   // Control characters
      ],
      // Maximum lengths to prevent buffer overflow attacks
      maxLengths: {
        option: 50,
        value: 500,
        path: 1000
      }
    };
    
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Parses and validates command line arguments securely.
   * 
   * @param {string[]} rawArgs - Raw command line arguments
   * @returns {Object} Parsed and validated arguments
   * @throws {Error} If validation fails or security issues are detected
   */
  parse(rawArgs) {
    this.errors = [];
    this.warnings = [];
    
    try {
      // Step 1: Basic security validation
      this.validateBasicSecurity(rawArgs);
      
      // Step 2: Parse arguments into structured format
      const parsed = this.parseArguments(rawArgs);
      
      // Step 3: Validate parsed arguments
      this.validateParsedArguments(parsed);
      
      // Step 4: Sanitize all values
      const sanitized = this.sanitizeArguments(parsed);
      
      // Step 5: Apply custom validation rules
      this.applyValidationRules(sanitized);
      
      // Step 6: Check for security violations
      this.performSecurityCheck(sanitized);
      
      if (this.errors.length > 0) {
        throw new CLIValidationError('CLI validation failed', this.errors, this.warnings);
      }
      
      return sanitized;
      
    } catch (error) {
      if (error instanceof CLIValidationError) {
        throw error;
      }
      throw new CLIValidationError('CLI parsing failed', [error.message], this.warnings);
    }
  }

  /**
   * Validates basic security requirements for raw arguments.
   * 
   * @param {string[]} rawArgs - Raw arguments to validate
   * @throws {Error} If basic security checks fail
   */
  validateBasicSecurity(rawArgs) {
    // Check total argument count
    if (rawArgs.length > this.config.maxTotalArgs) {
      this.errors.push(`Too many arguments: ${rawArgs.length} (max: ${this.config.maxTotalArgs})`);
    }
    
    // Check each argument for security issues
    rawArgs.forEach((arg, index) => {
      // Check argument length
      if (arg.length > this.config.maxArgLength) {
        this.errors.push(`Argument ${index} too long: ${arg.length} chars (max: ${this.config.maxArgLength})`);
      }
      
      // Check for forbidden patterns
      this.securityRules.forbiddenPatterns.forEach(pattern => {
        if (pattern.test(arg)) {
          this.errors.push(`Security violation in argument ${index}: forbidden pattern detected`);
        }
      });
      
      // Check for null bytes and control characters
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(arg)) {
        this.errors.push(`Invalid characters in argument ${index}`);
      }
    });
  }

  /**
   * Parses raw arguments into structured format.
   * 
   * @param {string[]} rawArgs - Raw arguments to parse
   * @returns {Object} Structured arguments
   */
  parseArguments(rawArgs) {
    const result = {
      options: {},
      positional: [],
      flags: new Set()
    };
    
    for (let i = 0; i < rawArgs.length; i++) {
      const arg = rawArgs[i];
      
      // Handle help flag specially
      if (arg === '--help' || arg === '-h') {
        result.flags.add('help');
        continue;
      }
      
      // Handle long options with equals
      if (arg.startsWith('--') && arg.includes('=')) {
        const [option, ...valueParts] = arg.slice(2).split('=');
        const value = valueParts.join('='); // Rejoin in case value contains '='
        
        if (!this.isOptionAllowed(option)) {
          this.errors.push(`Unknown option: --${option}`);
          continue;
        }
        
        this.setOptionValue(result.options, option, value);
        continue;
      }
      
      // Handle long options
      if (arg.startsWith('--')) {
        const option = arg.slice(2);
        
        if (!this.isOptionAllowed(option)) {
          this.errors.push(`Unknown option: --${option}`);
          continue;
        }
        
        // Check if this option requires a value
        if (this.optionRequiresValue(option)) {
          if (i + 1 >= rawArgs.length || rawArgs[i + 1].startsWith('-')) {
            this.errors.push(`Option --${option} requires a value`);
            continue;
          }
          this.setOptionValue(result.options, option, rawArgs[++i]);
        } else {
          // Flag option
          result.flags.add(option);
        }
        continue;
      }
      
      // Handle short options
      if (arg.startsWith('-') && arg.length > 1) {
        const shortOption = arg.slice(1);
        const longOption = this.expandShortOption(shortOption);
        
        if (!longOption) {
          this.errors.push(`Unknown short option: -${shortOption}`);
          continue;
        }
        
        if (this.optionRequiresValue(longOption)) {
          if (i + 1 >= rawArgs.length || rawArgs[i + 1].startsWith('-')) {
            this.errors.push(`Option -${shortOption} requires a value`);
            continue;
          }
          this.setOptionValue(result.options, longOption, rawArgs[++i]);
        } else {
          result.flags.add(longOption);
        }
        continue;
      }
      
      // Positional argument
      result.positional.push(arg);
    }
    
    return result;
  }

  /**
   * Sets option value with array support for multiple values.
   */
  setOptionValue(options, option, value) {
    if (option === 'exclude') {
      // Special handling for exclude which can have multiple values
      if (!options[option]) {
        options[option] = [];
      }
      options[option].push(value);
    } else {
      // Single value options
      if (options[option] !== undefined) {
        this.warnings.push(`Option --${option} specified multiple times, using last value`);
      }
      options[option] = value;
    }
  }

  /**
   * Validates parsed arguments structure.
   */
  validateParsedArguments(parsed) {
    // Check required positional arguments
    if (this.config.requiredArgs.length > parsed.positional.length) {
      const missing = this.config.requiredArgs.slice(parsed.positional.length);
      this.errors.push(`Missing required arguments: ${missing.join(', ')}`);
    }
    
    // Validate positional arguments count
    if (parsed.positional.length > this.config.requiredArgs.length) {
      this.warnings.push(`Extra positional arguments will be ignored`);
    }
  }

  /**
   * Sanitizes all argument values.
   */
  sanitizeArguments(parsed) {
    const sanitized = {
      options: {},
      positional: [],
      flags: parsed.flags
    };
    
    // Sanitize options
    for (const [key, value] of Object.entries(parsed.options)) {
      if (Array.isArray(value)) {
        sanitized.options[key] = value.map(v => this.sanitizeValue(v, key));
      } else {
        sanitized.options[key] = this.sanitizeValue(value, key);
      }
    }
    
    // Sanitize positional arguments
    sanitized.positional = parsed.positional.map((arg, index) => {
      const argName = this.config.requiredArgs[index] || `arg${index}`;
      return this.sanitizeValue(arg, argName);
    });
    
    return sanitized;
  }

  /**
   * Sanitizes a single value based on its context.
   */
  sanitizeValue(value, context) {
    if (typeof value !== 'string') {
      return value;
    }
    
    // Remove null bytes and control characters
    let sanitized = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    // Context-specific sanitization
    switch (context) {
      case 'repository-path':
      case 'output-dir':
        // Path sanitization - normalize separators but keep the path structure
        sanitized = sanitized.replace(/['"`;|&$(){}[\]<>\\]/g, '');
        break;
      case 'exclude':
        // Exclude patterns - allow glob patterns but remove dangerous chars
        sanitized = sanitized.replace(/['"`;|&$(){}[\]<>\\]/g, '');
        break;
      case 'model':
        // Model names - alphanumeric and hyphens only
        sanitized = sanitized.replace(/[^a-zA-Z0-9\-\.]/g, '');
        break;
      default:
        // General sanitization
        sanitized = sanitized.replace(/['"`;|&$(){}[\]<>\\]/g, '');
    }
    
    return sanitized;
  }

  /**
   * Applies custom validation rules.
   */
  applyValidationRules(parsed) {
    // Validate model if specified
    if (parsed.options.model) {
      this.validateModel(parsed.options.model);
    }
    
    // Validate output directory
    if (parsed.options['output-dir']) {
      this.validatePath(parsed.options['output-dir'], 'output-dir');
    }
    
    // Validate repository path
    if (parsed.positional[0]) {
      this.validatePath(parsed.positional[0], 'repository-path');
    }
    
    // Validate exclude patterns
    if (parsed.options.exclude) {
      parsed.options.exclude.forEach(pattern => {
        this.validateExcludePattern(pattern);
      });
    }
  }

  /**
   * Validates a model name.
   */
  validateModel(modelName) {
    const validModels = [
      'claude-sonnet-4',
      'claude-opus-4', 
      'claude-sonnet-3.5',
      'claude-haiku-3.5',
      'claude-sonnet-3.7'
    ];
    
    const validApiIdentifiers = [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-5-haiku-latest',
      'claude-3-7-sonnet-20250224'
    ];
    
    if (!validModels.includes(modelName) && !validApiIdentifiers.includes(modelName)) {
      this.errors.push(`Invalid model '${modelName}'. Available: ${validModels.join(', ')}`);
    }
  }

  /**
   * Validates a file system path.
   */
  validatePath(path, context) {
    // Check for dangerous path traversal attempts
    if (this.isDangerousPath(path)) {
      this.errors.push(`Path traversal detected in ${context}: ${path}`);
    }
    
    // Check path length
    if (path.length > this.securityRules.maxLengths.path) {
      this.errors.push(`Path too long in ${context}: ${path.length} chars`);
    }
    
    // Check for suspicious patterns
    if (this.patterns.commandInjection.test(path)) {
      this.errors.push(`Potentially unsafe characters in ${context}: ${path}`);
    }
  }

  /**
   * Determines if a path contains dangerous traversal patterns.
   * Allows safe relative paths like ../sibling-dir but blocks malicious ones.
   */
  isDangerousPath(path) {
    // Normalize the path to check for dangerous patterns
    const normalizedPath = path.replace(/\\/g, '/'); // Convert Windows paths
    
    // Block paths that try to escape to system directories
    const dangerousPatterns = [
      /\.\.[\/\\]\.\.[\/\\]/,  // Multiple levels up (../../)
      /^[\/\\]/,               // Absolute paths starting with / or \
      /^[a-zA-Z]:[\/\\]/,      // Windows absolute paths (C:\)
      /\/etc[\/\\]/,           // Unix system directories
      /\/usr[\/\\]/,
      /\/bin[\/\\]/,
      /\/sbin[\/\\]/,
      /\/var[\/\\]/,
      /\/tmp[\/\\]/,
      /\/root[\/\\]/,
      /\/home[\/\\][^\/\\]+[\/\\]\./,  // Hidden files in home directories
      /\\Windows[\\\/]/i,      // Windows system directories
      /\\System32[\\\/]/i,
      /\\Program Files[\\\/]/i,
      /\.\.[\/\\][a-zA-Z0-9_-]*[\/\\]\./  // Traversal to hidden files
    ];
    
    // Check for dangerous patterns
    for (const pattern of dangerousPatterns) {
      if (pattern.test(normalizedPath)) {
        return true;
      }
    }
    
    // Allow simple sibling directory access (one level up only)
    // Pattern: ../valid-directory-name (no further traversal)
    const safeSiblingPattern = /^\.\.\/[a-zA-Z0-9._-]+([\/\\][a-zA-Z0-9._-]+)*\/?$/;
    if (safeSiblingPattern.test(normalizedPath)) {
      return false; // This is safe
    }
    
    // Block any other .. patterns that weren't explicitly allowed
    if (normalizedPath.includes('..')) {
      return true;
    }
    
    return false; // Path is safe
  }

  /**
   * Validates an exclude pattern.
   */
  validateExcludePattern(pattern) {
    // Allow glob patterns but prevent command injection
    if (this.patterns.commandInjection.test(pattern.replace(/[*?[\]]/g, ''))) {
      this.errors.push(`Potentially unsafe exclude pattern: ${pattern}`);
    }
  }

  /**
   * Performs final security check.
   */
  performSecurityCheck(parsed) {
    // Check for any remaining security issues
    const allValues = [
      ...parsed.positional,
      ...Object.values(parsed.options).flat()
    ].filter(v => typeof v === 'string');
    
    allValues.forEach(value => {
      // Final check for command injection patterns
      if (/[;&|`$()]/.test(value)) {
        this.errors.push(`Security violation detected in value: ${value.substring(0, 50)}...`);
      }
    });
  }

  /**
   * Checks if an option is in the allowed list.
   */
  isOptionAllowed(option) {
    return this.config.allowedOptions.length === 0 || 
           this.config.allowedOptions.includes(option);
  }

  /**
   * Checks if an option requires a value.
   */
  optionRequiresValue(option) {
    const flagOptions = ['verbose', 'help'];
    return !flagOptions.includes(option);
  }

  /**
   * Expands short option to long option.
   */
  expandShortOption(shortOption) {
    const mapping = {
      'e': 'exclude',
      'o': 'output-dir',
      'm': 'model',
      'v': 'verbose',
      'h': 'help'
    };
    
    return mapping[shortOption] || null;
  }

  /**
   * Gets validation errors and warnings.
   */
  getValidationResults() {
    return {
      errors: [...this.errors],
      warnings: [...this.warnings],
      isValid: this.errors.length === 0
    };
  }
}

/**
 * Custom error class for CLI validation failures.
 */
export class CLIValidationError extends Error {
  constructor(message, errors = [], warnings = []) {
    super(message);
    this.name = 'CLIValidationError';
    this.errors = errors;
    this.warnings = warnings;
    this.isSecurityError = errors.some(err => 
      err.includes('Security violation') || 
      err.includes('Path traversal') ||
      err.includes('forbidden pattern')
    );
  }
  
  toString() {
    let result = `${this.message}\n`;
    
    if (this.errors.length > 0) {
      result += `\nErrors:\n${this.errors.map(e => `  - ${e}`).join('\n')}`;
    }
    
    if (this.warnings.length > 0) {
      result += `\nWarnings:\n${this.warnings.map(w => `  - ${w}`).join('\n')}`;
    }
    
    return result;
  }
}