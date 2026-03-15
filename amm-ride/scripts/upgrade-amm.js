#!/usr/bin/env node
/**
 * Upgrade PoolCore.ride + SwapRouter.ride on existing accounts.
 * Only does SetScript — does NOT call initialize (state is preserved).
 *
 * Usage:
 *   node scripts/upgrade-amm.js \
 *     --core-seed "..." --router-seed "..."
 *
 * After upgrade, call setTreasury + setProtocolFee:
 *   node scripts/upgrade-amm.js \
 *     --core-seed "..." --router-seed "..." \
 *     --treasury 3DTEYQbdJ8erVi7DrNJjyZ6ShD9mXYnaJaC \
 *     --protocol-fee-pct 2857
 */

const fs = require('fs');
const path = require('path');
const { setScript, invokeScript, broadcast, waitForTx, libs } = require('@decentralchain/transactions');

const args = process.argv.slice(2);
let coreSeed = '';
let routerSeed = '';
let treasury = '';
let protocolFeePct = -1;
let nodeUrl = 'https://mainnet-node.decentralchain.io';
let chainId = '?';
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--core-seed') coreSeed = args[++i];
  else if (args[i] === '--router-seed') routerSeed = args[++i];
  else if (args[i] === '--treasury') treasury = args[++i];
  else if (args[i] === '--protocol-fee-pct') protocolFeePct = parseInt(args[++i], 10);
  else if (args[i] === '--node') nodeUrl = args[++i];
  else if (args[i] === '--chain-id') chainId = args[++i];
  else if (args[i] === '--dry-run') dryRun = true;
}

if (!coreSeed || !routerSeed) {
  console.error('ERROR: Both --core-seed and --router-seed are required');
  process.exit(1);
}

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
  console.log(`  ${label} OK (complexity: ${json.complexity}, size: ${json.script.length}, funcs: ${funcs})`);
  return json.script;
}

async function deployScript(seed, compiledScript, label) {
  const addr = libs.crypto.address(seed, chainId);
  console.log(`  Deploying ${label} to ${addr}...`);
  const tx = setScript(
    { script: compiledScript, chainId: chainId.charCodeAt(0), fee: 1400000 },
    seed
  );
  console.log(`  tx ID: ${tx.id}`);
  await broadcast(tx, nodeUrl);
  console.log('  Broadcast OK. Waiting...');
  await waitForTx(tx.id, { apiBase: nodeUrl, timeout: 120000 });
  console.log(`  ${label} deployed!`);
  return addr;
}

async function invokeFunc(seed, dApp, funcName, funcArgs, label) {
  console.log(`  Calling ${funcName}(${funcArgs.map(a => a.value).join(', ')}) on ${dApp}...`);
  const tx = invokeScript(
    { dApp, call: { function: funcName, args: funcArgs }, payment: [], fee: 900000, chainId: chainId.charCodeAt(0) },
    seed
  );
  console.log(`  tx ID: ${tx.id}`);
  await broadcast(tx, nodeUrl);
  console.log('  Broadcast OK. Waiting...');
  await waitForTx(tx.id, { apiBase: nodeUrl, timeout: 120000 });
  console.log(`  ${label} confirmed!`);
}

async function main() {
  const coreAddr = libs.crypto.address(coreSeed, chainId);
  const routerAddr = libs.crypto.address(routerSeed, chainId);

  console.log('═══ DCC AMM — Upgrade (SetScript only) ═══');
  console.log(`  Core:   ${coreAddr}`);
  console.log(`  Router: ${routerAddr}`);
  console.log('');

  // 1. Compile
  const coreSource = fs.readFileSync(path.join(__dirname, '..', 'ride', 'PoolCore.ride'), 'utf8');
  const routerSource = fs.readFileSync(path.join(__dirname, '..', 'ride', 'SwapRouter.ride'), 'utf8');
  console.log('[1/4] Compiling...');
  const coreCompiled = await compileRide(coreSource, 'PoolCore');
  const routerCompiled = await compileRide(routerSource, 'SwapRouter');

  if (dryRun) {
    console.log('\n[DRY RUN] Would deploy both contracts. No init calls.');
    if (treasury) console.log(`  + setTreasury("${treasury}")`);
    if (protocolFeePct >= 0) console.log(`  + setProtocolFee(${protocolFeePct})`);
    return;
  }

  // 2. Deploy Core
  console.log('[2/4] SetScript PoolCore...');
  await deployScript(coreSeed, coreCompiled, 'PoolCore');

  // 3. Deploy Router
  console.log('[3/4] SetScript SwapRouter...');
  await deployScript(routerSeed, routerCompiled, 'SwapRouter');

  // 4. Admin calls (treasury + protocolFee)
  console.log('[4/4] Admin calls...');
  if (treasury) {
    await invokeFunc(coreSeed, coreAddr, 'setTreasury', [{ type: 'string', value: treasury }], 'setTreasury');
  }
  if (protocolFeePct >= 0) {
    await invokeFunc(coreSeed, coreAddr, 'setProtocolFee', [{ type: 'integer', value: protocolFeePct }], 'setProtocolFee');
  }

  console.log('\n✅ Upgrade complete!');
}

main().catch((err) => {
  console.error('\n❌ Upgrade failed:', err.message || err);
  process.exit(1);
});
