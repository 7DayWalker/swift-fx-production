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

console.log('[init-git] Checking for Git repository...');

// Check if .git already exists
if (fs.existsSync(gitDir)) {
  console.log('[init-git] Git repository already exists');
  process.exit(0);
}

console.log('[init-git] Initializing Git repository for EAS CLI...');

try {
  // Initialize git
  execSync('git init', { cwd: frontendDir, stdio: 'pipe' });
  console.log('[init-git] Git initialized');
  
  // Configure git
  execSync('git config user.email "build@swiftfx.app"', { cwd: frontendDir, stdio: 'pipe' });
  execSync('git config user.name "SwiftFX Build"', { cwd: frontendDir, stdio: 'pipe' });
  console.log('[init-git] Git configured');
  
  // Create empty initial commit (fastest option)
  execSync('git commit --allow-empty -m "Initial commit for EAS"', { cwd: frontendDir, stdio: 'pipe' });
  console.log('[init-git] Initial commit created');
  
  console.log('[init-git] Git repository initialized successfully');
  process.exit(0);
} catch (error) {
  // If git fails, try to create a minimal .git structure manually
  console.log('[init-git] Git command failed, creating minimal .git structure...');
  try {
    fs.mkdirSync(gitDir, { recursive: true });
    fs.mkdirSync(path.join(gitDir, 'refs', 'heads'), { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(gitDir, 'config'), `[core]
    repositoryformatversion = 0
    filemode = true
    bare = false
[user]
    email = build@swiftfx.app
    name = SwiftFX Build
`);
    // Create an empty refs/heads/main
    fs.writeFileSync(path.join(gitDir, 'refs', 'heads', 'main'), '0000000000000000000000000000000000000000\n');
    console.log('[init-git] Minimal .git structure created');
    process.exit(0);
  } catch (fallbackError) {
    console.error('[init-git] Warning: Could not create .git:', fallbackError.message);
    process.exit(0); // Don't fail the build
  }
}
