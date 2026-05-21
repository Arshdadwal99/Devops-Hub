#!/usr/bin/env node

/**
 * DevOps Hub - Setup Verification Script
 * Checks if the system is properly configured for automated deployment
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('\n🔍 DevOps Hub - Setup Verification\n');
console.log('=' .repeat(60));

let passed = 0;
let failed = 0;
let warnings = 0;

// Helper functions
const checkStatus = (condition, task, message = '') => {
  if (condition) {
    console.log(`✅ ${task}`);
    passed++;
  } else {
    console.log(`❌ ${task}${message ? ` - ${message}` : ''}`);
    failed++;
  }
};

const checkWarning = (condition, task, message = '') => {
  if (!condition) {
    console.log(`⚠️  ${task}${message ? ` - ${message}` : ''}`);
    warnings++;
  }
};

// 1. Check Backend Structure
console.log('\n📁 Backend Structure');
console.log('-'.repeat(60));

const requiredFiles = [
  'src/server.js',
  'src/services/techStackDetectorService.js',
  'src/services/dockerfileGeneratorService.js',
  'src/services/dockerComposeGeneratorService.js',
  'src/services/jenkinsfileGeneratorService.js',
  'src/services/healthCheckService.js',
  'src/services/ec2AutomatedDeploymentService.js',
  'src/services/deploymentOrchestrationService.js',
  'src/routes/automationRoutes.js',
  'package.json',
  '.env'
];

requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  checkStatus(fs.existsSync(filePath), `${file} exists`);
});

// 2. Check .env Configuration
console.log('\n⚙️  Environment Configuration');
console.log('-'.repeat(60));

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

const requiredEnvVars = [
  'PORT',
  'MONGODB_URI',
  'JWT_SECRET',
  'GITHUB_TOKEN',
  'GITHUB_WEBHOOK_SECRET'
];

const automatedDeploymentVars = [
  'WEBHOOK_DEPLOYMENT_MODE',
  'AWS_EC2_HOST',
  'AWS_EC2_USER',
  'AWS_EC2_KEY_PATH'
];

requiredEnvVars.forEach(envVar => {
  const hasVar = envContent.includes(`${envVar}=`) && !envContent.includes(`${envVar}=`);
  checkStatus(
    envContent.includes(`${envVar}=`) && envContent.split(`${envVar}=`)[1].trim(),
    `${envVar} configured`,
    hasVar ? '' : 'not set or empty'
  );
});

console.log('\n🚀 Automated Deployment Configuration:');
automatedDeploymentVars.forEach(envVar => {
  const hasVar = envContent.includes(`${envVar}=`);
  const value = envContent.split(`${envVar}=`)[1]?.split('\n')[0]?.trim();
  
  if (hasVar && value && !value.includes('your-') && value.length > 0) {
    checkStatus(true, `${envVar} configured`, `= ${value.substring(0, 30)}...`);
  } else {
    checkStatus(false, `${envVar} configured`, 'needs setup for AWS EC2');
  }
});

// 3. Check package.json
console.log('\n📦 Dependencies');
console.log('-'.repeat(60));

const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const requiredDeps = [
  'express',
  'mongoose',
  'dotenv',
  'jsonwebtoken',
  'socket.io',
  'axios'
];

requiredDeps.forEach(dep => {
  checkStatus(
    packageJson.dependencies[dep] !== undefined,
    `${dep} installed`
  );
});

// 4. Check Server Integration
console.log('\n🔌 Server Integration');
console.log('-'.repeat(60));

const serverPath = path.join(__dirname, 'src/server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

checkStatus(
  serverContent.includes('automationRoutes'),
  'automationRoutes imported'
);

checkStatus(
  serverContent.includes('/api/automation'),
  'automation routes registered'
);

checkStatus(
  serverContent.includes('verifyToken'),
  'authentication middleware applied'
);

// 5. Check Webhook Integration
console.log('\n🔗 Webhook Integration');
console.log('-'.repeat(60));

const webhookPath = path.join(__dirname, 'src/services/webhookService.js');
const webhookContent = fs.readFileSync(webhookPath, 'utf8');

checkStatus(
  webhookContent.includes('deploymentOrchestrationService'),
  'orchestration service imported'
);

checkStatus(
  webhookContent.includes('fully-automated'),
  'fully-automated mode supported'
);

// 6. Check AWS EC2 Configuration
console.log('\n☁️  AWS EC2 Configuration');
console.log('-'.repeat(60));

const ec2Vars = ['AWS_EC2_HOST', 'AWS_EC2_USER', 'AWS_EC2_KEY_PATH'];
const ec2Configured = ec2Vars.every(v => {
  const val = envContent.split(`${v}=`)[1]?.split('\n')[0]?.trim();
  return val && !val.includes('your-');
});

if (ec2Configured) {
  checkStatus(true, 'AWS EC2 configured', 'Ready for deployment');
} else {
  checkWarning(
    false,
    'AWS EC2 not fully configured',
    'Needed for automated deployment'
  );
}

// 7. Check SSH Key
console.log('\n🔐 SSH Key');
console.log('-'.repeat(60));

const keyPath = envContent.split('AWS_EC2_KEY_PATH=')[1]?.split('\n')[0]?.trim();
if (keyPath) {
  checkStatus(
    fs.existsSync(keyPath),
    `SSH key exists at ${keyPath}`
  );
} else {
  checkWarning(false, 'SSH key path not configured');
}

// 8. Summary
console.log('\n' + '='.repeat(60));
console.log(`\n📊 Verification Summary`);
console.log(`✅ Passed: ${passed}`);
if (failed > 0) console.log(`❌ Failed: ${failed}`);
if (warnings > 0) console.log(`⚠️  Warnings: ${warnings}`);

// Recommendations
console.log('\n' + '='.repeat(60));
console.log('\n📋 Recommendations:\n');

if (failed > 0) {
  console.log('❌ Critical Issues Found:');
  console.log('   - Fix missing files or environment variables');
  console.log('   - See documentation for setup instructions');
}

if (!ec2Configured) {
  console.log('\n🚀 To Enable Automated Deployment:');
  console.log('   1. Update AWS_EC2_HOST in .env');
  console.log('   2. Set AWS_EC2_USER (usually "ubuntu")');
  console.log('   3. Set AWS_EC2_KEY_PATH to your SSH key');
  console.log('   4. Run: npm start');
  console.log('   5. Add GitHub webhooks to your repos');
}

if (passed === requiredFiles.length + requiredEnvVars.length + requiredDeps.length + 5) {
  console.log('\n✨ All checks passed! System is ready to use.');
}

console.log('\n' + '='.repeat(60) + '\n');

// Exit with appropriate code
process.exit(failed > 0 ? 1 : 0);
