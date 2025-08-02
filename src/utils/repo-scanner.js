import { readFileSync, statSync } from 'fs';
import { glob } from 'glob';
import { join, extname } from 'path';
import { PathValidator } from './path-validator.js';

/**
 * Repository scanner for analyzing repository structure and metadata.
 * Scans repositories to provide comprehensive information about file counts, languages, frameworks, and structure.
 */
export class RepoScanner {
  
  /**
   * Default file patterns to analyze
   */
  static DEFAULT_PATTERNS = [
    '**/*.js',
    '**/*.ts',
    '**/*.jsx',
    '**/*.tsx',
    '**/*.json',
    '**/*.md',
    '**/package.json',
    '**/tsconfig.json',
    '**/*.config.js',
    '**/*.config.ts'
  ];

  /**
   * Default exclusion patterns
   */
  static DEFAULT_EXCLUSIONS = [
    'node_modules/**',
    'dist/**',
    'build/**',
    'coverage/**',
    '.git/**',
    '**/*.min.js',
    '**/*.bundle.js',
    '**/vendor/**',
    '**/third_party/**'
  ];

  /**
   * File size limits for different categories
   */
  static SIZE_LIMITS = {
    small: 10 * 1024,      // 10KB
    medium: 50 * 1024,     // 50KB  
    large: 100 * 1024,     // 100KB
    huge: 500 * 1024       // 500KB
  };

  /**
   * Scan repository and provide comprehensive analysis
   * @param {string} repoPath - Path to repository
   * @param {Object} options - Scan options
   * @returns {Promise<Object>} Repository scan results
   */
  static async scanRepository(repoPath, options = {}) {
    const {
      patterns = this.DEFAULT_PATTERNS,
      exclusions = this.DEFAULT_EXCLUSIONS,
      maxFiles = 1000,
      includeContent = false
    } = options;

    // Validate repository path
    const validatedPath = PathValidator.validateRepositoryPath(repoPath);
    
    // Find all matching files
    const files = await this.findFiles(validatedPath, patterns, exclusions, maxFiles);
    
    // Analyze files
    const fileAnalysis = await this.analyzeFiles(files, includeContent);
    
    // Generate repository statistics
    const repoStats = this.generateRepositoryStats(fileAnalysis);
    
    // Generate insights and recommendations
    const insights = this.generateInsights(fileAnalysis);
    
    return {
      repositoryPath: validatedPath,
      scanTimestamp: new Date().toISOString(),
      summary: {
        totalFiles: files.length,
        totalSize: fileAnalysis.totalSize,
        averageFileSize: fileAnalysis.averageSize
      },
      files: fileAnalysis.files,
      statistics: repoStats,
      insights,
      frameworks: this.detectFrameworks(fileAnalysis),
      languages: this.detectLanguages(fileAnalysis)
    };
  }

