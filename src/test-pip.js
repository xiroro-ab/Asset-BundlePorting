import { execSync } from 'child_process';
try {
  console.log(execSync('pip3 install --user unitypy').toString());
} catch (e) {
  console.log('Error installing UnityPy:', e.message);
  console.log('Stderr:', e.stderr ? e.stderr.toString() : '');
}
