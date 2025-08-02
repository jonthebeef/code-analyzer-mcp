/**
 * Token counting and cost calculation utility following Anthropic's pricing model.
 * Provides accurate cost estimates and token management for different Claude models.
 */
export class CostCalculator {
  
  /**
   * Anthropic Claude pricing per 1M tokens (as of 2024)
   * Updated based on current Anthropic pricing
   */
  static PRICING = {
    'claude-sonnet-4-20250514': {
      inputPer1M: 15.00,    // $15 per 1M input tokens
      outputPer1M: 75.00,   // $75 per 1M output tokens
      contextWindow: 200000,
      name: 'Claude Sonnet 4'
    },
    'claude-opus-4-20250514': {
      inputPer1M: 60.00,    // $60 per 1M input tokens
      outputPer1M: 300.00,  // $300 per 1M output tokens
      contextWindow: 200000,
      name: 'Claude Opus 4'
    },
    'claude-sonnet-3.5-20250106': {
      inputPer1M: 3.00,     // $3 per 1M input tokens
      outputPer1M: 15.00,   // $15 per 1M output tokens
      contextWindow: 200000,
      name: 'Claude Sonnet 3.5'
    },
    'claude-3-5-haiku-20241022': {
      inputPer1M: 0.80,     // $0.80 per 1M input tokens
      outputPer1M: 4.00,    // $4 per 1M output tokens
      contextWindow: 200000,
      name: 'Claude Haiku 3.5'
    }
  };

  /**
   * Default model fallback
   */
  static DEFAULT_MODEL = 'claude-sonnet-4-20250514';

  /**
   * Model name mapping from CLI options to API identifiers
   */
  static MODEL_MAPPING = {
    'claude-haiku-3.5': 'claude-3-5-haiku-20241022',
    'claude-sonnet-3.5': 'claude-sonnet-3.5-20250106',
    'claude-sonnet-4': 'claude-sonnet-4-20250514',
    'claude-opus-4': 'claude-opus-4-20250514'
  };

  /**
   * Resolve CLI model name to API identifier
   * @param {string} modelName - Model name from CLI or API
   * @returns {string} Resolved model identifier
   */
  static resolveModelName(modelName) {
    return this.MODEL_MAPPING[modelName] || modelName;
  }

  /**
   * Estimate token count from text using Anthropic's guidance
   * @param {string} text - Text to count tokens for
   * @returns {number} Estimated token count
   */
  static estimateTokens(text) {
    if (!text || typeof text !== 'string') {
      return 0;
    }
    
    // Anthropic's guidance: ~1 token = 4 characters for English text
    // More conservative estimate for code which may have more tokens per character
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Calculate cost for given tokens and model
   * @param {number} inputTokens - Number of input tokens
   * @param {number} outputTokens - Number of output tokens
   * @param {string} model - Model identifier
   * @returns {Object} Cost breakdown
   */
  static calculateCost(inputTokens = 0, outputTokens = 0, model = null) {
    const modelKey = this.resolveModelName(model || this.DEFAULT_MODEL);
    const pricing = this.PRICING[modelKey];
    
    if (!pricing) {
      throw new Error(`Unknown model: ${modelKey}. Available models: ${Object.keys(this.PRICING).join(', ')}`);
    }

    const inputCost = (inputTokens / 1000000) * pricing.inputPer1M;
    const outputCost = (outputTokens / 1000000) * pricing.outputPer1M;
    const totalCost = inputCost + outputCost;

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      inputCost,
      outputCost,
      totalCost,
      model: modelKey,
      modelName: pricing.name,
      costPerToken: totalCost / (inputTokens + outputTokens || 1)
    };
  }

  /**
   * Estimate cost for analyzing text content
   * @param {string} content - Content to analyze
   * @param {string} model - Model to use
   * @param {number} expectedOutputTokens - Expected output tokens (default: 10% of input)
   * @returns {Object} Cost estimate
   */
  static estimateContentCost(content, model = null, expectedOutputTokens = null) {
    const inputTokens = this.estimateTokens(content);
    const outputTokens = expectedOutputTokens || Math.ceil(inputTokens * 0.1); // Estimate 10% output
    
    return this.calculateCost(inputTokens, outputTokens, model);
  }

