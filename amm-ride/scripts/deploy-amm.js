#!/usr/bin/env node
/**
 * Deploy PoolCore.ride + SwapRouter.ride to DecentralChain
 *
 * Requires TWO seed phrases — one per contract address.
 *
 * Usage:
 *   node scripts/deploy-amm.js \
 *     --core-seed "seed phrase for core account" \
 *     --router-seed "seed phrase for router account"
 *
 * Options:
 *   --core-seed <phrase>    Seed for Pool Core account (REQUIRED)
 *   --router-seed <phrase>  Seed for Swap Router account (REQUIRED)
 *   --tracker <address>     EligibilityTracker contract address (optional)
 *   --node <url>            Node URL (default: https://mainnet-node.decentralchain.io)
 *   --chain-id <id>         Chain ID character (default: ?)
 *   --dry-run               Compile only, don't broadcast
 */

const fs = require('fs');
const path = require('path');
const { setScript, invokeScript, broadcast, waitForTx, libs } = require('@decentralchain/transactions');

// ── Parse CLI args ────────────────────────────────────────────
const args = process.argv.slice(2);
let coreSeed = '';
let routerSeed = '';
let trackerAddress = '';
let nodeUrl = 'https://mainnet-node.decentralchain.io';
let chainId = '?';
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--core-seed') coreSeed = args[++i];
  else if (args[i] === '--router-seed') routerSeed = args[++i];
  else if (args[i] === '--tracker') trackerAddress = args[++i];
  else if (args[i] === '--node') nodeUrl = args[++i];
  else if (args[i] === '--chain-id') chainId = args[++i];
  else if (args[i] === '--dry-run') dryRun = true;
}

if (!coreSeed || !routerSeed) {
  console.error('ERROR: Both --core-seed and --router-seed are required');
  console.error('');
  console.error('Usage:');
  console.error('  node scripts/deploy-amm.js \\');
  console.error('    --core-seed "seed phrase for core" \\');
  console.error('    --router-seed "seed phrase for router"');
  process.exit(1);
}

// ── Compile RIDE via node API ─────────────────────────────────
async function compileRide(source, label) {
  console.log(`  Compiling ${label}...`);
  const res = await fetch(`${nodeUrl}/utils/script/compileCode`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: source,
  });
  const json = await res.json();
  if (!res.ok || json.error || json.message) {
    throw new Error(`Compilation of ${label} failed: ${json.message || JSON.stringify(json)}`);
  }
  const funcs = Object.keys(json.callableComplexities || {}).join(', ');
  console.log(`  ${label} compiled OK (complexity: ${json.complexity}, functions: ${funcs})`);
  return json.script;
}

// ── Deploy script to an account ───────────────────────────────
async function deployScript(seed, compiledScript, label) {
  const addr = libs.crypto.address(seed, chainId);
  console.log(`  Deploying ${label} to ${addr}...`);

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
  console.log(`  ${label} deployed!`);
  return addr;
}

