#!/usr/bin/env node
/**
 * DCC AMM — Mainnet Deploy Script
 *
 * Compiles Pool.ride via the DCC node, signs SetScript + initialize()
 * transactions, and broadcasts them.
 *
 * Usage:
 *   node scripts/deploy.js
 *
 * Environment:
 *   SEED     - deployer seed phrase (required)
 *   ADMIN    - admin address override (default: deployer)
 *   DRY_RUN  - set to "1" to compile/sign without broadcasting
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const {
  setScript,
  invokeScript,
  broadcast,
  waitForTx,
  libs,
} = require('@waves/waves-transactions');

// ── DCC Mainnet Config ──────────────────────────────────────────────
const NODE_URL = 'https://mainnet-node.decentralchain.io';
const CHAIN_ID = '?';  // DCC mainnet = byte 63

// ── HTTP helper (for compile endpoint) ──────────────────────────────
function postText(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Compile RIDE ────────────────────────────────────────────────────
async function compileRide(source) {
  console.log('  Compiling RIDE via node API...');
  const res = await postText(`${NODE_URL}/utils/script/compileCode`, source);
  const json = JSON.parse(res.body);
  if (json.error || !json.script) {
    throw new Error(`Compile failed: ${json.message || res.body}`);
  }
  console.log(`  Compiled OK (${json.script.length} chars)`);
  return json.script; // includes "base64:" prefix
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const seed = process.env.SEED;
  if (!seed) {
    console.error('ERROR: Set SEED environment variable');
    console.error('  SEED="your seed phrase" node scripts/deploy.js');
    process.exit(1);
  }

  const dryRun = process.env.DRY_RUN === '1';
  const deployerAddr = libs.crypto.address(seed, CHAIN_ID);
  const adminAddr = process.env.ADMIN || deployerAddr;

  console.log('');
  console.log('  DCC AMM — Deploy Pool.ride v2.0');
  console.log('  ================================');
  console.log(`  Node:     ${NODE_URL}`);
  console.log(`  Chain:    ${CHAIN_ID} (byte ${CHAIN_ID.charCodeAt(0)})`);
  console.log(`  Deployer: ${deployerAddr}`);
  console.log(`  Admin:    ${adminAddr}`);
  console.log(`  Dry Run:  ${dryRun}`);
  console.log('');

  // Step 1: Read & compile RIDE
  const ridePath = path.join(__dirname, '..', 'ride', 'Pool.ride');
  const source = fs.readFileSync(ridePath, 'utf8');
  console.log(`[1/4] Loaded Pool.ride (${source.length} chars)`);
  const compiledScript = await compileRide(source);
  console.log('[2/4] RIDE compiled');

  // Step 2: Build & sign SetScript tx
  console.log('[3/4] Building SetScript transaction...');
  const deployTx = setScript(
    {
      script: compiledScript,
      chainId: CHAIN_ID.charCodeAt(0),
      fee: 1400000, // 0.014 DCC
    },
    seed
  );
  console.log(`  Tx ID:  ${deployTx.id}`);
  console.log(`  Fee:    ${deployTx.fee / 100000000} DCC`);

  if (dryRun) {
    console.log('');
    console.log('[DRY RUN] Signed SetScript tx:');
    console.log(`  ${JSON.stringify(deployTx).substring(0, 200)}...`);
    console.log('[DRY RUN] Would then call initialize()');
    return;
  }

  // Step 3: Broadcast SetScript
  console.log('  Broadcasting SetScript...');
  try {
    await broadcast(deployTx, NODE_URL);
  } catch (err) {
    console.error(`  Broadcast error: ${err.message}`);
    // Extract useful info from error
    if (err.message.includes('negative')) {
      console.error('  -> Account has insufficient native DCC for gas fees');
      console.error(`  -> Send at least 0.02 DCC to ${deployerAddr}`);
    }
    throw err;
  }
  console.log('  Waiting for confirmation...');
  await waitForTx(deployTx.id, { apiBase: NODE_URL, timeout: 120000 });
  console.log('  SetScript confirmed!');

  // Step 4: Call initialize(admin)
  console.log(`[4/4] Calling initialize("${adminAddr}")...`);
  const initTx = invokeScript(
    {
      dApp: deployerAddr,
      call: {
        function: 'initialize',
        args: [{ type: 'string', value: adminAddr }],
      },
      payment: [],
      chainId: CHAIN_ID.charCodeAt(0),
      fee: 900000, // 0.009 DCC (includes 0.004 smart account surcharge)
    },
    seed
  );
  console.log(`  Tx ID: ${initTx.id}`);

  await broadcast(initTx, NODE_URL);
  console.log('  Waiting for confirmation...');
  await waitForTx(initTx.id, { apiBase: NODE_URL, timeout: 120000 });
  console.log('  initialize() confirmed!');

  console.log('');
  console.log('  Deployment Complete!');
  console.log('  ====================');
  console.log(`  dApp Address: ${deployerAddr}`);
  console.log(`  Admin:        ${adminAddr}`);
  console.log(`  SetScript Tx: ${deployTx.id}`);
  console.log(`  Init Tx:      ${initTx.id}`);
}

main().catch((err) => {
  console.error('');
  console.error('DEPLOY FAILED:', err.message);
  process.exit(1);
});
