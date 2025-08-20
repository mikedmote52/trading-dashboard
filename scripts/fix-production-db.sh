#!/bin/bash
# Fix Production Database Issues
# Ensures discoveries_vigl table exists on production

set -e

echo "🔧 PRODUCTION DATABASE FIX"
echo "=========================="

# Add database initialization to startup
echo "📋 Step 1: Adding database initialization to render start command..."

# Create a pre-deploy script that initializes the database
cat > scripts/render-predeploy.sh << 'EOF'
#!/bin/bash
# Render pre-deploy script - Initialize database schema
echo "🗃️ Initializing database schema..."
node scripts/init_db.js
echo "✅ Database schema ready"
EOF

chmod +x scripts/render-predeploy.sh

echo "✅ Pre-deploy script created"

# Update render.yaml to include database initialization
echo "📋 Step 2: Updating render.yaml with database initialization..."

# Replace the startCommand to include db init
sed -i '' 's/startCommand: npm run render:start/startCommand: node scripts\/init_db.js \&\& npm run render:start/' render.yaml

echo "✅ Render start command updated"

# Commit the fix
echo "📋 Step 3: Deploying database fix..."
git add scripts/render-predeploy.sh render.yaml
git commit -m "fix: ensure discoveries_vigl table exists on production startup

- Add database schema initialization to render start command  
- Create pre-deploy script for schema setup
- Resolves 'no such table: discoveries_vigl' errors
- Critical fix for production stability

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

git push

echo "🚀 DATABASE FIX DEPLOYED"
echo ""
echo "Next Steps:"
echo "1. Wait ~2 minutes for Render deployment"
echo "2. Test: https://trading-dashboard-dvou.onrender.com/api/discoveries/latest-scores" 
echo "3. Verify: No more 'discoveries_vigl' errors in logs"
echo "4. Proceed with go-live when database is stable"