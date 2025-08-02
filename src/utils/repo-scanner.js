import { readFileSync, statSync } from 'fs';
import { glob } from 'glob';
import { join, extname } from 'path';
import { CostCalculator } from './cost-calculator.js';
import { PathValidator } from './path-validator.js';

/**
 * Repository scanner for pre-analysis cost estimation and repository analysis.
 * Scans repositories to provide cost estimates and size analysis before running full analysis.
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
      includeContent = false,
      model = 'claude-sonnet-4-20250514'
    } = options;

    // Validate repository path
    const validatedPath = PathValidator.validateRepositoryPath(repoPath);
    
    // Find all matching files
    const files = await this.findFiles(validatedPath, patterns, exclusions, maxFiles);
    
    // Analyze files
    const fileAnalysis = await this.analyzeFiles(files, includeContent);
    
    // Calculate cost estimates
    const costEstimate = this.calculateCostEstimates(fileAnalysis, model);
    
    // Generate repository statistics
    const repoStats = this.generateRepositoryStats(fileAnalysis);
    
    // Generate warnings and recommendations
    const warnings = this.generateWarnings(fileAnalysis, costEstimate);
    
    return {
      repositoryPath: validatedPath,
      scanTimestamp: new Date().toISOString(),
      summary: {
        totalFiles: files.length,
        totalSize: fileAnalysis.totalSize,
        averageFileSize: fileAnalysis.averageSize,
        estimatedTokens: costEstimate.totalTokens,
        estimatedCost: costEstimate.totalCost
      },
      files: fileAnalysis.files,
      statistics: repoStats,
      costEstimate,
      warnings,
      recommendations: this.generateRecommendations(fileAnalysis, costEstimate),
      modelInfo: {
        model,
        modelName: CostCalculator.PRICING[model]?.name || model,
        limits: CostCalculator.getTokenLimits(model)
      }
    };
  }

  /**
   * Quick scan for basic repository information and cost estimate
   * @param {string} repoPath - Path to repository
   * @param {string} model - Model to use for cost calculation
   * @returns {Promise<Object>} Quick scan results
   */
  static async quickScan(repoPath, model = 'claude-sonnet-4-20250514') {
    const validatedPath = PathValidator.validateRepositoryPath(repoPath);
    
    // Find files without reading content
    const files = await this.findFiles(validatedPath, this.DEFAULT_PATTERNS, this.DEFAULT_EXCLUSIONS, 200);
    
    let totalSize = 0;
    let fileCount = 0;
    const sizeBuckets = { small: 0, medium: 0, large: 0, huge: 0 };
    
    for (const file of files) {
      try {
        const fullPath = join(validatedPath, file);
        const stats = statSync(fullPath);
        const size = stats.size;
        
        totalSize += size;
        fileCount++;
        
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
    
    const estimatedTokens = CostCalculator.estimateTokens('x'.repeat(totalSize));
    const costEstimate = CostCalculator.calculateCost(estimatedTokens, Math.ceil(estimatedTokens * 0.1), model);
    
    return {
      fileCount,
      totalSize,
      averageFileSize: fileCount > 0 ? totalSize / fileCount : 0,
      sizeBuckets,
      estimatedTokens,
      estimatedCost: costEstimate.totalCost,
      isLargeRepository: fileCount > 100 || totalSize > 5 * 1024 * 1024, // 5MB
      exceedsRecommendedLimits: estimatedTokens > 200000, // 200k tokens
      modelInfo: {
        model,
        modelName: CostCalculator.PRICING[model]?.name || model
      }
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
   * Analyze individual files for size, content, and token estimates
   * @param {Array} files - Array of file paths
   * @param {boolean} includeContent - Whether to read file content
   * @returns {Promise<Object>} File analysis results
   * @private
   */
  static async analyzeFiles(files, includeContent = false) {
    const fileAnalysis = [];
    let totalSize = 0;
    let totalTokens = 0;
    const extensions = new Map();
    const sizeCategories = { small: 0, medium: 0, large: 0, huge: 0 };
    
    for (const filePath of files) {
      try {
        const stats = statSync(filePath);
        const size = stats.size;
        const ext = extname(filePath).toLowerCase();
        
        // Read content if requested and file is not too large
        let content = null;
        let tokens = 0;
        if (includeContent && size < this.SIZE_LIMITS.huge) {
          try {
            content = readFileSync(filePath, 'utf8');
            tokens = CostCalculator.estimateTokens(content);
          } catch (error) {
            // Skip files that can't be read as text
          }
        } else {
          // Estimate tokens based on file size
          tokens = CostCalculator.estimateTokens('x'.repeat(size));
        }
        
        const fileInfo = {
          path: filePath,
          size,
          extension: ext,
          estimatedTokens: tokens,
          sizeCategory: this.categorizeSizeBySize(size),
          isLarge: size > this.SIZE_LIMITS.large,
          needsTruncation: tokens > 6000, // Rough truncation threshold
          content: includeContent ? content : null
        };
        
        fileAnalysis.push(fileInfo);
        
        totalSize += size;
        totalTokens += tokens;
        
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
      totalTokens,
      averageSize: files.length > 0 ? totalSize / files.length : 0,
      averageTokens: files.length > 0 ? totalTokens / files.length : 0,
      extensions: Object.fromEntries(extensions),
      sizeCategories
    };
  }

  /**
   * Calculate cost estimates for different scenarios
   * @param {Object} fileAnalysis - File analysis results
   * @param {string} model - Model to use
   * @returns {Object} Cost estimates
   * @private
   */
  static calculateCostEstimates(fileAnalysis, model) {
    const totalTokens = fileAnalysis.totalTokens;
    const outputTokens = Math.ceil(totalTokens * 0.1); // Estimate 10% output
    
    const baseCost = CostCalculator.calculateCost(totalTokens, outputTokens, model);
    
    // Calculate costs for different models
    const modelComparisons = [];
    for (const [modelId, pricing] of Object.entries(CostCalculator.PRICING)) {
      const cost = CostCalculator.calculateCost(totalTokens, outputTokens, modelId);
      modelComparisons.push({
        model: modelId,
        modelName: pricing.name,
        estimatedCost: cost.totalCost,
        inputCost: cost.inputCost,
        outputCost: cost.outputCost,
        suitable: totalTokens <= pricing.contextWindow
      });
    }
    
    modelComparisons.sort((a, b) => a.estimatedCost - b.estimatedCost);
    
    return {
      totalTokens,
      outputTokens,
      totalCost: baseCost.totalCost,
      inputCost: baseCost.inputCost,
      outputCost: baseCost.outputCost,
      costPerFile: fileAnalysis.files.length > 0 ? baseCost.totalCost / fileAnalysis.files.length : 0,
      costPerKB: fileAnalysis.totalSize > 0 ? baseCost.totalCost / (fileAnalysis.totalSize / 1024) : 0,
      modelComparisons,
      cheapestModel: modelComparisons.find(m => m.suitable),
      currentModel: {
        model,
        modelName: CostCalculator.PRICING[model]?.name || model,
        cost: baseCost.totalCost
      }
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
      .map(f => ({ path: f.path, size: f.size, tokens: f.estimatedTokens }));
    
    // Files that need truncation
    const truncationCandidates = files.filter(f => f.needsTruncation);
    
    // Extension breakdown
    const extensionStats = Object.entries(fileAnalysis.extensions)
      .map(([ext, count]) => ({ extension: ext, count }))
      .sort((a, b) => b.count - a.count);
    
    return {
      fileCount: files.length,
      totalSize: fileAnalysis.totalSize,
      averageFileSize: fileAnalysis.averageSize,
      sizeDistribution: fileAnalysis.sizeCategories,
      largestFiles,
      truncationCandidates: {
        count: truncationCandidates.length,
        percentage: files.length > 0 ? (truncationCandidates.length / files.length) * 100 : 0,
        files: truncationCandidates.slice(0, 5).map(f => ({ path: f.path, tokens: f.estimatedTokens }))
      },
      extensionBreakdown: extensionStats
    };
  }

  /**
   * Generate warnings based on analysis
   * @param {Object} fileAnalysis - File analysis results
   * @param {Object} costEstimate - Cost estimates
   * @returns {Array} Array of warnings
   * @private
   */
  static generateWarnings(fileAnalysis, costEstimate) {
    const warnings = [];
    
    // High cost warning
    if (costEstimate.totalCost > 10.00) {
      warnings.push({
        type: 'cost',
        severity: 'high',
        message: `High estimated cost: $${costEstimate.totalCost.toFixed(2)}. Consider using a cheaper model or reducing scope.`
      });
    } else if (costEstimate.totalCost > 5.00) {
      warnings.push({
        type: 'cost',
        severity: 'medium',
        message: `Moderate cost: $${costEstimate.totalCost.toFixed(2)}. Review cost estimate before proceeding.`
      });
    }
    
    // Large file warnings
    const largeFiles = fileAnalysis.files.filter(f => f.size > this.SIZE_LIMITS.large);
    if (largeFiles.length > 0) {
      warnings.push({
        type: 'fileSize',
        severity: 'medium',
        message: `${largeFiles.length} large files detected. Analysis may require truncation.`,
        files: largeFiles.slice(0, 3).map(f => f.path)
      });
    }
    
    // Many files warning
    if (fileAnalysis.files.length > 100) {
      warnings.push({
        type: 'fileCount',
        severity: 'medium',
        message: `Large repository: ${fileAnalysis.files.length} files. Consider using exclusion patterns.`
      });
    }
    
    // Token limit warning
    const tokenLimits = CostCalculator.getTokenLimits(costEstimate.currentModel.model);
    if (costEstimate.totalTokens > tokenLimits.safeInputLimit) {
      warnings.push({
        type: 'tokenLimit',
        severity: 'high',
        message: `Token count (${costEstimate.totalTokens.toLocaleString()}) exceeds safe limits for ${costEstimate.currentModel.modelName}.`
      });
    }
    
    return warnings;
  }

  /**
   * Generate recommendations based on analysis
   * @param {Object} fileAnalysis - File analysis results
   * @param {Object} costEstimate - Cost estimates
   * @returns {Array} Array of recommendations
   * @private
   */
  static generateRecommendations(fileAnalysis, costEstimate) {
    const recommendations = [];
    
    // Model recommendation
    const cheapest = costEstimate.modelComparisons.find(m => m.suitable);
    if (cheapest && cheapest.model !== costEstimate.currentModel.model) {
      const savings = costEstimate.currentModel.cost - cheapest.estimatedCost;
      if (savings > 1.00) {
        recommendations.push({
          type: 'model',
          message: `Consider using ${cheapest.modelName} to save $${savings.toFixed(2)} (${((savings/costEstimate.currentModel.cost)*100).toFixed(1)}%)`
        });
      }
    }
    
    // File exclusion recommendation
    const truncationCandidates = fileAnalysis.files.filter(f => f.needsTruncation);
    if (truncationCandidates.length > fileAnalysis.files.length * 0.3) {
      recommendations.push({
        type: 'exclusion',
        message: `${truncationCandidates.length} files may be truncated. Consider adding exclusion patterns for large generated files.`
      });
    }
    
    // Performance recommendation
    if (fileAnalysis.files.length > 50) {
      recommendations.push({
        type: 'performance',
        message: 'Large repository detected. Analysis may take several minutes. Consider running during off-hours.'
      });
    }
    
    return recommendations;
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
    const { summary, warnings, recommendations, modelInfo } = scanResults;
    
    let output = `📊 Repository Scan Results:\n`;
    output += `   Files: ${summary.totalFiles}\n`;
    output += `   Size: ${this.formatBytes(summary.totalSize)}\n`;
    output += `   Estimated Cost: $${summary.estimatedCost.toFixed(4)} (${modelInfo.modelName})\n`;
    
    if (warnings.length > 0) {
      output += `\n⚠️ Warnings:\n`;
      warnings.forEach(w => output += `   - ${w.message}\n`);
    }
    
    if (recommendations.length > 0) {
      output += `\n💡 Recommendations:\n`;
      recommendations.forEach(r => output += `   - ${r.message}\n`);
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