import { generateDockerfile } from "./dockerfileGeneratorService.js";
import { generateJenkinsfile } from "./jenkinsfileGeneratorService.js";
import { TECH_STACKS } from "./techStackDetectorService.js";

/**
 * Config Generator Service
 * Generates Dockerfile and Jenkinsfile for GitHub repositories
 * Uses analysis results to determine optimal configuration
 */

/**
 * Map technologies to TECH_STACKS constant
 */
function mapTechToStack(technologies, frameworks) {
  // Priority order for detection
  if (frameworks.includes("Next.js")) return TECH_STACKS.NEXTJS;
  if (frameworks.includes("Express")) return TECH_STACKS.NODE_JS;
  if (technologies.includes("Next.js")) return TECH_STACKS.NEXTJS;
  if (frameworks.includes("React")) return TECH_STACKS.REACT;
  if (technologies.includes("React")) return TECH_STACKS.REACT;
  if (frameworks.includes("Django")) return TECH_STACKS.DJANGO;
  if (frameworks.includes("Flask")) return TECH_STACKS.FLASK;
  if (frameworks.includes("FastAPI")) return TECH_STACKS.FASTAPI;
  if (technologies.includes("Django")) return TECH_STACKS.DJANGO;
  if (technologies.includes("Flask")) return TECH_STACKS.FLASK;
  if (frameworks.includes("Spring Boot")) return TECH_STACKS.JAVA;
  if (technologies.includes("Java")) return TECH_STACKS.JAVA;
  if (technologies.includes("Go")) return TECH_STACKS.GO;
  if (technologies.includes("Ruby")) return TECH_STACKS.RUBY;
  if (technologies.includes("Python")) return TECH_STACKS.PYTHON;
  if (technologies.includes("Node.js")) return TECH_STACKS.NODE_JS;
  
  // Default
  return TECH_STACKS.NODE_JS;
}

/**
 * Generate configuration files based on repository analysis
 */
