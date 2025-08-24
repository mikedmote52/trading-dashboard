#!/usr/bin/env bash
set -euo pipefail

# Ban any direct invocations except our helper files
echo "🔍 Checking for direct screener invocations outside singleton..."

# Use grep instead of rg if rg is not available
if command -v rg >/dev/null 2>&1; then
  # Use ripgrep - look for actual spawn calls, not comments or env vars
  if rg -n --glob '!**/node_modules/**' --glob '!**/dist/**' \
    -S "spawn.*universe_screener_v2\.py|exec.*universe_screener_v2\.py" server \
    | rg -v "runScreener(\.ts|\.js)|screenerSingleton(\.ts|\.js)" -q; then
    echo "❌ Found direct screener spawn calls outside singleton"
    rg -n --glob '!**/node_modules/**' --glob '!**/dist/**' \
      -S "spawn.*universe_screener_v2\.py|exec.*universe_screener_v2\.py" server \
      | rg -v "runScreener(\.ts|\.js)|screenerSingleton(\.ts|\.js)"
    exit 1
  fi
else
  # Fallback to grep
  if grep -r -n "spawn.*universe_screener_v2\.py\|exec.*universe_screener_v2\.py" server \
    --exclude-dir=node_modules --exclude-dir=dist \
    | grep -v "runScreener\|screenerSingleton" -q; then
    echo "❌ Found direct screener spawn calls outside singleton"
    grep -r -n "spawn.*universe_screener_v2\.py\|exec.*universe_screener_v2\.py" server \
      --exclude-dir=node_modules --exclude-dir=dist \
      | grep -v "runScreener\|screenerSingleton"
    exit 1
  fi
fi

echo "✅ Singleton-only screener usage verified"