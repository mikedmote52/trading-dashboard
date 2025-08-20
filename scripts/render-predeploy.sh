#!/bin/bash
# Render pre-deploy script - Initialize database schema
echo "🗃️ Initializing database schema..."
node scripts/init_db.js
echo "✅ Database schema ready"
