import { execSync } from 'child_process';
try {
  console.log(execSync('apt-get update && apt-get install -y python3-pip').toString());
} catch (e) {
  console.log('Error:', e.message);
}
