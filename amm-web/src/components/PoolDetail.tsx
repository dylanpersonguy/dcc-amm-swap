/**
 * PoolDetail — full pool info, user position & earnings, remove-liquidity flow.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useSdk } from '../context/SdkContext';
import { useWallet } from '../context/WalletContext';
import { useTokens, getTokenColor } from '../hooks/useTokens';
import { estimateRemoveLiquidity } from '@dcc-amm/sdk';
import type { PoolStateV2 } from '@dcc-amm/sdk';

interface PoolDetailProps {
  poolId: string;
  userLpBalance: bigint;
  onBack: () => void;
}

export function PoolDetail({ poolId, userLpBalance: initialLpBalance, onBack }: PoolDetailProps) {
  const sdk = useSdk();
  const { address, isConnected, signAndBroadcast } = useWallet();
  const { tokens } = useTokens();

  const [pool, setPool] = useState<PoolStateV2 | null>(null);
  const [lpBalance, setLpBalance] = useState(initialLpBalance);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Remove liquidity state
  const [removePercent, setRemovePercent] = useState(0);
  const [removing, setRemoving] = useState(false);
  const [txResult, setTxResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchPool = useCallback(async () => {
    try {
      const p = await sdk.getPool(poolId);
      if (p) setPool(p);

      if (address) {
        let bal = 0n;
        if (p?.lpAssetId) {
          bal = await sdk.getBalance(address, p.lpAssetId);
        }
        if (bal === 0n) {
          bal = await sdk.getLpBalance(poolId, address);
        }
        setLpBalance(bal);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pool');
    } finally {
      setLoading(false);
    }
  }, [sdk, poolId, address]);

  useEffect(() => {
    fetchPool();
    const interval = setInterval(fetchPool, 15000);
    return () => clearInterval(interval);
  }, [fetchPool]);

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

  const sharePercent = pool && pool.lpSupply > 0n
    ? Number(lpBalance * 10000n / pool.lpSupply) / 100
    : 0;

  // Compute what the user would get for removing
  const lpToRemove = lpBalance * BigInt(removePercent) / 100n;
  const removeEstimate = pool && lpToRemove > 0n
    ? estimateRemoveLiquidity(lpToRemove, pool)
    : null;

  // Earnings: user's proportional share of accumulated fees
  const userFees0 = pool && pool.lpSupply > 0n
    ? (pool.fees0 * lpBalance) / pool.lpSupply
    : 0n;
  const userFees1 = pool && pool.lpSupply > 0n
    ? (pool.fees1 * lpBalance) / pool.lpSupply
    : 0n;

  async function handleRemoveLiquidity() {
    if (!pool || !address || lpToRemove <= 0n) return;

    try {
      setRemoving(true);
      setTxResult(null);

      const { tx } = await sdk.buildRemoveLiquidity(
        pool.token0 === 'DCC' ? null : pool.token0,
        pool.token1 === 'DCC' ? null : pool.token1,
        Number(pool.feeBps),
        lpToRemove,
        100n, // 1% slippage
      );

      await signAndBroadcast(tx);
      setTxResult({ success: true, message: `Removed ${removePercent}% liquidity successfully!` });
      setRemovePercent(0);

      // Refresh data
      setTimeout(fetchPool, 3000);
    } catch (err) {
      setTxResult({
        success: false,
        message: err instanceof Error ? err.message : 'Transaction failed',
      });
    } finally {
      setRemoving(false);
    }
  }

  if (loading) {
    return (
      <div className="panel-card pool-detail">
        <div className="empty-state">
          <span className="spinner lg" />
          <p>Loading pool details...</p>
        </div>
      </div>
    );
  }

  if (error || !pool) {
    return (
      <div className="panel-card pool-detail">
        <div className="detail-header">
          <button className="detail-back-btn" onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back
          </button>
        </div>
        <div className="empty-state error">
          <p>{error || 'Pool not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-card pool-detail">
      {/* Header */}
      <div className="detail-header">
        <button className="detail-back-btn" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>
        <div className="detail-title">
          <span className="pool-dot" style={{ background: getTokenColor(pool.token0 === 'DCC' ? null : pool.token0) }} />
          <span className="pool-dot" style={{ background: getTokenColor(pool.token1 === 'DCC' ? null : pool.token1), marginLeft: -6 }} />
          <h2>{fmtAsset(pool.token0)} / {fmtAsset(pool.token1)}</h2>
          <span className="pool-fee-badge">{Number(pool.feeBps) / 100}%</span>
        </div>
      </div>

      {/* Pool Overview */}
      <section className="detail-section">
        <h3 className="detail-section-title">Pool Overview</h3>
        <div className="detail-grid">
          <div className="detail-stat">
            <span className="detail-stat-label">Reserve {fmtAsset(pool.token0)}</span>
            <span className="detail-stat-value">{fmt(pool.reserve0, getDecimals(pool.token0))}</span>
          </div>
          <div className="detail-stat">
            <span className="detail-stat-label">Reserve {fmtAsset(pool.token1)}</span>
            <span className="detail-stat-value">{fmt(pool.reserve1, getDecimals(pool.token1))}</span>
          </div>
          <div className="detail-stat">
            <span className="detail-stat-label">LP Supply</span>
            <span className="detail-stat-value">{fmt(pool.lpSupply)}</span>
          </div>
          <div className="detail-stat">
            <span className="detail-stat-label">Total Swaps</span>
            <span className="detail-stat-value">{pool.swapCount.toLocaleString()}</span>
          </div>
          <div className="detail-stat">
            <span className="detail-stat-label">Total Volume ({fmtAsset(pool.token0)})</span>
            <span className="detail-stat-value">{fmt(pool.volume0, getDecimals(pool.token0))}</span>
          </div>
          <div className="detail-stat">
            <span className="detail-stat-label">Total Volume ({fmtAsset(pool.token1)})</span>
            <span className="detail-stat-value">{fmt(pool.volume1, getDecimals(pool.token1))}</span>
          </div>
          <div className="detail-stat">
            <span className="detail-stat-label">Total Fees ({fmtAsset(pool.token0)})</span>
            <span className="detail-stat-value">{fmt(pool.fees0, getDecimals(pool.token0))}</span>
          </div>
          <div className="detail-stat">
            <span className="detail-stat-label">Total Fees ({fmtAsset(pool.token1)})</span>
            <span className="detail-stat-value">{fmt(pool.fees1, getDecimals(pool.token1))}</span>
          </div>
        </div>
      </section>

      {/* User Position */}
      {isConnected && lpBalance > 0n && (
        <section className="detail-section position-section">
          <h3 className="detail-section-title">Your Position</h3>
          <div className="position-overview">
            <div className="position-share">
              <div className="position-share-bar">
                <div className="position-share-fill" style={{ width: `${Math.min(sharePercent, 100)}%` }} />
              </div>
              <span className="position-share-label">{sharePercent.toFixed(2)}% of pool</span>
            </div>
            <div className="detail-grid">
              <div className="detail-stat">
                <span className="detail-stat-label">LP Tokens</span>
                <span className="detail-stat-value">{fmt(lpBalance)}</span>
              </div>
              <div className="detail-stat">
                <span className="detail-stat-label">Value ({fmtAsset(pool.token0)})</span>
                <span className="detail-stat-value">
                  {fmt((pool.reserve0 * lpBalance) / pool.lpSupply, getDecimals(pool.token0))}
                </span>
              </div>
              <div className="detail-stat">
                <span className="detail-stat-label">Value ({fmtAsset(pool.token1)})</span>
                <span className="detail-stat-value">
                  {fmt((pool.reserve1 * lpBalance) / pool.lpSupply, getDecimals(pool.token1))}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Earnings */}
      {isConnected && lpBalance > 0n && (userFees0 > 0n || userFees1 > 0n) && (
        <section className="detail-section earnings-section">
          <h3 className="detail-section-title">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1l2 4h4l-3 3 1 5-4-2-4 2 1-5-3-3h4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
            Your Earnings
          </h3>
          <div className="earnings-cards">
            <div className="earnings-card">
              <span className="earnings-token">{fmtAsset(pool.token0)}</span>
              <span className="earnings-amount">{fmt(userFees0, getDecimals(pool.token0))}</span>
            </div>
            <div className="earnings-card">
              <span className="earnings-token">{fmtAsset(pool.token1)}</span>
              <span className="earnings-amount">{fmt(userFees1, getDecimals(pool.token1))}</span>
            </div>
          </div>
          <p className="earnings-note">
            Earnings are realized when you remove liquidity. Your share of accumulated fees
            is automatically included in your withdrawal.
          </p>
        </section>
      )}

      {/* Remove Liquidity */}
      {isConnected && lpBalance > 0n && (
        <section className="detail-section remove-section">
          <h3 className="detail-section-title">Remove Liquidity</h3>

          <div className="remove-slider-wrap">
            <div className="remove-slider-header">
              <span className="remove-slider-label">Amount to remove</span>
              <span className="remove-slider-value">{removePercent}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={removePercent}
              onChange={(e) => setRemovePercent(Number(e.target.value))}
              className="remove-slider"
            />
            <div className="remove-presets">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  className={`remove-preset-btn ${removePercent === pct ? 'active' : ''}`}
                  onClick={() => setRemovePercent(pct)}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {removeEstimate && (
            <div className="remove-preview">
              <h4>You will receive</h4>
              <div className="remove-preview-row">
                <span>{fmtAsset(pool.token0)}</span>
                <span className="remove-preview-amount">
                  {fmt(removeEstimate.amountA, getDecimals(pool.token0))}
                </span>
              </div>
              <div className="remove-preview-row">
                <span>{fmtAsset(pool.token1)}</span>
                <span className="remove-preview-amount">
                  {fmt(removeEstimate.amountB, getDecimals(pool.token1))}
                </span>
              </div>
            </div>
          )}

          <button
            className="action-btn remove-btn"
            disabled={removePercent === 0 || removing}
            onClick={handleRemoveLiquidity}
          >
            {removing ? (
              <><span className="spinner" /> Removing...</>
            ) : removePercent === 0 ? (
              'Select amount to remove'
            ) : (
              `Remove ${removePercent}% Liquidity`
            )}
          </button>

          {txResult && (
            <div className={`tx-toast ${txResult.success ? 'success' : 'error'}`}>
              {txResult.message}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
