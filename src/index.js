#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import { RepoAnalyzer } from './utils/repo-analyzer.js';
import { ExclusionManager } from './utils/exclusion-manager.js';
import { LLMInterface } from './utils/llm-interface.js';
import { RepoScanner } from './utils/repo-scanner.js';

// Agent configurations
const AGENT_CONFIGS = {
  'api-quality': {
    name: 'API Quality',
    description: 'Analyzes REST API design, error handling, and validation patterns',
    systemPrompt: `You are an API Quality specialist. Analyze the codebase focusing on:
- REST API design patterns and consistency
- Error handling and validation
- Request/response structures
- API documentation and OpenAPI specs
- Authentication and authorization patterns
- Rate limiting and caching strategies

Provide specific, actionable recommendations with code examples.`
  },
  'documentation': {
    name: 'Documentation',
    description: 'Evaluates README quality, inline comments, and API documentation',
    systemPrompt: `You are a Documentation specialist. Analyze the codebase focusing on:
- README completeness and clarity
- Inline code comments and JSDoc
- API documentation
- Setup and configuration guides
- Architecture documentation
- Example usage and tutorials

Provide specific recommendations for improving documentation.`
  },
  'code-quality': {
    name: 'Code Quality',
    description: 'Checks complexity, maintainability, and coding best practices',
    systemPrompt: `You are a Code Quality specialist. Analyze the codebase focusing on:
- Code complexity and maintainability
- Design patterns and architecture
- Code duplication and DRY principles
- Testing coverage and quality
- TypeScript usage and type safety
- Performance considerations

Provide specific refactoring suggestions with examples.`
  },
  'security': {
    name: 'Security',
    description: 'Scans for vulnerabilities, security patterns, and OWASP compliance',
    systemPrompt: `You are a Security specialist. Analyze the codebase focusing on:
- Common vulnerabilities (OWASP Top 10)
- Authentication and authorization security
- Input validation and sanitization
- Secrets management
- Dependency vulnerabilities
- Security headers and CORS configuration

Provide specific security recommendations with severity levels.`
  },
  'next-task': {
    name: 'Next Task',
    description: 'Suggests the next development tasks based on code analysis',
    systemPrompt: `You are a development planning specialist. Based on the codebase analysis:
- Identify missing features or incomplete implementations
- Suggest logical next steps for development
- Prioritize technical debt items
- Recommend testing improvements
- Propose performance optimizations

Provide a prioritized list of next tasks with effort estimates.`
  }
};

