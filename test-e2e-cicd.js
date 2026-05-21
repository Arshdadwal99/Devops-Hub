#!/usr/bin/env node

/**
 * Complete End-to-End CI/CD System Test
 * 
 * This script tests the entire CI/CD automation pipeline:
 * GitHub Webhook → Jenkins Trigger → Docker Build → Deployment → Dashboard
 * 
 * Usage: node test-e2e-cicd.js
 */

import axios from 'axios';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Configuration
const CONFIG = {
  backendUrl: process.env.BACKEND_URL || 'http://localhost:5000',
  jenkinsUrl: process.env.JENKINS_URL || 'http://localhost:8080',
  jenkinsUser: process.env.JENKINS_USER || 'admin',
  jenkinsToken: process.env.JENKINS_TOKEN || '',
  githubRepo: process.env.GITHUB_REPO || 'devops-hub',
  authToken: process.env.AUTH_TOKEN || 'test-token',
};

// Color output helper
const log = {
  section: (msg) => console.log(chalk.bgBlue.white.bold(` ${msg} `)),
  success: (msg) => console.log(chalk.green(`✅ ${msg}`)),
  error: (msg) => console.log(chalk.red(`❌ ${msg}`)),
  info: (msg) => console.log(chalk.blue(`ℹ️  ${msg}`)),
  warn: (msg) => console.log(chalk.yellow(`⚠️  ${msg}`)),
  test: (msg) => console.log(chalk.cyan(`🧪 ${msg}`)),
};

