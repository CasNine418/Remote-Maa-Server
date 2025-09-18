const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Building TypeScript project...');

try {
  execSync('tsc', { stdio: 'inherit' });
  console.log('TypeScript compilation completed successfully.');

  const distPath = path.join(__dirname, 'dist');
  if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath);
  }
  
  console.log('Build process completed.');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}