class CodeAnalyzerMCP {
  constructor() {
    this.server = new Server(
      {
        name: 'code-analyzer-mcp',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.repoAnalyzer = new RepoAnalyzer();
    this.exclusionManager = new ExclusionManager(process.cwd());
    this.llmInterface = new LLMInterface();
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'analyze_repository',
          description: 'Analyze a repository with specified agents for code quality, security, documentation, and API design',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the repository to analyze'
              },
              agents: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: Object.keys(AGENT_CONFIGS)
                },
                description: 'List of agents to run (defaults to all)'
              },
              exclude: {
                type: 'array',
                items: { type: 'string' },
                description: 'Patterns to exclude from analysis'
              }
            },
            required: ['path']
          }
        },
        {
          name: 'analyze_files',
          description: 'Analyze specific files with a chosen agent',
          inputSchema: {
            type: 'object',
            properties: {
              files: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of file paths to analyze'
              },
              agent: {
                type: 'string',
                enum: Object.keys(AGENT_CONFIGS),
                description: 'Agent to use for analysis'
              }
            },
            required: ['files', 'agent']
          }
        },
        {
          name: 'get_repository_info',
          description: 'Get basic information about a repository structure',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the repository'
              }
            },
            required: ['path']
          }
        },
        {
          name: 'scan_repository',
          description: 'Scan a repository to understand its structure, complexity, and suggest optimal analysis approach',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the repository'
              }
            },
            required: ['path']
          }
        }
      ]
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'analyze_repository':
          return await this.analyzeRepository(args);
        
        case 'analyze_files':
          return await this.analyzeFiles(args);
        
        case 'get_repository_info':
          return await this.getRepositoryInfo(args);
        
        case 'scan_repository':
          return await this.scanRepository(args);
        
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  async analyzeRepository(args) {
    const { path: repoPath, agents = Object.keys(AGENT_CONFIGS), exclude = [] } = args;

    try {
      // Set up exclusions
      this.exclusionManager.addPatterns(exclude);
      
      // Load .codeanalyzer file if it exists
      const codeAnalyzerPath = path.join(repoPath, '.codeanalyzer');
      try {
        const patterns = await this.exclusionManager.loadFromFile(codeAnalyzerPath);
        // console.error(`Loaded ${patterns.length} exclusion patterns from .codeanalyzer`);
      } catch (err) {
        // Try .gitignore as fallback
        const gitignorePath = path.join(repoPath, '.gitignore');
        try {
          const patterns = await this.exclusionManager.loadFromFile(gitignorePath);
          // console.error(`Loaded ${patterns.length} exclusion patterns from .gitignore`);
        } catch (err) {
          // No exclusion files found
        }
      }

      // Analyze repository structure
      const repoInfo = await this.repoAnalyzer.analyzeRepository(repoPath);
      
      // Get relevant files
      const files = await this.getRelevantFiles(repoPath, repoInfo);
      
      // Prepare analysis requests for each agent
      const analysisRequests = [];
      
      for (const agentKey of agents) {
        if (!AGENT_CONFIGS[agentKey]) {
          continue;
        }
        
        const config = AGENT_CONFIGS[agentKey];
        const request = this.llmInterface.formatAnalysisRequest(
          config.name,
          {
            files: files.slice(0, 20), // Limit files for context
            structure: repoInfo.structure,
            characteristics: repoInfo.characteristics
          },
          config.systemPrompt
        );
        
        analysisRequests.push({
          agent: agentKey,
          ...request
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              type: 'repository_analysis',
              repository: repoPath,
              agents: agents,
              analysisRequests: analysisRequests,
              summary: {
                totalFiles: repoInfo.structure.totalFiles,
                languages: repoInfo.characteristics.languages || ['JavaScript'],
                hasTests: repoInfo.characteristics.hasTests,
                hasTypeScript: repoInfo.characteristics.hasTypeScript,
                framework: repoInfo.characteristics.framework
              }
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error analyzing repository: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  async analyzeFiles(args) {
    const { files, agent } = args;
    
    if (!AGENT_CONFIGS[agent]) {
      throw new Error(`Unknown agent: ${agent}`);
    }
    
    try {
      const fileContents = await Promise.all(
        files.map(async (filePath) => {
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            return { path: filePath, content };
          } catch (err) {
            return { path: filePath, error: err.message };
          }
        })
      );
      
      const config = AGENT_CONFIGS[agent];
      const request = this.llmInterface.formatAnalysisRequest(
        config.name,
        {
          files: fileContents.filter(f => !f.error),
          structure: { totalFiles: files.length },
          characteristics: {}
        },
        config.systemPrompt
      );
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              type: 'file_analysis',
              agent: agent,
              files: files,
              analysisRequest: request
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error analyzing files: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  async getRepositoryInfo(args) {
    const { path: repoPath } = args;
    
    try {
      const repoInfo = await this.repoAnalyzer.analyzeRepository(repoPath);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              type: 'repository_info',
              path: repoPath,
              structure: repoInfo.structure,
              characteristics: repoInfo.characteristics,
              suggestedAgents: this.suggestAgents(repoInfo.characteristics)
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting repository info: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  async getRelevantFiles(repoPath, repoInfo) {
    const files = [];
    const patterns = ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx', '**/*.json', '**/*.md'];
    
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: repoPath,
        ignore: this.exclusionManager.patterns,
        absolute: false
      });
      
      for (const match of matches) {
        if (files.length >= 50) break; // Limit total files
        
        const filePath = path.join(repoPath, match);
        if (!this.exclusionManager.shouldExclude(match)) {
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            files.push({
              path: match,
              content: content.slice(0, 5000) // Limit content size
            });
          } catch (err) {
            // Skip files that can't be read
          }
        }
      }
    }
    
    return files;
  }

  suggestAgents(characteristics) {
    const suggested = [];
    
    // Always suggest code quality and documentation
    suggested.push('code-quality', 'documentation');
    
    // Suggest API quality if API routes detected
    if (characteristics.hasApiRoutes || characteristics.framework === 'express') {
      suggested.push('api-quality');
    }
    
    // Always suggest security for production code
    suggested.push('security');
    
    // Suggest next-task for active development
    if (characteristics.hasTests || characteristics.hasTypeScript) {
      suggested.push('next-task');
    }
    
    return [...new Set(suggested)];
  }

  async scanRepository(args) {
    const { path: repoPath } = args;
    
    try {
      // Use the repo scanner to analyze the repository structure
      const scanResult = await RepoScanner.scanRepository(repoPath, {
        excludePatterns: this.exclusionManager.patterns
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            repository: repoPath,
            summary: scanResult.summary,
            structure: {
              totalFiles: scanResult.totalFiles,
              analyzableFiles: scanResult.analyzableFiles,
              totalLines: scanResult.totalLines,
              languages: scanResult.languages || [],
              frameworks: scanResult.frameworks || []
            },
            complexity: {
              size: scanResult.totalFiles > 100 ? 'Large' : scanResult.totalFiles > 50 ? 'Medium' : 'Small',
              estimatedAnalysisTime: scanResult.totalFiles > 100 ? '5-10 minutes' : scanResult.totalFiles > 50 ? '2-5 minutes' : '1-2 minutes'
            },
            recommendations: {
              suggestedAgents: this.suggestAgents(scanResult),
              analysisApproach: scanResult.totalFiles > 100 ? 'Consider analyzing in phases or focusing on specific areas' : 'Full repository analysis recommended'
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `Failed to scan repository: ${error.message}`
        }]
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.setupHandlers();
    // console.error('Code Analyzer MCP Server running on stdio');
  }
}

// Start the server
const server = new CodeAnalyzerMCP();
server.run().catch(console.error);