export async function generateConfiguration(owner, repo, analysis) {
  try {
    console.log(`🔧 [Config Gen] Generating configs for ${owner}/${repo}`);

    // Build detection object for generators
    const detection = {
      primaryStack: mapTechToStack(analysis.technologies, analysis.frameworks),
      technologies: analysis.technologies,
      frameworks: analysis.frameworks,
      hasPackageJson: analysis.detectedFiles.includes("package.json"),
      hasRequirements: analysis.detectedFiles.includes("requirements.txt"),
      hasPomXml: analysis.detectedFiles.includes("pom.xml"),
    };

    const containerPort = analysis.recommendedPort || 3000;
    const containerName = `${repo}-${owner}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");

    // Generate Dockerfile
    let dockerfile = null;
    let dockerfileStatus = "skipped";
    let dockerfileReason = null;

    if (!analysis.hasDocker) {
      try {
        console.log(`📦 [Config Gen] Generating Dockerfile for ${detection.primaryStack}`);
        const dockerResult = await generateDockerfile(detection, null, containerPort);
        if (dockerResult.success) {
          dockerfile = dockerResult.dockerfile;
          dockerfileStatus = "generated";
          console.log(`✅ [Config Gen] Dockerfile generated successfully`);
        } else {
          dockerfileStatus = "error";
          dockerfileReason = dockerResult.error || "Unknown error";
        }
      } catch (error) {
        console.warn(`⚠️ [Config Gen] Dockerfile generation failed:`, error.message);
        dockerfileStatus = "error";
        dockerfileReason = error.message;
      }
    } else {
      dockerfileReason = "Dockerfile already exists in repository";
    }

    // Generate Jenkinsfile
    let jenkinsfile = null;
    let jenkinsfileStatus = "skipped";
    let jenkinsfileReason = null;

    if (!analysis.hasJenkinsfile) {
      try {
        console.log(`🔄 [Config Gen] Generating Jenkinsfile for ${detection.primaryStack}`);
        const jenkinsResult = await generateJenkinsfile(
          detection,
          containerName,
          containerPort,
          repo
        );
        if (jenkinsResult.success) {
          jenkinsfile = jenkinsResult.jenkinsfile;
          jenkinsfileStatus = "generated";
          console.log(`✅ [Config Gen] Jenkinsfile generated successfully`);
        } else {
          jenkinsfileStatus = "error";
          jenkinsfileReason = jenkinsResult.error || "Unknown error";
        }
      } catch (error) {
        console.warn(`⚠️ [Config Gen] Jenkinsfile generation failed:`, error.message);
        jenkinsfileStatus = "error";
        jenkinsfileReason = error.message;
      }
    } else {
      jenkinsfileReason = "Jenkinsfile already exists in repository";
    }

    // Generate .dockerignore if Dockerfile was generated
    let dockerignore = null;
    if (dockerfile) {
      dockerignore = generateDockerignore();
    }

    // Generate .github/workflows/ci.yml for GitHub Actions if needed
    let githubActions = null;
    if (!analysis.hasGitHubActions && !analysis.hasJenkinsfile) {
      githubActions = generateGitHubActionsWorkflow(detection, containerPort);
    }

    const result = {
      success: true,
      owner,
      repo,
      containerName,
      containerPort,
      techStack: detection.primaryStack,
      configs: {
        dockerfile: {
          status: dockerfileStatus,
          content: dockerfile,
          reason: dockerfileReason,
          language: "dockerfile",
        },
        jenkinsfile: {
          status: jenkinsfileStatus,
          content: jenkinsfile,
          reason: jenkinsfileReason,
          language: "groovy",
        },
        dockerignore: {
          status: dockerfile ? "generated" : "skipped",
          content: dockerignore,
          reason: dockerfile ? null : "Generated only if Dockerfile is created",
          language: "text",
        },
        githubActions: {
          status: githubActions ? "generated" : "skipped",
          content: githubActions,
          reason: githubActions ? null : "GitHub Actions workflow not needed",
          language: "yaml",
        },
      },
    };

    console.log(`✅ [Config Gen] Configuration generation complete`);
    return result;
  } catch (error) {
    console.error("❌ [Config Gen] Error:", error.message);
    throw new Error(`Configuration generation failed: ${error.message}`);
  }
}

/**
 * Generate .dockerignore file
 */
function generateDockerignore() {
  return `# Git
.git
.gitignore
.gitattributes

# Node
node_modules
npm-debug.log
yarn-error.log
.npm
.eslintcache

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode
.idea
*.swp
*.swo
*~
.DS_Store
.directory

# Logs
logs
*.log

# Dependencies
pnpm-lock.yaml
package-lock.json
yarn.lock

# Build outputs
dist
build
.next
out

# Testing
coverage
.nyc_output
test-results

# Docker
.docker
Dockerfile.dev
docker-compose.dev.yml

# CI/CD
.github
.gitlab-ci.yml
.travis.yml
Jenkinsfile.dev

# Misc
README.md
LICENSE
.editorconfig
`;
}

/**
 * Generate GitHub Actions CI workflow
 */
function generateGitHubActionsWorkflow(detection, containerPort) {
  return `name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
        if: \${{ contains('${"Node.js,React,Next.js,Express,Vue.js,Angular"}', '${"${{ inputs.tech }}"}') }}

      - name: Install dependencies
        run: npm install --legacy-peer-deps
        if: \${{ contains('${"Node.js,React,Next.js,Express,Vue.js,Angular"}', '${"${{ inputs.tech }}"}') }}

      - name: Run linter
        run: npm run lint || true
        if: \${{ contains('${"Node.js,React,Next.js,Express,Vue.js,Angular"}', '${"${{ inputs.tech }}"}') }}

      - name: Build application
        run: npm run build || npm run dev || echo "No build script"
        if: \${{ contains('${"Node.js,React,Next.js,Express,Vue.js,Angular"}', '${"${{ inputs.tech }}"}') }}

      - name: Run tests
        run: npm test || npm run test || echo "No test script"
        if: \${{ contains('${"Node.js,React,Next.js,Express,Vue.js,Angular"}', '${"${{ inputs.tech }}"}') }}

      - name: Build Docker image
        run: docker build -t app:latest .

      - name: Push Docker image
        if: github.ref == 'refs/heads/main'
        run: |
          echo "Docker image ready for deployment"
`;
}

/**
 * Export configs as downloadable object
 */
export function formatConfigsForExport(configs) {
  const result = {};

  if (configs.dockerfile && configs.dockerfile.content) {
    result.Dockerfile = configs.dockerfile.content;
  }

  if (configs.jenkinsfile && configs.jenkinsfile.content) {
    result.Jenkinsfile = configs.jenkinsfile.content;
  }

  if (configs.dockerignore && configs.dockerignore.content) {
    result[".dockerignore"] = configs.dockerignore.content;
  }

  if (configs.githubActions && configs.githubActions.content) {
    result[".github/workflows/ci.yml"] = configs.githubActions.content;
  }

  return result;
}