  /**
   * Estimate cost for multiple files
   * @param {Array} files - Array of file objects with content
   * @param {string} model - Model to use
   * @returns {Object} Aggregate cost estimate
   */
  static estimateFilesCost(files, model = null) {
    let totalInputTokens = 0;
    let totalContentSize = 0;
    const fileEstimates = [];

    for (const file of files) {
      const inputTokens = this.estimateTokens(file.content || '');
      totalInputTokens += inputTokens;
      totalContentSize += (file.content || '').length;
      
      fileEstimates.push({
        fileName: file.fileName || 'unknown',
        size: (file.content || '').length,
        estimatedTokens: inputTokens,
        estimatedCost: this.calculateCost(inputTokens, Math.ceil(inputTokens * 0.1), model).totalCost
      });
    }

    // Sort files by estimated cost (highest first)
    fileEstimates.sort((a, b) => b.estimatedCost - a.estimatedCost);

    const outputTokens = Math.ceil(totalInputTokens * 0.1);
    const totalCost = this.calculateCost(totalInputTokens, outputTokens, model);

    return {
      ...totalCost,
      fileCount: files.length,
      totalContentSize,
      averageFileSize: files.length > 0 ? totalContentSize / files.length : 0,
      fileBreakdown: fileEstimates,
      largestFiles: fileEstimates.slice(0, 10),
      costPerFile: totalCost.totalCost / files.length
    };
  }

  /**
   * Get recommended model based on content size and budget
   * @param {number} totalTokens - Total tokens to process
   * @param {number} maxBudget - Maximum budget in USD
   * @returns {Object} Model recommendation
   */
  static recommendModel(totalTokens, maxBudget = null) {
    const outputTokens = Math.ceil(totalTokens * 0.1);
    const models = Object.keys(this.PRICING);
    const recommendations = [];

    for (const model of models) {
      const cost = this.calculateCost(totalTokens, outputTokens, model);
      recommendations.push({
        model,
        modelName: cost.modelName,
        estimatedCost: cost.totalCost,
        withinBudget: maxBudget ? cost.totalCost <= maxBudget : true,
        tokensPerDollar: cost.totalTokens / cost.totalCost,
        suitable: cost.totalTokens <= this.PRICING[model].contextWindow
      });
    }

    // Sort by cost (cheapest first)
    recommendations.sort((a, b) => a.estimatedCost - b.estimatedCost);

    const recommended = recommendations.find(r => r.suitable && (maxBudget ? r.withinBudget : true));
    const cheapest = recommendations.find(r => r.suitable);
    const fastest = recommendations.find(r => r.model.includes('haiku') && r.suitable);

    return {
      all: recommendations,
      recommended: recommended || cheapest,
      cheapest,
      fastest,
      analysis: {
        totalTokens,
        outputTokens,
        exceedsContextWindow: recommendations.every(r => !r.suitable),
        maxBudget
      }
    };
  }

  /**
   * Calculate cost savings between models
   * @param {number} inputTokens - Input tokens
   * @param {number} outputTokens - Output tokens  
   * @param {string} fromModel - Current model
   * @param {string} toModel - Target model
   * @returns {Object} Savings analysis
   */
  static calculateSavings(inputTokens, outputTokens, fromModel, toModel) {
    const currentCost = this.calculateCost(inputTokens, outputTokens, fromModel);
    const targetCost = this.calculateCost(inputTokens, outputTokens, toModel);
    
    const absoluteSavings = currentCost.totalCost - targetCost.totalCost;
    const percentageSavings = currentCost.totalCost > 0 
      ? (absoluteSavings / currentCost.totalCost) * 100 
      : 0;

    // Resolve model names for pricing access
    const resolvedFromModel = this.resolveModelName(fromModel);
    const resolvedToModel = this.resolveModelName(toModel);

    return {
      currentModel: fromModel,
      targetModel: toModel,
      currentCost: currentCost.totalCost,
      targetCost: targetCost.totalCost,
      absoluteSavings,
      percentageSavings,
      worthSwitching: absoluteSavings > 0.01, // Worth switching if saving more than 1 cent
      recommendation: absoluteSavings > 0 
        ? `Switch to ${this.PRICING[resolvedToModel].name} to save $${absoluteSavings.toFixed(3)} (${percentageSavings.toFixed(1)}%)`
        : `${this.PRICING[resolvedFromModel].name} is more cost-effective`
    };
  }

