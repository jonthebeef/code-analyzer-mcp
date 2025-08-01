import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SecureEnvManager } from './secure-env-manager.js';

/**
 * Environment variable loader with native Node.js .env file support.
 * Supports both modern Node.js native .env loading and fallback parsing for older versions.
 * 
 * @class EnvLoader
 * @example
 * import { EnvLoader } from './src/utils/env-loader.js';
 * 
 * // Load .env file
 * EnvLoader.load();
 * 
 * // Load custom .env file
 * EnvLoader.load('.env.local');
 * 
 * // Get environment variable with validation
 * const apiKey = EnvLoader.get('ANTHROPIC_API_KEY', { required: true });
 */
export class EnvLoader {
  /**
   * Loads environment variables from a .env file.
   * Uses native Node.js support when available, falls back to manual parsing.
   * 
   * @param {string} [envFile='.env'] - Path to the .env file
   * @param {Object} [options={}] - Loading options
   * @param {boolean} [options.override=false] - Whether to override existing env vars
   * @param {boolean} [options.silent=false] - Whether to suppress warnings
   * @returns {boolean} True if file was loaded successfully
   */
  static load(envFile = '.env', options = {}) {
    const { override = false, silent = false } = options;
    
    try {
      // Check if file exists
      if (!existsSync(envFile)) {
        if (!silent) {
          console.log(`📁 No ${envFile} file found, using environment variables only`);
        }
        return false;
      }

      // Try native Node.js support first (Node.js 20.12.0+)
      if (this.hasNativeSupport()) {
        return this.loadNative(envFile, { override, silent });
      }

      // Fall back to manual parsing for older Node.js versions
      return this.loadManual(envFile, { override, silent });

    } catch (error) {
      if (!silent) {
        console.warn(`⚠️  Could not load ${envFile}:`, error.message);
      }
      return false;
    }
  }

  /**
   * Checks if Node.js has native .env file support.
   * @private
   * @returns {boolean} True if native support is available
   */
  static hasNativeSupport() {
    // Check for process.loadEnvFile (Node.js 20.12.0+)
    return typeof process.loadEnvFile === 'function';
  }

  /**
   * Loads .env file using native Node.js support.
   * @private
   * @param {string} envFile - Path to the .env file
   * @param {Object} options - Loading options
   * @returns {boolean} True if loaded successfully
   */
  static loadNative(envFile, { override, silent }) {
    try {
      let loadedCount = 0;
      let validationErrors = [];

      if (override) {
        // With override, we need to manually validate since process.loadEnvFile doesn't provide validation hooks
        const content = readFileSync(envFile, 'utf8');
        const parsed = this.parseEnvContent(content);
        
        Object.keys(parsed).forEach(key => {
          try {
            const validatedValue = SecureEnvManager.validateEnv(key, parsed[key], { required: false });
            process.env[key] = validatedValue;
            loadedCount++;
          } catch (validationError) {
            validationErrors.push(`${key}: ${validationError.message}`);
            if (!silent) {
              console.warn(`⚠️  Validation failed for ${key}:`, validationError.message);
            }
          }
        });
      } else {
        // Without override, parse manually and only set unset variables with validation
        const content = readFileSync(envFile, 'utf8');
        const parsed = this.parseEnvContent(content);
        
        Object.keys(parsed).forEach(key => {
          if (process.env[key] === undefined) {
            try {
              const validatedValue = SecureEnvManager.validateEnv(key, parsed[key], { required: false });
              process.env[key] = validatedValue;
              loadedCount++;
            } catch (validationError) {
              validationErrors.push(`${key}: ${validationError.message}`);
              if (!silent) {
                console.warn(`⚠️  Validation failed for ${key}:`, validationError.message);
              }
            }
          }
        });
      }

      if (validationErrors.length > 0 && !silent) {
        console.warn(`⚠️  ${validationErrors.length} environment variables failed validation`);
      }

      if (!silent) {
        console.log(`✅ Loaded ${loadedCount} environment variables from ${envFile} (native)`);
      }
      return true;
    } catch (error) {
      if (!silent) {
        console.warn(`⚠️  Native .env loading failed for ${envFile}:`, error.message);
      }
      return false;
    }
  }

  /**
   * Manually parses and loads .env file for older Node.js versions.
   * @private
   * @param {string} envFile - Path to the .env file
   * @param {Object} options - Loading options
   * @returns {boolean} True if loaded successfully
   */
  static loadManual(envFile, { override, silent }) {
    try {
      const content = readFileSync(envFile, 'utf8');
      const parsed = this.parseEnvContent(content);
      
      let loadedCount = 0;
      let validationErrors = [];
      
      Object.keys(parsed).forEach(key => {
        // Only set if not already in environment (unless override is true)
        if (override || process.env[key] === undefined) {
          try {
            // Use SecureEnvManager to validate and sanitize the value
            const validatedValue = SecureEnvManager.validateEnv(key, parsed[key], { required: false });
            process.env[key] = validatedValue;
            loadedCount++;
          } catch (validationError) {
            validationErrors.push(`${key}: ${validationError.message}`);
            if (!silent) {
              console.warn(`⚠️  Validation failed for ${key}:`, validationError.message);
            }
          }
        }
      });

      if (validationErrors.length > 0 && !silent) {
        console.warn(`⚠️  ${validationErrors.length} environment variables failed validation`);
      }

      if (!silent) {
        console.log(`✅ Loaded ${loadedCount} environment variables from ${envFile} (manual)`);
      }
      return true;
    } catch (error) {
      if (!silent) {
        console.warn(`⚠️  Manual .env parsing failed for ${envFile}:`, error.message);
      }
      return false;
    }
  }

