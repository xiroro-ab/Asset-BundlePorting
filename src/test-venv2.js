import { execSync } from 'child_process';
try {
  console.log(execSync('python3 -m venv venv 2>&1', { stdio: 'pipe' }).toString());
  console.log(execSync('./venv/bin/pip install unitypy 2>&1', { stdio: 'pipe' }).toString());
} catch (e) {
  console.log('Error output:', e.stdout ? e.stdout.toString() : e.message);
}
