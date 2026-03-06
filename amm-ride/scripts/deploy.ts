/**
 * DCC AMM — Deploy Script
 *
 * Compiles Pool.ride via the node's /utils/script/compileCode endpoint,
 * creates a SetScript transaction, broadcasts it, then calls initialize().
 *
 * Usage:
 *   npx ts-node scripts/deploy.ts \
 *     --network testnet \
 *     --seed "your twelve word seed phrase"
 *
 * Optional:
 *   --admin <address>   Override admin (default: deployer address)
 *   --node  <url>       Override node URL
 *   --dry-run           Compile and sign but don't broadcast
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';

// ── Configuration ─────────────────────────────────────────────────────

interface DeployConfig {
  network: 'testnet' | 'mainnet';
  seed: string;
  nodeUrl: string;
  chainId: string;
  adminAddr?: string;
  dryRun: boolean;
}

const NETWORK_CONFIGS: Record<string, { nodeUrl: string; chainId: string }> = {
  testnet: {
    nodeUrl: 'https://testnet.decentralchain.io',
    chainId: 'T',
  },
  mainnet: {
    nodeUrl: 'https://nodes.decentralchain.io',
    chainId: 'D',
  },
};

// ── CLI Arg Parser ────────────────────────────────────────────────────

function parseArgs(): DeployConfig {
  const args = process.argv.slice(2);
  let network: 'testnet' | 'mainnet' = 'testnet';
  let seed = '';
  let nodeUrl = '';
  let adminAddr: string | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--network':
        network = args[++i] as 'testnet' | 'mainnet';
        break;
      case '--seed':
        seed = args[++i];
        break;
      case '--node':
        nodeUrl = args[++i];
        break;
      case '--admin':
        adminAddr = args[++i];
        break;
      case '--dry-run':
        dryRun = true;
        break;
    }
  }

  if (!seed) {
    console.error(
      'Usage: deploy.ts --network <testnet|mainnet> --seed "<seed phrase>" [--admin <addr>] [--node <url>] [--dry-run]'
    );
    process.exit(1);
  }

  const netCfg = NETWORK_CONFIGS[network];
  return {
    network,
    seed,
    nodeUrl: nodeUrl || netCfg.nodeUrl,
    chainId: netCfg.chainId,
    adminAddr,
    dryRun,
  };
}

// ── HTTP Helper ───────────────────────────────────────────────────────

function httpRequest(
  url: string,
  method: 'GET' | 'POST',
  body?: string,
  contentType?: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const requester = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        ...(contentType ? { 'Content-Type': contentType } : {}),
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    };

    const req = requester.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Compile RIDE via Node API ─────────────────────────────────────────

async function compileRide(nodeUrl: string, source: string): Promise<string> {
  console.log('  Compiling RIDE script via node API...');

  const res = await httpRequest(
    `${nodeUrl}/utils/script/compileCode`,
    'POST',
    source,
    'text/plain'
  );

  if (res.status !== 200) {
    throw new Error(`Compilation failed (HTTP ${res.status}): ${res.body}`);
  }

  const json = JSON.parse(res.body);
  if (json.error) {
    throw new Error(`Compilation error: ${json.message || JSON.stringify(json)}`);
  }

  const base64Script = json.script;
  if (!base64Script) {
    throw new Error('No compiled script in response: ' + res.body);
  }

  // Remove "base64:" prefix if present
  const script = base64Script.startsWith('base64:')
    ? base64Script.slice(7)
    : base64Script;

  console.log(`  Compiled successfully (${script.length} chars base64)`);
  return base64Script; // Keep prefix for SetScript tx
}

// ── Broadcast Transaction ─────────────────────────────────────────────

async function broadcast(nodeUrl: string, txJson: string): Promise<any> {
  const res = await httpRequest(
    `${nodeUrl}/transactions/broadcast`,
    'POST',
    txJson,
    'application/json'
  );

  const json = JSON.parse(res.body);
  if (res.status !== 200 || json.error) {
    throw new Error(
      `Broadcast failed (HTTP ${res.status}): ${json.message || res.body}`
    );
  }

  return json;
}

// ── Wait for Transaction Confirmation ─────────────────────────────────

async function waitForTx(
  nodeUrl: string,
  txId: string,
  timeoutMs = 60000,
  intervalMs = 3000
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await httpRequest(
        `${nodeUrl}/transactions/info/${txId}`,
        'GET'
      );
      if (res.status === 200) {
        return JSON.parse(res.body);
      }
    } catch {
      // ignore, retry
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout waiting for tx ${txId}`);
}

// ── Get Address from Seed ─────────────────────────────────────────────
// NOTE: This is a placeholder. In production, use @decentralchain/ts-lib-crypto
// or @waves/ts-lib-crypto for proper address derivation.

function getAddressPlaceholder(seed: string, chainId: string): string {
  console.log(
    `  [NOTE] Address derivation requires @decentralchain/ts-lib-crypto`
  );
  console.log(`  Seed: "${seed.substring(0, 8)}..."  Chain: ${chainId}`);
  return '<DEPLOYER_ADDRESS>';
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const config = parseArgs();

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║       DCC AMM — Deploy Pool.ride v2.0               ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Network:  ${config.network}`);
  console.log(`  Node:     ${config.nodeUrl}`);
  console.log(`  Dry Run:  ${config.dryRun}`);
  console.log('');

  // Step 1: Read RIDE source
  const ridePath = path.join(__dirname, '..', 'ride', 'Pool.ride');
  if (!fs.existsSync(ridePath)) {
    console.error(`ERROR: Pool.ride not found at ${ridePath}`);
    process.exit(1);
  }

  const rideSource = fs.readFileSync(ridePath, 'utf8');
  console.log(`[1/4] Loaded Pool.ride (${rideSource.length} chars)`);

  // Step 2: Compile via node
  const compiledScript = await compileRide(config.nodeUrl, rideSource);
  console.log(`[2/4] RIDE compiled successfully`);

  // Step 3: Build SetScript transaction
  const deployerAddr = getAddressPlaceholder(config.seed, config.chainId);
  const adminAddr = config.adminAddr || deployerAddr;

  console.log(`[3/4] Building SetScript transaction...`);
  console.log(`  Deployer: ${deployerAddr}`);
  console.log(`  Admin:    ${adminAddr}`);

  // SetScript transaction structure
  const setScriptTx = {
    type: 13,
    version: 2,
    chainId: config.chainId.charCodeAt(0),
    script: compiledScript,
    fee: 1400000, // 0.014 DCC (extra fee for smart account)
    timestamp: Date.now(),
  };

  console.log(`  Fee: ${setScriptTx.fee / 100_000_000} DCC`);

  if (config.dryRun) {
    console.log('');
    console.log('[DRY RUN] Would broadcast SetScript transaction:');
    console.log(JSON.stringify(setScriptTx, null, 2));
    console.log('');
    console.log('[DRY RUN] Then invoke initialize():');
    console.log(`  dApp: ${deployerAddr}`);
    console.log(`  function: initialize("${adminAddr}")`);
    console.log('');
    console.log('Deploy process would complete. Exiting (dry run).');
    return;
  }

  // ── Production deployment flow ──
  // Uncomment when @decentralchain/transactions is installed:
  //
  // import { setScript, invokeScript, broadcast as txBroadcast } from '@decentralchain/transactions';
  //
  // // Deploy script
  // const deployTx = setScript({
  //   script: compiledScript,
  //   chainId: config.chainId.charCodeAt(0),
  //   fee: 1400000,
  // }, config.seed);
  //
  // console.log(`  Tx ID: ${deployTx.id}`);
  // const deployResult = await txBroadcast(deployTx, config.nodeUrl);
  // console.log(`  Broadcast OK. Waiting for confirmation...`);
  // await waitForTx(config.nodeUrl, deployTx.id);
  // console.log(`  Confirmed in block.`);
  //
  // // Initialize
  // console.log(`[4/4] Calling initialize("${adminAddr}")...`);
  // const initTx = invokeScript({
  //   dApp: deployerAddr,
  //   call: {
  //     function: 'initialize',
  //     args: [{ type: 'string', value: adminAddr }],
  //   },
  //   payment: [],
  //   chainId: config.chainId.charCodeAt(0),
  //   fee: 500000,
  // }, config.seed);
  //
  // await txBroadcast(initTx, config.nodeUrl);
  // await waitForTx(config.nodeUrl, initTx.id);
  // console.log(`  Initialized! Tx: ${initTx.id}`);
  //
  // console.log('');
  // console.log('═══ Deployment Complete ═══');
  // console.log(`  dApp Address: ${deployerAddr}`);
  // console.log(`  Admin:        ${adminAddr}`);
  // console.log(`  Network:      ${config.network}`);

  console.log('');
  console.log('[4/4] Production broadcast requires @decentralchain/transactions.');
  console.log('      Install it and uncomment the broadcast section in deploy.ts.');
  console.log('');
  console.log('Manual deployment steps:');
  console.log(`  1. Use compiled script above with a SetScript transaction`);
  console.log(`  2. Sign with seed and broadcast to ${config.nodeUrl}`);
  console.log(`  3. Call initialize("${adminAddr}") on the deployed dApp`);
  console.log(`  4. Run smoke-test.ts to verify`);
}

main().catch((err) => {
  console.error('');
  console.error('DEPLOY FAILED:', err.message);
  process.exit(1);
});
