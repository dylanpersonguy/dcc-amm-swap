/**
 * Bridge service client — communicates with the DCC Bridge API
 * to handle cross-chain deposits (SOL/USDT/USDC on Solana → DCC).
 *
 * Bridge API is expected at BRIDGE_API_URL (default: http://localhost:3001).
 */

import { config } from '../config';

const BRIDGE_URL = process.env.BRIDGE_API_URL || 'http://localhost:3001';

// ── Types ──────────────────────────────────────────────────────────

export type BridgeCoin = 'SOL' | 'USDT' | 'USDC';

export interface DepositRequest {
  coin: BridgeCoin;
  amountUsd: number;          // how much USD worth the user wants to deposit
  dccAmount: number;          // how many DCC to receive (amountUsd / 0.05)
  dccRecipient: string;       // DCC address to receive the purchased DCC
  userId: number;             // Telegram user ID for tracking
}

export interface DepositResponse {
  id: string;                 // unique transfer/order ID
  depositAddress: string;     // Solana address to send funds to
  depositAmount: string;      // exact amount of SOL/USDT/USDC to send
  coin: BridgeCoin;
  dccAmount: string;          // DCC to be sent on confirmation
  expiresAt: string;          // ISO timestamp — deposit window
  status: 'pending' | 'confirming' | 'completed' | 'expired' | 'failed';
}

export interface DepositStatus {
  id: string;
  status: 'pending' | 'confirming' | 'completed' | 'expired' | 'failed';
  depositAddress: string;
  depositAmount: string;
  coin: BridgeCoin;
  dccAmount: string;
  dccTxId?: string;           // on-chain DCC tx ID once sent
  confirmedAt?: string;
  expiresAt: string;
}

export interface DepositLimits {
  minUsd: number;
  maxUsd: number;
  coins: Array<{
    coin: BridgeCoin;
    minAmount: string;
    maxAmount: string;
    decimals: number;
    price: number;            // current price in USD
  }>;
}

export interface FeesQuote {
  coin: BridgeCoin;
  amountUsd: number;
  networkFee: string;         // in coin units
  bridgeFee: string;          // in coin units
  totalFee: string;
  dccReceived: string;        // net DCC after fees
  rate: number;               // DCC per USD
}

export interface BridgeHealth {
  status: 'ok' | 'degraded' | 'down';
  solana: boolean;
  dcc: boolean;
  timestamp: string;
}

// ── API Client ─────────────────────────────────────────────────────

async function bridgeFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${BRIDGE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bridge API ${res.status}: ${body || res.statusText}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Check bridge health.
 */
export async function getHealth(): Promise<BridgeHealth> {
  return bridgeFetch<BridgeHealth>('/health');
}

/**
 * Get deposit limits and supported coins.
 */
export async function getDepositLimits(): Promise<DepositLimits> {
  return bridgeFetch<DepositLimits>('/deposit/limits');
}

/**
 * Get a fee quote for a specific deposit.
 */
export async function getFeesQuote(coin: BridgeCoin, amountUsd: number): Promise<FeesQuote> {
  return bridgeFetch<FeesQuote>(`/fees/quote?coin=${coin}&amountUsd=${amountUsd}`);
}

/**
 * Create a deposit — generates a Solana deposit address.
 * User sends SOL/USDT/USDC to this address, and bridge sends DCC to their wallet.
 */
export async function createDeposit(req: DepositRequest): Promise<DepositResponse> {
  return bridgeFetch<DepositResponse>('/deposit', {
    method: 'POST',
    body: JSON.stringify({
      coin: req.coin,
      amountUsd: req.amountUsd,
      dccAmount: req.dccAmount,
      dccRecipient: req.dccRecipient,
      userId: req.userId,
    }),
  });
}

/**
 * Create an SPL token deposit (USDT/USDC on Solana).
 */
export async function createSplDeposit(req: DepositRequest): Promise<DepositResponse> {
  return bridgeFetch<DepositResponse>('/deposit/spl', {
    method: 'POST',
    body: JSON.stringify({
      coin: req.coin,
      amountUsd: req.amountUsd,
      dccAmount: req.dccAmount,
      dccRecipient: req.dccRecipient,
      userId: req.userId,
    }),
  });
}

/**
 * Get deposit/order status by ID.
 */
export async function getDepositStatus(id: string): Promise<DepositStatus> {
  return bridgeFetch<DepositStatus>(`/${id}`);
}

/**
 * Get transfer history for a DCC address.
 */
export async function getHistory(dccAddress: string): Promise<DepositStatus[]> {
  return bridgeFetch<DepositStatus[]>(`/history/${dccAddress}`);
}

// ── DCC Price ──────────────────────────────────────────────────────

/** Fixed DCC price for the buy flow */
export const DCC_PRICE_USD = 0.05;

/**
 * Calculate how many DCC the user gets for a USD amount.
 */
export function usdToDcc(amountUsd: number): number {
  return Math.floor(amountUsd / DCC_PRICE_USD);
}

/**
 * Calculate USD cost for a DCC amount.
 */
export function dccToUsd(dccAmount: number): number {
  return dccAmount * DCC_PRICE_USD;
}

// ── Coin metadata ──────────────────────────────────────────────────

export const SUPPORTED_COINS: Record<BridgeCoin, {
  name: string;
  symbol: string;
  emoji: string;
  isNative: boolean;
  decimals: number;
  splMint?: string;
}> = {
  SOL: {
    name: 'Solana',
    symbol: 'SOL',
    emoji: '◎',
    isNative: true,
    decimals: 9,
  },
  USDT: {
    name: 'Tether USD',
    symbol: 'USDT',
    emoji: '💵',
    isNative: false,
    decimals: 6,
    splMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  },
  USDC: {
    name: 'USD Coin',
    symbol: 'USDC',
    emoji: '🔵',
    isNative: false,
    decimals: 6,
    splMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  },
};
