import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { glob } from 'glob';

/**
 * Analyzes repository structure and characteristics.
 * Detects frameworks, file types, authentication patterns, and other structural elements.
 * 
 * @class RepoAnalyzer
 * @example
 * const analysis = await RepoAnalyzer.analyzeStructure('/path/to/repo', exclusionManager);
 * console.log(`Detected frameworks: ${analysis.frameworks.join(', ')}`);
 */
export class RepoAnalyzer {
  /**
   * Performs comprehensive analysis of repository structure.
   * 
   * @param {string} repoPath - Path to the repository to analyze
   * @param {ExclusionManager} [exclusionManager=null] - Manager for file exclusions
   * @returns {Promise<Object>} Analysis results containing frameworks, file counts, etc.
   * @throws {Error} If package.json is not found or invalid
   */
  static async analyzeStructure(repoPath, exclusionManager = null) {
    const packageJsonPath = join(repoPath, 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    
    return {
      hasAPI: await this.detectFrameworks(packageJson).length > 0 || await this.hasAPIRoutes(repoPath, exclusionManager),
      frameworks: await this.detectFrameworks(packageJson),
      fileCount: await this.countFileTypes(repoPath, exclusionManager),
      hasAuth: await this.detectAuthPatterns(repoPath, exclusionManager),
      entryPoints: await this.findEntryPoints(repoPath, packageJson),
      configFiles: await this.findConfigFiles(repoPath),
      packageJson,
      exclusionSummary: exclusionManager ? exclusionManager.getExclusionSummary() : null
    };
  }

  static detectFrameworks(packageJson) {
    const frameworks = [];
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    const frameworkMap = {
      'express': 'Express',
      'fastify': 'Fastify',
      'koa': 'Koa',
      'hapi': 'Hapi',
      'nest': 'NestJS',
      '@nestjs/core': 'NestJS',
      'next': 'Next.js',
      'react': 'React',
      'vue': 'Vue',
      'angular': 'Angular'
    };

    for (const [pkg, framework] of Object.entries(frameworkMap)) {
      if (deps[pkg]) {
        frameworks.push(framework);
      }
    }

    return frameworks;
  }

  static async hasAPIRoutes(repoPath, exclusionManager = null) {
    try {
      let globOptions = { 
        cwd: repoPath, 
        ignore: ['node_modules/**', 'dist/**', 'build/**'] 
      };
      
      if (exclusionManager) {
        globOptions.ignore = exclusionManager.getAllExclusions();
      }
      
      const jsFiles = await glob('**/*.{js,ts}', globOptions);

      for (const file of jsFiles.slice(0, 20)) { // Limit to avoid performance issues
        try {
          const content = readFileSync(join(repoPath, file), 'utf8');
          if (this.hasAPIPatterns(content)) {
            return true;
          }
        } catch (error) {
          // Skip files that can't be read
          continue;
        }
      }
    } catch (error) {
      // If glob fails, return false
    }
    
    return false;
  }

  static hasAPIPatterns(content) {
    const apiPatterns = [
      /app\.(get|post|put|delete|patch)/,
      /router\.(get|post|put|delete|patch)/,
      /fastify\.(get|post|put|delete|patch)/,
      /\.route\(/,
      /@(Get|Post|Put|Delete|Patch)\(/,
      /express\(\)/,
      /createServer/
    ];

    return apiPatterns.some(pattern => pattern.test(content));
  }

  static async countFileTypes(repoPath, exclusionManager = null) {
    const counts = { ts: 0, js: 0, test: 0, json: 0, md: 0 };
    
    try {
      let globOptions = { 
        cwd: repoPath, 
        ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**'],
        nodir: true
      };
      
      if (exclusionManager) {
        globOptions.ignore = exclusionManager.getAllExclusions();
      }
      
      const allFiles = await glob('**/*', globOptions);

      for (const file of allFiles) {
        const ext = extname(file).toLowerCase();
        const basename = file.toLowerCase();
        
        if (basename.includes('.test.') || basename.includes('.spec.')) {
          counts.test++;
        } else if (ext === '.ts') {
          counts.ts++;
        } else if (ext === '.js') {
          counts.js++;
        } else if (ext === '.json') {
          counts.json++;
        } else if (ext === '.md') {
          counts.md++;
        }
      }
    } catch (error) {
      // If glob fails, return zero counts
    }

    return counts;
  }

  static async detectAuthPatterns(repoPath, exclusionManager = null) {
    try {
      let globOptions = { 
        cwd: repoPath, 
        ignore: ['node_modules/**', 'dist/**', 'build/**'] 
      };
      
      if (exclusionManager) {
        globOptions.ignore = exclusionManager.getAllExclusions();
      }
      
      const jsFiles = await glob('**/*.{js,ts}', globOptions);

      const authPatterns = [
        /passport/i,
        /jwt/i,
        /authenticate/i,
        /authorization/i,
        /bearer/i,
        /oauth/i,
        /auth.*middleware/i,
        /req\.user/,
        /token.*verify/i,
        /login/i,
        /logout/i
      ];

      for (const file of jsFiles.slice(0, 30)) { // Limit search
        try {
          const content = readFileSync(join(repoPath, file), 'utf8');
          if (authPatterns.some(pattern => pattern.test(content))) {
            return true;
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      // If search fails, return false
    }

    return false;
  }

  static async findEntryPoints(repoPath, packageJson) {
    const entryPoints = [];
    
    // Check package.json main field
    if (packageJson.main) {
      entryPoints.push(packageJson.main);
    }

    // Check common entry point files
    const commonEntries = ['index.js', 'index.ts', 'app.js', 'app.ts', 'server.js', 'server.ts', 'src/index.js', 'src/index.ts', 'src/app.js', 'src/app.ts'];
    
    for (const entry of commonEntries) {
      if (existsSync(join(repoPath, entry)) && !entryPoints.includes(entry)) {
        entryPoints.push(entry);
      }
    }

    return entryPoints;
  }

  static async findConfigFiles(repoPath) {
    const configFiles = [];
    const commonConfigs = [
      'tsconfig.json',
      '.eslintrc.js',
      '.eslintrc.json',
      'prettier.config.js',
      '.prettierrc',
      'jest.config.js',
      'webpack.config.js',
      'vite.config.js',
      '.env',
      '.env.example',
      'docker-compose.yml',
      'Dockerfile'
    ];

    for (const config of commonConfigs) {
      if (existsSync(join(repoPath, config))) {
        configFiles.push(config);
      }
    }

    return configFiles;
  }
}