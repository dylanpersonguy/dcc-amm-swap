#!/usr/bin/env node
/**
 * End-to-end AMM test: Issue token, create pool, add liquidity, swap.
 * Uses a separate "user" account for pool interactions (dApp self-payment is forbidden in V4+).
 */
const {
  issue,
  transfer,
  invokeScript,
  broadcast,
  waitForTx,
  libs,
} = require('@waves/waves-transactions');

const ADMIN_SEED = process.env.SEED;
if (!ADMIN_SEED) {
  console.error('ERROR: Set SEED environment variable');
  console.error('  SEED="your seed phrase" node scripts/pool-test.js');
  process.exit(1);
}
const NODE = 'https://mainnet-node.decentralchain.io';
const CHAIN = 63; // '?'
const DAPP = '3Da7xwRRtXfkA46jaKTYb75Usd2ZNWdY6HX';
const ADMIN_ADDR = libs.crypto.address(ADMIN_SEED, '?');

// Generate a deterministic user account for testing
const USER_SEED = ADMIN_SEED + ' user';
const USER_ADDR = libs.crypto.address(USER_SEED, '?');

// Fees
const INVOKE_FEE = 900000;    // 0.009 DCC (smart account invoke)
const ISSUE_FEE  = 100400000; // 1.004 DCC (issue + smart surcharge)
const XFER_FEE   = 500000;    // 0.005 DCC (transfer from smart account)
const USER_INVOKE_FEE = 500000; // 0.005 DCC (invoke from non-smart account)

// Token already issued from previous run? Set to skip re-issue.
const EXISTING_TOKEN_ID = process.env.TOKEN_ID || null;

async function sendAndWait(tx) {
  console.log(`  Tx ID: ${tx.id}`);
  try {
    await broadcast(tx, NODE);
  } catch (err) {
    console.error(`  Broadcast error: ${err.message}`);
    throw err;
  }
  console.log('  Broadcast OK, waiting...');
  await waitForTx(tx.id, { apiBase: NODE, timeout: 120000 });
  console.log('  Confirmed!');
}

async function main() {
  console.log(`\nAdmin (dApp): ${ADMIN_ADDR}`);
  console.log(`User account: ${USER_ADDR}\n`);

  let tokenId = EXISTING_TOKEN_ID;

  // ── Step 1: Issue PoolTest token (from admin/dApp account) ────────
  if (!tokenId) {
    console.log('=== Step 1: Issue "PoolTest" token (100M supply, 0 decimals) ===');
    const issueTx = issue(
      {
        name: 'PoolTest',
        description: 'AMM test token for DCC pool',
        quantity: 100000000, // 100,000,000 (0 decimals)
        decimals: 0,
        reissuable: false,
        chainId: CHAIN,
        fee: ISSUE_FEE,
      },
      ADMIN_SEED
    );
    await sendAndWait(issueTx);
    tokenId = issueTx.id;
    console.log(`  Token ID: ${tokenId}\n`);
  } else {
    console.log(`=== Step 1: Using existing token ${tokenId} ===\n`);
  }

  // ── Step 2: Create pool DCC/PoolTest (from admin) ────────────────
  console.log('=== Step 2: Create pool DCC/PoolTest (30 bps fee) ===');
  const createPoolTx = invokeScript(
    {
      dApp: DAPP,
      call: {
        function: 'createPool',
        args: [
          { type: 'string', value: 'DCC' },
          { type: 'string', value: tokenId },
          { type: 'integer', value: 30 },
        ],
      },
      payment: [],
      chainId: CHAIN,
      fee: INVOKE_FEE,
    },
    ADMIN_SEED
  );
  await sendAndWait(createPoolTx);
  console.log('');

  // ── Step 3: Transfer funds to user account ────────────────────────
  const dccForUser = 11000000000; // 110 DCC (100 for liquidity + gas)
  const tokensForUser = 100000000; // 100M PoolTest

  console.log('=== Step 3: Fund user account ===');
  console.log(`  Sending 110 DCC to ${USER_ADDR}...`);
  const xferDcc = transfer(
    {
      recipient: USER_ADDR,
      amount: dccForUser,
      chainId: CHAIN,
      fee: XFER_FEE,
    },
    ADMIN_SEED
  );
  await sendAndWait(xferDcc);

  console.log(`  Sending 100M PoolTest to ${USER_ADDR}...`);
  const xferToken = transfer(
    {
      recipient: USER_ADDR,
      amount: tokensForUser,
      assetId: tokenId,
      chainId: CHAIN,
      fee: XFER_FEE,
    },
    ADMIN_SEED
  );
  await sendAndWait(xferToken);
  console.log('');

  // ── Step 4: Add liquidity (from user account) ────────────────────
  const dccAmount = 10000000000;  // 100 DCC (8 decimals)
  const tokenAmount = 100000000;  // 100M PoolTest (0 decimals)
  const deadline = Date.now() + 600000; // 10 minutes

  console.log('=== Step 4: Add liquidity (100 DCC + 100M PoolTest) ===');
  const addLiqTx = invokeScript(
    {
      dApp: DAPP,
      call: {
        function: 'addLiquidity',
        args: [
          { type: 'string', value: 'DCC' },
          { type: 'string', value: tokenId },
          { type: 'integer', value: 30 },
          { type: 'integer', value: dccAmount },
          { type: 'integer', value: tokenAmount },
          { type: 'integer', value: 1 },  // amountAMin
          { type: 'integer', value: 1 },  // amountBMin
          { type: 'integer', value: deadline },
        ],
      },
      payment: [
        { assetId: null, amount: dccAmount },       // DCC native
        { assetId: tokenId, amount: tokenAmount },   // PoolTest
      ],
      chainId: CHAIN,
      fee: USER_INVOKE_FEE,
    },
    USER_SEED
  );
  await sendAndWait(addLiqTx);
  console.log('');

  // ── Step 5: Swap 1 DCC -> PoolTest (from user) ──────────────────
  const swapIn = 100000000; // 1 DCC
  console.log('=== Step 5: Swap 1 DCC -> PoolTest ===');
  const swapTx = invokeScript(
    {
      dApp: DAPP,
      call: {
        function: 'swapExactIn',
        args: [
          { type: 'string', value: 'DCC' },
          { type: 'string', value: tokenId },
          { type: 'integer', value: 30 },
          { type: 'integer', value: swapIn },
          { type: 'integer', value: 1 },       // minAmountOut
          { type: 'integer', value: deadline },
        ],
      },
      payment: [
        { assetId: null, amount: swapIn },
      ],
      chainId: CHAIN,
      fee: USER_INVOKE_FEE,
    },
    USER_SEED
  );
  await sendAndWait(swapTx);
  console.log('');

  // ── Summary ──────────────────────────────────────────────────────
  console.log('========================================');
  console.log('  ALL STEPS COMPLETED SUCCESSFULLY!');
  console.log('========================================');
  console.log(`  PoolTest Token: ${tokenId}`);
  console.log(`  Pool:           DCC / PoolTest @ 30bps`);
  console.log(`  Liquidity:      100 DCC + 100M PoolTest`);
  console.log(`  Swap:           1 DCC -> PoolTest`);
  console.log(`  dApp:           ${DAPP}`);
  console.log(`  Explorer:       https://explorer.decentralchain.io/address/${DAPP}`);
}

main().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
