import { CostCalculator } from './cost-calculator.js';

/**
 * Generates comprehensive meta.md reports with cost analysis, performance metrics,
 * and insights for code analysis operations.
 */
export class MetaReportGenerator {
  
  /**
   * Generate a complete meta.md report from analysis metrics
   * @param {AnalysisMetrics} metrics - Analysis metrics instance
   * @param {Object} options - Report generation options
   * @returns {string} Formatted markdown report
   */
  static generateReport(metrics, options = {}) {
    const {
      includeDetailedBreakdown = true,
      includePerformanceDetails = true,
      includeRecommendations = true,
      includeFileDetails = false,
      model = 'claude-sonnet-4-20250514'
    } = options;

    // Ensure analysis is completed
    if (!metrics.endTime) {
      metrics.completeAnalysis();
    }

    const data = metrics.toObject();
    const sections = [];

    // Header
    sections.push(this.generateHeader(data, model));
    
    // Cost Summary
    sections.push(this.generateCostSummary(data, model));
    
    // Agent Breakdown
    if (includeDetailedBreakdown) {
      sections.push(this.generateAgentBreakdown(data));
    }
    
    // Repository Statistics
    sections.push(this.generateRepositoryStats(data));
    
    // Performance Metrics
    if (includePerformanceDetails) {
      sections.push(this.generatePerformanceMetrics(data));
    }
    
    // Cost Efficiency Analysis
    sections.push(this.generateCostEfficiency(data));
    
    // Content Analysis
    sections.push(this.generateContentAnalysis(data));
    
    // File Details
    if (includeFileDetails && data.repositoryStats.largestFiles.length > 0) {
      sections.push(this.generateFileDetails(data));
    }
    
    // Warnings & Recommendations
    if (includeRecommendations) {
      sections.push(this.generateWarningsAndRecommendations(data));
    }
    
    // Model Comparison
    sections.push(this.generateModelComparison(data, model));
    
    // Footer
    sections.push(this.generateFooter(data));

    return sections.join('\n\n');
  }

  /**
   * Generate report header with basic information
   * @param {Object} data - Metrics data
   * @param {string} model - Model used
   * @returns {string} Header section
   * @private
   */
  static generateHeader(data, model) {
    const modelName = CostCalculator.PRICING[model]?.name || model;
    const duration = this.formatDuration(data.performanceMetrics.totalDuration);
    
    return `# Analysis Metadata Report

**Repository Analysis completed at ${data.timestamp}**

**Analysis Duration:** ${duration}  
**Model Used:** ${modelName}  
**Total Cost:** $${data.globalMetrics.totalCost.toFixed(4)}`;
  }

  /**
   * Generate cost summary section
   * @param {Object} data - Metrics data
   * @param {string} model - Model used
   * @returns {string} Cost summary section
   * @private
   */
  static generateCostSummary(data, model) {
    const modelName = CostCalculator.PRICING[model]?.name || model;
    const inputCost = CostCalculator.calculateCost(data.globalMetrics.totalInputTokens, 0, model).totalCost;
    const outputCost = CostCalculator.calculateCost(0, data.globalMetrics.totalOutputTokens, model).totalCost;

    return `## Cost Summary

| Metric | Value |
|--------|-------|
| **Total Cost** | **$${data.globalMetrics.totalCost.toFixed(4)}** |
| Input Tokens | ${data.globalMetrics.totalInputTokens.toLocaleString()} ($${inputCost.toFixed(4)}) |
| Output Tokens | ${data.globalMetrics.totalOutputTokens.toLocaleString()} ($${outputCost.toFixed(4)}) |
| Total Tokens | ${(data.globalMetrics.totalInputTokens + data.globalMetrics.totalOutputTokens).toLocaleString()} |
| Model | ${modelName} |
| API Calls | ${data.globalMetrics.totalApiCalls} |`;
  }

