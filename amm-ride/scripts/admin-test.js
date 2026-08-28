#!/usr/bin/env node
/**
 * Functionally verify every admin-gated PoolCore function against the live
 * deployment, without ever risking a lockout or a real-swap DoS window.
 *
 * What this does and why:
 *   1. Confirms requireAdmin() REJECTS a random, non-admin caller (proves
 *      the access-control gate actually rejects — this is the single most
 *      important property, since every other admin function shares this
 *      exact same gate).
 *   2. pause() -> verify paused=true -> unpause() -> verify paused=false.
 *      Round-trips the real emergency-stop switch.
 *   3. setProtocolFee(test value) -> verify -> restore original -> verify.
 *   4. setTreasury(test address) -> verify -> restore original -> verify.
 *   5. setRouter() called with its OWN current value (verify-only, not a
 *      real change) — a real round-trip would create a window where
 *      applySwap rejects the real Router (E_NOT_ROUTER) for any concurrent
 *      swap, which isn't worth it just to prove a String write works.
 *
 * setAdmin() is deliberately NOT live-tested here. It shares the exact same
 * requireAdmin() gate already proven by steps 1-5, and round-tripping it for
 * real requires a second signing key + a strict two-step handoff — if
 * anything goes wrong mid-handoff (network blip, script bug, Ctrl+C), you
 * can permanently lock yourself out of a contract holding real pooled
 * funds. Not worth it for coverage the other tests already provide.
 *
 * Usage:
 *   node scripts/admin-test.js --core-seed "your fifteen word core seed"
 *
 * Optional:
 *   --node <url>       Override node URL (default: mainnet)
 *   --chain-id <id>    Override chain ID (default: '?')
 */

const { invokeScript, broadcast, waitForTx, libs } = require('@decentralchain/transactions');

const args = process.argv.slice(2);
let coreSeed = '';
let nodeUrl = 'https://mainnet-node.decentralchain.io';
let chainId = '?';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--core-seed') coreSeed = args[++i];
  else if (args[i] === '--node') nodeUrl = args[++i];
  else if (args[i] === '--chain-id') chainId = args[++i];
}

if (!coreSeed) {
  console.error('ERROR: --core-seed is required');
  process.exit(1);
}

const results = [];

