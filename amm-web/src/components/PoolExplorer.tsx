/**
 * PoolExplorer — card-based pool browser with stats.
 */

import React, { useState, useEffect } from 'react';
import { useSdk } from '../context/SdkContext';
import { getTokenColor, useTokens } from '../hooks/useTokens';
import type { PoolStateV2 } from '@dcc-amm/sdk';

export function PoolExplorer() {
  const sdk = useSdk();
  const { tokens } = useTokens();
  const [pools, setPools] = useState<PoolStateV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchPools() {
      try {
        setLoading(true);
        const allPools = await sdk.listPools();
        if (!cancelled) {
          setPools(allPools);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch pools');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPools();
    const interval = setInterval(fetchPools, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [sdk]);

  const fmt = (val: bigint, decimals = 8): string => {
    if (val === 0n) return '0';
    const str = val.toString().padStart(decimals + 1, '0');
    const int = str.slice(0, str.length - decimals);
    const frac = str.slice(str.length - decimals, str.length - decimals + 4).replace(/0+$/, '');
    return frac ? `${int}.${frac}` : int;
  };

  const fmtAsset = (s: string) => (s === 'DCC' ? 'DCC' : s.slice(0, 8) + '…');

  const getDecimals = (assetId: string): number => {
    if (!assetId || assetId === 'DCC') return 8;
    const t = tokens.find((tk) => tk.assetId === assetId);
    return t?.decimals ?? 8;
  };

  if (loading) {
    return (
      <div className="panel-card">
        <div className="panel-header"><h2>Pools</h2></div>
        <div className="empty-state">
          <span className="spinner lg" />
          <p>Loading pools...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel-card">
        <div className="panel-header"><h2>Pools</h2></div>
        <div className="empty-state error">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (pools.length === 0) {
    return (
      <div className="panel-card">
        <div className="panel-header"><h2>Pools</h2></div>
        <div className="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <p>No pools yet</p>
          <span className="empty-hint">Create one in the Liquidity tab to get started!</span>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-card pool-explorer">
      <div className="panel-header">
        <h2>Pools</h2>
        <span className="pool-count">{pools.length} pool{pools.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="pool-grid">
        {pools.map((pool) => (
          <div key={pool.poolId} className="pool-card">
            <div className="pool-card-header">
              <div className="pool-pair">
                <span className="pool-dot" style={{ background: getTokenColor(pool.token0 === 'DCC' ? null : pool.token0) }} />
                <span className="pool-dot" style={{ background: getTokenColor(pool.token1 === 'DCC' ? null : pool.token1), marginLeft: -6 }} />
                <span className="pool-pair-name">
                  {fmtAsset(pool.token0)} / {fmtAsset(pool.token1)}
                </span>
              </div>
              <span className="pool-fee-badge">{Number(pool.feeBps) / 100}%</span>
            </div>

            <div className="pool-stats">
              <div className="pool-stat">
                <span className="pool-stat-label">Reserve {fmtAsset(pool.token0)}</span>
                <span className="pool-stat-value">{fmt(pool.reserve0, getDecimals(pool.token0))}</span>
              </div>
              <div className="pool-stat">
                <span className="pool-stat-label">Reserve {fmtAsset(pool.token1)}</span>
                <span className="pool-stat-value">{fmt(pool.reserve1, getDecimals(pool.token1))}</span>
              </div>
              <div className="pool-stat">
                <span className="pool-stat-label">LP Supply</span>
                <span className="pool-stat-value">{fmt(pool.lpSupply)}</span>
              </div>
              <div className="pool-stat">
                <span className="pool-stat-label">Total Swaps</span>
                <span className="pool-stat-value">{pool.swapCount}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
