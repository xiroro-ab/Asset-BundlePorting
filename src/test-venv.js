import { execSync } from 'child_process';
try {
  console.log(execSync('python3 -m venv venv && ./venv/bin/pip install unitypy').toString());
} catch (e) {
  console.log('Error:', e.message);
  console.log('Stderr:', e.stderr ? e.stderr.toString() : '');
}
