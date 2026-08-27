/**
 * Solana service — generates deposit addresses and monitors incoming deposits.
 *
 * Each deposit order gets a unique derived Solana address.
 * The service polls for incoming transactions and triggers DCC payouts.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { config } from './config';
import * as db from './db';

// ── Connection ─────────────────────────────────────────────────────

let connection: Connection;

export function initSolana(): void {
  connection = new Connection(config.solanaRpcUrl, 'confirmed');
  console.log(`  Solana RPC: ${config.solanaRpcUrl}`);
}

// ── Address derivation ─────────────────────────────────────────────

/**
 * Generate a unique deposit keypair for an order.
 * Uses deterministic derivation from the order ID for reproducibility.
 */
export function generateDepositKeypair(orderId: string): Keypair {
  // Derive a seed from the order ID + admin secret
  const crypto = require('crypto');
  const seed = crypto.createHash('sha256')
    .update(`dcc-bridge:${orderId}:${config.solanaAdminSeed || 'default'}`)
    .digest();
  // Use first 32 bytes as Ed25519 seed
  return Keypair.fromSeed(seed.subarray(0, 32));
}

/**
 * The bridge's own Solana wallet — sweep destination and fee payer for every
 * sweep. Derived the same deterministic way as deposit keypairs but with a
 * fixed label instead of a per-order id, so it never needs a separate secret.
 * Must be funded with a small amount of real SOL (covers tx fees only —
 * a few thousand lamports per sweep, so even 0.05 SOL covers thousands).
 */
export function getTreasuryKeypair(): Keypair {
  const crypto = require('crypto');
  const seed = crypto.createHash('sha256')
    .update(`dcc-bridge:treasury:${config.solanaAdminSeed || 'default'}`)
    .digest();
  return Keypair.fromSeed(seed.subarray(0, 32));
}

/**
 * Get SOL balance for an address.
 */
export async function getSolBalance(address: string): Promise<number> {
  try {
    const pubkey = new PublicKey(address);
    const balance = await connection.getBalance(pubkey);
    return balance / LAMPORTS_PER_SOL;
  } catch {
    return 0;
  }
}

/**
 * Get SPL token balance for an address.
 * Returns balance in raw units (before decimal adjustment).
 */
export async function getSplBalance(address: string, mintAddress: string): Promise<bigint> {
  try {
    const { TOKEN_PROGRAM_ID } = await import('@solana/spl-token');
    const pubkey = new PublicKey(address);
    const mint = new PublicKey(mintAddress);

    const accounts = await connection.getTokenAccountsByOwner(pubkey, { mint });
    if (accounts.value.length === 0) return 0n;

    // Parse account data to get balance
    const accountInfo = accounts.value[0].account;
    // Token account data: first 32 bytes = mint, next 32 = owner, next 8 = amount (LE)
    const data = accountInfo.data;
    const amount = data.readBigUInt64LE(64);
    return amount;
  } catch {
    return 0n;
  }
}

// ── SPL Token mints ────────────────────────────────────────────────

