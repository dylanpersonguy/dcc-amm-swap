/**
 * PoolExplorer — displays all pools with reserves, prices, and stats.
 */

import React, { useState, useEffect } from 'react';
import { useSdk } from '../context/SdkContext';
import type { PoolState } from '@dcc-amm/sdk';

export function PoolExplorer() {
  const sdk = useSdk();
  const [pools, setPools] = useState<PoolState[]>([]);
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
    // Refresh every 15 seconds
    const interval = setInterval(fetchPools, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sdk]);

  const fmt = (val: bigint, decimals: number = 8): string => {
    if (val === 0n) return '0';
    const str = val.toString().padStart(decimals + 1, '0');
    const int = str.slice(0, str.length - decimals);
    const frac = str.slice(str.length - decimals, str.length - decimals + 4);
    const trimmed = frac.replace(/0+$/, '');
    return trimmed ? `${int}.${trimmed}` : int;
  };

  if (loading) {
    return (
      <div className="card">
        <div className="status-msg pending">Loading pools...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="status-msg error">{error}</div>
      </div>
    );
  }

  if (pools.length === 0) {
    return (
      <div className="card">
        <div className="status-msg">No pools found. Create one in the Liquidity tab!</div>
      </div>
    );
  }

  return (
    <div className="card">
      <table className="pool-table">
        <thead>
          <tr>
            <th>Pair</th>
            <th>Reserve A</th>
            <th>Reserve B</th>
            <th>Fee</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {pools.map((pool) => (
            <tr key={pool.poolKey}>
              <td>
                {pool.assetA === 'DCC' ? 'DCC' : pool.assetA.slice(0, 6) + '...'}
                {' / '}
                {pool.assetB === 'DCC' ? 'DCC' : pool.assetB.slice(0, 6) + '...'}
              </td>
              <td>{fmt(pool.reserveA)}</td>
              <td>{fmt(pool.reserveB)}</td>
              <td>{Number(pool.feeBps) / 100}%</td>
              <td style={{ color: pool.status === 'active' ? 'var(--success)' : 'var(--error)' }}>
                {pool.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
