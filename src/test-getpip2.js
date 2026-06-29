import { execSync } from 'child_process';
try {
  console.log(execSync('python3 get-pip.py --user --break-system-packages 2>&1').toString());
  console.log(execSync('python3 -m pip install --user --break-system-packages unitypy 2>&1').toString());
} catch (e) {
  console.log('Error output:', e.stdout ? e.stdout.toString() : e.message);
}