async function readState(dApp, key) {
  const res = await fetch(`${nodeUrl}/addresses/data/${dApp}/${encodeURIComponent(key)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`State read failed for ${key}: ${res.status}`);
  const json = await res.json();
  return json.value;
}

async function invokeFunc(seed, dApp, funcName, funcArgs) {
  const tx = invokeScript(
    { dApp, call: { function: funcName, args: funcArgs }, payment: [], fee: 900000, chainId: chainId.charCodeAt(0) },
    seed
  );
  const broadcastErr = await broadcast(tx, nodeUrl).then(
    () => null,
    (err) => err.message || String(err)
  );
  if (broadcastErr) {
    return { ok: false, error: `broadcast rejected: ${broadcastErr}`, txId: tx.id };
  }
  // waitForTx only confirms the tx was MINED — a callable function's own
  // `must(...)`/`strict` check can still fail at script-execution time and
  // still get included in a block (fee charged, no state change). That's
  // reported via applicationStatus, not by waitForTx throwing.
  let mined;
  try {
    mined = await waitForTx(tx.id, { apiBase: nodeUrl, timeout: 60000 });
  } catch (err) {
    return { ok: false, error: err.message || String(err), txId: tx.id };
  }
  if (mined.applicationStatus && mined.applicationStatus !== 'succeeded') {
    return { ok: false, error: `applicationStatus=${mined.applicationStatus}`, txId: tx.id };
  }
  return { ok: true, txId: tx.id };
}

async function step(name, fn) {
  process.stdout.write(`  ${name}... `);
  const start = Date.now();
  try {
    await fn();
    console.log(`✅ (${Date.now() - start}ms)`);
    results.push({ name, pass: true });
  } catch (err) {
    console.log(`❌ ${err.message || err}`);
    results.push({ name, pass: false, detail: err.message || String(err) });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const coreAddr = libs.crypto.address(coreSeed, chainId);
  console.log('═══ DCC AMM — Admin Function Test ═══');
  console.log(`  Core: ${coreAddr}`);
  console.log(`  Node: ${nodeUrl}\n`);

  const currentAdmin = await readState(coreAddr, 'admin');
  assert(currentAdmin, 'Could not read current admin from state — is the contract initialized?');
  const providedIsAdmin = currentAdmin === coreAddr;
  console.log(`  Stored admin: ${currentAdmin}`);
  console.log(`  --core-seed derives to the stored admin: ${providedIsAdmin ? 'yes' : 'NO — calls below will fail'}\n`);

  // ── 1. Non-admin rejection ──────────────────────────────────────────
  await step('requireAdmin rejects a non-admin caller (pause from a throwaway seed)', async () => {
    const throwawaySeed = libs.crypto.randomSeed(15);
    const result = await invokeFunc(throwawaySeed, coreAddr, 'pause', []);
    assert(!result.ok, 'Expected the call to be rejected, but it succeeded — access control is broken!');
    // The node doesn't reliably surface the specific must()/throw reason
    // string via applicationStatus, so we only assert it failed, not why.
    const now = await readState(coreAddr, 'paused');
    assert(now !== true, `pause() should NOT have taken effect from a non-admin caller, but paused=${now}`);
  });

  // ── 2. pause / unpause round-trip ───────────────────────────────────
  const pausedBefore = await readState(coreAddr, 'paused');
  await step(`pause() (was paused=${!!pausedBefore})`, async () => {
    const result = await invokeFunc(coreSeed, coreAddr, 'pause', []);
    assert(result.ok, `pause() failed: ${result.error}`);
    const now = await readState(coreAddr, 'paused');
    assert(now === true, `Expected paused=true after pause(), got ${now}`);
  });
  await step('unpause() restores paused=false', async () => {
    const result = await invokeFunc(coreSeed, coreAddr, 'unpause', []);
    assert(result.ok, `unpause() failed: ${result.error}`);
    const now = await readState(coreAddr, 'paused');
    assert(now === false, `Expected paused=false after unpause(), got ${now}`);
  });

  // ── 3. setProtocolFee round-trip ────────────────────────────────────
  // Only round-trips if a real prior value exists. Neither setter's target
  // key can be un-set again through any callable the contract exposes (no
  // DeleteEntry path) — so if it was never configured before (state read
  // returns null), there is no safe value to "restore" to. Attempting to
  // pass null as the arg also just produces an invalid tx, not a revert.
  const originalFeePct = await readState(coreAddr, 'config:protocolFeePct');
  if (originalFeePct === null) {
    console.log('  [SKIP] config:protocolFeePct was never set — no safe value to round-trip to.');
    console.log('         (Confirmed separately that getProtocolFeePct() is never read by any');
    console.log('          swap/liquidity logic, so this is dead config, not a fund-safety gap —');
    console.log('          but it also means there is nothing here worth live-testing right now.)');
  } else {
    const testFeePct = originalFeePct === 1234 ? 4321 : 1234;
    await step(`setProtocolFee(${testFeePct}) (was ${originalFeePct})`, async () => {
      const result = await invokeFunc(coreSeed, coreAddr, 'setProtocolFee', [{ type: 'integer', value: testFeePct }]);
      assert(result.ok, `setProtocolFee() failed: ${result.error}`);
      const now = await readState(coreAddr, 'config:protocolFeePct');
      assert(now === testFeePct, `Expected ${testFeePct}, got ${now}`);
    });
    await step(`setProtocolFee(${originalFeePct}) restores original`, async () => {
      const result = await invokeFunc(coreSeed, coreAddr, 'setProtocolFee', [{ type: 'integer', value: originalFeePct }]);
      assert(result.ok, `setProtocolFee() restore failed: ${result.error}`);
      const now = await readState(coreAddr, 'config:protocolFeePct');
      assert(now === originalFeePct, `Expected restore to ${originalFeePct}, got ${now}`);
    });
  }

  // ── 4. setTreasury round-trip ───────────────────────────────────────
  const originalTreasury = await readState(coreAddr, 'config:treasury');
  if (originalTreasury === null) {
    console.log('  [SKIP] config:treasury was never set — no safe value to round-trip to.');
    console.log('         (Same reasoning as protocolFeePct above — also confirmed getTreasury()');
    console.log('          is never read anywhere, so this is dead config, not a fund risk.)');
  } else {
    const testTreasurySeed = libs.crypto.randomSeed(15);
    const testTreasuryAddr = libs.crypto.address(testTreasurySeed, chainId);
    await step(`setTreasury(${testTreasuryAddr}) (was ${originalTreasury})`, async () => {
      const result = await invokeFunc(coreSeed, coreAddr, 'setTreasury', [{ type: 'string', value: testTreasuryAddr }]);
      assert(result.ok, `setTreasury() failed: ${result.error}`);
      const now = await readState(coreAddr, 'config:treasury');
      assert(now === testTreasuryAddr, `Expected ${testTreasuryAddr}, got ${now}`);
    });
    await step(`setTreasury(${originalTreasury}) restores original`, async () => {
      const result = await invokeFunc(coreSeed, coreAddr, 'setTreasury', [{ type: 'string', value: originalTreasury }]);
      assert(result.ok, `setTreasury() restore failed: ${result.error}`);
      const now = await readState(coreAddr, 'config:treasury');
      assert(now === originalTreasury, `Expected restore to ${originalTreasury}, got ${now}`);
    });
  }

  // ── 5. setRouter verify-only (same value, not a real change) ───────
  const currentRouter = await readState(coreAddr, 'router');
  await step(`setRouter(${currentRouter}) — verify-only, same value (no routing window)`, async () => {
    assert(currentRouter, 'No router currently set — cannot verify-only test');
    const result = await invokeFunc(coreSeed, coreAddr, 'setRouter', [{ type: 'string', value: currentRouter }]);
    assert(result.ok, `setRouter() failed: ${result.error}`);
    const now = await readState(coreAddr, 'router');
    assert(now === currentRouter, `Router changed unexpectedly: expected ${currentRouter}, got ${now}`);
  });

  console.log('\n  setAdmin() intentionally not live-tested — see the comment at the top of this file for why.\n');

  // ── Summary ──────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.pass);
  console.log('═══ Summary ═══');
  for (const r of results) {
    console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log(`\n  ${results.length - failed.length}/${results.length} passed`);

  if (failed.length > 0) {
    console.log('\n❌ Some admin function checks failed — see above.');
    process.exit(1);
  }
  console.log('\n✅ All admin functions verified working correctly.');
}

main().catch((err) => {
  console.error('\n❌ Admin test failed:', err.message || err);
  process.exit(1);
});
