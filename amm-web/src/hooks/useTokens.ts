/**
 * useTokens hook — discovers available tokens from on-chain pool data
 * AND the connected wallet's asset balances.
 */

import { useState, useEffect, useCallback } from 'react';
import { useSdk } from '../context/SdkContext';
import { useWallet } from '../context/WalletContext';
import { config } from '../config';

export interface TokenInfo {
  assetId: string | null; // null for DCC
  name: string;
  decimals: number;
}

const DCC_TOKEN: TokenInfo = { assetId: null, name: 'DCC', decimals: 8 };

/** Map of lowercase token name keywords to logo file paths */
const TOKEN_LOGOS: Record<string, string> = {
  dcc: '/logo.png',
  usdc: '/tokens/usdc.png',
  usdt: '/tokens/usdt.png',
  tether: '/tokens/usdt.png',
  solana: '/tokens/solana.png',
  sol: '/tokens/solana.png',
  bitcoin: '/tokens/bitcoin.png',
  btc: '/tokens/bitcoin.png',
  wbtc: '/tokens/bitcoin.png',
  ethereum: '/tokens/ethereum.png',
  eth: '/tokens/ethereum.png',
  weth: '/tokens/ethereum.png',
  bnb: '/tokens/bnb.png',
  dai: '/tokens/dai.png',
  waves: '/tokens/waves.png',
  sdcc: '/tokens/staked-dcc.png',
  'staked dcc': '/tokens/staked-dcc.png',
  'staked decentralchain': '/tokens/staked-dcc.png',
};

/** Map of asset IDs to logo file paths */
const ASSET_ID_LOGOS: Record<string, string> = {
  '8MFwa1h8Y6SBc6B3BJwYfC4Fe13EFx5ifkAziXAZRVvc': '/tokens/staked-dcc.png',
};

/** Get the logo URL for a token by name or asset ID. Returns null if no logo available. */
export function getTokenLogo(name: string | null | undefined, assetId?: string | null): string | null {
  if (assetId && ASSET_ID_LOGOS[assetId]) return ASSET_ID_LOGOS[assetId];
  if (!name) return null;
  const lower = name.toLowerCase();
  // Exact match first
  if (TOKEN_LOGOS[lower]) return TOKEN_LOGOS[lower];
  // Partial match (e.g. "Wrapped Bitcoin" contains "bitcoin")
  for (const [key, url] of Object.entries(TOKEN_LOGOS)) {
    if (lower.includes(key)) return url;
  }
  return null;
}

/** Generate a deterministic color from an asset ID */
export function getTokenColor(assetId: string | null): string {
  if (!assetId || assetId === 'DCC') return '#58a6ff';
  let hash = 0;
  for (let i = 0; i < assetId.length; i++) {
    hash = assetId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `hsl(${h}, 60%, 60%)`;
}

export function useTokens() {
  const sdk = useSdk();
  const { address, isConnected } = useWallet();
  const [tokens, setTokens] = useState<TokenInfo[]>([DCC_TOKEN]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const tokenMap = new Map<string, TokenInfo>();
      tokenMap.set('DCC', DCC_TOKEN);

      // 1. Discover tokens from pools
      const pools = await sdk.listPools();
      const poolAssetIds = new Set<string>();
      for (const pool of pools) {
        if (pool.token0 && pool.token0 !== 'DCC') poolAssetIds.add(pool.token0);
        if (pool.token1 && pool.token1 !== 'DCC') poolAssetIds.add(pool.token1);
      }

      for (const id of poolAssetIds) {
        if (tokenMap.has(id)) continue;
        try {
          const info = await sdk.node.getAssetInfo(id);
          tokenMap.set(id, {
            assetId: id,
            name: info?.name || id.slice(0, 8) + '…',
            decimals: info?.decimals ?? 8,
          });
        } catch {
          tokenMap.set(id, { assetId: id, name: id.slice(0, 8) + '…', decimals: 8 });
        }
      }

      // 2. Fetch wallet balances to discover additional tokens
      if (isConnected && address) {
        try {
          const nodeUrl = (sdk as any).node?.nodeUrl || config.nodeUrl;
          const res = await fetch(`${nodeUrl}/assets/balance/${address}`);
          if (res.ok) {
            const data = (await res.json()) as {
              balances: Array<{
                assetId: string;
                balance: number;
                issueTransaction: { name: string; decimals: number } | null;
              }>;
            };
            for (const b of data.balances) {
              if (b.balance > 0 && !tokenMap.has(b.assetId)) {
                tokenMap.set(b.assetId, {
                  assetId: b.assetId,
                  name: b.issueTransaction?.name || b.assetId.slice(0, 8) + '…',
                  decimals: b.issueTransaction?.decimals ?? 8,
                });
              }
            }
          }
        } catch {
          // Wallet balance fetch failed — still have pool tokens
        }
      }

      setTokens(Array.from(tokenMap.values()));
    } catch (err) {
      console.error('[useTokens] Failed to load tokens:', err);
    } finally {
      setLoading(false);
    }
  }, [sdk, address, isConnected]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tokens, loading, refresh };
}
