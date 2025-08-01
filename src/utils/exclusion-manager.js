import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Manages file and directory exclusions for repository analysis.
 * Handles default exclusions, user-specified exclusions, and .codeanalyzer/.gitignore files.
 * 
 * @class ExclusionManager
 * @example
 * const exclusionManager = new ExclusionManager('/path/to/repo', ['*.test.js']);
 * const shouldExclude = exclusionManager.shouldExcludeFile('src/test.js');
 */
export class ExclusionManager {
  /**
   * Creates a new ExclusionManager instance.
   * 
   * @param {string} repoPath - Path to the repository
   * @param {string[]} [userExclusions=[]] - User-specified exclusion patterns
   */
  constructor(repoPath, userExclusions = []) {
    this.repoPath = repoPath;
    this.userExclusions = userExclusions;
    this.defaultExclusions = [
      'node_modules/**',
      'dist/**',
      'build/**',
      '.git/**',
      '.next/**',
      '.nuxt/**',
      'coverage/**',
      'out/**',
      'target/**',
      '*.log',
      '*.tmp',
      '*.temp',
      '.DS_Store',
      'Thumbs.db',
      '.vscode/**',
      '.idea/**',
      '*.min.js',
      '*.min.css',
      'bundle.js',
      'bundle.css'
    ];
    this.ignoreFileExclusions = this.loadIgnoreFile();
  }

  loadIgnoreFile() {
    const ignoreFiles = ['.codeanalyzer', '.codeanalyzerignore', '.gitignore'];
    const exclusions = [];

    for (const ignoreFile of ignoreFiles) {
      const ignoreFilePath = join(this.repoPath, ignoreFile);
      if (existsSync(ignoreFilePath)) {
        try {
          const content = readFileSync(ignoreFilePath, 'utf8');
          const lines = content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
          
          exclusions.push(...lines);
          // console.log(`📋 Loaded ${lines.length} exclusions from ${ignoreFile}`);
        } catch (error) {
          // console.warn(`⚠️  Could not read ${ignoreFile}: ${error.message}`);
        }
      }
    }

    return exclusions;
  }

  getAllExclusions() {
    return [
      ...this.defaultExclusions,
      ...this.ignoreFileExclusions,
      ...this.userExclusions
    ];
  }

  getGlobExclusions() {
    // Return exclusions in glob-compatible format (with leading !)
    return this.getAllExclusions().map(pattern => `!${pattern}`);
  }

  shouldExcludeFile(filePath) {
    const allExclusions = this.getAllExclusions();
    
    for (const exclusion of allExclusions) {
      if (this.matchesPattern(filePath, exclusion)) {
        return true;
      }
    }
    
    return false;
  }

  shouldExcludePath(path) {
    // Normalize path separators for consistent matching
    const normalizedPath = path.replace(/\\/g, '/');
    return this.shouldExcludeFile(normalizedPath);
  }

  matchesPattern(filePath, pattern) {
    // Convert glob patterns to regex for basic matching
    // This is a simplified implementation - could be enhanced with a proper glob library
    
    // Handle common patterns
    if (pattern.endsWith('/**')) {
      const dirPattern = pattern.slice(0, -3);
      return filePath.startsWith(dirPattern + '/') || filePath === dirPattern;
    }
    
    if (pattern.startsWith('**/')) {
      const filePattern = pattern.slice(3);
      return filePath.includes('/' + filePattern) || filePath.endsWith('/' + filePattern) || filePath === filePattern;
    }
    
    if (pattern.includes('**')) {
      // Handle patterns like "test/**" or "**/test/**"
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*'); // Single * matches within path segment
      
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(filePath);
    }
    
    if (pattern.includes('*')) {
      // Simple wildcard matching
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(filePath);
    }
    
    // Exact match or starts with for directory patterns
    return filePath === pattern || 
           filePath.startsWith(pattern + '/') || 
           filePath.includes('/' + pattern + '/') ||
           filePath.endsWith('/' + pattern);
  }

  filterFiles(files) {
    return files.filter(file => !this.shouldExcludeFile(file));
  }

  logExclusions() {
    const allExclusions = this.getAllExclusions();
    console.log(`🚫 Using ${allExclusions.length} exclusion patterns:`);
    
    if (this.defaultExclusions.length > 0) {
      console.log(`   - ${this.defaultExclusions.length} default exclusions`);
    }
    
    if (this.ignoreFileExclusions.length > 0) {
      console.log(`   - ${this.ignoreFileExclusions.length} from ignore files`);
    }
    
    if (this.userExclusions.length > 0) {
      console.log(`   - ${this.userExclusions.length} user-specified: ${this.userExclusions.join(', ')}`);
    }
  }

  // Helper method to get a summary of exclusions for reports
  getExclusionSummary() {
    const allExclusions = this.getAllExclusions();
    return {
      total: allExclusions.length,
      default: this.defaultExclusions.length,
      ignoreFile: this.ignoreFileExclusions.length,
      user: this.userExclusions.length,
      patterns: allExclusions
    };
  }
}