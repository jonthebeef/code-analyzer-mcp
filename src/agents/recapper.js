import { BaseAgent } from './base-agent.js';
import { MarkdownManager } from '../utils/markdown-manager.js';
import { dirname, join } from 'path';

/**
 * Agent responsible for synthesizing findings from all other analysis agents into a comprehensive executive summary.
 * Creates actionable recommendations with priority levels for technical leads and stakeholders.
 * 
 * @class RecapperAgent
 * @extends BaseAgent
 * 
 * @example
 * const recapper = new RecapperAgent();
 * await recapper.analyze();
 * // Generates comprehensive executive summary with prioritized action items
 */
export class RecapperAgent extends BaseAgent {
  constructor(config = {}) {
    super('recapper', {
      systemPrompt: `You are a senior technical lead creating an executive summary of code analysis findings. Focus on:
- Synthesizing findings from all analysis agents
- Identifying critical issues requiring immediate attention
- Providing actionable recommendations with priority levels
- Creating a clear roadmap for improvements
- Highlighting positive aspects and strengths
- Providing effort and complexity estimates without timeline references

Create a comprehensive but concise report suitable for technical leads and stakeholders.`,
      maxTokens: 4000,
      ...config
    });
  }

  async analyze() {
    this.logProgress('Starting final synthesis and recap...');
    
    try {
      // Collect reports from all other agents
      const agentReports = await this.collectAgentReports();
      
      if (Object.keys(agentReports).length === 0) {
        this.updateAnalysisSection('No agent reports found to synthesize.');
        return;
      }

      // Analyze coordination comments and questions
      const coordinationSummary = await this.analyzeCoordination();
      
      // Generate executive summary
      const executiveSummary = await this.generateExecutiveSummary(agentReports, coordinationSummary);
      
      // Create prioritized action plan
      const actionPlan = await this.createActionPlan(agentReports);
      
      // Generate final recommendations
      const recommendations = await this.generateFinalRecommendations(agentReports);
      
      const finalReport = this.formatAnalysis('Executive Summary & Recommendations', {
        'Executive Summary': executiveSummary,
        'Critical Issues': await this.extractCriticalIssues(agentReports),
        'Prioritized Action Plan': actionPlan,
        'Agent Coordination Summary': coordinationSummary,
        'Final Recommendations': recommendations,
        'Report Metadata': this.generateMetadata(agentReports)
      });
      
      this.updateAnalysisSection(finalReport);
      this.logProgress('Final synthesis completed');
      
    } catch (error) {
      this.logError('Recap analysis failed', error);
      this.updateAnalysisSection(`Synthesis failed: ${error.message}`);
    }
  }

  async collectAgentReports() {
    const reports = {};
    const agentNames = ['api-quality', 'documentation', 'code-quality', 'security'];
    
    // Get the output directory from the working file path
    const outputDir = this.workingFile ? dirname(this.workingFile) : 'output';
    
    for (const agentName of agentNames) {
      try {
        const reportPath = join(outputDir, `${agentName}-analysis.md`);
        const reportContent = MarkdownManager.readFile(reportPath);
        
        if (reportContent && reportContent.length > 100) {
          reports[agentName] = {
            content: reportContent,
            analysisSection: this.extractAnalysisSection(reportContent),
            hasContent: true
          };
        } else {
          reports[agentName] = {
            content: '',
            analysisSection: 'No analysis performed',
            hasContent: false
          };
        }
        
      } catch (error) {
        reports[agentName] = {
          content: '',
          analysisSection: `Error reading report: ${error.message}`,
          hasContent: false
        };
      }
    }
    
    return reports;
  }

  extractAnalysisSection(reportContent) {
    const analysisStart = reportContent.indexOf('## Analysis Results');
    const coordinationStart = reportContent.indexOf('## Coordination');
    
    if (analysisStart === -1) return 'No analysis results found';
    
    const endIndex = coordinationStart !== -1 ? coordinationStart : reportContent.length;
    const analysisSection = reportContent.substring(analysisStart, endIndex);
    
    // Remove the section header and clean up
    return analysisSection.replace('## Analysis Results', '').trim();
  }

