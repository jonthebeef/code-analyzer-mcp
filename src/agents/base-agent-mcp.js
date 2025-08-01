/**
 * Base class for MCP code analysis agents
 * Provides common functionality without direct LLM calls
 */
export class BaseAgentMCP {
  constructor(name, config = {}) {
    this.name = name;
    this.config = {
      maxTokens: 4000,
      temperature: 0.1,
      ...config
    };
  }

  /**
   * Get files relevant to this agent's analysis
   */
  async getRelevantFiles(files, characteristics) {
    return files;
  }

  /**
   * Build the analysis context for this agent
   */
  buildContext(files, repoInfo) {
    return {
      agent: this.name,
      files: files,
      repository: repoInfo,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Format the analysis request
   */
  formatRequest(context) {
    return {
      agent: this.name,
      systemPrompt: this.config.systemPrompt || this.getDefaultSystemPrompt(),
      context: context,
      maxTokens: this.config.maxTokens
    };
  }

  /**
   * Get default system prompt for the agent
   */
  getDefaultSystemPrompt() {
    return `You are a code analysis agent focused on ${this.name}. Analyze the provided code and give actionable recommendations.`;
  }
}