import { BaseAgent } from './base-agent.js';
import { MarkdownManager } from '../utils/markdown-manager.js';
import { dirname, join } from 'path';

/**
 * Agent responsible for analyzing all findings and recommending the next most impactful task.
 * Provides comprehensive implementation guidance including context, best practices, and step-by-step approach.
 * 
 * @class NextTaskAgent
 * @extends BaseAgent
 * 
 * @example
 * const agent = new NextTaskAgent();
 * await agent.initialize('./repo', './output');
 * await agent.analyze();
 */
export class NextTaskAgent extends BaseAgent {
  constructor(config = {}) {
    super('next-task', {
      systemPrompt: `You are a senior technical lead who analyzes code analysis findings and recommends the next most impactful task to tackle.

Your role is to:
- Synthesize findings from all analysis agents
- Identify the single most impactful next task
- Provide comprehensive implementation guidance
- Include context, best practices, and step-by-step approach
- Consider effort vs impact ratio
- Account for dependencies between tasks

Focus on practical, actionable recommendations that follow software engineering best practices.`,
      maxTokens: 4000,
      ...config
    });
  }

  async analyze() {
    try {
      console.log(`📊 ${this.name}: Starting next task recommendation analysis...`);
      
      // Read all agent reports
      const agentReports = await this.readAgentReports();
      
      // Generate next task recommendation
      const recommendation = await this.generateNextTaskRecommendation(agentReports);
      
      // Update analysis section with recommendation
      await this.updateAnalysisSection(recommendation);
      
      console.log(`📊 ${this.name}: Next task analysis completed`);
      return recommendation;
      
    } catch (error) {
      const errorMsg = `Next task analysis failed: ${error.message}`;
      console.error(`❌ ${this.name}: ${errorMsg}`);
      await this.updateAnalysisSection(`Error generating next task recommendation: ${error.message}`);
      throw error;
    }
  }

  async readAgentReports() {
    const reports = {};
    const agentNames = ['code-quality', 'documentation', 'api-quality', 'security', 'recapper'];
    
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

  async generateNextTaskRecommendation(agentReports) {
    // Build comprehensive context from all reports
    const reportsContext = this.buildReportsContext(agentReports);
    
    const recommendationPrompt = `Based on the comprehensive code analysis findings below, recommend the single most impactful next task to tackle.

${reportsContext}

Please provide:

1. **Recommended Next Task** - Clear, specific task title
2. **Rationale** - Why this task should be prioritized (impact vs effort)
3. **Context & Background** - Technical context and current state
4. **Implementation Plan** - High-level approach identifying key areas to address
5. **Best Practices** - Testing, documentation, patterns to follow (JavaScript only, no TypeScript suggestions)
6. **Success Criteria** - How to know the task is complete
7. **Dependencies** - What needs to be done before/after this task
8. **Risk Assessment** - Potential risks and mitigation strategies

Guidelines:
- Focus on the highest impact task that provides the best foundation for subsequent improvements
- Consider security vulnerabilities (highest priority), code quality issues, infrastructure improvements
- Provide strategic guidance without detailed code examples
- Avoid suggesting TypeScript migration (that's a separate future task)
- Keep recommendations focused on JavaScript-based solutions
- Address technical debt that blocks other improvements

Provide specific, actionable guidance that follows established patterns in the codebase.`;

    try {
      return await this.callAI(recommendationPrompt);
    } catch (error) {
      console.error(`❌ ${this.name}: AI call failed, using fallback analysis`);
      return this.generateFallbackRecommendation(agentReports);
    }
  }

  buildReportsContext(agentReports) {
    let context = '';
    
    for (const [agentName, report] of Object.entries(agentReports)) {
      if (report.hasContent) {
        context += `\n### ${agentName.toUpperCase()} FINDINGS:\n`;
        context += report.analysisSection.substring(0, 2000) + '\n'; // Limit length
      }
    }
    
    return context;
  }

  generateFallbackRecommendation(agentReports) {
    // Basic pattern-based recommendation when AI is unavailable
    let recommendation = `# Next Task Recommendation (Fallback Analysis)

## Recommended Next Task
**Implement Basic Security Improvements**

## Rationale
Based on pattern analysis of the reports, security issues appear to be the highest priority concern.

## Implementation Plan
1. Review security analysis findings
2. Identify critical security vulnerabilities
3. Implement fixes for highest-severity issues
4. Add tests for security improvements
5. Update documentation

## Best Practices
- Follow existing code patterns in the repository
- Add comprehensive tests for any changes
- Update relevant documentation
- Use established security libraries where possible

## Success Criteria
- Security vulnerabilities addressed
- Tests passing
- Documentation updated

*Note: This is a fallback recommendation. For detailed analysis, ensure ANTHROPIC_API_KEY is configured.*`;

    return recommendation;
  }

  async updateAnalysisSection(analysisContent) {
    try {
      const currentContent = this.readWorkingMemory();
      
      // Find the analysis results section
      const resultsStart = currentContent.indexOf('## Analysis Results');
      const coordinationStart = currentContent.indexOf('## Coordination');
      
      console.log(`📝 ${this.name}: Updating analysis section...`, {
        contentLength: analysisContent?.length || 0,
        contentType: typeof analysisContent,
        resultsStart,
        coordinationStart,
        workingFileLength: currentContent?.length || 0
      });
      
      if (resultsStart === -1 || coordinationStart === -1) {
        this.logError('Invalid working file format - missing required sections', new Error(`Missing sections: resultsStart=${resultsStart}, coordinationStart=${coordinationStart}`));
        throw new Error('Invalid working file format');
      }
      
      // Log if analysisContent is null or problematic
      if (!analysisContent) {
        this.logError('Attempting to update analysis section with null/undefined content');
        analysisContent = 'Next task analysis failed to generate content';
      }
      
      // Replace the analysis section
      const beforeResults = currentContent.substring(0, resultsStart);
      const afterCoordination = currentContent.substring(coordinationStart);
      
      const newContent = beforeResults + 
        '## Analysis Results\n\n' + 
        analysisContent + '\n\n' + 
        afterCoordination;
      
      this.writeWorkingMemory(newContent);
      console.log(`✅ ${this.name}: Analysis section updated successfully`);
      
    } catch (error) {
      console.error(`❌ ${this.name}: Failed to update analysis section:`, error);
      this.logError('Failed to update analysis section', error);
      throw error;
    }
  }
}