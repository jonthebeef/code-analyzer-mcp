/**
 * Comprehensive analytics and metrics tracking for code analysis operations.
 * Tracks token usage, costs, performance, and content statistics.
 */
export class AnalysisMetrics {
  constructor() {
    this.startTime = Date.now();
    this.endTime = null;
    this.agentMetrics = new Map();
    this.globalMetrics = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      totalApiCalls: 0,
      filesProcessed: 0,
      contentTruncated: 0,
      totalFileSize: 0
    };
    this.repositoryStats = {
      fileCount: 0,
      totalSize: 0,
      averageFileSize: 0,
      largestFiles: [],
      truncatedFiles: [],
      contentBreakdown: {
        code: 0,
        comments: 0,
        imports: 0,
        other: 0
      }
    };
    this.performanceMetrics = {
      analysisStartTime: this.startTime,
      analysisEndTime: null,
      totalDuration: 0,
      agentDurations: new Map(),
      apiResponseTimes: [],
      averageResponseTime: 0,
      tokensPerSecond: 0,
      filesPerMinute: 0
    };
  }

  /**
   * Initialize metrics for a specific agent
   * @param {string} agentName - Name of the agent
   */
  initializeAgent(agentName) {
    this.agentMetrics.set(agentName, {
      startTime: Date.now(),
      endTime: null,
      workStartTime: null,
      workEndTime: null,
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      apiCalls: 0,
      filesProcessed: 0,
      contentTruncated: 0,
      duration: 0,
      workDuration: 0,
      apiResponseTimes: []
    });
  }

  /**
   * Mark the start of actual work for an agent
   * @param {string} agentName - Name of the agent
   */
  startAgentWork(agentName) {
    if (this.agentMetrics.has(agentName)) {
      const agentData = this.agentMetrics.get(agentName);
      agentData.workStartTime = Date.now();
    }
  }

  /**
   * Mark the end of actual work for an agent
   * @param {string} agentName - Name of the agent
   */
  endAgentWork(agentName) {
    if (this.agentMetrics.has(agentName)) {
      const agentData = this.agentMetrics.get(agentName);
      agentData.workEndTime = Date.now();
      if (agentData.workStartTime) {
        agentData.workDuration = agentData.workEndTime - agentData.workStartTime;
      }
    }
  }

  /**
   * Record API call metrics for an agent
   * @param {string} agentName - Name of the agent
   * @param {Object} callMetrics - API call metrics
   */
  recordApiCall(agentName, callMetrics) {
    const {
      inputTokens = 0,
      outputTokens = 0,
      cost = 0,
      responseTime = 0,
      model = 'unknown'
    } = callMetrics;

    // Update agent-specific metrics
    if (this.agentMetrics.has(agentName)) {
      const agentData = this.agentMetrics.get(agentName);
      agentData.inputTokens += inputTokens;
      agentData.outputTokens += outputTokens;
      agentData.cost += cost;
      agentData.apiCalls += 1;
      agentData.apiResponseTimes.push(responseTime);
    }

    // Update global metrics
    this.globalMetrics.totalInputTokens += inputTokens;
    this.globalMetrics.totalOutputTokens += outputTokens;
    this.globalMetrics.totalCost += cost;
    this.globalMetrics.totalApiCalls += 1;

    // Update performance metrics
    this.performanceMetrics.apiResponseTimes.push(responseTime);
    this.performanceMetrics.averageResponseTime = 
      this.performanceMetrics.apiResponseTimes.reduce((a, b) => a + b, 0) / 
      this.performanceMetrics.apiResponseTimes.length;
  }

  /**
   * Record file processing metrics for an agent
   * @param {string} agentName - Name of the agent
   * @param {Object} fileMetrics - File processing metrics
   */
  recordFileProcessing(agentName, fileMetrics) {
    const {
      fileName = '',
      fileSize = 0,
      wasTruncated = false,
      contentSize = 0
    } = fileMetrics;

    // Update agent-specific metrics
    if (this.agentMetrics.has(agentName)) {
      const agentData = this.agentMetrics.get(agentName);
      agentData.filesProcessed += 1;
      if (wasTruncated) {
        agentData.contentTruncated += 1;
      }
    }

    // Update global metrics
    this.globalMetrics.filesProcessed += 1;
    this.globalMetrics.totalFileSize += fileSize;
    if (wasTruncated) {
      this.globalMetrics.contentTruncated += 1;
      this.repositoryStats.truncatedFiles.push({
        fileName,
        originalSize: fileSize,
        processedSize: contentSize
      });
    }

    // Update repository stats
    this.repositoryStats.fileCount += 1;
    this.repositoryStats.totalSize += fileSize;
    
    // Track largest files
    this.repositoryStats.largestFiles.push({ fileName, size: fileSize });
    this.repositoryStats.largestFiles.sort((a, b) => b.size - a.size);
    this.repositoryStats.largestFiles = this.repositoryStats.largestFiles.slice(0, 10);
  }

  /**
   * Complete metrics for a specific agent
   * @param {string} agentName - Name of the agent
   */
  completeAgent(agentName) {
    if (this.agentMetrics.has(agentName)) {
      const agentData = this.agentMetrics.get(agentName);
      agentData.endTime = Date.now();
      agentData.duration = agentData.endTime - agentData.startTime;
      this.performanceMetrics.agentDurations.set(agentName, agentData.duration);
    }
  }

  /**
   * Complete the overall analysis and calculate final metrics
   */
  completeAnalysis() {
    this.endTime = Date.now();
    this.performanceMetrics.analysisEndTime = this.endTime;
    this.performanceMetrics.totalDuration = this.endTime - this.startTime;

    // Calculate derived metrics
    this.repositoryStats.averageFileSize = this.repositoryStats.fileCount > 0 
      ? this.repositoryStats.totalSize / this.repositoryStats.fileCount 
      : 0;

    this.performanceMetrics.tokensPerSecond = this.performanceMetrics.totalDuration > 0
      ? (this.globalMetrics.totalInputTokens / (this.performanceMetrics.totalDuration / 1000))
      : 0;

    this.performanceMetrics.filesPerMinute = this.performanceMetrics.totalDuration > 0
      ? (this.globalMetrics.filesProcessed / (this.performanceMetrics.totalDuration / 60000))
      : 0;
  }

  /**
   * Get summary statistics for all agents
   * @returns {Array} Array of agent summaries
   */
  getAgentSummaries() {
    const summaries = [];
    for (const [agentName, metrics] of this.agentMetrics) {
      summaries.push({
        name: agentName,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        totalTokens: metrics.inputTokens + metrics.outputTokens,
        cost: metrics.cost,
        duration: metrics.duration,
        workDuration: metrics.workDuration,
        apiCalls: metrics.apiCalls,
        filesProcessed: metrics.filesProcessed,
        contentTruncated: metrics.contentTruncated,
        avgResponseTime: metrics.apiResponseTimes.length > 0 
          ? metrics.apiResponseTimes.reduce((a, b) => a + b, 0) / metrics.apiResponseTimes.length 
          : 0,
        costPerFile: metrics.filesProcessed > 0 ? metrics.cost / metrics.filesProcessed : 0
      });
    }
    return summaries.sort((a, b) => b.cost - a.cost);
  }

  /**
   * Get performance efficiency metrics
   * @returns {Object} Efficiency metrics
   */
  getEfficiencyMetrics() {
    const totalDurationSeconds = this.performanceMetrics.totalDuration / 1000;
    return {
      costPerFile: this.globalMetrics.filesProcessed > 0 
        ? this.globalMetrics.totalCost / this.globalMetrics.filesProcessed 
        : 0,
      costPerKB: this.repositoryStats.totalSize > 0 
        ? this.globalMetrics.totalCost / (this.repositoryStats.totalSize / 1024) 
        : 0,
      costPerToken: (this.globalMetrics.totalInputTokens + this.globalMetrics.totalOutputTokens) > 0
        ? this.globalMetrics.totalCost / (this.globalMetrics.totalInputTokens + this.globalMetrics.totalOutputTokens)
        : 0,
      tokensPerSecond: totalDurationSeconds > 0 
        ? this.globalMetrics.totalInputTokens / totalDurationSeconds 
        : 0,
      filesPerMinute: totalDurationSeconds > 0 
        ? this.globalMetrics.filesProcessed / (totalDurationSeconds / 60) 
        : 0,
      averageFileProcessingTime: this.globalMetrics.filesProcessed > 0
        ? this.performanceMetrics.totalDuration / this.globalMetrics.filesProcessed
        : 0
    };
  }

  /**
   * Get warnings and recommendations based on metrics
   * @returns {Array} Array of warning/recommendation objects
   */
  getWarningsAndRecommendations() {
    const warnings = [];
    const recommendations = [];

    // Check for truncated content
    if (this.globalMetrics.contentTruncated > 0) {
      const truncationPercentage = (this.globalMetrics.contentTruncated / this.globalMetrics.filesProcessed) * 100;
      warnings.push({
        type: 'warning',
        message: `${this.globalMetrics.contentTruncated} files truncated (${truncationPercentage.toFixed(1)}%) - potential missed analysis`
      });
    }

    // Check for large files
    const largeFiles = this.repositoryStats.largestFiles.filter(f => f.size > 50000); // 50KB
    largeFiles.forEach(file => {
      warnings.push({
        type: 'warning',
        message: `${file.fileName} (${Math.round(file.size/1024)}KB) - consider file size limits`
      });
    });

    // Cost optimization recommendations
    const efficiency = this.getEfficiencyMetrics();
    if (efficiency.costPerFile > 0.10) {
      recommendations.push({
        type: 'recommendation',
        message: `High cost per file ($${efficiency.costPerFile.toFixed(3)}) - consider using claude-haiku-3.5 for simpler analyses`
      });
    }

    // Performance recommendations
    if (this.performanceMetrics.averageResponseTime > 5000) { // 5 seconds
      recommendations.push({
        type: 'recommendation',
        message: `Slow API responses (${(this.performanceMetrics.averageResponseTime/1000).toFixed(1)}s avg) - consider reducing content or batch processing`
      });
    }

    // Truncation impact estimation
    if (this.globalMetrics.contentTruncated > 0) {
      const potentialSavings = efficiency.costPerFile * 0.2; // Estimate 20% savings with better truncation
      recommendations.push({
        type: 'recommendation',
        message: `Estimated ${(potentialSavings/efficiency.costPerFile*100).toFixed(0)}% cost reduction with smarter content management`
      });
    }

    return [...warnings, ...recommendations];
  }

  /**
   * Export all metrics as a plain object for serialization
   * @returns {Object} Complete metrics data
   */
  toObject() {
    return {
      timestamp: new Date().toISOString(),
      startTime: this.startTime,
      endTime: this.endTime,
      globalMetrics: this.globalMetrics,
      repositoryStats: this.repositoryStats,
      performanceMetrics: {
        ...this.performanceMetrics,
        agentDurations: Object.fromEntries(this.performanceMetrics.agentDurations),
      },
      agentSummaries: this.getAgentSummaries(),
      efficiencyMetrics: this.getEfficiencyMetrics(),
      warningsAndRecommendations: this.getWarningsAndRecommendations()
    };
  }
}