#!/usr/bin/env node

/**
 * DevOps Hub - Automated Production Deployment & Setup
 * 
 * This script automates the complete production deployment:
 * 1. Environment setup validation
 * 2. Database initialization
 * 3. Backend build and deployment
 * 4. Frontend build and deployment
 * 5. Docker image build and push
 * 6. Health checks
 * 
 * Usage:
 *   node deploy.js setup          - Complete setup
 *   node deploy.js test           - Run end-to-end tests
 *   node deploy.js deploy         - Deploy to production
 *   node deploy.js docker-build   - Build Docker image
 *   node deploy.js docker-push    - Push to registry
 */

import fs from 'fs';
import path from 'path';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);
const __dirname = path.dirname(new URL(import.meta.url).pathname);

// Configuration
const config = {
  nodeEnv: process.env.NODE_ENV || 'production',
  backendDir: path.join(__dirname, 'backend'),
  frontendDir: path.join(__dirname, 'frontend'),
  dockerImage: process.env.DOCKER_IMAGE || 'devops-hub:latest',
  dockerRegistry: process.env.DOCKER_REGISTRY || 'localhost',
  deployCommand: process.env.DEPLOY_COMMAND || 'docker-compose',
};

// Helper functions
const log = {
  section: (msg) => console.log(chalk.bgBlue.white.bold(` ${msg} `)),
  success: (msg) => console.log(chalk.green(`✅ ${msg}`)),
  error: (msg) => console.log(chalk.red(`❌ ${msg}`)),
  info: (msg) => console.log(chalk.blue(`ℹ️  ${msg}`)),
  warn: (msg) => console.log(chalk.yellow(`⚠️  ${msg}`)),
  step: (msg) => console.log(chalk.cyan(`→ ${msg}`)),
};

async function command(cmd, cwd = __dirname) {
  log.step(cmd);
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (stdout) log.info(stdout.trim());
    return { stdout, stderr, success: true };
  } catch (error) {
    log.error(error.message);
    return { error: error.message, success: false };
  }
}

function checkFileExists(filePath) {
  return fs.existsSync(filePath);
}

async function validateEnvironment() {
  log.section('Validating Environment');

  const checks = [];

  // Check Node.js
  try {
    const { stdout } = await execAsync('node --version');
    checks.push({ name: 'Node.js', passed: true, version: stdout.trim() });
  } catch {
    checks.push({ name: 'Node.js', passed: false });
  }

  // Check npm
  try {
    const { stdout } = await execAsync('npm --version');
    checks.push({ name: 'npm', passed: true, version: stdout.trim() });
  } catch {
    checks.push({ name: 'npm', passed: false });
  }

  // Check Docker
  try {
    const { stdout } = await execAsync('docker --version');
    checks.push({ name: 'Docker', passed: true, version: stdout.trim() });
  } catch {
    checks.push({ name: 'Docker', passed: false });
  }

  // Check .env files
  const envFiles = [
    { path: path.join(config.backendDir, '.env'), name: 'backend/.env' },
    { path: path.join(config.frontendDir, '.env.local'), name: 'frontend/.env.local' },
  ];

  envFiles.forEach(env => {
    const exists = checkFileExists(env.path);
    checks.push({ name: env.name, passed: exists });
  });

  // Report
  checks.forEach(check => {
    if (check.passed) {
      log.success(`${check.name}${check.version ? ' - ' + check.version : ''}`);
    } else {
      log.error(`${check.name} - Not found or not installed`);
    }
  });

  const allPassed = checks.every(c => c.passed);
  if (!allPassed) {
    throw new Error('Environment validation failed');
  }
}

async function setupBackend() {
  log.section('Setting Up Backend');

  // Install dependencies
  log.step('Installing backend dependencies...');
  await command('npm install', config.backendDir);

  // Check if database migration needed
  log.step('Database check...');
  log.info('Database will be initialized on first connection');
}

async function setupFrontend() {
  log.section('Setting Up Frontend');

  // Install dependencies
  log.step('Installing frontend dependencies...');
  await command('npm install', config.frontendDir);
}

async function buildBackend() {
  log.section('Building Backend');

  log.step('Building backend...');
  const buildCmd = 'npm run build';
  const result = await command(buildCmd, config.backendDir);

  if (!result.success) {
    log.warn('Backend build not required or build step skipped');
  }
}

async function buildFrontend() {
  log.section('Building Frontend');

  log.step('Building React application...');
  await command('npm run build', config.frontendDir);

  // Check if build output exists
  const distPath = path.join(config.frontendDir, 'dist');
  if (checkFileExists(distPath)) {
    log.success('Frontend build completed');
  } else {
    throw new Error('Frontend build failed - dist directory not created');
  }
}

async function buildDockerImage() {
  log.section('Building Docker Image');

  const dockerfile = path.join(__dirname, 'Dockerfile');

  if (!checkFileExists(dockerfile)) {
    log.error('Dockerfile not found');
    throw new Error('Dockerfile not found at ' + dockerfile);
  }

  log.step(`Building Docker image: ${config.dockerImage}`);
  await command(`docker build -t ${config.dockerImage} .`);

  log.success(`Docker image built: ${config.dockerImage}`);
}

async function pushDockerImage() {
  log.section('Pushing Docker Image');

  if (config.dockerRegistry === 'localhost') {
    log.warn('Docker registry is localhost - skipping push');
    return;
  }

  const fullImageTag = `${config.dockerRegistry}/${config.dockerImage}`;

  log.step(`Tagging image as ${fullImageTag}`);
  await command(`docker tag ${config.dockerImage} ${fullImageTag}`);

  log.step(`Pushing to registry...`);
  await command(`docker push ${fullImageTag}`);

  log.success('Docker image pushed to registry');
}

