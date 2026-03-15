/**
 * MyPools — shows pools where the connected user has LP positions,
 * with PnL tracking and skeleton loaders.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSdk } from '../context/SdkContext';
import { useWallet } from '../context/WalletContext';
import { useTokens, getTokenColor } from '../hooks/useTokens';
import { getTokenLogo } from '../hooks/useTokens';
import { usePoolStats } from '../hooks/usePoolStats';
import { SkeletonPoolGrid } from './SkeletonLoaders';
import { config } from '../config';
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
  const navigate = useNavigate();
  const { address, isConnected, openConnectModal } = useWallet();
  const { tokens } = useTokens();

  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const statsMap = usePoolStats(positions.map((p) => p.pool));

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
        <SkeletonPoolGrid />
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
            onClick={() => navigate(`/pools/${encodeURIComponent(pool.poolId)}`)}
          >
            <div className="pool-card-header">
              <div className="pool-pair">
                {(() => {
                  const logo = getTokenLogo(fmtAsset(pool.token0), pool.token0 === 'DCC' ? null : pool.token0);
                  return logo
                    ? <img src={logo} alt={fmtAsset(pool.token0)} className="pool-dot-logo" />
                    : <span className="pool-dot" style={{ background: getTokenColor(pool.token0 === 'DCC' ? null : pool.token0) }} />;
                })()}
                {(() => {
                  const logo = getTokenLogo(fmtAsset(pool.token1), pool.token1 === 'DCC' ? null : pool.token1);
                  return logo
                    ? <img src={logo} alt={fmtAsset(pool.token1)} className="pool-dot-logo" style={{ marginLeft: -6 }} />
                    : <span className="pool-dot" style={{ background: getTokenColor(pool.token1 === 'DCC' ? null : pool.token1), marginLeft: -6 }} />;
                })()}
                <span className="pool-pair-name">
                  {fmtAsset(pool.token0)} / {fmtAsset(pool.token1)}
                </span>
              </div>
              <span className="pool-fee-badge">{Number(pool.feeBps) / 100}%</span>
              {config.verifiedPools.has(pool.poolId) && (
                <span className="verified-badge" title="Official verified pool">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M6.5 11.5l-3-3 1.4-1.4L6.5 8.7l4.6-4.6 1.4 1.4z" fill="currentColor"/></svg>
                  Verified
                </span>
              )}
            </div>

            {(() => {
              const poolStats = statsMap.get(pool.poolId);
              const apy = poolStats?.apy ?? 0;
              return (
                <div className={`pool-apy-badge ${apy > 0 ? 'active' : ''}`}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1l2 4h4l-3 3 1 5-4-2-4 2 1-5-3-3h4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                  </svg>
                  <span className="pool-apy-value">{apy > 0 ? `${apy.toFixed(2)}%` : '--'}</span>
                  <span className="pool-apy-label">APY</span>
                </div>
              );
            })()}

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

            {/* PnL / Earned Fees */}
            {pool.lpSupply > 0n && (pool.fees0 > 0n || pool.fees1 > 0n) && (
              <div className="position-pnl">
                <span className="position-pnl-label">Earned Fees</span>
                <div className="position-pnl-values">
                  <span>{fmt((pool.fees0 * lpBalance) / pool.lpSupply, getDecimals(pool.token0))} {fmtAsset(pool.token0)}</span>
                  <span>{fmt((pool.fees1 * lpBalance) / pool.lpSupply, getDecimals(pool.token1))} {fmtAsset(pool.token1)}</span>
                </div>
              </div>
            )}

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