  /**
   * Generate agent breakdown table
   * @param {Object} data - Metrics data
   * @returns {string} Agent breakdown section
   * @private
   */
  static generateAgentBreakdown(data) {
    let table = `## Agent Performance Breakdown

| Agent | Input Tokens | Output Tokens | Cost | Total Time | Work Time | Files | Truncated | Avg Response |
|-------|-------------|---------------|------|------------|-----------|-------|-----------|--------------|`;

    for (const agent of data.agentSummaries) {
      const duration = this.formatDuration(agent.duration);
      const workDuration = this.formatDuration(agent.workDuration);
      const avgResponse = agent.avgResponseTime > 0 ? `${(agent.avgResponseTime/1000).toFixed(1)}s` : 'N/A';
      
      table += `
| ${agent.name} | ${agent.inputTokens.toLocaleString()} | ${agent.outputTokens.toLocaleString()} | $${agent.cost.toFixed(4)} | ${duration} | ${workDuration} | ${agent.filesProcessed} | ${agent.contentTruncated} | ${avgResponse} |`;
    }

    return table;
  }

  /**
   * Generate repository statistics section
   * @param {Object} data - Metrics data
   * @returns {string} Repository stats section
   * @private
   */
  static generateRepositoryStats(data) {
    const truncationRate = data.globalMetrics.filesProcessed > 0 
      ? ((data.globalMetrics.contentTruncated / data.globalMetrics.filesProcessed) * 100).toFixed(1)
      : 0;
    
    const avgFileSize = data.repositoryStats.averageFileSize > 0 
      ? this.formatBytes(data.repositoryStats.averageFileSize)
      : 'N/A';

    return `## Repository Statistics

| Metric | Value |
|--------|-------|
| **Files Processed** | **${data.globalMetrics.filesProcessed}** |
| Total Repository Size | ${this.formatBytes(data.repositoryStats.totalSize)} |
| Average File Size | ${avgFileSize} |
| Content Truncated | ${data.globalMetrics.contentTruncated} files (${truncationRate}%) |
| Largest File | ${this.getLargestFileName(data)} |`;
  }

  /**
   * Generate performance metrics section
   * @param {Object} data - Metrics data
   * @returns {string} Performance section
   * @private
   */
  static generatePerformanceMetrics(data) {
    const tokensPerSecond = data.efficiencyMetrics.tokensPerSecond.toFixed(0);
    const filesPerMinute = data.efficiencyMetrics.filesPerMinute.toFixed(1);
    const avgResponseTime = data.performanceMetrics.averageResponseTime > 0 
      ? `${(data.performanceMetrics.averageResponseTime/1000).toFixed(1)}s`
      : 'N/A';

    return `## Performance Metrics

| Metric | Value |
|--------|-------|
| **Total Analysis Time** | **${this.formatDuration(data.performanceMetrics.totalDuration)}** |
| Average API Response Time | ${avgResponseTime} |
| Processing Rate | ${tokensPerSecond} tokens/sec |
| File Processing Rate | ${filesPerMinute} files/min |
| Average File Processing Time | ${this.formatDuration(data.efficiencyMetrics.averageFileProcessingTime)} |`;
  }

  /**
   * Generate cost efficiency analysis
   * @param {Object} data - Metrics data
   * @returns {string} Cost efficiency section
   * @private
   */
  static generateCostEfficiency(data) {
    const costPerFile = data.efficiencyMetrics.costPerFile.toFixed(4);
    const costPerKB = data.efficiencyMetrics.costPerKB.toFixed(6);
    const costPerToken = data.efficiencyMetrics.costPerToken.toFixed(8);
    
    // Determine most/least expensive agents
    const sortedAgents = [...data.agentSummaries].sort((a, b) => b.cost - a.cost);
    const mostExpensive = sortedAgents[0];
    const leastExpensive = sortedAgents[sortedAgents.length - 1];

    return `## Cost Efficiency Analysis

| Metric | Value |
|--------|-------|
| **Cost per File** | **$${costPerFile}** |
| Cost per KB | $${costPerKB} |
| Cost per Token | $${costPerToken} |
| Most Expensive Agent | ${mostExpensive?.name} ($${mostExpensive?.cost.toFixed(4)}) |
| Most Efficient Agent | ${leastExpensive?.name} ($${leastExpensive?.costPerFile.toFixed(4)}/file) |`;
  }