  async analyzeCoordination() {
    const agentNames = ['api-quality', 'documentation', 'code-quality', 'security'];
    let totalQuestions = 0;
    let resolvedQuestions = 0;
    const coordinationInsights = [];

    // Get the output directory from the working file path
    const outputDir = this.workingFile ? dirname(this.workingFile) : 'output';

    for (const agentName of agentNames) {
      try {
        const reportPath = join(outputDir, `${agentName}-analysis.md`);
        const reportContent = MarkdownManager.readFile(reportPath);
        
        if (reportContent) {
          const comments = MarkdownManager.parseComments(reportContent);
          totalQuestions += comments.length;
          resolvedQuestions += comments.filter(c => c.status === 'resolved').length;
          
          // Extract insights from resolved questions
          const resolvedComments = comments.filter(c => c.status === 'resolved');
          for (const comment of resolvedComments) {
            coordinationInsights.push({
              from: agentName,
              to: comment.targetAgent,
              question: comment.question,
              context: comment.context
            });
          }
        }
        
      } catch (error) {
        continue;
      }
    }

    let summary = `**Agent Coordination Summary:**\n`;
    summary += `- Total coordination questions: ${totalQuestions}\n`;
    summary += `- Resolved questions: ${resolvedQuestions}\n`;
    summary += `- Resolution rate: ${totalQuestions > 0 ? Math.round((resolvedQuestions / totalQuestions) * 100) : 0}%\n\n`;

    if (coordinationInsights.length > 0) {
      summary += `**Key Coordination Insights:**\n`;
      coordinationInsights.slice(0, 5).forEach(insight => {
        summary += `- ${insight.from} → ${insight.to}: ${insight.question}\n`;
      });
    } else {
      summary += `**No agent coordination occurred** - Agents worked independently\n`;
    }

    return summary;
  }

  async generateExecutiveSummary(agentReports, coordinationSummary) {
    const activeAgents = Object.entries(agentReports).filter(([_, report]) => report.hasContent);
    
    if (activeAgents.length === 0) {
      return 'No comprehensive analysis could be performed due to lack of agent reports.';
    }

    // Prepare context for AI analysis
    const reportsContext = activeAgents.map(([agent, report]) => 
      `**${agent.toUpperCase()} AGENT FINDINGS:**\n${report.analysisSection}\n`
    ).join('\n');

    const summaryPrompt = `Based on the following code analysis reports, create a comprehensive executive summary:

${reportsContext}

${coordinationSummary}

Please provide:
1. **Overall Assessment** - High-level health of the codebase
2. **Key Strengths** - What the codebase does well  
3. **Major Concerns** - Critical issues that need immediate attention
4. **Risk Assessment** - Potential risks to the project
5. **Recommended Action Plan** - Strategic priorities with effort and complexity estimates

Keep the summary concise but comprehensive, suitable for technical leads and stakeholders. Focus on strategic insights with effort/complexity assessment. Avoid ALL timeline references including sprints, weeks, months, days, or any time-based language.`;

    try {
      return await this.callAnthropic(summaryPrompt);
    } catch (error) {
      return this.generateFallbackSummary(agentReports);
    }
  }

  generateFallbackSummary(agentReports) {
    const activeAgents = Object.entries(agentReports).filter(([_, report]) => report.hasContent);
    
    let summary = `**Codebase Analysis Summary**\n\n`;
    summary += `**Agents Completed:** ${activeAgents.length}/4\n`;
    summary += `**Analysis Coverage:**\n`;
    
    for (const [agentName, report] of activeAgents) {
      summary += `- ✅ ${agentName.replace('-', ' ').toUpperCase()}: Analysis completed\n`;
    }
    
    const inactiveAgents = Object.entries(agentReports).filter(([_, report]) => !report.hasContent);
    for (const [agentName, _] of inactiveAgents) {
      summary += `- ❌ ${agentName.replace('-', ' ').toUpperCase()}: No analysis performed\n`;
    }

    summary += `\n**Note:** This is a fallback summary. AI analysis was not available for detailed synthesis.\n`;

    return summary;
  }

  async extractCriticalIssues(agentReports) {
    const criticalIssues = [];
    
    for (const [agentName, report] of Object.entries(agentReports)) {
      if (!report.hasContent) continue;
      
      const analysis = report.analysisSection.toLowerCase();
      
      // Look for critical indicators
      if (analysis.includes('critical') || analysis.includes('🚨')) {
        criticalIssues.push(`**${agentName.toUpperCase()}**: Critical issues detected in analysis`);
      }
      
      if (analysis.includes('security') && (analysis.includes('vulnerability') || analysis.includes('injection'))) {
        criticalIssues.push(`**SECURITY**: Potential security vulnerabilities found`);
      }
      
      if (analysis.includes('no test') || analysis.includes('❌') && analysis.includes('test')) {
        criticalIssues.push(`**QUALITY**: Testing coverage issues identified`);
      }
      
      if (analysis.includes('no readme') || analysis.includes('no documentation')) {
        criticalIssues.push(`**DOCUMENTATION**: Missing critical documentation`);
      }
    }

    if (criticalIssues.length === 0) {
      return '✅ No critical issues requiring immediate attention were identified.';
    }

    let output = `**Issues Requiring Immediate Attention:**\n\n`;
    criticalIssues.forEach((issue, index) => {
      output += `${index + 1}. ${issue}\n`;
    });

    return output;
  }

