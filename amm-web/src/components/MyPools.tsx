/**
 * MyPools — shows pools where the connected user has LP positions.
 * Clicking a pool opens the PoolDetail view.
 */

import React, { useState, useEffect } from 'react';
import { useSdk } from '../context/SdkContext';
import { useWallet } from '../context/WalletContext';
import { useTokens, getTokenColor } from '../hooks/useTokens';
import { PoolDetail } from './PoolDetail';
import type { PoolStateV2 } from '@dcc-amm/sdk';

interface UserPosition {
  pool: PoolStateV2;
  lpBalance: bigint;
  sharePercent: number;
  value0: bigint;
  value1: bigint;
}

export function MyPools() {
  const sdk = useSdk();
  const { address, isConnected, openConnectModal } = useWallet();
  const { tokens } = useTokens();

  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      setPositions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function fetchPositions() {
      try {
        setLoading(true);
        const allPools = await sdk.listPools();
        const userPositions: UserPosition[] = [];

        for (const pool of allPools) {
          // Check LP token balance (v3 real asset)
          let lpBalance = 0n;
          if (pool.lpAssetId) {
            lpBalance = await sdk.getBalance(address!, pool.lpAssetId);
          }
          // Also check on-chain internal LP balance (legacy)
          if (lpBalance === 0n) {
            lpBalance = await sdk.getLpBalance(pool.poolId, address!);
          }

          if (lpBalance > 0n && pool.lpSupply > 0n) {
            const sharePercent = Number(lpBalance * 10000n / pool.lpSupply) / 100;
            const value0 = (pool.reserve0 * lpBalance) / pool.lpSupply;
            const value1 = (pool.reserve1 * lpBalance) / pool.lpSupply;
            userPositions.push({ pool, lpBalance, sharePercent, value0, value1 });
          }
        }

        if (!cancelled) {
          setPositions(userPositions);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load positions');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPositions();
    const interval = setInterval(fetchPositions, 20000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [sdk, address, isConnected]);

  const fmt = (val: bigint, decimals = 8): string => {
    if (val === 0n) return '0';
    const str = val.toString().padStart(decimals + 1, '0');
    const int = str.slice(0, str.length - decimals);
    const frac = str.slice(str.length - decimals, str.length - decimals + 4).replace(/0+$/, '');
    return frac ? `${int}.${frac}` : int;
  };

  const fmtAsset = (s: string) => {
    if (!s || s === 'DCC') return 'DCC';
    const t = tokens.find((tk) => tk.assetId === s);
    return t?.name || s.slice(0, 8) + '…';
  };

  const getDecimals = (assetId: string): number => {
    if (!assetId || assetId === 'DCC') return 8;
    const t = tokens.find((tk) => tk.assetId === assetId);
    return t?.decimals ?? 8;
  };

  // Pool detail view
  if (selectedPoolId) {
    const pos = positions.find((p) => p.pool.poolId === selectedPoolId);
    return (
      <PoolDetail
        poolId={selectedPoolId}
        userLpBalance={pos?.lpBalance ?? 0n}
        onBack={() => setSelectedPoolId(null)}
      />
    );
  }

  // Not connected
  if (!isConnected) {
    return (
      <div className="panel-card my-pools">
        <div className="panel-header"><h2>My Pools</h2></div>
        <div className="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0zM6 19c0-2 3-4 6-4s6 2 6 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <p>Connect your wallet to view your positions</p>
          <button className="btn-accent" onClick={() => openConnectModal()}>
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="panel-card my-pools">
        <div className="panel-header"><h2>My Pools</h2></div>
        <div className="empty-state">
          <span className="spinner lg" />
          <p>Loading your positions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel-card my-pools">
        <div className="panel-header"><h2>My Pools</h2></div>
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

  if (positions.length === 0) {
    return (
      <div className="panel-card my-pools">
        <div className="panel-header"><h2>My Pools</h2></div>
        <div className="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M3 9h18M9 3v18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <p>No liquidity positions found</p>
          <span className="empty-hint">Add liquidity to a pool in the Liquidity tab to get started!</span>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-card my-pools">
      <div className="panel-header">
        <h2>My Pools</h2>
        <span className="pool-count">{positions.length} position{positions.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="pool-grid">
        {positions.map(({ pool, lpBalance, sharePercent, value0, value1 }) => (
          <div
            key={pool.poolId}
            className="pool-card position-card"
            onClick={() => setSelectedPoolId(pool.poolId)}
          >
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

            <div className="position-share">
              <div className="position-share-bar">
                <div className="position-share-fill" style={{ width: `${Math.min(sharePercent, 100)}%` }} />
              </div>
              <span className="position-share-label">{sharePercent.toFixed(2)}% pool share</span>
            </div>

            <div className="pool-stats">
              <div className="pool-stat">
                <span className="pool-stat-label">Your {fmtAsset(pool.token0)}</span>
                <span className="pool-stat-value">{fmt(value0, getDecimals(pool.token0))}</span>
              </div>
              <div className="pool-stat">
                <span className="pool-stat-label">Your {fmtAsset(pool.token1)}</span>
                <span className="pool-stat-value">{fmt(value1, getDecimals(pool.token1))}</span>
              </div>
              <div className="pool-stat">
                <span className="pool-stat-label">LP Tokens</span>
                <span className="pool-stat-value">{fmt(lpBalance)}</span>
              </div>
            </div>

            <div className="position-cta">
              <span>View Details</span>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
