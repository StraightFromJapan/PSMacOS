const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function tryKill(name) {
  try {
    // Use taskkill on Windows to force-stop by image name
    execSync(`taskkill /IM ${name} /F`, { stdio: 'ignore' });
    console.log(`Stopped process: ${name}`);
  } catch (e) {
    // ignore errors (process may not exist)
  }
}

function removeDir(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      // fs.rm with recursive option (Node 14+)
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`Removed directory: ${dirPath}`);
    } else {
      console.log(`Directory not found (skipping): ${dirPath}`);
    }
  } catch (e) {
    console.warn(`Could not remove ${dirPath}:`, e && e.message ? e.message : e);
  }
}

function main() {
  // Only useful on Windows, but safe to run elsewhere (taskkill will fail silently)
  console.log('Running prebuild cleanup: attempting to stop common locker processes and remove build-artifacts...');

  // Common process names that may lock app.asar during packaging
  const processes = ['electron.exe', 'app-builder.exe', 'electron', 'app-builder'];
  processes.forEach(tryKill);

  // Remove the default output directory
  const projectRoot = path.resolve(__dirname, '..');
  const outDir = path.join(projectRoot, 'build-artifacts');
  removeDir(outDir);

  // Also try the old 'dist' just in case
  removeDir(path.join(projectRoot, 'dist'));

  console.log('Prebuild cleanup finished.');
}

main();
