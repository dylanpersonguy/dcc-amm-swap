/**
 * Trading service — executes swaps, adds/removes liquidity via the AMM SDK.
 * Signs and broadcasts transactions using the user's stored seed.
 */

import { AmmSdk, fromRawAmount, toRawAmount } from '@dcc-amm/sdk';
import { invokeScript, transfer, broadcast, waitForTx } from '@waves/waves-transactions';
import { config, adminAddress } from '../config';
import {
  getWalletSeed,
  getActiveWallet,
  recordTrade,
  getSettings,
  getReferrer,
  recordReferralReward,
} from '../db';
import { getAssetInfo } from './wallet';

// ── SDK singleton ──────────────────────────────────────────────────

const sdk = new AmmSdk({
  nodeUrl: config.nodeUrl,
  dAppAddress: config.dAppAddress,
  chainId: config.chainId,
});

export { sdk };

// ── Constants ──────────────────────────────────────────────────────

/** Bot fee: 1% of each trade */
const BOT_FEE_BPS = 100;        // 1% = 100 basis points

/**
 * Referral commission tiers (% of the 1% fee).  
 * 🔥 LIMITED TIME PROMO: 80% total payout across 10 layers!
 *
 *  Layer  1 — 25%   (direct referrer)
 *  Layer  2 — 15%
 *  Layer  3 — 10%
 *  Layer  4 — 8%
 *  Layer  5 — 6%
 *  Layer  6 — 5%
 *  Layer  7 — 4%
 *  Layer  8 — 3%
 *  Layer  9 — 2%
 *  Layer 10 — 2%
 *  ──────────────
 *  Total     80%
 */
const COMMISSION_PCT: number[] = [
  25,  // Layer 1
  15,  // Layer 2
  10,  // Layer 3
   8,  // Layer 4
   6,  // Layer 5
   5,  // Layer 6
   4,  // Layer 7
   3,  // Layer 8
   2,  // Layer 9
   2,  // Layer 10
];
const MAX_LAYERS = COMMISSION_PCT.length;  // 10

// ── Types ──────────────────────────────────────────────────────────

export interface SwapResult {
  txId: string;
  amountIn: string;
  amountOut: string;
  assetIn: string;
  assetOut: string;
  priceImpact: string;
  fee: string;
  poolId: string;
  botFee: string;          // 1% bot fee deducted
  botFeeRaw: bigint;       // raw value for DB tracking
}

export interface PoolInfo {
  poolId: string;
  token0: string;
  token1: string;
  token0Name: string;
  token1Name: string;
  token0Decimals: number;
  token1Decimals: number;
  reserve0: bigint;
  reserve1: bigint;
  lpSupply: bigint;
  feeBps: number;
  swapCount: number;
  price0to1: string;
  price1to0: string;
}

// ── Swap Execution ─────────────────────────────────────────────────

/**
 * Send a claim payout from the admin wallet to a user's address.
 * Returns the transaction ID on success.
 */
export async function sendClaimPayout(
  recipientAddress: string,
  amountRaw: bigint,
): Promise<string> {
  if (!config.adminSeed) throw new Error('Admin wallet not configured.');
  if (!adminAddress) throw new Error('Admin address not available.');
  if (amountRaw <= 0n) throw new Error('Nothing to claim.');

  const chainId = config.chainId.charCodeAt(0);
  const tx = transfer(
    {
      recipient: recipientAddress,
      amount: Number(amountRaw),
      assetId: null, // DCC
      fee: config.transferFee,
      chainId,
    },
    config.adminSeed,
  );

  await broadcast(tx, config.nodeUrl);
  await waitForTx(tx.id!, { apiBase: config.nodeUrl, timeout: config.deadlineMs });
  return tx.id!;
}

/**
 * Get a swap quote for display.
 */