  /**
   * Generate content analysis section
   * @param {Object} data - Metrics data
   * @returns {string} Content analysis section
   * @private
   */
  static generateContentAnalysis(data) {
    // This would be enhanced with actual pattern detection results
    // For now, we'll show basic content statistics
    
    return `## Content Analysis

| Metric | Value |
|--------|-------|
| Files with Truncation | ${data.globalMetrics.contentTruncated} |
| Processing Success Rate | ${this.calculateSuccessRate(data)}% |
| Average Tokens per File | ${this.calculateAvgTokensPerFile(data)} |
| Token Utilization | ${this.calculateTokenUtilization(data)}% |

*Note: Detailed pattern analysis (security patterns, API endpoints, etc.) would be populated by individual agents*`;
  }

  /**
   * Generate file details section for largest files
   * @param {Object} data - Metrics data
   * @returns {string} File details section
   * @private
   */
  static generateFileDetails(data) {
    let section = `## Largest Files Analysis

| File | Size | Est. Tokens | Truncated |
|------|------|-------------|-----------|`;

    const largestFiles = data.repositoryStats.largestFiles.slice(0, 10);
    for (const file of largestFiles) {
      const isTruncated = data.repositoryStats.truncatedFiles.some(tf => tf.fileName === file.fileName);
      const estimatedTokens = CostCalculator.estimateTokens('x'.repeat(file.size)); // Rough estimate
      
      section += `
| ${file.fileName} | ${this.formatBytes(file.size)} | ${estimatedTokens.toLocaleString()} | ${isTruncated ? '⚠️ Yes' : '✅ No'} |`;
    }

    return section;
  }

  /**
   * Generate warnings and recommendations section
   * @param {Object} data - Metrics data
   * @returns {string} Warnings section
   * @private
   */
  static generateWarningsAndRecommendations(data) {
    const items = data.warningsAndRecommendations;
    
    if (items.length === 0) {
      return `## Analysis Quality

✅ **No warnings detected** - Analysis completed successfully without issues.`;
    }

    let section = `## Warnings & Recommendations\n`;
    
    const warnings = items.filter(item => item.type === 'warning');
    const recommendations = items.filter(item => item.type === 'recommendation');

    if (warnings.length > 0) {
      section += `\n### ⚠️ Warnings\n`;
      for (const warning of warnings) {
        section += `- ${warning.message}\n`;
      }
    }

    if (recommendations.length > 0) {
      section += `\n### 💡 Recommendations\n`;
      for (const recommendation of recommendations) {
        section += `- ${recommendation.message}\n`;
      }
    }

    return section;
  }

  /**
   * Generate model comparison section
   * @param {Object} data - Metrics data
   * @param {string} currentModel - Currently used model
   * @returns {string} Model comparison section
   * @private
   */
  static generateModelComparison(data, currentModel) {
    const totalTokens = data.globalMetrics.totalInputTokens + data.globalMetrics.totalOutputTokens;
    const recommendation = CostCalculator.recommendModel(data.globalMetrics.totalInputTokens);
    
    let section = `## Model Comparison

**Current Model:** ${CostCalculator.PRICING[currentModel]?.name || currentModel}

| Model | Estimated Cost | Savings | Recommendation |
|-------|---------------|---------|----------------|`;

    for (const model of recommendation.all) {
      if (!model.suitable) continue;
      
      const savings = CostCalculator.calculateSavings(
        data.globalMetrics.totalInputTokens,
        data.globalMetrics.totalOutputTokens,
        currentModel,
        model.model
      );
      
      const savingsText = savings.absoluteSavings > 0 
        ? `💰 $${savings.absoluteSavings.toFixed(4)} (${savings.percentageSavings.toFixed(1)}%)`
        : savings.absoluteSavings < 0 
        ? `❌ +$${Math.abs(savings.absoluteSavings).toFixed(4)}`
        : '➖ Same';
      
      const isRecommended = model.model === recommendation.recommended?.model ? '⭐' : '';
      const isFastest = model.model === recommendation.fastest?.model ? '⚡' : '';
      const isCheapest = model.model === recommendation.cheapest?.model ? '💲' : '';
      
      section += `
| ${model.modelName} ${isRecommended}${isFastest}${isCheapest} | $${model.estimatedCost.toFixed(4)} | ${savingsText} | ${this.getModelRecommendation(model, currentModel)} |`;
    }

    section += `\n\n**Legend:** ⭐ Recommended | ⚡ Fastest | 💲 Cheapest`;

    return section;
  }

