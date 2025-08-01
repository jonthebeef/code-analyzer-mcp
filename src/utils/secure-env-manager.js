/**
 * Secure environment variable management system.
 * Provides validation, sanitization, and secure logging for environment variables.
 * 
 * @class SecureEnvManager
 * @example
 * import { SecureEnvManager } from './secure-env-manager.js';
 * 
 * // Validate required environment variable
 * const apiKey = SecureEnvManager.validateEnv('ANTHROPIC_API_KEY', 'your-api-key');
 * 
 * // Check if a key is sensitive
 * const isSensitive = SecureEnvManager.isSensitive('API_KEY'); // true
 * 
 * // Mask sensitive value for logging
 * const masked = SecureEnvManager.maskSensitive('secret123'); // 'sec...123'
 */
export class SecureEnvManager {
  /**
   * List of sensitive key patterns that should never be logged in plain text.
   * Uses private static field for security.
   * @private
   */
  static #sensitivePatterns = [
    'API_KEY',
    'SECRET',
    'PASSWORD', 
    'TOKEN',
    'PRIVATE_KEY',
    'CLIENT_SECRET',
    'AUTH',
    'CREDENTIAL',
    'PASS',
    'PWD'
  ];

  /**
   * Validates and sanitizes an environment variable.
   * 
   * @param {string} key - Environment variable name
   * @param {string} value - Environment variable value
   * @param {Object} [options={}] - Validation options
   * @param {boolean} [options.required=true] - Whether the variable is required
   * @param {number} [options.minLength] - Minimum required length
   * @param {number} [options.maxLength] - Maximum allowed length
   * @param {RegExp} [options.pattern] - Pattern the value must match
   * @returns {string} Sanitized value
   * @throws {Error} If validation fails
   */
  static validateEnv(key, value, options = {}) {
    const { required = true, minLength, maxLength, pattern } = options;

    // Check if required
    if (required && (!value || value.trim() === '')) {
      throw new Error(`Required environment variable missing: ${key}`);
    }

    // Return early if value is empty and not required
    if (!value || value.trim() === '') {
      return '';
    }

    // Sanitize the value
    const sanitized = this.sanitizeValue(key, value);

    // Length validation
    if (minLength && sanitized.length < minLength) {
      throw new Error(`Environment variable ${key} must be at least ${minLength} characters`);
    }

    if (maxLength && sanitized.length > maxLength) {
      throw new Error(`Environment variable ${key} must not exceed ${maxLength} characters`);
    }

    // Pattern validation
    if (pattern && !pattern.test(sanitized)) {
      throw new Error(`Environment variable ${key} does not match required pattern`);
    }

    return sanitized;
  }

  /**
   * Sanitizes an environment variable value.
   * 
   * @param {string} key - Environment variable name
   * @param {string} value - Environment variable value
   * @returns {string} Sanitized value
   */
  static sanitizeValue(key, value) {
    if (!value || typeof value !== 'string') {
      return '';
    }

    // Basic sanitization
    let sanitized = value.trim();

    // Remove null bytes and control characters (except newlines for multi-line values)
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // For URL-like values, ensure they're properly formatted
    if (key.toLowerCase().includes('url') || key.toLowerCase().includes('endpoint')) {
      try {
        new URL(sanitized);
      } catch (error) {
        throw new Error(`Environment variable ${key} must be a valid URL`);
      }
    }

    return sanitized;
  }

  /**
   * Checks if an environment variable key is considered sensitive.
   * 
   * @param {string} key - Environment variable name
   * @returns {boolean} True if the key is sensitive
   */
  static isSensitive(key) {
    if (!key || typeof key !== 'string') {
      return false;
    }

    const upperKey = key.toUpperCase();
    return this.#sensitivePatterns.some(pattern => upperKey.includes(pattern));
  }

  /**
   * Masks a sensitive value for safe logging.
   * 
   * @param {string} value - Value to mask
   * @param {Object} [options={}] - Masking options
   * @param {number} [options.visibleStart=3] - Number of characters to show at start
   * @param {number} [options.visibleEnd=3] - Number of characters to show at end
   * @param {string} [options.maskChar='*'] - Character to use for masking
   * @returns {string} Masked value
   */
  static maskSensitive(value, options = {}) {
    if (!value || typeof value !== 'string') {
      return '[EMPTY]';
    }

    const { visibleStart = 3, visibleEnd = 3, maskChar = '*' } = options;

    // For very short values, mask completely
    if (value.length <= visibleStart + visibleEnd) {
      return maskChar.repeat(Math.min(value.length, 8));
    }

    const start = value.substring(0, visibleStart);
    const end = value.substring(value.length - visibleEnd);
    const maskLength = value.length - visibleStart - visibleEnd;
    
    return `${start}${maskChar.repeat(maskLength)}${end}`;
  }

  /**
   * Creates a secure summary of environment variables for logging.
   * Never logs actual values, only metadata.
   * 
   * @param {Object} envVars - Environment variables object
   * @param {string[]} [keysToCheck] - Specific keys to check
   * @returns {Object} Secure summary
   */
  static createSecureSummary(envVars, keysToCheck = null) {
    const keys = keysToCheck || Object.keys(envVars);
    const summary = {
      total: keys.length,
      present: 0,
      missing: 0,
      sensitive: 0,
      variables: []
    };

    keys.forEach(key => {
      const value = envVars[key];
      const hasValue = value !== undefined && value !== null && value !== '';
      const sensitive = this.isSensitive(key);

      if (hasValue) {
        summary.present++;
      } else {
        summary.missing++;
      }

      if (sensitive) {
        summary.sensitive++;
      }

      summary.variables.push({
        key,
        present: hasValue,
        sensitive,
        length: hasValue ? value.length : 0,
        type: this.getValueType(value)
      });
    });

    return summary;
  }

  /**
   * Gets the type of an environment variable value.
   * 
   * @private
   * @param {*} value - Value to check
   * @returns {string} Value type
   */
  static getValueType(value) {
    if (value === undefined || value === null || value === '') {
      return 'empty';
    }

    if (typeof value !== 'string') {
      return typeof value;
    }

    // Check common patterns
    if (/^\d+$/.test(value)) {
      return 'numeric';
    }

    if (/^(true|false)$/i.test(value)) {
      return 'boolean';
    }

    if (/^https?:\/\//.test(value)) {
      return 'url';
    }

    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) {
      return 'email';
    }

    return 'string';
  }

  /**
   * Validates a collection of required environment variables.
   * 
   * @param {Object} envVars - Environment variables object
   * @param {string[]} requiredKeys - Array of required variable names
   * @param {Object} [validationRules={}] - Validation rules per key
   * @returns {Object} Validation result
   * @throws {Error} If any required variables are missing or invalid
   */
  static validateRequired(envVars, requiredKeys, validationRules = {}) {
    const results = {
      valid: true,
      missing: [],
      invalid: [],
      validated: {}
    };

    for (const key of requiredKeys) {
      const value = envVars[key];
      const rules = validationRules[key] || {};

      try {
        const validatedValue = this.validateEnv(key, value, rules);
        results.validated[key] = validatedValue;
      } catch (error) {
        results.valid = false;
        if (error.message.includes('missing')) {
          results.missing.push(key);
        } else {
          results.invalid.push({ key, error: error.message });
        }
      }
    }

    if (!results.valid) {
      const errorParts = [];
      
      if (results.missing.length > 0) {
        errorParts.push(`Missing variables: ${results.missing.join(', ')}`);
      }
      
      if (results.invalid.length > 0) {
        const invalidMessages = results.invalid.map(({ key, error }) => `${key}: ${error}`);
        errorParts.push(`Invalid variables: ${invalidMessages.join('; ')}`);
      }

      throw new Error(`Environment variable validation failed: ${errorParts.join('. ')}`);
    }

    return results;
  }

  /**
   * Creates a safe configuration object with validated environment variables.
   * 
   * @param {Object} envVars - Environment variables object
   * @param {Object} configSchema - Configuration schema with validation rules
   * @returns {Object} Validated configuration object
   */
  static createSafeConfig(envVars, configSchema) {
    const config = {};
    const requiredKeys = [];
    const validationRules = {};

    // Parse schema
    Object.entries(configSchema).forEach(([configKey, schema]) => {
      const { envKey, required, ...rules } = schema;
      const envVarKey = envKey || configKey.toUpperCase();

      if (required) {
        requiredKeys.push(envVarKey);
      }

      validationRules[envVarKey] = { required, ...rules };
    });

    // Validate required variables
    const validationResult = this.validateRequired(envVars, requiredKeys, validationRules);

    // Build config object
    Object.entries(configSchema).forEach(([configKey, schema]) => {
      const { envKey, defaultValue, transform } = schema;
      const envVarKey = envKey || configKey.toUpperCase();
      
      let value = validationResult.validated[envVarKey] || envVars[envVarKey] || defaultValue;

      // Apply transformation if provided
      if (transform && typeof transform === 'function') {
        value = transform(value);
      }

      config[configKey] = value;
    });

    return config;
  }
}