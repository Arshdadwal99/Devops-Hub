#!/usr/bin/env node

/**
 * DevOps Hub - Interactive Setup Assistant
 * Guides you through completing the setup
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => {
  return new Promise(resolve => rl.question(prompt, resolve));
};

console.log('\n🚀 DevOps Hub - Interactive Setup Assistant\n');
console.log('=' .repeat(70));
console.log('This will help you configure AWS EC2 automated deployment\n');

const runSetup = async () => {
  try {
    // Check current .env
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');

    // 1. EC2 Host
    console.log('\n🌐 AWS EC2 Configuration');
    console.log('-'.repeat(70));
    console.log('First, you need your AWS EC2 instance IP address');
    console.log('Example: 13.201.45.22\n');

    const currentHost = envContent.split('AWS_EC2_HOST=')[1]?.split('\n')[0]?.trim();
    console.log(`Current AWS_EC2_HOST: ${currentHost || 'Not set'}\n`);

    const ec2Host = await question('Enter your EC2 public IP address: ');
    if (ec2Host) {
      if (envContent.includes('AWS_EC2_HOST=')) {
        envContent = envContent.replace(
          /AWS_EC2_HOST=.*/,
          `AWS_EC2_HOST=${ec2Host}`
        );
      } else {
        envContent += `\nAWS_EC2_HOST=${ec2Host}`;
      }
      console.log('✅ EC2 host updated\n');
    }

    // 2. EC2 User
    const ec2User = await question('Enter EC2 username (default: ubuntu): ');
    const userToSave = ec2User || 'ubuntu';
    if (envContent.includes('AWS_EC2_USER=')) {
      envContent = envContent.replace(
        /AWS_EC2_USER=.*/,
        `AWS_EC2_USER=${userToSave}`
      );
    } else {
      envContent += `\nAWS_EC2_USER=${userToSave}`;
    }
    console.log(`✅ EC2 user set to: ${userToSave}\n`);

    // 3. SSH Key Path
    console.log('🔐 SSH Key Configuration');
    console.log('-'.repeat(70));
    console.log('Example paths:');
    console.log('  Windows: C:\\Users\\Username\\.ssh\\key.pem');
    console.log('  Mac/Linux: /Users/username/.ssh/key.pem\n');

    const sshKeyPath = await question('Enter full path to SSH private key (.pem): ');
    if (sshKeyPath) {
      if (fs.existsSync(sshKeyPath)) {
        console.log('✅ SSH key found at path\n');
      } else {
        console.log('⚠️  Warning: SSH key not found at this path');
        console.log('   Make sure the path is correct before starting deployment\n');
      }

      if (envContent.includes('AWS_EC2_KEY_PATH=')) {
        envContent = envContent.replace(
          /AWS_EC2_KEY_PATH=.*/,
          `AWS_EC2_KEY_PATH=${sshKeyPath}`
        );
      } else {
        envContent += `\nAWS_EC2_KEY_PATH=${sshKeyPath}`;
      }
      console.log('✅ SSH key path updated\n');
    }

    // 4. Webhook Mode
    console.log('🔗 Webhook Deployment Mode');
    console.log('-'.repeat(70));
    console.log('Your deployment mode is already set to: fully-automated\n');

    // 5. GitHub Token
    console.log('🐙 GitHub Configuration');
    console.log('-'.repeat(70));
    const currentToken = envContent.split('GITHUB_TOKEN=')[1]?.split('\n')[0]?.trim();
    console.log(`Current GITHUB_TOKEN: ${currentToken ? '***' + currentToken.substring(currentToken.length - 5) : 'Not set'}\n`);

    const updateToken = await question('Update GitHub token? (y/n): ');
    if (updateToken.toLowerCase() === 'y') {
      const ghToken = await question('Enter GitHub personal access token: ');
      if (ghToken) {
        envContent = envContent.replace(
          /GITHUB_TOKEN=.*/,
          `GITHUB_TOKEN=${ghToken}`
        );
        console.log('✅ GitHub token updated\n');
      }
    }

    // Save .env
    console.log('💾 Saving configuration...');
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Configuration saved\n');

    // 6. Summary & Next Steps
    console.log('=' .repeat(70));
    console.log('\n✨ Setup Complete!\n');
    console.log('📋 Summary of Configuration:');
    console.log(`   - EC2 Host: ${ec2Host || currentHost}`);
    console.log(`   - EC2 User: ${userToSave}`);
    console.log(`   - SSH Key: ${sshKeyPath || 'configured'}`);
    console.log(`   - Mode: Fully Automated`);

    console.log('\n📝 Next Steps:');
    console.log('   1. Start backend: npm start');
    console.log('   2. Add GitHub webhook to your repo:');
    console.log('      - Go to: github.com/YOUR_REPO/settings/webhooks');
    console.log('      - Payload URL: https://your-domain/api/webhooks/github');
    console.log('      - Events: Push');
    console.log('   3. Push code to trigger automated deployment');
    console.log('   4. Check dashboard: http://localhost:5173/dashboard');

    console.log('\n🚀 Ready to deploy automatically!\n');
    console.log('=' .repeat(70));

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
};

runSetup();