  /**
   * Generate footer with metadata
   * @param {Object} data - Metrics data
   * @returns {string} Footer section
   * @private
   */
  static generateFooter(data) {
    return `---

**Report Metadata:**
- **Generated:** ${data.timestamp}
- **Analysis Duration:** ${this.formatDuration(data.performanceMetrics.totalDuration)}
- **Total Agents:** ${data.agentSummaries.length}
- **Total API Calls:** ${data.globalMetrics.totalApiCalls}
- **Code Analyzer Version:** v1.0.0

*This report was automatically generated by Code Analyzer's cost monitoring system.*`;
  }

  // Utility methods

  /**
   * Format duration in milliseconds to human readable format
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration
   * @private
   */
  static formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
    if (ms < 3600000) return `${Math.floor(ms/60000)}m ${Math.floor((ms%60000)/1000)}s`;
    return `${Math.floor(ms/3600000)}h ${Math.floor((ms%3600000)/60000)}m`;
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

  /**
   * Get the largest file name from repository stats
   * @param {Object} data - Metrics data
   * @returns {string} Largest file info
   * @private
   */
  static getLargestFileName(data) {
    if (data.repositoryStats.largestFiles.length === 0) return 'N/A';
    const largest = data.repositoryStats.largestFiles[0];
    return `${largest.fileName} (${this.formatBytes(largest.size)})`;
  }

  /**
   * Calculate processing success rate
   * @param {Object} data - Metrics data
   * @returns {number} Success rate percentage
   * @private
   */
  static calculateSuccessRate(data) {
    if (data.globalMetrics.filesProcessed === 0) return 100;
    const successfulFiles = data.globalMetrics.filesProcessed - data.globalMetrics.contentTruncated;
    return ((successfulFiles / data.globalMetrics.filesProcessed) * 100).toFixed(1);
  }

  /**
   * Calculate average tokens per file
   * @param {Object} data - Metrics data
   * @returns {number} Average tokens per file
   * @private
   */
  static calculateAvgTokensPerFile(data) {
    if (data.globalMetrics.filesProcessed === 0) return 0;
    return Math.round(data.globalMetrics.totalInputTokens / data.globalMetrics.filesProcessed);
  }

  /**
   * Calculate token utilization percentage
   * @param {Object} data - Metrics data
   * @returns {number} Token utilization percentage
   * @private
   */
  static calculateTokenUtilization(data) {
    // This is a rough estimate - could be enhanced with actual model context window usage
    const estimatedCapacity = data.globalMetrics.totalApiCalls * 100000; // Rough estimate
    const actualUsage = data.globalMetrics.totalInputTokens;
    return estimatedCapacity > 0 ? Math.min(100, (actualUsage / estimatedCapacity) * 100).toFixed(1) : 0;
  }

  /**
   * Get model recommendation text
   * @param {Object} model - Model info
   * @param {string} currentModel - Current model
   * @returns {string} Recommendation text
   * @private
   */
  static getModelRecommendation(model, currentModel) {
    if (model.model === currentModel) return 'Current';
    if (!model.withinBudget) return 'Over budget';
    if (model.estimatedCost < 0.01) return 'Very economical';
    if (model.model.includes('haiku')) return 'Fast & cheap';
    if (model.model.includes('sonnet')) return 'Balanced';
    if (model.model.includes('opus')) return 'Highest quality';
    return 'Alternative';
  }
}