  /**
   * Parses .env file content into key-value pairs.
   * @private
   * @param {string} content - The .env file content
   * @returns {Object} Parsed environment variables
   */
  static parseEnvContent(content) {
    const result = {};
    const lines = content.split('\n');

    for (let line of lines) {
      // Remove comments and trim whitespace
      line = line.split('#')[0].trim();
      
      // Skip empty lines
      if (!line) continue;

      // Parse key=value pairs
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;

      const [, key, value] = match;
      
      // Handle quoted values and perform basic sanitization
      let parsedValue = value.trim();
      if ((parsedValue.startsWith('"') && parsedValue.endsWith('"')) ||
          (parsedValue.startsWith("'") && parsedValue.endsWith("'"))) {
        parsedValue = parsedValue.slice(1, -1);
      }

      // Apply basic sanitization using SecureEnvManager (but don't validate here as that's done in loadManual)
      try {
        const sanitizedValue = SecureEnvManager.sanitizeValue(key, parsedValue);
        result[key] = sanitizedValue;
      } catch (error) {
        // If sanitization fails, store the original value and let validation handle it in loadManual
        result[key] = parsedValue;
      }
    }

    return result;
  }

  /**
   * Gets an environment variable with secure validation.
   * 
   * @param {string} key - Environment variable name
   * @param {Object} [options={}] - Validation options
   * @param {boolean} [options.required=false] - Whether the variable is required
   * @param {*} [options.defaultValue] - Default value if not found
   * @param {Function} [options.validator] - Custom validation function
   * @param {number} [options.minLength] - Minimum required length
   * @param {number} [options.maxLength] - Maximum allowed length
   * @param {RegExp} [options.pattern] - Pattern the value must match
   * @returns {string|*} The environment variable value
   * @throws {Error} If required variable is missing or validation fails
   */
  static get(key, options = {}) {
    const { required = false, defaultValue, validator, minLength, maxLength, pattern } = options;
    const value = process.env[key];

    // Use SecureEnvManager for validation
    try {
      const validatedValue = SecureEnvManager.validateEnv(key, value, {
        required,
        minLength,
        maxLength,
        pattern
      });

      // Apply custom validation if provided
      if (validator && typeof validator === 'function') {
        const validationResult = validator(validatedValue);
        if (validationResult !== true) {
          throw new Error(`Environment variable ${key} validation failed: ${validationResult}`);
        }
      }

      return validatedValue || defaultValue;
    } catch (error) {
      if (!required && (value === undefined || value === '')) {
        return defaultValue;
      }
      throw error;
    }
  }

  /**
   * Validates that all required environment variables are present using secure validation.
   * 
   * @param {string[]} requiredVars - Array of required environment variable names
   * @param {Object} [validationRules={}] - Validation rules per variable
   * @param {Object} [options={}] - Validation options
   * @param {boolean} [options.throwOnMissing=true] - Whether to throw error on missing vars
   * @returns {Object} Validation result with missing variables and status
   */
  static validateRequired(requiredVars, validationRules = {}, options = {}) {
    const { throwOnMissing = true } = options;

    try {
      const result = SecureEnvManager.validateRequired(process.env, requiredVars, validationRules);
      return {
        valid: result.valid,
        missing: result.missing,
        present: Object.keys(result.validated),
        total: requiredVars.length,
        validated: result.validated
      };
    } catch (error) {
      if (throwOnMissing) {
        throw error;
      }
      
      // Parse error to extract missing variables
      const missing = requiredVars.filter(key => !process.env[key] || process.env[key].trim() === '');
      const present = requiredVars.filter(key => process.env[key] && process.env[key].trim() !== '');
      
      return {
        valid: false,
        missing,
        present,
        total: requiredVars.length,
        error: error.message
      };
    }
  }

  /**
   * Creates a secure summary of loaded environment variables for logging.
   * Never exposes actual values, only metadata about their presence and type.
   * 
   * @param {string[]} [keys] - Specific keys to check, or all if not provided
   * @returns {Object} Summary of environment variable status
   */
  static getSecureSummary(keys = null) {
    const keysToCheck = keys || Object.keys(process.env).filter(key => 
      SecureEnvManager.isSensitive(key) || 
      key.includes('API') || 
      key.includes('URL') ||
      key.includes('CONFIG')
    );

    return SecureEnvManager.createSecureSummary(process.env, keysToCheck);
  }

  /**
   * Logs configuration safely without exposing sensitive values.
   * 
   * @param {Object} config - Configuration object to log
   * @param {Object} [options={}] - Logging options
   * @param {boolean} [options.showSensitive=false] - Whether to show masked sensitive values
   */
  static logConfiguration(config, options = {}) {
    const { showSensitive = false } = options;
    
    console.log('📋 Environment Configuration:');
    
    Object.entries(config).forEach(([key, value]) => {
      const isSensitive = SecureEnvManager.isSensitive(key);
      
      let displayValue;
      if (isSensitive) {
        displayValue = showSensitive 
          ? SecureEnvManager.maskSensitive(value)
          : '[HIDDEN]';
      } else {
        displayValue = value;
      }
      
      const status = value ? '✅' : '❌';
      console.log(`   ${status} ${key}: ${displayValue}`);
    });
  }
}