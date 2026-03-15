#!/usr/bin/env node
const { invokeScript, broadcast, waitForTx } = require('@decentralchain/transactions');

const coreSeed = process.argv[2];
const trackerAddr = process.argv[3] || '3DWDW21LtCn1BnDos6yZNrxtiGWL9zPEkHv';
const coreAddr = '3Dfh97WETii2jqHUZfw6AGsn3dLkAmvfiFm';
const nodeUrl = 'https://mainnet-node.decentralchain.io';

if (!coreSeed) {
  console.error('Usage: node set-tracker.js <core-seed> [tracker-address]');
  process.exit(1);
}

async function main() {
  console.log('Calling setEligibilityTracker on Core...');
  console.log('  Core:    ' + coreAddr);
  console.log('  Tracker: ' + trackerAddr);

  const tx = invokeScript({
    dApp: coreAddr,
    call: {
      function: 'setEligibilityTracker',
      args: [{ type: 'string', value: trackerAddr }]
    },
    payment: [],
    fee: 900000,
    chainId: '?'.charCodeAt(0),
  }, coreSeed);

  console.log('  TX ID: ' + tx.id);
  await broadcast(tx, nodeUrl);
  console.log('  Broadcast OK. Waiting for confirmation...');
  await waitForTx(tx.id, { apiBase: nodeUrl, timeout: 120000 });
  console.log('  setEligibilityTracker confirmed!');
}

main().catch(function(e) { console.error('FAILED:', e.message || e); process.exit(1); });
