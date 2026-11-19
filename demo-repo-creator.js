/**
 * Helper script to create or reset a sample Git repository with rich commit history,
 * multiple branches, and merge commits for testing GitChain Live.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const targetDir = path.resolve(__dirname, 'demo_git_repo');

console.log(`Setting up demo Git repository in: ${targetDir}`);

if (fs.existsSync(targetDir)) {
  fs.rmSync(targetDir, { recursive: true, force: true });
}

fs.mkdirSync(targetDir, { recursive: true });

function run(cmd) {
  return execSync(cmd, { cwd: targetDir, stdio: 'inherit' });
}

try {
  run('git init -b main');
  run('git config user.name "Alice Dev"');
  run('git config user.email "alice@example.com"');

  // Initial commit
  fs.writeFileSync(path.join(targetDir, 'README.md'), '# Microservices Core\nInitial system architecture.\n');
  run('git add README.md');
  run('git commit -m "initial: initialize microservices core project"');

  // Second commit
  fs.writeFileSync(path.join(targetDir, 'package.json'), '{\n  "name": "core-api",\n  "version": "1.0.0"\n}\n');
  run('git add package.json');
  run('git commit -m "feat(config): add project configuration and dependencies"');
  run('git tag v1.0.0');

  // Set up a bare local remote to simulate "origin"
  const remoteDir = path.resolve(__dirname, 'demo_git_repo_remote.git');
  if (fs.existsSync(remoteDir)) {
    fs.rmSync(remoteDir, { recursive: true, force: true });
  }
  fs.mkdirSync(remoteDir, { recursive: true });
  execSync('git init --bare', { cwd: remoteDir, stdio: 'ignore' });
  run(`git remote add origin "${remoteDir.replace(/\\/g, '/')}"`);
  run('git push -u origin main');

  // Feature branch: auth
  run('git checkout -b feature/jwt-auth');
  run('git config user.name "Bob Security"');
  run('git config user.email "bob@example.com"');
  fs.writeFileSync(path.join(targetDir, 'auth.js'), '// JWT Auth module\nexports.verifyToken = (token) => true;\n');
  run('git add auth.js');
  run('git commit -m "feat(auth): add JWT signature verification"');

  fs.appendFileSync(path.join(targetDir, 'auth.js'), 'exports.refreshToken = () => "new_token";\n');
  run('git add auth.js');
  run('git commit -m "feat(auth): implement refresh token rotation mechanism"');

  // Feature branch: payment
  run('git checkout -b feature/stripe-billing');
  fs.writeFileSync(path.join(targetDir, 'billing.js'), '// Stripe billing adapter\nexports.charge = (amount) => true;\n');
  run('git add billing.js');
  run('git commit -m "feat(billing): create stripe payment gateway integration"');

  // Back to main
  run('git checkout main');
  run('git config user.name "Alice Dev"');
  run('git config user.email "alice@example.com"');
  fs.appendFileSync(path.join(targetDir, 'README.md'), '\n## Security Guidelines\nFollow zero-trust principles.\n');
  run('git add README.md');
  run('git commit -m "docs: add security guidelines to readme"');

  // Merge feature/jwt-auth into main
  run('git merge feature/jwt-auth -m "merge: integrate JWT auth module into main" --no-ff');

  // Make an unpushed commit on main
  fs.writeFileSync(path.join(targetDir, 'metrics.js'), '// Prometheus metrics\nexports.counter = 0;\n');
  run('git add metrics.js');
  run('git commit -m "feat(observability): add prometheus metrics collector"');

  // Switch to feature/stripe-billing as current working branch
  run('git checkout feature/stripe-billing');

  console.log('\n✅ Demo repository created successfully with:');
  console.log('   - 3 branches (main, feature/jwt-auth, feature/stripe-billing)');
  console.log('   - 1 merge commit');
  console.log('   - 1 tag (v1.0.0)');
  console.log('   - Multiple authors & commits');
} catch (err) {
  console.error('Error generating demo repo:', err.message);
}
