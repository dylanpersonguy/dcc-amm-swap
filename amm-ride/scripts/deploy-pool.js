#!/usr/bin/env node
/**
 * Deploy Pool.ride to DecentralChain
 *
 * Usage:
 *   node scripts/deploy-pool.js --seed "your twelve word seed phrase"
 *
 * Options:
 *   --seed <phrase>   Seed phrase for the deployer account (REQUIRED)
 *   --node <url>      Node URL (default: https://mainnet-node.decentralchain.io)
 *   --chain-id <id>   Chain ID character (default: ?)
 *   --dry-run         Compile only, don't broadcast
 */

const fs = require('fs');
const path = require('path');
const { setScript, invokeScript, broadcast, waitForTx, libs } = require('@decentralchain/transactions');

// ── Parse CLI args ────────────────────────────────────────────────
const args = process.argv.slice(2);
let seed = '';
let nodeUrl = 'https://mainnet-node.decentralchain.io';
let chainId = '?';
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--seed') seed = args[++i];
  else if (args[i] === '--node') nodeUrl = args[++i];
  else if (args[i] === '--chain-id') chainId = args[++i];
  else if (args[i] === '--dry-run') dryRun = true;
}

if (!seed) {
  console.error('ERROR: --seed is required');
  console.error('Usage: node scripts/deploy-pool.js --seed "your seed phrase"');
  process.exit(1);
}

// ── Compile RIDE via node API ─────────────────────────────────────
async function compileRide(source) {
  console.log('  Compiling Pool.ride via node API...');
  const res = await fetch(`${nodeUrl}/utils/script/compileCode`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: source,
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`Compilation failed: ${json.message || JSON.stringify(json)}`);
  }
  console.log(`  Compiled OK (complexity: ${json.complexity})`);
  console.log(`  Callable functions: ${Object.keys(json.callableComplexities || {}).join(', ')}`);
  return json.script;
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  const address = libs.crypto.address(seed, chainId);
  const publicKey = libs.crypto.publicKey(seed);

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║         DCC AMM — Deploy Pool.ride                  ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Node:     ${nodeUrl}`);
  console.log(`  Chain ID: ${chainId}`);
  console.log(`  Address:  ${address}`);
  console.log(`  Dry Run:  ${dryRun}`);
  console.log('');

  // 1. Read Pool.ride source
  const ridePath = path.join(__dirname, '..', 'ride', 'Pool.ride');
  const rideSource = fs.readFileSync(ridePath, 'utf8');
  console.log(`[1/4] Loaded Pool.ride (${rideSource.length} chars)`);

  // 2. Compile
  const compiledScript = await compileRide(rideSource);
  console.log(`[2/4] RIDE compiled`);

  if (dryRun) {
    console.log('\n[DRY RUN] Compilation successful. Would deploy to:', address);
    console.log('[DRY RUN] Then call initialize() with admin =', address);
    return;
  }

  // 3. Deploy SetScript
  console.log(`[3/4] Deploying script...`);
  const setScriptTx = setScript(
    {
      script: compiledScript,
      chainId: chainId.charCodeAt(0),
      fee: 1400000,
    },
    seed
  );
  console.log(`  SetScript tx ID: ${setScriptTx.id}`);

  await broadcast(setScriptTx, nodeUrl);
  console.log('  Broadcast OK. Waiting for confirmation...');
  await waitForTx(setScriptTx.id, { apiBase: nodeUrl, timeout: 120000 });
  console.log('  SetScript confirmed!');

  // 4. Initialize
  console.log(`[4/4] Calling initialize("${address}")...`);
  const initTx = invokeScript(
    {
      dApp: address,
      call: {
        function: 'initialize',
        args: [{ type: 'string', value: address }],
      },
      payment: [],
      fee: 900000,
      chainId: chainId.charCodeAt(0),
    },
    seed
  );
  console.log(`  Initialize tx ID: ${initTx.id}`);

  await broadcast(initTx, nodeUrl);
  console.log('  Broadcast OK. Waiting for confirmation...');
  await waitForTx(initTx.id, { apiBase: nodeUrl, timeout: 120000 });
  console.log('  Initialize confirmed!');

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  DEPLOYMENT COMPLETE                                ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  dApp Address:  ${address}`);
  console.log('');
  console.log('  Update your .env or config with:');
  console.log(`    VITE_AMM_DAPP_ADDRESS=${address}`);
}

main().catch((err) => {
  console.error('\nDEPLOYMENT FAILED:', err.message || err);
  process.exit(1);
});