export const SPL_MINTS: Record<string, string> = {
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

// ── Price fetching ─────────────────────────────────────────────────

// Simple price cache (5 min TTL)
const priceCache = new Map<string, { price: number; ts: number }>();
const PRICE_CACHE_TTL = 5 * 60 * 1000;

/**
 * Get the current USD price of a coin.
 * Uses CoinGecko-compatible free API as fallback.
 */
export async function getCoinPriceUsd(coin: string): Promise<number> {
  const cached = priceCache.get(coin);
  if (cached && Date.now() - cached.ts < PRICE_CACHE_TTL) return cached.price;

  // Static fallback prices (updated at deploy)
  const fallbackPrices: Record<string, number> = {
    SOL: 150.0,
    USDT: 1.0,
    USDC: 1.0,
  };

  try {
    const ids: Record<string, string> = {
      SOL: 'solana',
      USDT: 'tether',
      USDC: 'usd-coin',
    };
    const cgId = ids[coin];
    if (!cgId) return fallbackPrices[coin] || 1;

    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd`,
    );
    if (res.ok) {
      const data = await res.json() as any;
      const price = data[cgId]?.usd;
      if (price) {
        priceCache.set(coin, { price, ts: Date.now() });
        return price;
      }
    }
  } catch {
    // Use fallback
  }

  return fallbackPrices[coin] || 1;
}

/**
 * Calculate how much of a coin is needed to buy X USD worth.
 */
export async function coinAmountForUsd(coin: string, amountUsd: number): Promise<string> {
  const price = await getCoinPriceUsd(coin);
  const amount = amountUsd / price;

  // Format with appropriate decimals
  if (coin === 'SOL') return amount.toFixed(6);
  return amount.toFixed(2); // USDT/USDC
}

// ── Deposit monitoring ─────────────────────────────────────────────

/**
 * Check all pending deposit orders for incoming funds.
 * Called periodically by the main loop.
 */
export async function checkPendingDeposits(
  onDeposit: (order: db.DepositOrder, txSig: string) => Promise<void>,
): Promise<void> {
  const pending = db.getPendingOrders();
  if (pending.length === 0) return;

  for (const order of pending) {
    // Check for expiry
    const now = Math.floor(Date.now() / 1000);
    if (order.status === 'pending' && order.expiresAt < now) {
      db.updateOrderStatus(order.id, 'expired');
      console.log(`⌛ Order ${order.id} expired`);
      continue;
    }

    try {
      let hasDeposit = false;

      if (order.coin === 'SOL') {
        const balance = await getSolBalance(order.depositAddress);
        const expected = parseFloat(order.depositAmount);
        // Allow 1% tolerance
        if (balance >= expected * 0.99) {
          hasDeposit = true;
        }
      } else {
        // SPL token (USDT/USDC)
        const mint = SPL_MINTS[order.coin];
        if (mint) {
          const balance = await getSplBalance(order.depositAddress, mint);
          const decimals = order.coin === 'SOL' ? 9 : 6;
          const expected = parseFloat(order.depositAmount) * (10 ** decimals);
          if (Number(balance) >= expected * 0.99) {
            hasDeposit = true;
          }
        }
      }

      if (hasDeposit && order.status === 'pending') {
        db.updateOrderStatus(order.id, 'confirming');
        console.log(`🔄 Deposit detected for order ${order.id}`);
        await onDeposit(order, '');
      }
    } catch (err) {
      console.error(`Error checking deposit for ${order.id}:`, err);
    }
  }
}

// ── Fund sweeping ────────────────────────────────────────────────────

/**
 * Move a completed order's deposit from its per-order address to the
 * treasury. The treasury is always the fee payer (and co-signs), so the
 * deposit address itself never needs its own SOL for fees — this matters
 * especially for SPL deposits, where the user only ever sends the token,
 * never extra SOL.
 */
export async function sweepDeposit(orderId: string, coin: string): Promise<string | null> {
  const depositKeypair = generateDepositKeypair(orderId);
  const treasuryKeypair = getTreasuryKeypair();

  if (coin === 'SOL') {
    const lamports = await connection.getBalance(depositKeypair.publicKey);
    if (lamports <= 0) return null;

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: depositKeypair.publicKey,
        toPubkey: treasuryKeypair.publicKey,
        lamports,
      }),
    );
    tx.feePayer = treasuryKeypair.publicKey;
    const sig = await sendAndConfirmTransaction(connection, tx, [treasuryKeypair, depositKeypair]);
    console.log(`🧹 Swept ${lamports / LAMPORTS_PER_SOL} SOL from order ${orderId}: ${sig}`);
    return sig;
  }

  const mintAddress = SPL_MINTS[coin];
  if (!mintAddress) return null;

  const { getAssociatedTokenAddress, createTransferInstruction, getOrCreateAssociatedTokenAccount } =
    await import('@solana/spl-token');
  const mint = new PublicKey(mintAddress);
  const amount = await getSplBalance(depositKeypair.publicKey.toBase58(), mintAddress);
  if (amount <= 0n) return null;

  const sourceAta = await getAssociatedTokenAddress(mint, depositKeypair.publicKey);
  // Treasury pays for its own ATA creation if this is the first sweep of this mint.
  const treasuryAta = await getOrCreateAssociatedTokenAccount(
    connection,
    treasuryKeypair,
    mint,
    treasuryKeypair.publicKey,
  );

  const tx = new Transaction().add(
    createTransferInstruction(sourceAta, treasuryAta.address, depositKeypair.publicKey, amount),
  );
  tx.feePayer = treasuryKeypair.publicKey;
  const sig = await sendAndConfirmTransaction(connection, tx, [treasuryKeypair, depositKeypair]);
  console.log(`🧹 Swept ${amount} raw ${coin} from order ${orderId}: ${sig}`);
  return sig;
}
