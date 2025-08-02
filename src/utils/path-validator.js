import { resolve, join, basename, isAbsolute } from 'path';
import { existsSync, statSync, mkdirSync } from 'fs';

/**
 * Secure path validation utility to prevent path traversal attacks.
 * Provides validation, sanitization, and secure path operations.
 * 
 * @class PathValidator
 * @example
 * import { PathValidator } from './path-validator.js';
 * 
 * // Validate output directory path
 * const safePath = PathValidator.validateOutputPath('./reports');
 * 
 * // Check if path is safe relative path
 * const isSafe = PathValidator.isSafeRelativePath('../dangerous');
 */
export class PathValidator {
  /**
   * List of dangerous path components that indicate potential traversal attacks.
   * @private
   */
  static #dangerousComponents = [
    '..',
    '~',
    '%2e%2e',  // URL encoded ..
    '%2e',     // URL encoded .
    '%2f',     // URL encoded /
    '%5c',     // URL encoded \
  ];

  /**
   * Validates and sanitizes an output directory path for CLI usage.
   * Ensures the path is safe for file operations and doesn't escape project boundaries.
   * 
   * @param {string} outputPath - User-provided output directory path
   * @param {string} [basePath=process.cwd()] - Base directory to validate against
   * @returns {string} Validated and normalized absolute path
   * @throws {Error} If the path is invalid or potentially dangerous
   */
  static validateOutputPath(outputPath, basePath = process.cwd()) {
    if (!outputPath || typeof outputPath !== 'string') {
      throw new Error('Output path must be a non-empty string');
    }

    // Sanitize the input path
    const sanitizedPath = this.sanitizePath(outputPath);
    
    // Check for dangerous patterns
    this.checkForDangerousPatterns(sanitizedPath);
    
    // Resolve paths to absolute form for comparison
    const resolvedBase = resolve(basePath);
    const candidatePath = this.resolveSafePath(sanitizedPath, resolvedBase);
    
    // Validate the resolved path is within safe boundaries
    this.validatePathBoundaries(candidatePath, resolvedBase);
    
    // Additional security checks
    this.performSecurityChecks(candidatePath);
    
    return candidatePath;
  }

  /**
   * Sanitizes a path string by removing dangerous characters and normalizing.
   * 
   * @param {string} path - Path to sanitize
   * @returns {string} Sanitized path
   * @private
   */
  static sanitizePath(path) {
    if (!path || typeof path !== 'string') {
      return '';
    }

    // Trim whitespace
    let sanitized = path.trim();

    // Check for null bytes and control characters before removing them
    if (/[\x00-\x1F\x7F]/.test(sanitized)) {
      throw new Error('Path contains invalid control characters or null bytes');
    }

    // Normalize path separators to forward slashes for cross-platform compatibility
    sanitized = sanitized.replace(/\\/g, '/');

    // Remove multiple consecutive slashes
    sanitized = sanitized.replace(/\/+/g, '/');

    // Remove trailing slashes (except for root)
    if (sanitized.length > 1 && sanitized.endsWith('/')) {
      sanitized = sanitized.slice(0, -1);
    }

    // URL decode to catch encoded traversal attempts
    try {
      const decoded = decodeURIComponent(sanitized);
      // If decoding changed the string, use the decoded version for further checks
      if (decoded !== sanitized) {
        sanitized = decoded;
      }
    } catch (error) {
      // If decoding fails, use original (it's likely already clean)
    }

    return sanitized;
  }

  /**
   * Checks for dangerous patterns that indicate path traversal attempts.
   * 
   * @param {string} path - Path to check
   * @throws {Error} If dangerous patterns are found
   * @private
   */
  static checkForDangerousPatterns(path) {
    // Check for obvious traversal attempts
    if (path.includes('..')) {
      throw new Error('Path contains directory traversal sequences (..)');
    }

    // Check for absolute paths that could escape project boundaries
    if (isAbsolute(path)) {
      // Allow absolute paths only within reasonable boundaries
      const normalizedPath = path.toLowerCase();
      
      // Block dangerous system paths
      const dangerousPaths = [
        '/etc',
        '/bin',
        '/usr',
        '/var',
        '/tmp',
        '/root',
        '/home',
        'c:\\windows',
        'c:\\program files',
        'c:\\users',
      ];

      for (const dangerousPath of dangerousPaths) {
        if (normalizedPath.startsWith(dangerousPath)) {
          throw new Error(`Path attempts to access restricted system directory: ${dangerousPath}`);
        }
      }
    }

    // Check for encoded traversal attempts
    const pathComponents = path.split('/').filter(component => component.length > 0);
    for (const component of pathComponents) {
      const lowerComponent = component.toLowerCase();
      // Exclude empty string from dangerous components check since we filtered them out
      if (component !== '' && this.#dangerousComponents.includes(lowerComponent)) {
        throw new Error(`Path contains dangerous component: ${component}`);
      }
    }

    // Check for very long paths that might cause issues
    if (path.length > 260) { // Windows MAX_PATH limit
      throw new Error('Path exceeds maximum allowed length (260 characters)');
    }

    // Check for suspicious patterns
    if (/\$\{.*\}/.test(path) || /\%\{.*\}/.test(path)) {
      throw new Error('Path contains template injection patterns');
    }
  }

  /**
   * Safely resolves a path against a base directory.
   * 
   * @param {string} inputPath - Path to resolve
   * @param {string} basePath - Base directory
   * @returns {string} Resolved absolute path
   * @private
   */
  static resolveSafePath(inputPath, basePath) {
    try {
      // If it's an absolute path, validate it directly
      if (isAbsolute(inputPath)) {
        return resolve(inputPath);
      }

      // For relative paths, join with base path
      const joinedPath = join(basePath, inputPath);
      return resolve(joinedPath);
    } catch (error) {
      throw new Error(`Failed to resolve path: ${error.message}`);
    }
  }

  /**
   * Validates that the resolved path stays within safe boundaries.
   * 
   * @param {string} resolvedPath - Resolved absolute path to validate
   * @param {string} basePath - Base directory that should contain the path
   * @throws {Error} If path escapes boundaries
   * @private
   */
  static validatePathBoundaries(resolvedPath, basePath) {
    // Normalize paths for comparison (handle Windows/Unix differences)
    const normalizedResolved = resolvedPath.replace(/\\/g, '/');
    const normalizedBase = basePath.replace(/\\/g, '/');

    // For relative paths, ensure they stay within the base directory or its subdirectories
    if (!isAbsolute(resolvedPath.replace(basePath, ''))) {
      if (!normalizedResolved.startsWith(normalizedBase + '/') && 
          normalizedResolved !== normalizedBase) {
        throw new Error('Path attempts to escape project directory boundaries');
      }
    }

    // Additional check: ensure the path doesn't go above the base directory
    const relativePath = resolvedPath.replace(basePath, '');
    if (relativePath.startsWith('..')) {
      throw new Error('Resolved path escapes base directory');
    }
  }

  /**
   * Performs additional security checks on the validated path.
   * 
   * @param {string} path - Path to check
   * @throws {Error} If security concerns are found
   * @private
   */
  static performSecurityChecks(path) {
    // Check if path points to a sensitive file or directory
    const sensitivePatterns = [
      'password',
      'secret',
      'key',
      'token',
      'credential',
      '.env',
      '.ssh',
      '.git',
      'node_modules',
    ];

    const pathBasename = basename(path).toLowerCase();
    for (const pattern of sensitivePatterns) {
      if (pathBasename.includes(pattern)) {
        console.warn(`Warning: Output path contains sensitive pattern: ${pattern}`);
      }
    }

    // Validate directory name doesn't contain suspicious characters
    const dirName = basename(path);
    if (!/^[a-zA-Z0-9._-]+$/.test(dirName)) {
      throw new Error('Directory name contains invalid characters. Use only letters, numbers, dots, underscores, and hyphens.');
    }
  }

  /**
   * Checks if a path is a safe relative path (doesn't traverse upward).
   * 
   * @param {string} path - Path to check
   * @returns {boolean} True if the path is safe
   */
  static isSafeRelativePath(path) {
    try {
      this.sanitizePath(path);
      this.checkForDangerousPatterns(path);
      return !path.includes('..') && !isAbsolute(path);
    } catch (error) {
      return false;
    }
  }

  /**
   * Creates a secure output directory, ensuring parent directories exist.
   * 
   * @param {string} outputPath - Validated output directory path
   * @returns {string} The created directory path
   * @throws {Error} If directory creation fails
   */
  static createSecureOutputDir(outputPath) {
    try {
      // Additional validation
      const validatedPath = this.validateOutputPath(outputPath);
      
      // Create directory if it doesn't exist
      if (!existsSync(validatedPath)) {
        mkdirSync(validatedPath, { recursive: true, mode: 0o755 });
      } else {
        // Verify it's actually a directory
        const stats = statSync(validatedPath);
        if (!stats.isDirectory()) {
          throw new Error(`Output path exists but is not a directory: ${validatedPath}`);
        }
      }

      return validatedPath;
    } catch (error) {
      throw new Error(`Failed to create secure output directory: ${error.message}`);
    }
  }

  /**
   * Validates a repository path for analysis operations.
   * Less restrictive than output path validation, but still prevents path traversal attacks.
   * 
   * @param {string} repoPath - Repository path to validate
   * @returns {string} Validated and normalized absolute path
   * @throws {Error} If the path is invalid or potentially dangerous
   */
  static validateRepositoryPath(repoPath) {
    if (!repoPath || typeof repoPath !== 'string') {
      throw new Error('Repository path must be a non-empty string');
    }

    // Sanitize the input path
    const sanitizedPath = this.sanitizePath(repoPath);
    
    // Check for dangerous patterns (less restrictive than output validation)
    this.checkForRepositoryDangerousPatterns(sanitizedPath);
    
    // Resolve to absolute path
    const resolvedPath = resolve(sanitizedPath);
    
    // Verify the path exists and is a directory
    if (!existsSync(resolvedPath)) {
      throw new Error(`Repository path does not exist: ${resolvedPath}`);
    }
    
    const stats = statSync(resolvedPath);
    if (!stats.isDirectory()) {
      throw new Error(`Repository path is not a directory: ${resolvedPath}`);
    }
    
    return resolvedPath;
  }

  /**
   * Checks for dangerous patterns specific to repository path validation.
   * More permissive than output path validation but still secure.
   * 
   * @param {string} path - Path to check
   * @throws {Error} If dangerous patterns are found
   * @private
   */
  static checkForRepositoryDangerousPatterns(path) {
    // Check for null bytes and control characters
    if (/[\x00-\x1F\x7F]/.test(path)) {
      throw new Error('Repository path contains invalid control characters or null bytes');
    }

    // Check for very long paths
    if (path.length > 260) {
      throw new Error('Repository path exceeds maximum allowed length (260 characters)');
    }

    // Check for template injection patterns
    if (/\$\{.*\}/.test(path) || /\%\{.*\}/.test(path)) {
      throw new Error('Repository path contains template injection patterns');
    }

    // Block obvious system directories that shouldn't be analyzed
    if (isAbsolute(path)) {
      const normalizedPath = path.toLowerCase();
      const restrictedPaths = [
        '/etc',
        '/bin', 
        '/usr/bin',
        '/sbin',
        '/var/log',
        '/root',
        'c:\\windows\\system32',
        'c:\\program files',
      ];

      for (const restrictedPath of restrictedPaths) {
        if (normalizedPath.startsWith(restrictedPath)) {
          throw new Error(`Repository path points to restricted system directory: ${restrictedPath}`);
        }
      }
    }
  }

  /**
   * Validates a file path within an already validated directory.
   * 
   * @param {string} filePath - File path to validate
   * @param {string} validatedDir - Already validated directory path
   * @returns {string} Validated file path
   * @throws {Error} If file path is invalid
   */
  static validateFilePathInDir(filePath, validatedDir) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('File path must be a non-empty string');
    }

    // Extract just the filename from the path to prevent directory traversal
    const fileName = basename(filePath);
    
    // Sanitize file name
    const sanitizedFile = this.sanitizePath(fileName);
    
    // Check for dangerous file patterns
    if (sanitizedFile.includes('..') || sanitizedFile.startsWith('.')) {
      throw new Error('Invalid file name - contains dangerous patterns');
    }

    // Join with validated directory
    const fullPath = join(validatedDir, sanitizedFile);
    
    // Ensure the file stays within the directory
    const normalizedFull = resolve(fullPath).replace(/\\/g, '/');
    const normalizedDir = resolve(validatedDir).replace(/\\/g, '/');
    
    if (!normalizedFull.startsWith(normalizedDir + '/') && normalizedFull !== normalizedDir) {
      throw new Error('File path escapes directory boundaries');
    }

    return fullPath;
  }
}