// API client
const api = axios.create({
  baseURL: CONFIG.backendUrl,
  headers: {
    'Authorization': `Bearer ${CONFIG.authToken}`,
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Test results
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: [],
};

// Helper to track test result
function recordTest(name, passed, message = '') {
  const testResult = { name, passed, message };
  results.tests.push(testResult);
  
  if (passed) {
    results.passed++;
    log.success(name);
  } else {
    results.failed++;
    log.error(`${name}: ${message}`);
  }
}

// Test functions
async function testHealthCheck() {
  log.section('1. Health Check');
  
  try {
    const response = await api.get('/api/health');
    const dbConnected = response.data.dbConnected;
    
    recordTest(
      'Backend health check',
      response.data.ok,
      'Backend not responding'
    );
    
    if (!dbConnected) {
      log.warn('Database not connected');
    } else {
      log.success('Database connected');
    }
  } catch (error) {
    recordTest('Backend health check', false, error.message);
  }
}

async function testWebhookEndpoint() {
  log.section('2. Webhook System');
  
  try {
    // Prepare webhook payload
    const webhookPayload = {
      event: 'push',
      action: 'opened',
      repository: {
        id: 123456,
        name: CONFIG.githubRepo,
        fullName: `user/${CONFIG.githubRepo}`,
        private: false,
        url: `https://github.com/user/${CONFIG.githubRepo}`,
        cloneUrl: `https://github.com/user/${CONFIG.githubRepo}.git`,
      },
      branch: 'main',
      commit: {
        id: 'abc123def456',
        sha: 'abc123def456',
        message: 'Test CI/CD pipeline',
        timestamp: new Date().toISOString(),
        url: 'https://github.com/user/repo/commit/abc123',
        author: {
          name: 'Test User',
          email: 'test@example.com',
          username: 'testuser',
        },
      },
      pusher: {
        name: 'Test User',
        email: 'test@example.com',
      },
    };

    // Send webhook
    const response = await api.post('/api/webhook', webhookPayload);
    
    recordTest(
      'Webhook reception',
      response.data.success || response.status === 200,
      'Webhook not received properly'
    );

    if (response.data.webhookId) {
      log.info(`Webhook ID: ${response.data.webhookId}`);
    }
  } catch (error) {
    recordTest('Webhook reception', false, error.message);
  }
}

async function testJenkinsTrigger() {
  log.section('3. Jenkins Integration');
  
  if (!CONFIG.jenkinsToken) {
    log.warn('JENKINS_TOKEN not set, skipping Jenkins trigger test');
    return;
  }

  try {
    const response = await api.post('/api/jenkins/trigger', {
      repository: CONFIG.githubRepo,
      commit: 'test-commit-sha',
      branch: 'main',
      environment: 'production',
    });

    recordTest(
      'Jenkins trigger',
      response.data.success || response.data.buildNumber,
      'Jenkins trigger failed'
    );

    if (response.data.buildNumber) {
      log.info(`Build number: ${response.data.buildNumber}`);
    }
  } catch (error) {
    recordTest('Jenkins trigger', false, error.message);
  }
}

async function testPipelineStatus() {
  log.section('4. Pipeline Status');
  
  try {
    const response = await api.get('/api/jenkins/pipeline/status');
    
    recordTest(
      'Pipeline status fetch',
      response.data && response.data.status,
      'Could not fetch pipeline status'
    );

    if (response.data) {
      log.info(`Pipeline status: ${response.data.status}`);
      if (response.data.buildNumber) {
        log.info(`Latest build: #${response.data.buildNumber}`);
      }
    }
  } catch (error) {
    recordTest('Pipeline status fetch', false, error.message);
  }
}

async function testDeploymentAPIs() {
  log.section('5. Deployment APIs');
  
  try {
    // Test GET deployments
    const getResponse = await api.get('/api/deployments');
    recordTest(
      'GET /api/deployments',
      Array.isArray(getResponse.data.deployments || getResponse.data),
      'Could not fetch deployments'
    );

    if (getResponse.data.deployments) {
      log.info(`Total deployments: ${getResponse.data.deployments.length}`);
    }

    // Test deployment history
    const historyResponse = await api.get('/api/deployments?limit=5');
    recordTest(
      'Deployment history fetch',
      Array.isArray(historyResponse.data.deployments || historyResponse.data),
      'Could not fetch deployment history'
    );
  } catch (error) {
    recordTest('Deployment APIs', false, error.message);
  }
}

async function testDockerAPIs() {
  log.section('6. Docker Monitoring');
  
  try {
    // Test containers endpoint
    const response = await api.get('/api/docker/containers');
    
    recordTest(
      'GET /api/docker/containers',
      response.data && response.data.containers !== undefined,
      'Could not fetch containers'
    );

    if (response.data && response.data.containers) {
      log.info(`Running containers: ${response.data.containers.length}`);
      response.data.containers.slice(0, 3).forEach(container => {
        const name = container.Names?.[0] || container.Name || 'Unknown';
        log.info(`  - ${name} (${container.State})`);
      });
    }
  } catch (error) {
    recordTest('Docker APIs', false, error.message);
  }
}

async function testMetricsAPI() {
  log.section('7. Metrics System');
  
  try {
    const response = await api.get('/api/metrics');
    
    const hasMetrics = response.data && (
      response.data.cpu !== undefined ||
      response.data.metrics?.cpu !== undefined
    );

    recordTest(
      'GET /api/metrics',
      hasMetrics,
      'Could not fetch metrics'
    );

    if (response.data) {
      const metrics = response.data.metrics || response.data;
      if (metrics.cpu !== undefined) {
        log.info(`CPU: ${metrics.cpu}%`);
        log.info(`Memory: ${metrics.memory}%`);
      }
    }
  } catch (error) {
    recordTest('Metrics API', false, error.message);
  }
}

async function testLogsAPI() {
  log.section('8. Logs System');
  
  try {
    // Test logs fetch
    const response = await api.get('/api/logs?limit=10');
    
    recordTest(
      'GET /api/logs',
      response.data && Array.isArray(response.data.logs),
      'Could not fetch logs'
    );

    if (response.data && response.data.logs) {
      log.info(`Total logs: ${response.data.total}`);
      log.info(`Retrieved: ${response.data.logs.length}`);
      
      if (response.data.logs.length > 0) {
        log.info('Sample logs:');
        response.data.logs.slice(0, 3).forEach(log => {
          console.log(`  [${log.source}] ${log.message}`);
        });
      }
    }
  } catch (error) {
    recordTest('Logs API', false, error.message);
  }
}

async function testAlertsAPI() {
  log.section('9. Alerts System');
  
  try {
    // Test alerts fetch
    const response = await api.get('/api/alerts?limit=10');
    
    recordTest(
      'GET /api/alerts',
      response.data && Array.isArray(response.data.alerts),
      'Could not fetch alerts'
    );

    if (response.data && response.data.alerts) {
      log.info(`Active alerts: ${response.data.alerts.filter(a => !a.resolved).length}`);
      log.info(`Total alerts: ${response.data.total}`);
    }
  } catch (error) {
    recordTest('Alerts API', false, error.message);
  }
}

async function testAIAnalysisAPI() {
  log.section('10. AI Log Analysis');
  
  try {
    const sampleLogs = `[INFO] Build started
[INFO] Compiling sources...
[ERROR] Failed to compile: syntax error on line 42
[ERROR] Cannot find module 'express'
[WARN] Missing dependency
[INFO] Build failed`;

    const response = await api.post('/api/analyze-logs', {
      logs: sampleLogs,
      pipelineId: 'test-pipeline',
    });

    recordTest(
      'POST /api/analyze-logs',
      response.data && response.data.errors_detected !== undefined,
      'AI analysis failed'
    );

    if (response.data) {
      log.info(`Errors detected: ${response.data.errors_detected?.length || 0}`);
      log.info(`Warnings detected: ${response.data.warnings_detected?.length || 0}`);
      if (response.data.suggested_fixes?.length > 0) {
        log.info('Suggested fixes available');
      }
    }
  } catch (error) {
    recordTest('AI Analysis API', false, error.message);
  }
}

async function testDashboardData() {
  log.section('11. Dashboard Integration');
  
  try {
    const response = await api.get('/api/dashboard');
    
    const hasDashboardData = response.data && (
      response.data.metrics ||
      response.data.pipeline ||
      response.data.status
    );

    recordTest(
      'GET /api/dashboard',
      hasDashboardData,
      'Could not fetch dashboard data'
    );

    if (response.data) {
      if (response.data.status) {
        log.info(`Dashboard status: ${response.data.status}`);
      }
      if (response.data.metrics) {
        log.info('Dashboard metrics available');
      }
      if (response.data.pipeline) {
        log.info('Pipeline data available');
      }
    }
  } catch (error) {
    recordTest('Dashboard Integration', false, error.message);
  }
}

async function testBuildHistoryFetch() {
  log.section('12. Build History');
  
  try {
    const response = await api.get('/api/jenkins/builds?limit=5');
    
    recordTest(
      'GET /api/jenkins/builds',
      response.data && Array.isArray(response.data.builds || response.data),
      'Could not fetch build history'
    );

    if (response.data && response.data.builds) {
      log.info(`Total builds: ${response.data.builds.length}`);
      response.data.builds.slice(0, 3).forEach(build => {
        console.log(`  Build #${build.buildNumber}: ${build.status}`);
      });
    }
  } catch (error) {
    recordTest('Build History', false, error.message);
  }
}

async function testDockerCommandExecution() {
  log.section('13. Docker Command Execution');
  
  try {
    // Test if docker is available
    const { stdout } = await execAsync('docker --version');
    
    recordTest(
      'Docker availability',
      true,
      ''
    );
    
    log.info(`Docker: ${stdout.trim()}`);

    // List containers
    const { stdout: containers } = await execAsync('docker ps -a --format "{{json .}}" | wc -l');
    log.info(`Total containers: ${parseInt(containers) || 0}`);
  } catch (error) {
    recordTest('Docker Command Execution', false, 'Docker not available or not installed');
  }
}

async function testJenkinsConnection() {
  log.section('14. Jenkins Connection');
  
  if (!CONFIG.jenkinsToken) {
    log.warn('JENKINS_TOKEN not set, skipping Jenkins connection test');
    results.warnings++;
    return;
  }

  try {
    const jenkins = axios.create({
      baseURL: CONFIG.jenkinsUrl,
      auth: {
        username: CONFIG.jenkinsUser,
        password: CONFIG.jenkinsToken,
      },
      timeout: 5000,
    });

    const response = await jenkins.get('/api/json');
    
    recordTest(
      'Jenkins connection',
      response.status === 200,
      'Could not connect to Jenkins'
    );

    log.info(`Jenkins version: ${response.data.version || 'Unknown'}`);
  } catch (error) {
    recordTest('Jenkins Connection', false, error.message);
  }
}

async function testMongoDBConnection() {
  log.section('15. Database Connection');
  
  try {
    // Try to fetch a collection
    const response = await api.get('/api/logs?limit=1');
    
    recordTest(
      'MongoDB connection',
      response.data && response.data.logs !== undefined,
      'Could not connect to MongoDB'
    );

    log.info('MongoDB is accessible');
  } catch (error) {
    recordTest('MongoDB Connection', false, error.message);
  }
}

// Main test execution
async function runAllTests() {
  console.log('\n' + chalk.bgCyan.white.bold(' 🚀 CI/CD System End-to-End Tests '));
  console.log(chalk.cyan('═'.repeat(50)) + '\n');

  try {
    // Run all tests
    await testHealthCheck();
    await testWebhookEndpoint();
    await testJenkinsTrigger();
    await testPipelineStatus();
    await testDeploymentAPIs();
    await testDockerAPIs();
    await testMetricsAPI();
    await testLogsAPI();
    await testAlertsAPI();
    await testAIAnalysisAPI();
    await testDashboardData();
    await testBuildHistoryFetch();
    await testDockerCommandExecution();
    await testJenkinsConnection();
    await testMongoDBConnection();
  } catch (error) {
    log.error(`Unexpected error: ${error.message}`);
  }

  // Print summary
  console.log('\n' + chalk.cyan('═'.repeat(50)));
  console.log(chalk.bgGreen.white.bold(' TEST SUMMARY '));
  console.log(chalk.cyan('═'.repeat(50)) + '\n');

  console.log(chalk.green(`✅ Passed: ${results.passed}`));
  console.log(chalk.red(`❌ Failed: ${results.failed}`));
  if (results.warnings > 0) {
    console.log(chalk.yellow(`⚠️  Warnings: ${results.warnings}`));
  }

  const total = results.passed + results.failed;
  const percentage = total > 0 ? Math.round((results.passed / total) * 100) : 0;

  console.log(chalk.white(`\nTotal: ${results.passed}/${total} (${percentage}%)\n`));

  // Print detailed results if any failed
  if (results.failed > 0) {
    console.log(chalk.bgRed.white.bold(' FAILED TESTS '));
    console.log(chalk.cyan('─'.repeat(50)) + '\n');
    
    results.tests
      .filter(t => !t.passed)
      .forEach(t => {
        console.log(chalk.red(`❌ ${t.name}`));
        if (t.message) {
          console.log(chalk.gray(`   ${t.message}`));
        }
      });
    console.log();
  }

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  log.error(`Test execution failed: ${error.message}`);
  process.exit(1);
});