  async createActionPlan(agentReports) {
    const actions = [];
    
    // Extract action items from each agent report
    for (const [agentName, report] of Object.entries(agentReports)) {
      if (!report.hasContent) continue;
      
      const analysis = report.analysisSection;
      
      // Security actions (highest priority)
      if (analysis.toLowerCase().includes('critical') && agentName === 'security') {
        actions.push({
          priority: 1,
          category: 'Security',
          action: 'Address critical security vulnerabilities'
        });
      }
      
      // Testing actions
      if (analysis.toLowerCase().includes('no test') || (analysis.includes('test') && analysis.includes('❌'))) {
        actions.push({
          priority: 2,
          category: 'Quality',
          action: 'Implement basic testing framework and tests'
        });
      }
      
      // Documentation actions
      if (analysis.toLowerCase().includes('no readme') || analysis.toLowerCase().includes('documentation')) {
        actions.push({
          priority: 3,
          category: 'Documentation',
          action: 'Create essential documentation (README, API docs)'
        });
      }
      
      // Code quality actions
      if (analysis.toLowerCase().includes('complexity') || analysis.toLowerCase().includes('code smell')) {
        actions.push({
          priority: 4,
          category: 'Refactoring',
          action: 'Refactor high-complexity code and address code smells'
        });
      }
    }

    // Sort by priority and format
    actions.sort((a, b) => a.priority - b.priority);
    
    if (actions.length === 0) {
      return '✅ No specific actions required - codebase appears to be in good condition.';
    }

    let plan = `**Prioritized Action Plan:**\n\n`;
    actions.forEach((action, index) => {
      plan += `**${index + 1}. ${action.action}**\n`;
      plan += `- Category: ${action.category}\n\n`;
    });

    return plan;
  }

  async generateFinalRecommendations(agentReports) {
    const recommendations = [];
    
    // Tool recommendations
    const toolRecommendations = [];
    for (const [agentName, report] of Object.entries(agentReports)) {
      if (report.analysisSection.includes('ESLint')) toolRecommendations.push('ESLint for code quality');
      if (report.analysisSection.includes('Jest')) toolRecommendations.push('Jest for testing');
      if (report.analysisSection.includes('TypeScript')) toolRecommendations.push('TypeScript for type safety');
      if (report.analysisSection.includes('bcrypt')) toolRecommendations.push('bcrypt for password hashing');
    }

    let output = `**Strategic Recommendations:**\n\n`;
    
    output += `**1. Development Workflow Improvements:**\n`;
    output += `- Implement pre-commit hooks for code quality checks\n`;
    output += `- Set up continuous integration with automated testing\n`;
    output += `- Establish code review processes\n`;
    output += `- Configure automated dependency updates\n\n`;

    output += `**2. Technical Debt Management:**\n`;
    output += `- Schedule regular refactoring sessions\n`;
    output += `- Monitor and track technical debt metrics\n`;
    output += `- Prioritize fixes based on business impact\n`;
    output += `- Document architectural decisions\n\n`;
    
    if (toolRecommendations.length > 0) {
      output += `**3. Recommended Tools:**\n`;
      [...new Set(toolRecommendations)].forEach(tool => {
        output += `- ${tool}\n`;
      });
      output += '\n';
    }

    output += `**4. Long-term Considerations:**\n`;
    output += `- Plan for scalability and performance optimization\n`;
    output += `- Consider migration to modern frameworks/patterns\n`;
    output += `- Invest in team training and knowledge sharing\n`;
    output += `- Establish monitoring and observability practices\n`;

    return output;
  }

  generateMetadata(agentReports) {
    const timestamp = new Date().toISOString();
    const activeAgents = Object.entries(agentReports).filter(([_, report]) => report.hasContent).length;
    const totalAgents = Object.keys(agentReports).length;
    
    return `**Analysis Metadata:**
- **Generated:** ${timestamp}
- **AI Model:** ${this.getModelInfo()}
- **Agent Coverage:** ${activeAgents}/${totalAgents} agents completed
- **Repository:** ${this.repoPath}
- **Analysis Tool:** Code Analyzer v1.0.0

**Agent Status:**
${Object.entries(agentReports).map(([name, report]) => 
  `- ${name}: ${report.hasContent ? '✅ Complete' : '❌ No analysis'}`
).join('\n')}`;
  }

  /**
   * Get model information for display in metadata
   * @returns {string} Formatted model information
   */
  getModelInfo() {
    if (this.usingFallbackAnalysis) {
      return 'Fallback Analysis (no API key)';
    }

    if (this.anthropicClient) {
      const modelDisplayName = this.anthropicClient.getModelDisplayName();
      const modelId = this.anthropicClient.model;
      return `${modelDisplayName} (${modelId})`;
    }

    // If no anthropicClient available, check if model was set
    if (this.model) {
      const DISPLAY_MAP = {
        'claude-sonnet-4-20250514': 'Claude Sonnet 4',
        'claude-opus-4-20250514': 'Claude Opus 4',
        'claude-3-5-sonnet-20241022': 'Claude Sonnet 3.5',
        'claude-3-5-haiku-20241022': 'Claude Haiku 3.5',
        'claude-3-7-sonnet-20250224': 'Claude Sonnet 3.7'
      };
      const displayName = DISPLAY_MAP[this.model] || this.model;
      return `${displayName} (${this.model})`;
    }

    // Default fallback
    return 'Claude Sonnet 4 (claude-sonnet-4-20250514)';
  }
}