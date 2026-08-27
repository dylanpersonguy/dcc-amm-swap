/**
 * DCC payout service — sends DCC to users after their Solana deposit is confirmed.
 */

import { transfer, broadcast, waitForTx } from '@decentralchain/transactions';
import { config } from './config';
import * as db from './db';
import { sweepDeposit } from './solana';

/**
 * Send DCC to a recipient address using the bridge admin wallet.
 * Returns the DCC transaction ID.
 */
export async function sendDccPayout(
  recipient: string,
  dccAmountRaw: bigint,
): Promise<string> {
  if (!config.dccAdminSeed) {
    throw new Error('DCC admin seed not configured');
  }

  const chainId = config.dccChainId.charCodeAt(0);
  const tx = transfer(
    {
      recipient,
      amount: Number(dccAmountRaw),
      assetId: null, // native DCC
      fee: config.dccTransferFee,
      chainId,
    },
    config.dccAdminSeed,
  );

  await broadcast(tx, config.dccNodeUrl);
  await waitForTx(tx.id!, { apiBase: config.dccNodeUrl, timeout: 120_000 });

  return tx.id!;
}

/**
 * Process a confirmed deposit — send DCC to the user.
 */
export async function processDeposit(order: db.DepositOrder): Promise<void> {
  console.log(`💰 Processing DCC payout for order ${order.id}: ${order.dccAmount} DCC → ${order.dccRecipient}`);

  try {
    // Convert DCC amount to raw (8 decimals)
    const dccRaw = BigInt(Math.floor(parseFloat(order.dccAmount) * 1e8));

    const txId = await sendDccPayout(order.dccRecipient, dccRaw);

    db.updateOrderStatus(order.id, 'completed', undefined, txId);
    console.log(`✅ Order ${order.id} completed — DCC tx: ${txId}`);

    // Best-effort — the payout already succeeded and is recorded regardless
    // of whether this succeeds. A failed sweep just leaves funds at the
    // per-order address; resweepPendingOrders() retries it on the next pass.
    try {
      const sweepTxId = await sweepDeposit(order.id, order.coin);
      if (sweepTxId) db.markSwept(order.id, sweepTxId);
    } catch (sweepErr: any) {
      console.error(`⚠️  Sweep failed for order ${order.id} (funds remain at deposit address):`, sweepErr.message);
    }
  } catch (err: any) {
    console.error(`❌ DCC payout failed for order ${order.id}:`, err.message);
    db.updateOrderStatus(order.id, 'failed');
  }
}

/**
 * Retry sweeping any completed order whose deposit is still sitting at its
 * per-order address (transient RPC failure, treasury temporarily out of SOL
 * for fees, etc). Safe to call repeatedly — sweepDeposit no-ops once the
 * balance is already zero.
 */
export async function resweepStaleOrders(): Promise<void> {
  const unswept = db.getUnsweptCompletedOrders();
  for (const order of unswept) {
    try {
      const sweepTxId = await sweepDeposit(order.id, order.coin);
      if (sweepTxId) {
        db.markSwept(order.id, sweepTxId);
        console.log(`🧹 Retry-swept order ${order.id}: ${sweepTxId}`);
      }
    } catch (err: any) {
      console.error(`⚠️  Retry sweep failed for order ${order.id}:`, err.message);
    }
  }
}