  /**
   * Quick scan for basic repository information
   * @param {string} repoPath - Path to repository
   * @returns {Promise<Object>} Quick scan results
   */
  static async quickScan(repoPath) {
    const validatedPath = PathValidator.validateRepositoryPath(repoPath);
    
    // Find files without reading content
    const files = await this.findFiles(validatedPath, this.DEFAULT_PATTERNS, this.DEFAULT_EXCLUSIONS, 200);
    
    let totalSize = 0;
    let fileCount = 0;
    const sizeBuckets = { small: 0, medium: 0, large: 0, huge: 0 };
    const extensions = new Map();
    
    for (const file of files) {
      try {
        const fullPath = join(validatedPath, file);
        const stats = statSync(fullPath);
        const size = stats.size;
        const ext = extname(file).toLowerCase();
        
        totalSize += size;
        fileCount++;
        
        // Track extensions
        extensions.set(ext, (extensions.get(ext) || 0) + 1);
        
        // Categorize by size
        if (size <= this.SIZE_LIMITS.small) sizeBuckets.small++;
        else if (size <= this.SIZE_LIMITS.medium) sizeBuckets.medium++;
        else if (size <= this.SIZE_LIMITS.large) sizeBuckets.large++;
        else sizeBuckets.huge++;
        
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }
    
    return {
      fileCount,
      totalSize,
      averageFileSize: fileCount > 0 ? totalSize / fileCount : 0,
      sizeBuckets,
      extensions: Object.fromEntries(extensions),
      isLargeRepository: fileCount > 100 || totalSize > 5 * 1024 * 1024 // 5MB
    };
  }

  /**
   * Find files in repository matching patterns
   * @param {string} repoPath - Repository path
   * @param {Array} patterns - File patterns to match
   * @param {Array} exclusions - Exclusion patterns
   * @param {number} maxFiles - Maximum files to return
   * @returns {Promise<Array>} Array of file paths
   * @private
   */
  static async findFiles(repoPath, patterns, exclusions, maxFiles) {
    const allFiles = new Set();
    
    for (const pattern of patterns) {
      try {
        const files = await glob(pattern, {
          cwd: repoPath,
          ignore: exclusions,
          nodir: true
        });
        
        files.forEach(file => allFiles.add(file));
        
        if (allFiles.size >= maxFiles) break;
      } catch (error) {
        console.warn(`Warning: Failed to process pattern ${pattern}: ${error.message}`);
      }
    }
    
    return Array.from(allFiles).slice(0, maxFiles);
  }

  /**
   * Analyze individual files for size, content, and metadata
   * @param {Array} files - Array of file paths
   * @param {boolean} includeContent - Whether to read file content
   * @returns {Promise<Object>} File analysis results
   * @private
   */
  static async analyzeFiles(files, includeContent = false) {
    const fileAnalysis = [];
    let totalSize = 0;
    const extensions = new Map();
    const sizeCategories = { small: 0, medium: 0, large: 0, huge: 0 };
    
    for (const filePath of files) {
      try {
        const stats = statSync(filePath);
        const size = stats.size;
        const ext = extname(filePath).toLowerCase();
        
        // Read content if requested and file is not too large
        let content = null;
        let lineCount = 0;
        if (includeContent && size < this.SIZE_LIMITS.huge) {
          try {
            content = readFileSync(filePath, 'utf8');
            lineCount = content.split('\n').length;
          } catch (error) {
            // Skip files that can't be read as text
          }
        }
        
        const fileInfo = {
          path: filePath,
          size,
          extension: ext,
          lineCount,
          sizeCategory: this.categorizeSizeBySize(size),
          isLarge: size > this.SIZE_LIMITS.large,
          content: includeContent ? content : null,
          lastModified: stats.mtime
        };
        
        fileAnalysis.push(fileInfo);
        
        totalSize += size;
        
        // Track extensions
        extensions.set(ext, (extensions.get(ext) || 0) + 1);
        
        // Track size categories
        sizeCategories[fileInfo.sizeCategory]++;
        
      } catch (error) {
        console.warn(`Warning: Failed to analyze file ${filePath}: ${error.message}`);
      }
    }
    
    return {
      files: fileAnalysis,
      totalSize,
      averageSize: files.length > 0 ? totalSize / files.length : 0,
      extensions: Object.fromEntries(extensions),
      sizeCategories
    };
  }

  /**
   * Detect frameworks used in the repository
   * @param {Object} fileAnalysis - File analysis results
   * @returns {Object} Detected frameworks
   * @private
   */
  static detectFrameworks(fileAnalysis) {
    const frameworks = {
      frontend: [],
      backend: [],
      testing: [],
      build: []
    };
    
    const files = fileAnalysis.files;
    const extensions = fileAnalysis.extensions;
    
    // Check for package.json to detect Node.js dependencies
    const packageJsonFiles = files.filter(f => f.path.endsWith('package.json'));
    
    // React/Next.js indicators
    if (extensions['.jsx'] || extensions['.tsx'] || 
        files.some(f => f.path.includes('package.json'))) {
      if (files.some(f => f.path.includes('next.config'))) {
        frameworks.frontend.push('Next.js');
      } else if (extensions['.jsx'] || extensions['.tsx']) {
        frameworks.frontend.push('React');
      }
    }
    
    // Vue.js
    if (extensions['.vue']) frameworks.frontend.push('Vue.js');
    
    // Angular
    if (files.some(f => f.path.includes('angular.json')) || 
        extensions['.component.ts']) {
      frameworks.frontend.push('Angular');
    }
    
    // Backend frameworks
    if (files.some(f => f.path.includes('express'))) frameworks.backend.push('Express.js');
    if (files.some(f => f.path.includes('fastify'))) frameworks.backend.push('Fastify');
    if (extensions['.py']) {
      if (files.some(f => f.path.includes('django'))) frameworks.backend.push('Django');
      if (files.some(f => f.path.includes('flask'))) frameworks.backend.push('Flask');
      if (files.some(f => f.path.includes('fastapi'))) frameworks.backend.push('FastAPI');
    }
    
    // Testing frameworks
    if (files.some(f => f.path.includes('jest'))) frameworks.testing.push('Jest');
    if (files.some(f => f.path.includes('cypress'))) frameworks.testing.push('Cypress');
    if (files.some(f => f.path.includes('playwright'))) frameworks.testing.push('Playwright');
    
    // Build tools
    if (files.some(f => f.path.includes('webpack'))) frameworks.build.push('Webpack');
    if (files.some(f => f.path.includes('vite'))) frameworks.build.push('Vite');
    if (files.some(f => f.path.includes('rollup'))) frameworks.build.push('Rollup');
    
    return frameworks;
  }
  
  /**
   * Detect programming languages used in the repository
   * @param {Object} fileAnalysis - File analysis results
   * @returns {Object} Language statistics
   * @private
   */
  static detectLanguages(fileAnalysis) {
    const languageMap = {
      '.js': 'JavaScript',
      '.jsx': 'JavaScript (React)',
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript (React)',
      '.py': 'Python',
      '.java': 'Java',
      '.cpp': 'C++',
      '.c': 'C',
      '.cs': 'C#',
      '.go': 'Go',
      '.rs': 'Rust',
      '.php': 'PHP',
      '.rb': 'Ruby',
      '.swift': 'Swift',
      '.kt': 'Kotlin',
      '.scala': 'Scala',
      '.html': 'HTML',
      '.css': 'CSS',
      '.scss': 'SCSS',
      '.sass': 'Sass',
      '.less': 'Less',
      '.vue': 'Vue.js',
      '.sql': 'SQL',
      '.sh': 'Shell',
      '.yaml': 'YAML',
      '.yml': 'YAML',
      '.json': 'JSON',
      '.xml': 'XML',
      '.md': 'Markdown'
    };
    
    const languages = {};
    let totalFiles = 0;
    
    for (const [ext, count] of Object.entries(fileAnalysis.extensions)) {
      const language = languageMap[ext];
      if (language) {
        languages[language] = (languages[language] || 0) + count;
        totalFiles += count;
      }
    }
    
    // Calculate percentages
    const languageStats = Object.entries(languages)
      .map(([lang, count]) => ({
        language: lang,
        fileCount: count,
        percentage: totalFiles > 0 ? (count / totalFiles * 100).toFixed(1) : 0
      }))
      .sort((a, b) => b.fileCount - a.fileCount);
    
    return {
      primary: languageStats[0]?.language || 'Unknown',
      distribution: languageStats,
      totalFiles
    };
  }

  /**
   * Generate repository statistics
   * @param {Object} fileAnalysis - File analysis results
   * @returns {Object} Repository statistics
   * @private
   */
  static generateRepositoryStats(fileAnalysis) {
    const files = fileAnalysis.files;
    
    // Sort files by size (largest first)
    const largestFiles = [...files]
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
      .map(f => ({ path: f.path, size: f.size, lineCount: f.lineCount }));
    
    // Recent files (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentFiles = files.filter(f => f.lastModified > thirtyDaysAgo);
    
    // Extension breakdown
    const extensionStats = Object.entries(fileAnalysis.extensions)
      .map(([ext, count]) => ({ extension: ext, count }))
      .sort((a, b) => b.count - a.count);
    
    // Calculate total lines of code
    const totalLines = files.reduce((sum, f) => sum + (f.lineCount || 0), 0);
    
    return {
      fileCount: files.length,
      totalSize: fileAnalysis.totalSize,
      averageFileSize: fileAnalysis.averageSize,
      totalLines,
      averageLines: files.length > 0 ? totalLines / files.length : 0,
      sizeDistribution: fileAnalysis.sizeCategories,
      largestFiles,
      recentActivity: {
        filesModifiedLast30Days: recentFiles.length,
        percentage: files.length > 0 ? (recentFiles.length / files.length) * 100 : 0
      },
      extensionBreakdown: extensionStats
    };
  }

  /**
   * Generate insights based on analysis
   * @param {Object} fileAnalysis - File analysis results
   * @returns {Array} Array of insights
   * @private
   */
  static generateInsights(fileAnalysis) {
    const insights = [];
    
    // Large file insights
    const largeFiles = fileAnalysis.files.filter(f => f.size > this.SIZE_LIMITS.large);
    if (largeFiles.length > 0) {
      insights.push({
        type: 'fileSize',
        severity: 'info',
        message: `${largeFiles.length} large files detected (>100KB). These may need special attention during analysis.`,
        files: largeFiles.slice(0, 3).map(f => f.path)
      });
    }
    
    // Repository scale insight
    if (fileAnalysis.files.length > 100) {
      insights.push({
        type: 'scale',
        severity: 'info',
        message: `Large repository: ${fileAnalysis.files.length} files. This is a substantial codebase.`
      });
    } else if (fileAnalysis.files.length < 10) {
      insights.push({
        type: 'scale',
        severity: 'info',
        message: `Small repository: ${fileAnalysis.files.length} files. This is a compact codebase.`
      });
    }
    
    // Binary/non-text files
    const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz'];
    const binaryFiles = fileAnalysis.files.filter(f => binaryExtensions.includes(f.extension));
    if (binaryFiles.length > 0) {
      insights.push({
        type: 'binaryFiles',
        severity: 'info',
        message: `${binaryFiles.length} binary files detected. These will be excluded from text analysis.`
      });
    }
    
    return insights;
  }


  /**
   * Categorize file size
   * @param {number} size - File size in bytes
   * @returns {string} Size category
   * @private
   */
  static categorizeSizeBySize(size) {
    if (size <= this.SIZE_LIMITS.small) return 'small';
    if (size <= this.SIZE_LIMITS.medium) return 'medium';
    if (size <= this.SIZE_LIMITS.large) return 'large';
    return 'huge';
  }

  /**
   * Format scan results for CLI display
   * @param {Object} scanResults - Results from scanRepository
   * @returns {string} Formatted display text
   */
  static formatScanResults(scanResults) {
    const { summary, insights, languages, frameworks } = scanResults;
    
    let output = `Repository Scan Results:\n`;
    output += `   Files: ${summary.totalFiles}\n`;
    output += `   Size: ${this.formatBytes(summary.totalSize)}\n`;
    output += `   Primary Language: ${languages.primary}\n`;
    
    if (frameworks.frontend.length > 0) {
      output += `   Frontend: ${frameworks.frontend.join(', ')}\n`;
    }
    
    if (frameworks.backend.length > 0) {
      output += `   Backend: ${frameworks.backend.join(', ')}\n`;
    }
    
    if (insights.length > 0) {
      output += `\nInsights:\n`;
      insights.forEach(i => output += `   - ${i.message}\n`);
    }
    
    return output;
  }

  /**
   * Format bytes to human readable format
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size
   * @private
   */
  static formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}