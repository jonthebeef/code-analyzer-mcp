import Anthropic from '@anthropic-ai/sdk';

/**
 * Wrapper for Anthropic client to maintain compatibility
 */
export class AnthropicClient {
  constructor() {
    this.client = null;
    if (process.env.ANTHROPIC_API_KEY) {
      this.client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
  }

  async sendMessage(messages, options = {}) {
    if (!this.client) {
      throw new Error('No API key configured');
    }

    const response = await this.client.messages.create({
      model: options.model || 'claude-3-5-sonnet-20241022',
      max_tokens: options.max_tokens || 4096,
      messages: messages,
      ...options
    });

    return response;
  }
}