  /**
   * Get safe token limits for a model to avoid exceeding context window
   * @param {string} model - Model identifier
   * @param {number} reservePercentage - Percentage to reserve for system prompts (default: 20%)
   * @returns {Object} Token limits
   */
  static getTokenLimits(model = null, reservePercentage = 20) {
    const modelKey = this.resolveModelName(model || this.DEFAULT_MODEL);
    const pricing = this.PRICING[modelKey];
    
    if (!pricing) {
      throw new Error(`Unknown model: ${modelKey}`);
    }

    const contextWindow = pricing.contextWindow;
    const reserveTokens = Math.ceil(contextWindow * (reservePercentage / 100));
    const safeInputLimit = contextWindow - reserveTokens;

    return {
      model: modelKey,
      modelName: pricing.name,
      contextWindow,
      reserveTokens,
      safeInputLimit,
      recommendedFileLimit: Math.ceil(safeInputLimit * 0.8), // Additional safety margin
      maxCharacters: safeInputLimit * 3.5, // Conservative character estimate
      recommendedCharactersPerFile: Math.ceil(safeInputLimit * 0.8 * 3.5)
    };
  }

  /**
   * Validate if content fits within model limits
   * @param {string} content - Content to validate
   * @param {string} model - Model identifier
   * @returns {Object} Validation result
   */
  static validateContentSize(content, model = null) {
    const tokens = this.estimateTokens(content);
    const limits = this.getTokenLimits(model);
    
    const fitsInContext = tokens <= limits.contextWindow;
    const fitsInSafeLimit = tokens <= limits.safeInputLimit;
    const fitsInRecommended = tokens <= limits.recommendedFileLimit;

    return {
      content: {
        length: content.length,
        estimatedTokens: tokens
      },
      limits,
      validation: {
        fitsInContext,
        fitsInSafeLimit,
        fitsInRecommended,
        status: fitsInRecommended ? 'safe' : fitsInSafeLimit ? 'caution' : fitsInContext ? 'risky' : 'too_large',
        recommendation: this.getContentSizeRecommendation(tokens, limits)
      }
    };
  }

  /**
   * Get recommendation based on content size
   * @param {number} tokens - Token count
   * @param {Object} limits - Token limits
   * @returns {string} Recommendation message
   * @private
   */
  static getContentSizeRecommendation(tokens, limits) {
    if (tokens <= limits.recommendedFileLimit) {
      return 'Content size is optimal for analysis';
    } else if (tokens <= limits.safeInputLimit) {
      return 'Content is large but should work - monitor for truncation';
    } else if (tokens <= limits.contextWindow) {
      return 'Content may exceed safe limits - consider chunking or summarization';
    } else {
      return 'Content is too large for this model - chunking required';
    }
  }

  /**
   * Get available models with their capabilities
   * @returns {Array} Array of model information
   */
  static getAvailableModels() {
    return Object.entries(this.PRICING).map(([key, pricing]) => ({
      id: key,
      name: pricing.name,
      inputCostPer1M: pricing.inputPer1M,
      outputCostPer1M: pricing.outputPer1M,
      contextWindow: pricing.contextWindow,
      recommended: key.includes('sonnet-4'),
      fastest: key.includes('haiku'),
      cheapest: pricing.inputPer1M < 1.0
    }));
  }
}