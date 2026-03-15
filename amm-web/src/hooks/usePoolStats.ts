/**
 * usePoolStats — fetches pool APY/volume/fees from the indexer API.
 * Falls back to a client-side estimate from on-chain cumulative data.
 */

import { useState, useEffect, useRef } from 'react';
import { config } from '../config';
import type { PoolStateV2 } from '@dcc-amm/sdk';

export interface PoolStats {
  poolKey: string;
  apy: number;
  volume24h: string;
  fees24h: string;
  tvl: string;
  txCount24h: number;
}

/** Fetch stats for a single pool from the indexer. */
async function fetchPoolStats(poolKey: string): Promise<PoolStats | null> {
  try {
    const res = await fetch(`${config.indexerUrl}/pools/${encodeURIComponent(poolKey)}/stats`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Client-side APY estimate from cumulative on-chain data (since pool creation). */
function estimateApy(pool: PoolStateV2): number {
  const tvl = pool.reserve0 + pool.reserve1;
  if (tvl <= 0n) return 0;

  // Convert fees to token0 terms using the price ratio
  const price1in0 = pool.reserve0 > 0n
    ? Number(pool.reserve1) / Number(pool.reserve0)
    : 1;
  const totalFeesInToken0 = Number(pool.fees0) + (price1in0 > 0
    ? Number(pool.fees1) / price1in0
    : 0);
  const tvlInToken0 = Number(pool.reserve0) * 2;

  if (tvlInToken0 <= 0) return 0;

  // createdAt is already in milliseconds (from lastBlock.timestamp in RIDE)
  const ageMs = Date.now() - pool.createdAt;
  const ageDays = ageMs / 86_400_000;
  if (ageDays < 0.01) return 0;

  const dailyFeeRate = totalFeesInToken0 / ageDays / tvlInToken0;
  return Math.round(dailyFeeRate * 365 * 100 * 100) / 100;
}

/** Hook: returns a map of poolId → PoolStats for a set of pools. */
export function usePoolStats(pools: PoolStateV2[]): Map<string, PoolStats> {
  const [statsMap, setStatsMap] = useState<Map<string, PoolStats>>(new Map());
  const poolIds = pools.map((p) => p.poolId).join(',');
  const poolsRef = useRef(pools);
  poolsRef.current = pools;

  useEffect(() => {
    if (pools.length === 0) return;
    let cancelled = false;

    async function load() {
      const result = new Map<string, PoolStats>();

      // Try fetching all stats from indexer in parallel
      const fetched = await Promise.all(
        poolsRef.current.map((p) => fetchPoolStats(p.poolId))
      );

      for (let i = 0; i < poolsRef.current.length; i++) {
        const pool = poolsRef.current[i];
        const stats = fetched[i];
        if (stats) {
          result.set(pool.poolId, stats);
        } else {
          // Fallback: estimate from on-chain data
          result.set(pool.poolId, {
            poolKey: pool.poolId,
            apy: estimateApy(pool),
            volume24h: '0',
            fees24h: '0',
            tvl: (pool.reserve0 + pool.reserve1).toString(),
            txCount24h: 0,
          });
        }
      }

      if (!cancelled) setStatsMap(result);
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [poolIds]);

  return statsMap;
}
