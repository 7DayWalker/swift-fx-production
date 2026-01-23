#!/usr/bin/env node
/**
 * Post-install script to initialize a Git repository
 * Required for EAS CLI to function properly
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const frontendDir = path.resolve(__dirname, '..');
const gitDir = path.join(frontendDir, '.git');

// Check if .git already exists
if (fs.existsSync(gitDir)) {
  console.log('[init-git] Git repository already exists');
  process.exit(0);
}

console.log('[init-git] Initializing Git repository for EAS CLI...');

try {
  // Initialize git
  execSync('git init', { cwd: frontendDir, stdio: 'inherit' });
  
  // Configure git
  execSync('git config user.email "build@swiftfx.app"', { cwd: frontendDir, stdio: 'inherit' });
  execSync('git config user.name "SwiftFX Build"', { cwd: frontendDir, stdio: 'inherit' });
  
  // Create initial commit with just package.json to be fast
  execSync('git add package.json', { cwd: frontendDir, stdio: 'inherit' });
  execSync('git commit -m "Initial commit for EAS" --allow-empty', { cwd: frontendDir, stdio: 'inherit' });
  
  console.log('[init-git] Git repository initialized successfully');
} catch (error) {
  console.error('[init-git] Warning: Could not initialize git:', error.message);
  // Don't fail the build, just warn
  process.exit(0);
}