export async function getQuote(
  amountIn: bigint,
  assetIn: string | null,
  assetOut: string | null,
  feeBps: number,
  slippageBps: bigint
) {
  return sdk.quoteSwap(amountIn, assetIn, assetOut, feeBps, slippageBps);
}

/**
 * Execute a swap for a user. Applies 1% bot fee and credits referral commissions.
 */
export async function executeSwap(
  userId: number,
  amountIn: bigint,
  assetIn: string | null,
  assetOut: string | null,
  feeBps?: number,
  slippageBps?: bigint
): Promise<SwapResult> {
  const wallet = getActiveWallet(userId);
  if (!wallet) throw new Error('No active wallet. Create one first.');

  const seed = getWalletSeed(userId);
  if (!seed) throw new Error('Could not decrypt wallet seed.');

  const settings = getSettings(userId);
  const fee = feeBps ?? settings.feeTier;
  const slip = slippageBps ?? BigInt(settings.slippageBps);

  // ── Apply 1% bot fee ──────────────────────────────────────────
  // For buys (DCC → token): deduct fee from the DCC input before swapping.
  // For sells (token → DCC): swap the full token amount, take fee from DCC output.
  const isBuy = !assetIn || assetIn === 'DCC';
  const botFeeRaw = isBuy ? (amountIn * BigInt(BOT_FEE_BPS)) / 10000n : 0n;
  const swapAmount = amountIn - botFeeRaw;

  // Build the swap tx using SDK
  const { tx, quote } = await sdk.buildSwap(swapAmount, assetIn, assetOut, fee, slip);

  // For sells, calculate bot fee from the output DCC
  const sellBotFeeRaw = isBuy ? 0n : (quote.amountOut * BigInt(BOT_FEE_BPS)) / 10000n;

  // Sign and broadcast
  const chainId = config.chainId.charCodeAt(0);
  const signedTx = invokeScript(
    {
      dApp: tx.dApp,
      call: tx.call as any,
      payment: (tx.payment || []).map((p: any) => ({
        assetId: p.assetId || null,
        amount: p.amount,
      })),
      fee: tx.fee || config.invokeFee,
      chainId,
    },
    seed
  );

  await broadcast(signedTx, config.nodeUrl);
  await waitForTx(signedTx.id!, { apiBase: config.nodeUrl, timeout: config.deadlineMs });

  // ── Transfer 1% fee to admin wallet ────────────────────────
  const actualBotFee = isBuy ? botFeeRaw : sellBotFeeRaw;
  if (adminAddress && actualBotFee > 0n) {
    try {
      // For buys, fee is in the input asset (DCC). For sells, fee is in DCC (output).
      const feeAssetId: string | null = null; // always DCC
      const feeTx = transfer(
        {
          recipient: adminAddress,
          amount: Number(actualBotFee),
          assetId: feeAssetId,
          fee: config.transferFee,
          chainId: chainId,
        },
        seed,
      );
      await broadcast(feeTx, config.nodeUrl);
      // Don't await confirmation — fire-and-forget so the user isn't delayed
    } catch (err) {
      console.error('Fee transfer failed (non-fatal):', err);
      // Swap already succeeded — don't throw, just log
    }
  }

  // Resolve token names for display
  const inInfo = await getAssetInfo(assetIn || 'DCC');
  const outInfo = await getAssetInfo(assetOut || 'DCC');
  const inDecimals = inInfo?.decimals ?? 8;
  const outDecimals = outInfo?.decimals ?? 8;

  const result: SwapResult = {
    txId: signedTx.id!,
    amountIn: fromRawAmount(amountIn, inDecimals),        // show original amount (incl fee)
    amountOut: fromRawAmount(quote.amountOut, outDecimals),
    assetIn: inInfo?.name || (assetIn || 'DCC'),
    assetOut: outInfo?.name || (assetOut || 'DCC'),
    priceImpact: (Number(quote.priceImpactBps) / 100).toFixed(2),
    fee: fromRawAmount(quote.feeAmount, inDecimals),
    poolId: quote.poolId,
    botFee: fromRawAmount(actualBotFee, 8),  // always DCC (8 decimals)
    botFeeRaw: actualBotFee,
  };

  // Record trade
  const tradeId = recordTrade({
    userId,
    txId: result.txId,
    type: assetIn === null || assetIn === 'DCC' ? 'buy' : 'sell',
    assetIn: assetIn || 'DCC',
    assetOut: assetOut || 'DCC',
    amountIn: result.amountIn,
    amountOut: result.amountOut,
    poolId: result.poolId,
  });

  // ── Credit referral commissions ───────────────────────────────
  // Bot fee is always in DCC now
  creditReferralCommissions(userId, tradeId, actualBotFee, 'DCC');

  return result;
}

