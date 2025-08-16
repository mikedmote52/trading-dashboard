const { execSync } = require('child_process');
const label = process.argv[2] || 'manual';
process.env.SCREENER_LABEL = label;

console.log(`🔄 Running AlphaStack screener: ${label}`);

try {
  execSync('python3 agents/screener_worker.py', { 
    stdio: 'inherit',
    env: { ...process.env, SCREENER_LABEL: label }
  });
  console.log(`✅ Screener completed: ${label}`);
} catch (error) {
  console.error(`❌ Screener failed: ${error.message}`);
  process.exit(1);
}
