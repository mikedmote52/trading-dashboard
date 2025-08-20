#!/usr/bin/env bash
# AlphaStack Preflight — end-to-end readiness check for tomorrow's trading
# Usage: ./alpha-preflight.sh [--base http://localhost:3003] [--test-order SPY]
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3003}"
TEST_ORDER="${1:-}"
for arg in "$@"; do
  case "$arg" in
    --base) shift; BASE="$1";;
    --base=*) BASE="${arg#*=}";;
    --test-order) shift; TEST_ORDER="$1";;
    --test-order=*) TEST_ORDER="${arg#*=}";;
  esac
done

# ---- helpers ---------------------------------------------------------
JQ_OK=1; command -v jq >/dev/null || JQ_OK=0
GREEN="$(tput setaf 2 2>/dev/null || true)"; RED="$(tput setaf 1 2>/dev/null || true)"
YEL="$(tput setaf 3 2>/dev/null || true)"; CYAN="$(tput setaf 6 2>/dev/null || true)"
BOLD="$(tput bold 2>/dev/null || true)"; RESET="$(tput sgr0 2>/dev/null || true)"

say() { printf "%s\n" "$*"; }
ok()  { printf "%s✔ %s%s\n" "$GREEN" "$*" "$RESET"; }
warn(){ printf "%s⚠ %s%s\n" "$YEL" "$*" "$RESET"; }
fail(){ printf "%s✖ %s%s\n" "$RED" "$*" "$RESET"; exit 1; }
hdr(){ printf "\n%s%s— %s —%s\n" "$BOLD" "$CYAN" "$1" "$RESET"; }

get() { curl -fsS "$1"; }
post() { curl -fsS -X POST -H "Content-Type: application/json" -d "$2" "$1"; }

# ---- 0) service ping -------------------------------------------------
hdr "0) Service ping"
get "$BASE/api/scan/status" >/dev/null && ok "Server reachable at $BASE" || fail "Server not reachable: $BASE"

# ---- 1) kick scan ----------------------------------------------------
hdr "1) Kick fresh scan"
get "$BASE/api/scan/today?refresh=1" >/dev/null && ok "Scan triggered" || fail "Failed to trigger scan"
sleep 2

# ---- 2) status sanity ------------------------------------------------
hdr "2) Scan status"
STATUS_JSON="$(get "$BASE/api/scan/status")" || fail "Cannot fetch /api/scan/status"
if (( JQ_OK )); then
  echo "$STATUS_JSON" | jq '{relaxation_active, gateCounts, current_thresholds, polygon}'
else
  say "$STATUS_JSON"
fi

RELAX="$(echo "$STATUS_JSON" | jq -r '.relaxation_active' 2>/dev/null || echo "unknown")"
TR="$(echo "$STATUS_JSON" | jq -r '.gateCounts.s1_momentum_tradeReady // 0' 2>/dev/null || echo 0)"
ER="$(echo "$STATUS_JSON" | jq -r '.gateCounts.s1_momentum_earlyReady // 0' 2>/dev/null || echo 0)"
POLY="$(echo "$STATUS_JSON" | jq -r '.polygon // "unknown"' 2>/dev/null || echo "unknown")"

[ "$POLY" = "ok" ] && ok "Polygon: ok" || warn "Polygon status: $POLY"
ok "Momentum tiers — TradeReady: $TR • EarlyReady: $ER"
[ "$RELAX" = "true" ] && warn "Cold Tape ACTIVE (scores capped ≤ 74)" || ok "Cold Tape OFF"

# ---- 3) results shape ------------------------------------------------
hdr "3) Results"
RESULTS_JSON="$(get "$BASE/api/scan/results")" || fail "Cannot fetch /api/scan/results"
LEN="$(echo "$RESULTS_JSON" | (jq 'length' 2>/dev/null || echo 0))"
[ "$LEN" -gt 0 ] && ok "Got $LEN candidates" || warn "No candidates returned"

# quick field check on first item
if (( JQ_OK )) && [ "$LEN" -gt 0 ]; then
  echo "$RESULTS_JSON" | jq '.[0] | {symbol, price, score, readiness_tier, relVol, aboveVWAP, bumps, high_priority, relaxationActive, score_breakdown}'
  # assert required fields exist
  for f in symbol price score readiness_tier relVol aboveVWAP; do
    VAL="$(echo "$RESULTS_JSON" | jq -r ".[0].$f" 2>/dev/null || echo "")"
    [ -n "$VAL" ] && : || fail "Missing field '$f' on first result"
  done
  ok "Result shape OK"
fi

# ---- 4) tier counts (client side) -----------------------------------
if (( JQ_OK )) && [ "$LEN" -gt 0 ]; then
  hdr "4) Tier counts"
  echo "$RESULTS_JSON" | jq 'group_by(.readiness_tier) | map({tier: .[0].readiness_tier, n: length})'
fi

# ---- 5) portfolio smoke ---------------------------------------------
hdr "5) Portfolio endpoint"
PORT="$(get "$BASE/api/dashboard" 2>/dev/null || echo "{}")"
if (( JQ_OK )); then 
  PLEN="$(echo "$PORT" | jq '.portfolio | length' 2>/dev/null || echo 0)"
  echo "{\"portfolio_positions\": $PLEN}"
fi
ok "Portfolio endpoint reachable"

# ---- 6) optional test order (paper safe) ----------------------------
if [ -n "$TEST_ORDER" ]; then
  hdr "6) Test order (paper)"
  # use discovery buy endpoint with realistic price
  BODY=$(cat <<JSON
{"symbol":"$TEST_ORDER","price":50,"stopLossPercent":10,"takeProfitPercent":15}
JSON
)
  ORDER_RESP=$(post "$BASE/api/discoveries/buy100" "$BODY" 2>&1) \
    && ok "Order POST ok for $TEST_ORDER (buy100 endpoint)" \
    || warn "Order POST failed: $ORDER_RESP"
  sleep 1
  get "$BASE/api/dashboard" >/dev/null && ok "Dashboard refreshed" || warn "Dashboard refresh failed"
else
  warn "Skipping test order (run with: ./alpha-preflight.sh --test-order SPY)"
fi

hdr "✅ Preflight complete"
[ "$RELAX" = "true" ] && say "Note: Cold Tape is active. Expect Watch-only seeds until momentum returns."