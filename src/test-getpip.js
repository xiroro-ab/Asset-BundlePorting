import { execSync } from 'child_process';
try {
  console.log(execSync('curl -sSL https://bootstrap.pypa.io/get-pip.py -o get-pip.py 2>&1').toString());
  console.log(execSync('python3 get-pip.py --user 2>&1').toString());
  console.log(execSync('python3 -m pip install --user unitypy 2>&1').toString());
} catch (e) {
  console.log('Error output:', e.stdout ? e.stdout.toString() : e.message);
}
