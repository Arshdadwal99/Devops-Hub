#!/usr/bin/env node

/**
 * DevOps Hub - Complete Startup Script
 * Starts both backend and frontend with monitoring
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

console.log('\n' + '='.repeat(70));
console.log('🚀 DevOps Hub - Complete Startup Script');
console.log('='.repeat(70) + '\n');

// Check prerequisites
console.log('📋 Checking prerequisites...\n');

const checks = [];

// Check backend
const backendPath = path.join(projectRoot, 'backend');
const backendEnv = path.join(backendPath, '.env');
if (fs.existsSync(backendEnv)) {
  checks.push({ name: 'Backend .env', status: '✅' });
} else {
  checks.push({ name: 'Backend .env', status: '❌' });
}

if (fs.existsSync(path.join(backendPath, 'package.json'))) {
  checks.push({ name: 'Backend package.json', status: '✅' });
}

// Check frontend
const frontendPath = path.join(projectRoot, 'frontend');
const frontendEnv = path.join(frontendPath, '.env');
if (fs.existsSync(frontendEnv)) {
  checks.push({ name: 'Frontend .env', status: '✅' });
}

if (fs.existsSync(path.join(frontendPath, 'package.json'))) {
  checks.push({ name: 'Frontend package.json', status: '✅' });
}

checks.forEach(check => {
  console.log(`${check.status} ${check.name}`);
});

console.log('\n' + '='.repeat(70));
console.log('🔧 Starting Services\n');

let backendReady = false;
let frontendReady = false;

// Start Backend
console.log('📦 Starting Backend...');
const backend = spawn('npm', ['start'], {
  cwd: backendPath,
  stdio: 'pipe',
  shell: true
});

backend.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(`[Backend] ${output}`);
  if (output.includes('Server running') || output.includes('port 5000')) {
    backendReady = true;
  }
});

backend.stderr.on('data', (data) => {
  console.log(`[Backend Error] ${data.toString()}`);
});

// Start Frontend
console.log('📱 Starting Frontend...');
const frontend = spawn('npm', ['run', 'dev'], {
  cwd: frontendPath,
  stdio: 'pipe',
  shell: true
});

frontend.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(`[Frontend] ${output}`);
  if (output.includes('Local:') || output.includes('http://')) {
    frontendReady = true;
  }
});

frontend.stderr.on('data', (data) => {
  console.log(`[Frontend Error] ${data.toString()}`);
});

// Startup complete message
setTimeout(() => {
  console.log('\n' + '='.repeat(70));
  console.log('✅ DevOps Hub is Starting!\n');
  console.log('📊 Access Points:');
  console.log('   - Backend API: http://localhost:5000');
  console.log('   - Frontend: http://localhost:5173');
  console.log('   - Dashboard: http://localhost:5173/dashboard\n');
  console.log('📖 Documentation:');
  console.log('   - Quick Start: FULLY_AUTOMATED_QUICK_START.md');
  console.log('   - Setup Guide: AWS_EC2_AUTOMATED_SETUP.md');
  console.log('   - Full Reference: FULLY_AUTOMATED_DEPLOYMENT.md\n');
  console.log('⌨️  Press Ctrl+C to stop all services\n');
  console.log('='.repeat(70) + '\n');
}, 3000);

// Handle exit
process.on('SIGINT', () => {
  console.log('\n\n🛑 Stopping services...\n');
  backend.kill();
  frontend.kill();
  console.log('✅ All services stopped\n');
  process.exit(0);
});
