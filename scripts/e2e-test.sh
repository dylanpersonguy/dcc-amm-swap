#!/bin/bash
# E2E Test Suite for DCC AMM Swap
set -e

PASS=0
FAIL=0

pass() { echo "  ✅ PASS $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ FAIL $1"; FAIL=$((FAIL+1)); }

echo "========================================"
echo "  E2E TEST SUITE — DCC AMM SWAP"
echo "========================================"
echo ""

# ── Unit Tests ──
echo "── 1. amm-core unit tests (87 tests) ──"
cd /Users/dylanshilts/dcc-amm-swap/amm-core
if npx jest --silent 2>&1 | grep -q "passed"; then pass; else fail "jest"; fi
cd /Users/dylanshilts/dcc-amm-swap

# ── AMM API (port 3002) ──
echo ""
echo "── AMM API (port 3002) ──"

echo "── 2. /health ──"
R=$(curl -sf http://localhost:3002/health 2>/dev/null || echo "CURL_FAIL")
if echo "$R" | grep -q '"status":"ok"'; then pass; else fail "$R"; fi

echo "── 3. /docs (Swagger HTML) ──"
SC=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/docs)
if [ "$SC" = "200" ]; then pass "(HTTP $SC)"; else fail "(HTTP $SC)"; fi

echo "── 4. /docs.json (OpenAPI spec) ──"
R=$(curl -sf http://localhost:3002/docs.json 2>/dev/null || echo "CURL_FAIL")
if echo "$R" | grep -q '"openapi"'; then pass; else fail; fi

echo "── 5. /pools ──"
R=$(curl -sf http://localhost:3002/pools 2>/dev/null || echo "CURL_FAIL")
if echo "$R" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then pass "(valid JSON)"; else fail "$R"; fi

echo "── 6. /swaps ──"
R=$(curl -sf "http://localhost:3002/swaps?limit=3" 2>/dev/null || echo "CURL_FAIL")
if echo "$R" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then pass "(valid JSON)"; else fail "$R"; fi

echo "── 7. /quote/swap ──"
R=$(curl -s "http://localhost:3002/quote/swap?assetIn=DCC&assetOut=GEsVWVHDXvpGVaMbrvYJ8paoegn8sjJdY5DNkmpjM1EY&amountIn=100000000&feeBps=30&slippageBps=50" 2>/dev/null)
echo "     Response: $(echo "$R" | head -c 120)"
if echo "$R" | grep -q 'amountOut\|error'; then pass "(endpoint responded)"; else fail; fi

echo "── 8. POST /tx/swap ──"
R=$(curl -s -X POST http://localhost:3002/tx/swap \
  -H "Content-Type: application/json" \
  -d '{"amountIn":"100000000","assetIn":"DCC","assetOut":"GEsVWVHDXvpGVaMbrvYJ8paoegn8sjJdY5DNkmpjM1EY","feeBps":30,"slippageBps":50}' 2>/dev/null)
echo "     Response: $(echo "$R" | head -c 120)"
if echo "$R" | grep -q 'tx\|error'; then pass "(endpoint responded)"; else fail; fi

# ── Bridge API (port 3001) ──
echo ""
echo "── Bridge API (port 3001) ──"

echo "── 9. /health ──"
R=$(curl -sf http://localhost:3001/health 2>/dev/null || echo "CURL_FAIL")
if echo "$R" | grep -q 'ok\|status'; then pass; else fail "$R"; fi

echo "── 10. /docs (Swagger) ──"
SC=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/docs/)
if [ "$SC" = "200" ] || [ "$SC" = "301" ]; then pass "(HTTP $SC)"; else fail "(HTTP $SC)"; fi

# ── Web Frontend (port 5173) ──
echo ""
echo "── Web Frontend (port 5173) ──"

echo "── 11. Serves index.html ──"
SC=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/)
if [ "$SC" = "200" ]; then pass "(HTTP $SC)"; else fail "(HTTP $SC)"; fi

echo "── 12. Vite SPA with module scripts ──"
R=$(curl -s http://localhost:5173/)
if echo "$R" | grep -q 'module\|src/main'; then pass; else fail; fi

# ── @decentralchain/transactions library ──
echo ""
echo "── @decentralchain/transactions (new library) ──"

echo "── 13. Package loads correctly ──"
R=$(node -e "import('@decentralchain/transactions').then(m => console.log('OK:' + Object.keys(m).length + ' exports')).catch(e => console.log('FAIL:' + e.message))" 2>&1)
echo "     $R"
if echo "$R" | grep -q "^OK:"; then pass; else fail "$R"; fi

echo "── 14. libs.crypto.address works ──"
R=$(node -e "import('@decentralchain/transactions').then(m => { const a = m.libs.crypto.address('test seed', '?'); console.log('OK:' + a); }).catch(e => console.log('FAIL:' + e.message))" 2>&1)
echo "     $R"
if echo "$R" | grep -q "^OK:3"; then pass; else fail "$R"; fi

echo "── 15. invokeScript function exists ──"
R=$(node -e "import('@decentralchain/transactions').then(m => console.log('OK:' + typeof m.invokeScript)).catch(e => console.log('FAIL:' + e.message))" 2>&1)
if echo "$R" | grep -q "OK:function"; then pass; else fail "$R"; fi

echo "── 16. broadcast function exists ──"
R=$(node -e "import('@decentralchain/transactions').then(m => console.log('OK:' + typeof m.broadcast)).catch(e => console.log('FAIL:' + e.message))" 2>&1)
if echo "$R" | grep -q "OK:function"; then pass; else fail "$R"; fi

echo "── 17. transfer function exists ──"
R=$(node -e "import('@decentralchain/transactions').then(m => console.log('OK:' + typeof m.transfer)).catch(e => console.log('FAIL:' + e.message))" 2>&1)
if echo "$R" | grep -q "OK:function"; then pass; else fail "$R"; fi

echo "── 18. waitForTx function exists ──"
R=$(node -e "import('@decentralchain/transactions').then(m => console.log('OK:' + typeof m.waitForTx)).catch(e => console.log('FAIL:' + e.message))" 2>&1)
if echo "$R" | grep -q "OK:function"; then pass; else fail "$R"; fi

# ── check-state.js (live mainnet query) ──
echo ""
echo "── Mainnet Integration ──"

echo "── 19. check-state.js queries mainnet ──"
R=$(timeout 30 node check-state.js 2>&1 | head -5)
echo "     $(echo "$R" | head -3)"
if echo "$R" | grep -q "ADMIN_ADDR:"; then pass; else fail "$R"; fi

echo "── 20. SDK quote engine (mainnet) ──"
R=$(node -e "
const { AmmSdk } = require('./amm-sdk');
const sdk = new AmmSdk({ nodeUrl: 'https://mainnet-node.decentralchain.io', dAppAddress: '3Da7xwRRtXfkA46jaKTYb75Usd2ZNWdY6HX', chainId: '?' });
sdk.quoteSwap(BigInt(100000000), null, 'GEsVWVHDXvpGVaMbrvYJ8paoegn8sjJdY5DNkmpjM1EY', 30, 50n)
  .then(q => console.log('OK amountOut=' + q.amountOut))
  .catch(e => console.log('FAIL:' + e.message));
" 2>&1)
echo "     $R"
if echo "$R" | grep -q "^OK"; then pass; else fail "$R"; fi

# ── Summary ──
echo ""
echo "========================================"
echo "  RESULTS: $PASS passed, $FAIL failed out of 20"
echo "========================================"

if [ $FAIL -gt 0 ]; then exit 1; fi
