/**
 * Wallet service — create, import, and manage DCC wallets.
 * Uses @decentralchain/transactions for key derivation.
 */

import { libs } from '@decentralchain/transactions';
import { config } from '../config';
import {
  createWallet as dbCreateWallet,
  getActiveWallet,
  getUserWallets,
  setActiveWallet,
  deleteWallet as dbDeleteWallet,
  getWalletSeed,
  UserWallet,
} from '../db';

/**
 * Generate a new random wallet for a user.
 */
export function generateWallet(userId: number, label = 'Wallet'): UserWallet {
  // Generate 15-word seed phrase
  const seed = libs.crypto.randomSeed(15);
  const address = libs.crypto.address(seed, config.chainId);
  const publicKey = libs.crypto.publicKey(seed);

  const wallets = getUserWallets(userId);
  const walletLabel = label || `Wallet ${wallets.length + 1}`;

  return dbCreateWallet(userId, walletLabel, address, publicKey, seed);
}

/**
 * Import a wallet from a seed phrase.
 */
export function importWallet(userId: number, seed: string, label = 'Imported'): UserWallet {
  const trimmed = seed.trim();
  if (!trimmed) throw new Error('Empty seed phrase');

  const address = libs.crypto.address(trimmed, config.chainId);
  const publicKey = libs.crypto.publicKey(trimmed);

  // Check if already imported
  const existing = getUserWallets(userId);
  const dup = existing.find((w) => w.address === address);
  if (dup) {
    setActiveWallet(userId, dup.id);
    return dup;
  }

  return dbCreateWallet(userId, label, address, publicKey, trimmed);
}

/**
 * Get the active wallet's DCC balance.
 */
export async function getBalance(address: string): Promise<bigint> {
  const res = await fetch(`${config.nodeUrl}/addresses/balance/${address}`);
  if (!res.ok) return 0n;
  const data = (await res.json()) as { balance: number };
  return BigInt(data.balance);
}

/**
 * Get a specific asset balance.
 */
export async function getAssetBalance(address: string, assetId: string): Promise<bigint> {
  if (!assetId || assetId === 'DCC') return getBalance(address);
  const res = await fetch(`${config.nodeUrl}/assets/balance/${address}/${assetId}`);
  if (!res.ok) return 0n;
  const data = (await res.json()) as { balance: number };
  return BigInt(data.balance);
}

/**
 * Get all non-zero asset balances for an address.
 */
export async function getAllBalances(
  address: string
): Promise<Array<{ assetId: string | null; name: string; balance: bigint; decimals: number }>> {
  const results: Array<{ assetId: string | null; name: string; balance: bigint; decimals: number }> = [];

  // DCC balance
  const dcc = await getBalance(address);
  results.push({ assetId: null, name: 'DCC', balance: dcc, decimals: 8 });

  // Fetch all asset balances
  try {
    const res = await fetch(`${config.nodeUrl}/assets/balance/${address}`);
    if (res.ok) {
      const data = (await res.json()) as { balances: Array<{ assetId: string; balance: number; issueTransaction: { name: string; decimals: number } | null }> };
      for (const b of data.balances) {
        if (b.balance > 0) {
          results.push({
            assetId: b.assetId,
            name: b.issueTransaction?.name || b.assetId.slice(0, 8),
            balance: BigInt(b.balance),
            decimals: b.issueTransaction?.decimals ?? 0,
          });
        }
      }
    }
  } catch {
    // Ignore — at minimum we have DCC
  }

  return results;
}

/**
 * Get asset info from on-chain.
 */
export async function getAssetInfo(assetId: string): Promise<{
  name: string;
  decimals: number;
  description: string;
} | null> {
  if (!assetId || assetId === 'DCC') {
    return { name: 'DCC', decimals: 8, description: 'DecentralChain native token' };
  }
  try {
    const res = await fetch(`${config.nodeUrl}/assets/details/${assetId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    return {
      name: data.name || assetId.slice(0, 8),
      decimals: data.decimals ?? 0,
      description: data.description || '',
    };
  } catch {
    return null;
  }
}

export {
  getActiveWallet,
  getUserWallets,
  setActiveWallet,
  getWalletSeed,
};
export { deleteWallet as removeWallet } from '../db';
