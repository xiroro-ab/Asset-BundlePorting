import { execSync } from 'child_process';
try {
  console.log(execSync('python3 -m pip install --user unitypy').toString());
} catch (e) {
  console.log('Error installing UnityPy:', e.message);
  console.log('Stderr:', e.stderr ? e.stderr.toString() : '');
}
