# Code Analyzer MCP

A powerful Model Context Protocol (MCP) server that provides comprehensive code analysis capabilities for your projects. Analyze code quality, security vulnerabilities, documentation coverage, API design, and get intelligent suggestions for your next development tasks.

Based on and inspired by [JKershaw's original code-analyzer](https://github.com/JKershaw/code-analyzer) - this version extends the concept to work with Claude Desktop through the Model Context Protocol.

## Features

### 🤖 Multiple Specialized Analysis Agents

- **Code Quality Agent**: Analyzes code structure, patterns, and maintainability
- **Security Agent**: Identifies potential vulnerabilities and security best practices
- **Documentation Agent**: Evaluates documentation coverage and quality
- **API Quality Agent**: Reviews REST API design, error handling, and validation patterns
- **Next Task Agent**: Suggests logical next steps and prioritizes technical debt

### 🛡️ Enterprise-Grade Security

- Command injection prevention
- Path traversal protection
- Secure environment variable handling
- Sensitive data masking
- Input validation and sanitization

### 🚀 Smart Analysis Features

- Automatic framework and language detection
- Intelligent file exclusion (.gitignore, .codeanalyzer)
- AI-powered analysis with fallback pattern matching
- Support for multiple programming languages
- Configurable analysis scope

## Installation

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn
- Claude Desktop App

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/jonthebeef/code-analyzer-mcp.git
   cd code-analyzer-mcp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Add to Claude Desktop**
   
   Using Claude's CLI (recommended):
   ```bash
   # For global access across all projects
   claude mcp add code-analyzer node /path/to/code-analyzer-mcp/src/index.js --scope user
   
   # For current project only
   claude mcp add code-analyzer node /path/to/code-analyzer-mcp/src/index.js
   ```

4. **Verify installation**
   ```bash
   claude mcp list
   ```
   
   You should see:
   ```
   code-analyzer: node /path/to/code-analyzer-mcp/src/index.js - ✓ Connected
   ```

## Usage

Once installed, the Code Analyzer MCP provides three main tools in Claude:

### 1. Analyze Repository
Performs a comprehensive analysis of an entire repository.

```
Tool: analyze_repository
Parameters:
- path: Path to the repository to analyze
- agents: (optional) Array of specific agents to run
- exclude: (optional) Additional patterns to exclude
```

Example in Claude:
> "Analyze the repository at /path/to/my-project"

### 2. Analyze Files
Analyzes specific files with a chosen agent.

```
Tool: analyze_files
Parameters:
- files: Array of file paths to analyze
- agent: Specific agent to use for analysis
```

Example in Claude:
> "Analyze the security of these files: src/auth.js, src/api/users.js"

### 3. Get Repository Info
Provides basic information about a repository structure.

```
Tool: get_repository_info
Parameters:
- path: Path to the repository
```

Example in Claude:
> "What's the structure of the repository at /path/to/project?"

## Configuration

### Exclusion Files

Create a `.codeanalyzer` file in your project root to define custom exclusion patterns:

```
# .codeanalyzer
node_modules/
dist/
*.test.js
*.spec.js
coverage/
```

The analyzer also respects `.gitignore` files automatically.

### Environment Variables

For AI-powered analysis (recommended), set your Anthropic API key:

```bash
export ANTHROPIC_API_KEY=your-api-key-here
```

Without an API key, the analyzer will use pattern-matching fallbacks which may be less accurate.

## Available Agents

### Code Quality Agent
- Analyzes code structure and patterns
- Identifies code smells and anti-patterns
- Suggests refactoring opportunities
- Evaluates maintainability

### Security Agent
- Scans for common vulnerabilities
- Identifies insecure patterns
- Reviews authentication and authorization
- Checks for exposed secrets

### Documentation Agent
- Measures documentation coverage
- Evaluates JSDoc/comment quality
- Identifies undocumented APIs
- Suggests documentation improvements

### API Quality Agent
- Reviews REST API design
- Analyzes error handling
- Validates request/response patterns
- Checks API consistency

### Next Task Agent
- Suggests logical next development steps
- Prioritizes technical debt
- Identifies missing features
- Recommends testing improvements

## Troubleshooting

### MCP Server Not Showing in Claude

1. **Check installation**
   ```bash
   claude mcp list
   ```

2. **Verify Node.js version**
   ```bash
   node --version  # Should be 18.0.0 or higher
   ```

3. **Check server health**
   ```bash
   # Test the server directly
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"1.0.0","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node /path/to/code-analyzer-mcp/src/index.js
   ```

4. **Reinstall with correct scope**
   ```bash
   # Remove existing installation
   claude mcp remove code-analyzer
   
   # Add with user scope for global access
   claude mcp add code-analyzer node /path/to/code-analyzer-mcp/src/index.js --scope user
   ```

5. **Check logs for errors**
   - Look for any error messages when running `claude mcp list`
   - Ensure the path to index.js is absolute and correct

### Common Issues

**"Cannot find module" errors**
- Ensure you've run `npm install` in the code-analyzer-mcp directory
- Check that Node.js version is 18.0.0 or higher

**"Path not found" errors**
- Use absolute paths when adding the MCP server
- Verify the path exists: `ls -la /path/to/code-analyzer-mcp/src/index.js`

**Server connects but tools don't appear**
- Restart Claude Desktop after adding the MCP server
- Check that no console.log statements are interfering with MCP protocol

**Analysis seems incomplete**
- Set `ANTHROPIC_API_KEY` for AI-powered analysis
- Check file exclusion patterns in `.codeanalyzer` or `.gitignore`

## Development

### Project Structure
```
code-analyzer-mcp/
├── src/
│   ├── index.js           # Main MCP server
│   ├── agents/            # Analysis agents
│   │   ├── base-agent.js
│   │   ├── code-quality.js
│   │   ├── security.js
│   │   ├── documentation.js
│   │   ├── api-quality.js
│   │   └── next-task.js
│   └── utils/             # Utility modules
│       ├── repo-analyzer.js
│       ├── exclusion-manager.js
│       ├── llm-interface.js
│       └── secure-*.js
├── package.json
└── README.md
```

### Adding Custom Agents

1. Create a new agent file in `src/agents/`
2. Extend the `BaseAgent` class
3. Implement the `performAnalysis` method
4. Add the agent to `AGENT_CONFIGS` in `src/index.js`

Example:
```javascript
export class CustomAgent extends BaseAgent {
  constructor(options) {
    super('custom', options);
  }

  async performAnalysis(fileContents, repoInfo) {
    // Your analysis logic here
    return {
      summary: "Analysis summary",
      findings: [],
      score: 85
    };
  }
}
```

## Security Considerations

This tool is designed with security in mind:

- All file paths are validated to prevent directory traversal
- Command injection is prevented through input sanitization
- Sensitive data is masked in logs and outputs
- File access is restricted by exclusion patterns
- No external commands are executed without validation

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Credits & Acknowledgments

This project is based on the excellent work by [John Kershaw](https://github.com/JKershaw) on the original [code-analyzer](https://github.com/JKershaw/code-analyzer). This MCP version extends John's concept to integrate seamlessly with Claude Desktop through the Model Context Protocol.

Special thanks to:
- [John Kershaw](https://github.com/JKershaw) for the original code-analyzer inspiration and architecture
- The [Model Context Protocol](https://modelcontextprotocol.io) team for making Claude integrations possible
- [Anthropic](https://anthropic.com) for Claude and the AI analysis capabilities

## Support

For issues, questions, or contributions:
- Open an issue on [GitHub](https://github.com/jonthebeef/code-analyzer-mcp/issues)
- Check the [troubleshooting guide](#troubleshooting) above
- Review the MCP documentation at [modelcontextprotocol.io](https://modelcontextprotocol.io)
- See the original code-analyzer project at [github.com/JKershaw/code-analyzer](https://github.com/JKershaw/code-analyzer)