// ── Invoke a function ─────────────────────────────────────────
async function invokeFunc(seed, dApp, funcName, funcArgs, label) {
  console.log(`  Calling ${funcName}() on ${dApp}...`);
  const tx = invokeScript(
    {
      dApp,
      call: { function: funcName, args: funcArgs },
      payment: [],
      fee: 900000,
      chainId: chainId.charCodeAt(0),
    },
    seed
  );
  console.log(`  ${label} tx ID: ${tx.id}`);

  await broadcast(tx, nodeUrl);
  console.log('  Broadcast OK. Waiting for confirmation...');
  await waitForTx(tx.id, { apiBase: nodeUrl, timeout: 120000 });
  console.log(`  ${label} confirmed!`);
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const coreAddr = libs.crypto.address(coreSeed, chainId);
  const routerAddr = libs.crypto.address(routerSeed, chainId);

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║       DCC AMM — Deploy Core + Router                ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Node:           ${nodeUrl}`);
  console.log(`  Chain ID:       ${chainId}`);
  console.log(`  Core Address:   ${coreAddr}`);
  console.log(`  Router Address: ${routerAddr}`);
  console.log(`  Tracker:        ${trackerAddress || '(none — skipping setEligibilityTracker)'}`);
  console.log(`  Dry Run:        ${dryRun}`);
  console.log('');

  // Step 1: Read and compile both contracts
  const totalSteps = trackerAddress ? 7 : 6;
  const coreSource = fs.readFileSync(path.join(__dirname, '..', 'ride', 'PoolCore.ride'), 'utf8');
  const routerSource = fs.readFileSync(path.join(__dirname, '..', 'ride', 'SwapRouter.ride'), 'utf8');
  console.log(`[1/${totalSteps}] Loaded PoolCore.ride (${coreSource.length} chars) and SwapRouter.ride (${routerSource.length} chars)`);

  const coreCompiled = await compileRide(coreSource, 'PoolCore');
  const routerCompiled = await compileRide(routerSource, 'SwapRouter');
  console.log(`[2/${totalSteps}] Both contracts compiled successfully`);

  if (dryRun) {
    console.log('\n[DRY RUN] Compilation successful. Would deploy:');
    console.log(`  Core   → ${coreAddr}`);
    console.log(`  Router → ${routerAddr}`);
    console.log('[DRY RUN] Then:');
    console.log(`  Core.initialize("${coreAddr}")`);
    console.log(`  Core.setRouter("${routerAddr}")`);
    console.log(`  Router.initialize("${coreAddr}", "${coreAddr}")`);
    if (trackerAddress) {
      console.log(`  Core.setEligibilityTracker("${trackerAddress}")`);
    }
    console.log('');
    console.log('Config values for .env:');
    console.log(`  VITE_AMM_DAPP_ADDRESS=${coreAddr}`);
    console.log(`  VITE_AMM_ROUTER_ADDRESS=${routerAddr}`);
    return;
  }

  // Step 3: Deploy Core
  console.log(`[3/${totalSteps}] Deploying PoolCore...`);
  await deployScript(coreSeed, coreCompiled, 'PoolCore');

  // Step 4: Deploy Router
  console.log(`[4/${totalSteps}] Deploying SwapRouter...`);
  await deployScript(routerSeed, routerCompiled, 'SwapRouter');

  // Step 5: Initialize Core (admin = core address) + set router
  console.log(`[5/${totalSteps}] Initializing Core...`);
  await invokeFunc(
    coreSeed,
    coreAddr,
    'initialize',
    [{ type: 'string', value: coreAddr }],
    'Core.initialize'
  );
  await invokeFunc(
    coreSeed,
    coreAddr,
    'setRouter',
    [{ type: 'string', value: routerAddr }],
    'Core.setRouter'
  );

  // Step 6: Initialize Router (set core address + admin)
  console.log(`[6/${totalSteps}] Initializing Router...`);
  await invokeFunc(
    routerSeed,
    routerAddr,
    'initialize',
    [
      { type: 'string', value: coreAddr },
      { type: 'string', value: coreAddr },
    ],
    'Router.initialize'
  );

  // Step 7 (optional): Set EligibilityTracker on Core
  if (trackerAddress) {
    console.log(`[7/${totalSteps}] Setting EligibilityTracker on Core...`);
    await invokeFunc(
      coreSeed,
      coreAddr,
      'setEligibilityTracker',
      [{ type: 'string', value: trackerAddress }],
      'Core.setEligibilityTracker'
    );
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  DEPLOYMENT COMPLETE                                ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Core Address:   ${coreAddr}`);
  console.log(`  Router Address: ${routerAddr}`);
  if (trackerAddress) {
    console.log(`  Tracker:        ${trackerAddress}`);
  }
  console.log('');
  console.log('  Update your .env with:');
  console.log(`    VITE_AMM_DAPP_ADDRESS=${coreAddr}`);
  console.log(`    VITE_AMM_ROUTER_ADDRESS=${routerAddr}`);
}

main().catch((err) => {
  console.error('\nDEPLOYMENT FAILED:', err.message || err);
  process.exit(1);
});
