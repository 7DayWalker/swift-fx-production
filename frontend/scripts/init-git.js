#!/usr/bin/env node
/**
 * Post-install script to initialize Git and EAS project state
 * Required for EAS CLI to function properly during deployment
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const frontendDir = path.resolve(__dirname, '..');
const gitDir = path.join(frontendDir, '.git');
const expoDir = path.join(frontendDir, '.expo');

console.log('[init-git] Initializing project for EAS deployment...');

// Step 1: Initialize Git repository
if (!fs.existsSync(gitDir)) {
  console.log('[init-git] Creating Git repository...');
  try {
    execSync('git init', { cwd: frontendDir, stdio: 'pipe' });
    execSync('git config user.email "build@swiftfx.app"', { cwd: frontendDir, stdio: 'pipe' });
    execSync('git config user.name "SwiftFX Build"', { cwd: frontendDir, stdio: 'pipe' });
    execSync('git commit --allow-empty -m "Initial commit for EAS"', { cwd: frontendDir, stdio: 'pipe' });
    console.log('[init-git] Git repository created');
  } catch (error) {
    console.log('[init-git] Git init failed, creating minimal structure...');
    fs.mkdirSync(gitDir, { recursive: true });
    fs.mkdirSync(path.join(gitDir, 'refs', 'heads'), { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(gitDir, 'config'), '[core]\n\trepositoryformatversion = 0\n');
    fs.writeFileSync(path.join(gitDir, 'refs', 'heads', 'main'), '0000000000000000000000000000000000000000\n');
  }
} else {
  console.log('[init-git] Git repository already exists');
}

// Step 2: Create .expo directory with project state
console.log('[init-git] Setting up Expo project state...');
fs.mkdirSync(expoDir, { recursive: true });

// Create settings.json
const settingsPath = path.join(expoDir, 'settings.json');
if (!fs.existsSync(settingsPath)) {
  fs.writeFileSync(settingsPath, JSON.stringify({
    hostType: "lan",
    lanType: "ip",
    dev: true,
    minify: false,
    urlRandomness: null,
    https: false,
    scheme: null,
    devClient: false
  }, null, 2));
}

// Create devices.json
const devicesPath = path.join(expoDir, 'devices.json');
if (!fs.existsSync(devicesPath)) {
  fs.writeFileSync(devicesPath, JSON.stringify({ devices: [] }, null, 2));
}

// Create README.md to indicate EAS is configured
const readmePath = path.join(expoDir, 'README.md');
fs.writeFileSync(readmePath, '# Expo\n\nThis project is configured for EAS deployment.\nOTA updates are disabled.\n');

console.log('[init-git] Expo project state configured');
console.log('[init-git] Initialization complete');
process.exit(0);
