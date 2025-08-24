#!/usr/bin/env bash
# CI guard to prevent legacy screener command logs from returning
set -euo pipefail

# Check for old-style direct screener command reconstruction logs
if grep -r "Running direct screener: python3" server/ --include="*.js" --include="*.ts" 2>/dev/null | grep -v "Running direct screener (singleton)" -q; then
  echo "❌ Legacy screener command log found - use singleton pattern only"
  exit 1
fi

echo "✅ No legacy screener command logs found"