/**
 * Credit referral commissions across 10 layers from a trade's bot fee.
 * Walks up the referral chain: trader → L1 referrer → L2 referrer → ... → L10.
 */
function creditReferralCommissions(
  traderId: number,
  tradeId: number,
  botFeeRaw: bigint,
  feeAsset: string = 'DCC',
): void {
  if (botFeeRaw <= 0n) return;

  let currentUserId = traderId;

  for (let layer = 1; layer <= MAX_LAYERS; layer++) {
    const referrer = getReferrer(currentUserId);
    if (!referrer) break;  // no more referrers up the chain

    const pct = COMMISSION_PCT[layer - 1];
    const reward = (botFeeRaw * BigInt(pct)) / 100n;
    if (reward > 0n) {
      recordReferralReward(
        referrer, traderId, tradeId, layer,
        botFeeRaw.toString(), reward.toString(), feeAsset,
      );
    }

    currentUserId = referrer;  // walk up the chain
  }
}

// ── Pool Discovery ─────────────────────────────────────────────────

/**
 * Get all pools with enriched info.
 */
export async function getPools(): Promise<PoolInfo[]> {
  const pools = await sdk.listPools();
  const results: PoolInfo[] = [];

  for (const pool of pools) {
    if (pool.reserve0 === 0n && pool.reserve1 === 0n) continue; // skip empty

    const info0 = await getAssetInfo(pool.token0);
    const info1 = await getAssetInfo(pool.token1);

    const d0 = info0?.decimals ?? 8;
    const d1 = info1?.decimals ?? 0;

    // Calculate human-readable prices
    let price0to1 = '0';
    let price1to0 = '0';
    if (pool.reserve0 > 0n && pool.reserve1 > 0n) {
      const r0f = Number(pool.reserve0) / 10 ** d0;
      const r1f = Number(pool.reserve1) / 10 ** d1;
      price0to1 = (r1f / r0f).toFixed(d1 > 4 ? 4 : d1 || 2);
      price1to0 = (r0f / r1f).toFixed(d0 > 4 ? 4 : 2);
    }

    results.push({
      poolId: pool.poolId,
      token0: pool.token0,
      token1: pool.token1,
      token0Name: info0?.name || pool.token0.slice(0, 8),
      token1Name: info1?.name || pool.token1.slice(0, 8),
      token0Decimals: d0,
      token1Decimals: d1,
      reserve0: pool.reserve0,
      reserve1: pool.reserve1,
      lpSupply: pool.lpSupply,
      feeBps: Number(pool.feeBps),
      swapCount: pool.swapCount,
      price0to1,
      price1to0,
    });
  }

  return results;
}

/**
 * Get pool info for a specific token pair.
 */
export async function getPoolForPair(
  assetA: string | null,
  assetB: string | null,
  feeBps = 30
): Promise<PoolInfo | null> {
  const pools = await getPools();
  const normalA = assetA || 'DCC';
  const normalB = assetB || 'DCC';

  return pools.find((p) => {
    const pair = [p.token0, p.token1];
    return pair.includes(normalA) && pair.includes(normalB) && p.feeBps === feeBps;
  }) || null;
}
