/**
 * useTokens hook — discovers available tokens from on-chain pool data.
 * Fetches pools, extracts unique token IDs, and resolves asset info.
 */

import { useState, useEffect, useCallback } from 'react';
import { useSdk } from '../context/SdkContext';

export interface TokenInfo {
  assetId: string | null; // null for DCC
  name: string;
  decimals: number;
}

const DCC_TOKEN: TokenInfo = { assetId: null, name: 'DCC', decimals: 8 };

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
  const [tokens, setTokens] = useState<TokenInfo[]>([DCC_TOKEN]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const pools = await sdk.listPools();
      const assetIds = new Set<string>();

      for (const pool of pools) {
        if (pool.token0 && pool.token0 !== 'DCC') assetIds.add(pool.token0);
        if (pool.token1 && pool.token1 !== 'DCC') assetIds.add(pool.token1);
      }

      const tokenList: TokenInfo[] = [DCC_TOKEN];

      for (const id of assetIds) {
        try {
          const info = await sdk.node.getAssetInfo(id);
          tokenList.push({
            assetId: id,
            name: info?.name || id.slice(0, 8) + '…',
            decimals: info?.decimals ?? 8,
          });
        } catch {
          tokenList.push({
            assetId: id,
            name: id.slice(0, 8) + '…',
            decimals: 8,
          });
        }
      }

      setTokens(tokenList);
    } catch (err) {
      console.error('[useTokens] Failed to load tokens:', err);
    } finally {
      setLoading(false);
    }
  }, [sdk]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tokens, loading, refresh };
}
