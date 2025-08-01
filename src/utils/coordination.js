import { MarkdownManager } from './markdown-manager.js';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Manages coordination between agents during analysis.
 * Facilitates communication, tracks rounds, and handles coordination timeouts.
 * 
 * @class CoordinationManager
 * @example
 * const coordinator = new CoordinationManager('./output');
 * await coordinator.startCoordinationRound(agents);
 */
export class CoordinationManager {
  /**
   * Creates a new CoordinationManager instance.
   * 
   * @param {string} [outputDir='output'] - Directory for coordination logs and error files
   */
  constructor(outputDir = 'output') {
    this.maxRounds = 3;
    this.currentRound = 1;
    this.roundLimits = new Map(); // Track rounds per agent pair
    this.errorLogPath = join(outputDir, 'error-log.md');
  }

  async startCoordinationRound(agents) {
    console.log(`🤝 Starting coordination round ${this.currentRound}`);
    
    const agentPairs = this.getAgentPairs(agents);
    const coordinationPromises = [];

    for (const [agent1, agent2] of agentPairs) {
      const pairKey = `${agent1.name}-${agent2.name}`;
      
      if (this.getRoundCount(pairKey) >= this.maxRounds) {
        this.logCoordinationTimeout(pairKey, []);
        continue;
      }

      coordinationPromises.push(
        this.facilitateCoordination(agent1, agent2, pairKey)
      );
    }

    await Promise.all(coordinationPromises);
    
    if (this.currentRound < this.maxRounds && this.hasPendingQuestions(agents)) {
      this.currentRound++;
      return this.startCoordinationRound(agents);
    }

    return true;
  }

  getAgentPairs(agents) {
    const pairs = [];
    const agentList = Array.from(agents.values());
    
    for (let i = 0; i < agentList.length; i++) {
      for (let j = i + 1; j < agentList.length; j++) {
        pairs.push([agentList[i], agentList[j]]);
      }
    }
    
    return pairs;
  }

  async facilitateCoordination(agent1, agent2, pairKey) {
    try {
      // Check if agent1 has questions for agent2
      const questions1to2 = this.checkForQuestions(agent1, agent2.name);
      if (questions1to2.length > 0) {
        await this.processQuestions(agent2, questions1to2, agent1.name);
        this.incrementRoundCount(pairKey);
      }

      // Check if agent2 has questions for agent1
      const questions2to1 = this.checkForQuestions(agent2, agent1.name);
      if (questions2to1.length > 0) {
        await this.processQuestions(agent1, questions2to1, agent2.name);
        this.incrementRoundCount(pairKey);
      }
    } catch (error) {
      this.logError(`Coordination error between ${agent1.name} and ${agent2.name}: ${error.message}`);
    }
  }

  checkForQuestions(fromAgent, toAgentName) {
    const content = MarkdownManager.readFile(fromAgent.workingFile);
    const comments = MarkdownManager.parseComments(content);
    
    return comments.filter(comment => 
      comment.targetAgent === toAgentName && 
      comment.status === 'pending' &&
      comment.round === this.currentRound
    );
  }

  async processQuestions(answeringAgent, questions, askingAgentName) {
    for (const question of questions) {
      try {
        const response = await answeringAgent.respondToQuestion(question, askingAgentName);
        
        // Find the asking agent's file and add the response
        const askingAgentFile = this.findAgentFile(askingAgentName);
        if (askingAgentFile) {
          MarkdownManager.respondToComment(askingAgentFile, question.id, response);
        }
      } catch (error) {
        this.logError(`Error processing question from ${askingAgentName} to ${answeringAgent.name}: ${error.message}`);
      }
    }
  }

  findAgentFile(agentName) {
    return join('output', `${agentName}-analysis.md`);
  }

  checkPendingQuestions(agents) {
    const pendingQuestions = [];
    
    for (const agent of agents.values()) {
      const content = MarkdownManager.readFile(agent.workingFile);
      const comments = MarkdownManager.parseComments(content);
      
      const pending = comments.filter(comment => comment.status === 'pending');
      pendingQuestions.push(...pending);
    }
    
    return pendingQuestions;
  }

  hasPendingQuestions(agents) {
    return this.checkPendingQuestions(agents).length > 0;
  }

  getRoundCount(pairKey) {
    return this.roundLimits.get(pairKey) || 0;
  }

  incrementRoundCount(pairKey) {
    const current = this.getRoundCount(pairKey);
    this.roundLimits.set(pairKey, current + 1);
  }

  logCoordinationTimeout(agentPair, questions) {
    const message = `
## Coordination Timeout - ${new Date().toISOString()}

**Agent Pair:** ${agentPair}
**Max Rounds Reached:** ${this.maxRounds}
**Pending Questions:** ${questions.length}

${questions.length > 0 ? '**Unresolved Questions:**' : '**No pending questions**'}
${questions.map(q => `- ${q.question} (Context: ${q.context})`).join('\n')}

---
`;

    this.appendToErrorLog(message);
  }

  logError(message) {
    const errorEntry = `
## Error - ${new Date().toISOString()}

${message}

---
`;
    this.appendToErrorLog(errorEntry);
  }

  appendToErrorLog(content) {
    try {
      // Ensure the directory exists
      const dir = dirname(this.errorLogPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      let existingContent = '';
      
      if (existsSync(this.errorLogPath)) {
        existingContent = MarkdownManager.readFile(this.errorLogPath);
      } else {
        existingContent = `# Code Analyzer Error Log

Generated: ${new Date().toISOString()}

---
`;
      }

      writeFileSync(this.errorLogPath, existingContent + content, 'utf8');
    } catch (error) {
      // Fallback to console if file writing fails
      console.error('Failed to write to error log:', error.message);
      console.error('Error content:', content);
    }
  }

  trackRoundLimits() {
    const summary = Array.from(this.roundLimits.entries())
      .map(([pair, rounds]) => `${pair}: ${rounds}/${this.maxRounds} rounds`)
      .join('\n');
    
    console.log('📊 Coordination Summary:');
    console.log(summary);
  }
}