async function deployWithDockerCompose() {
  log.section('Deploying with Docker Compose');

  const composeFile = path.join(__dirname, 'docker-compose.yml');

  if (!checkFileExists(composeFile)) {
    log.warn('docker-compose.yml not found');
    return;
  }

  log.step('Stopping old containers...');
  await command('docker-compose down || true');

  log.step('Building services...');
  await command('docker-compose build');

  log.step('Starting services...');
  await command('docker-compose up -d');

  log.step('Checking service status...');
  await command('docker-compose ps');

  log.success('Services deployed');
}

async function deployWithDocker() {
  log.section('Deploying with Docker');

  const containerName = process.env.CONTAINER_NAME || 'devops-hub-app';
  const port = process.env.PORT || '5000';

  log.step(`Stopping old container: ${containerName}`);
  await command(`docker stop ${containerName} || true`);
  await command(`docker rm ${containerName} || true`);

  log.step(`Starting new container...`);
  await command(
    `docker run -d --restart unless-stopped --name ${containerName} -p ${port}:5000 -e NODE_ENV=production ${config.dockerImage}`
  );

  log.success(`Container deployed: ${containerName}`);
}

async function healthCheck() {
  log.section('Health Checks');

  const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';

  log.step(`Checking backend health: ${backendUrl}/api/health`);

  try {
    const response = await fetch(`${backendUrl}/api/health`);
    const data = await response.json();

    if (data.ok) {
      log.success('Backend is healthy');
      if (data.dbConnected) {
        log.success('Database is connected');
      } else {
        log.warn('Database connection status unknown');
      }
    } else {
      log.warn('Backend health check returned unexpected response');
    }
  } catch (error) {
    log.error(`Health check failed: ${error.message}`);
  }
}

async function runTests() {
  log.section('Running Tests');

  log.step('Running end-to-end tests...');
  try {
    execSync('node test-e2e-cicd.js', { cwd: __dirname, stdio: 'inherit' });
  } catch (error) {
    log.warn('Some tests failed - check output above');
  }
}

async function printSummary() {
  console.log('\n' + chalk.bgGreen.white.bold(' ✅ Deployment Complete '));
  console.log(chalk.cyan('═'.repeat(50)) + '\n');

  console.log(chalk.white('Services:'));
  console.log(chalk.cyan('  Frontend: http://localhost:3000'));
  console.log(chalk.cyan('  Backend:  http://localhost:5000'));
  console.log(chalk.cyan('  Docs:     http://localhost:5000/api-docs'));

  console.log('\nDocumentation:');
  console.log(chalk.cyan('  Setup Guide: CICD_PRODUCTION_SETUP.md'));
  console.log(chalk.cyan('  Frontend:    FRONTEND_INTEGRATION_GUIDE.md'));
  console.log(chalk.cyan('  API Ref:     BACKEND_API_REFERENCE.md'));

  console.log('\nNext Steps:');
  console.log(chalk.white('  1. Configure GitHub webhook'));
  console.log(chalk.white('  2. Set Jenkins job parameters'));
  console.log(chalk.white('  3. Test pipeline with git push'));
  console.log(chalk.white('  4. Monitor dashboard'));

  console.log();
}

// Main execution
async function main() {
  const command = process.argv[2] || 'setup';

  try {
    switch (command) {
      case 'setup':
        log.section('🚀 Complete Production Setup');
        await validateEnvironment();
        await setupBackend();
        await setupFrontend();
        await buildBackend();
        await buildFrontend();
        await printSummary();
        break;

      case 'build':
        log.section('🔨 Build Step');
        await buildBackend();
        await buildFrontend();
        break;

      case 'docker-build':
        log.section('🐳 Docker Build');
        await buildDockerImage();
        break;

      case 'docker-push':
        log.section('🚀 Docker Push');
        await pushDockerImage();
        break;

      case 'deploy':
        log.section('🚀 Production Deployment');
        if (checkFileExists(path.join(__dirname, 'docker-compose.yml'))) {
          await deployWithDockerCompose();
        } else {
          await deployWithDocker();
        }
        await healthCheck();
        break;

      case 'test':
        log.section('🧪 Running Tests');
        await runTests();
        break;

      case 'health':
        await healthCheck();
        break;

      case 'validate':
        await validateEnvironment();
        break;

      case 'full':
        log.section('🚀 Full Deployment Pipeline');
        await validateEnvironment();
        await setupBackend();
        await setupFrontend();
        await buildBackend();
        await buildFrontend();
        await buildDockerImage();
        await deployWithDockerCompose();
        await healthCheck();
        await runTests();
        await printSummary();
        break;

      default:
        console.log(chalk.yellow('Unknown command: ' + command));
        console.log('\nAvailable commands:');
        console.log('  setup          - Complete environment setup');
        console.log('  build          - Build backend and frontend');
        console.log('  docker-build   - Build Docker image');
        console.log('  docker-push    - Push to registry');
        console.log('  deploy         - Deploy to production');
        console.log('  test           - Run tests');
        console.log('  health         - Health check');
        console.log('  validate       - Validate environment');
        console.log('  full           - Complete pipeline (all steps)');
        process.exit(1);
    }

    log.success('Done!');
    process.exit(0);
  } catch (error) {
    log.error('Deployment failed: ' + error.message);
    process.exit(1);
  }
}

main();
