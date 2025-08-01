/**
 * Interface for LLM operations in MCP context
 * This replaces the direct Anthropic API calls with a format that 
 * can be returned to Claude Code for processing
 */
export class LLMInterface {
  constructor() {
    this.pendingAnalyses = [];
  }

  /**
   * Instead of making API calls, we return structured prompts
   * that Claude Code can process using its own context
   */
  async prepareAnalysis(prompt, systemPrompt = '', maxTokens = 4000) {
    return {
      type: 'llm_analysis_request',
      systemPrompt,
      userPrompt: prompt,
      maxTokens,
      metadata: {
        timestamp: new Date().toISOString(),
        promptLength: prompt?.length || 0,
        systemPromptLength: systemPrompt?.length || 0
      }
    };
  }

  /**
   * Format analysis request for Claude Code to process
   */
  formatAnalysisRequest(agentName, repoContext, systemPrompt) {
    const prompt = this.buildPrompt(agentName, repoContext);
    
    return {
      agent: agentName,
      prompt: prompt,
      systemPrompt: systemPrompt,
      context: {
        files: repoContext.files || [],
        structure: repoContext.structure || {},
        characteristics: repoContext.characteristics || {}
      }
    };
  }

  buildPrompt(agentName, repoContext) {
    const { files, structure, characteristics } = repoContext;
    
    let prompt = `Please analyze this ${characteristics.language || 'Node.js'} repository as the ${agentName} agent.\n\n`;
    
    prompt += `Repository Structure:\n`;
    prompt += `- Total files: ${files.length}\n`;
    prompt += `- Main language: ${characteristics.language || 'JavaScript'}\n`;
    prompt += `- Has TypeScript: ${characteristics.hasTypeScript ? 'Yes' : 'No'}\n`;
    prompt += `- Has tests: ${characteristics.hasTests ? 'Yes' : 'No'}\n`;
    prompt += `- Has API routes: ${characteristics.hasApiRoutes ? 'Yes' : 'No'}\n\n`;
    
    if (files.length > 0) {
      prompt += `Files to analyze:\n`;
      files.forEach(file => {
        prompt += `\n--- ${file.path} ---\n`;
        prompt += file.content || '[File content provided separately]';
        prompt += `\n`;
      });
    }
    
    return prompt;
  }
}