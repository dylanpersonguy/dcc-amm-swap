/**
 * PoolDetail — full pool info with breadcrumbs, spot price,
 * add/remove liquidity, user position, earnings, and toast integration.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSdk } from '../context/SdkContext';
import { useWallet } from '../context/WalletContext';
import { useTokens, getTokenColor } from '../hooks/useTokens';
import { getTokenLogo } from '../hooks/useTokens';
import { usePoolStats } from '../hooks/usePoolStats';
import { useToasts } from '../context/ToastContext';
import { useTxTracker } from '../context/TransactionTracker';
import { Breadcrumbs } from './Breadcrumbs';
import { PriceChart } from './PriceChart';
import { config } from '../config';
import { estimateRemoveLiquidity, estimateAddLiquidity, getSpotPrice } from '@dcc-amm/sdk';
import type { PoolStateV2 } from '@dcc-amm/sdk';

export function PoolDetail() {
  const { poolId: routePoolId } = useParams<{ poolId: string }>();
  const navigate = useNavigate();
  const poolId = decodeURIComponent(routePoolId || '');
  const sdk = useSdk();
  const { address, isConnected, signAndBroadcast, openConnectModal } = useWallet();
  const { tokens } = useTokens();
  const { addToast } = useToasts();
  const { trackTransaction, confirmTransaction, failTransaction } = useTxTracker();

  const [pool, setPool] = useState<PoolStateV2 | null>(null);
  const [lpBalance, setLpBalance] = useState(0n);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const statsMap = usePoolStats(pool ? [pool] : []);
  const stats = pool ? statsMap.get(pool.poolId) : undefined;

  // Remove liquidity state
  const [removePercent, setRemovePercent] = useState(0);
  const [removing, setRemoving] = useState(false);
  const [txResult, setTxResult] = useState<{ success: boolean; message: string } | null>(null);

  // Add liquidity state
  const [addAmount0, setAddAmount0] = useState('');
  const [addAmount1, setAddAmount1] = useState('');
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState<{ success: boolean; message: string } | null>(null);

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

  // Spot price
  const spotPrice = pool ? getSpotPrice(pool) : { price0to1: 0, price1to0: 0 };

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

  // Parse amount string to raw bigint
  const parseAmount = (str: string, decimals: number): bigint => {
    if (!str || str === '.' || str === '0.') return 0n;
    const parts = str.split('.');
    const intPart = parts[0] || '0';
    const fracPart = (parts[1] || '').slice(0, decimals).padEnd(decimals, '0');
    return BigInt(intPart) * BigInt(10 ** decimals) + BigInt(fracPart);
  };

  // Add liquidity estimate
  const rawAdd0 = pool ? parseAmount(addAmount0, getDecimals(pool.token0)) : 0n;
  const rawAdd1 = pool ? parseAmount(addAmount1, getDecimals(pool.token1)) : 0n;
  const addEstimate = pool && rawAdd0 > 0n && rawAdd1 > 0n && pool.lpSupply > 0n
    ? (() => { try { return estimateAddLiquidity(rawAdd0, rawAdd1, pool); } catch { return null; } })()
    : null;

  async function handleAddLiquidity() {
    if (!pool || !address || rawAdd0 <= 0n || rawAdd1 <= 0n) return;
    const trackId = trackTransaction('add-liquidity', `Add liquidity to ${fmtAsset(pool.token0)}/${fmtAsset(pool.token1)}`);

    try {
      setAdding(true);
      setAddResult(null);

      const { tx } = await sdk.buildAddLiquidity(
        pool.token0 === 'DCC' ? null : pool.token0,
        pool.token1 === 'DCC' ? null : pool.token1,
        rawAdd0,
        rawAdd1,
        Number(pool.feeBps),
        100n, // 1% slippage
      );

      const id = await signAndBroadcast(tx);
      setAddResult({ success: true, message: 'Liquidity added successfully!' });
      setAddAmount0('');
      setAddAmount1('');
      confirmTransaction(trackId, id);
      addToast('success', 'Liquidity added!', { txId: id });

      setTimeout(fetchPool, 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      setAddResult({ success: false, message: msg });
      failTransaction(trackId);
      addToast('error', msg);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveLiquidity() {
    if (!pool || !address || lpToRemove <= 0n) return;
    const trackId = trackTransaction('remove-liquidity', `Remove ${removePercent}% liquidity from ${fmtAsset(pool.token0)}/${fmtAsset(pool.token1)}`);

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

      const id = await signAndBroadcast(tx);
      setTxResult({ success: true, message: `Removed ${removePercent}% liquidity successfully!` });
      setRemovePercent(0);
      confirmTransaction(trackId, id);
      addToast('success', `Removed ${removePercent}% liquidity!`, { txId: id });

      setTimeout(fetchPool, 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      setTxResult({ success: false, message: msg });
      failTransaction(trackId);
      addToast('error', msg);
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
          <button className="detail-back-btn" onClick={() => navigate('/pools')}>
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
      {/* Breadcrumbs */}
      <Breadcrumbs items={[
        { label: 'Pools', path: '/pools' },
        { label: `${fmtAsset(pool.token0)} / ${fmtAsset(pool.token1)}` },
      ]} />

      {/* Header */}
      <div className="detail-header">
        <button className="detail-back-btn" onClick={() => navigate('/pools')}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>
        <div className="detail-title">
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
          <h2>{fmtAsset(pool.token0)} / {fmtAsset(pool.token1)}</h2>
          <span className="pool-fee-badge">{Number(pool.feeBps) / 100}%</span>
          {config.verifiedPools.has(pool.poolId) && (
            <span className="verified-badge" title="Official verified pool">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M6.5 11.5l-3-3 1.4-1.4L6.5 8.7l4.6-4.6 1.4 1.4z" fill="currentColor"/></svg>
              Verified
            </span>
          )}
        </div>
      </div>

      {/* APY Banner */}
      <div className={`pool-apy-banner ${(stats?.apy ?? 0) > 0 ? 'active' : ''}`}>
        <div className="pool-apy-banner-main">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M8 1l2 4h4l-3 3 1 5-4-2-4 2 1-5-3-3h4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
          </svg>
          <span className="pool-apy-banner-value">{(stats?.apy ?? 0) > 0 ? `${stats!.apy.toFixed(2)}%` : '--'}</span>
          <span className="pool-apy-banner-label">APY</span>
        </div>
        <span className="pool-apy-banner-note">Based on 24h trading fees annualized</span>
      </div>

      {/* Price Chart */}
      <PriceChart
        poolId={poolId}
        token0Name={fmtAsset(pool.token0)}
        token1Name={fmtAsset(pool.token1)}
      />

      {/* Pool Overview */}
      <section className="detail-section">
        <h3 className="detail-section-title">Pool Overview</h3>

        {/* Spot Price */}
        {(spotPrice.price0to1 > 0) && (
          <div className="spot-price-row">
            <div className="spot-price-item">
              <span className="spot-price-label">1 {fmtAsset(pool.token0)} =</span>
              <span className="spot-price-value">{spotPrice.price0to1 < 0.0001 ? spotPrice.price0to1.toExponential(3) : spotPrice.price0to1.toFixed(6)} {fmtAsset(pool.token1)}</span>
            </div>
            <div className="spot-price-item">
              <span className="spot-price-label">1 {fmtAsset(pool.token1)} =</span>
              <span className="spot-price-value">{spotPrice.price1to0 < 0.0001 ? spotPrice.price1to0.toExponential(3) : spotPrice.price1to0.toFixed(6)} {fmtAsset(pool.token0)}</span>
            </div>
          </div>
        )}

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

      {/* Add Liquidity */}
      <section className="detail-section add-liq-section">
        <h3 className="detail-section-title">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Add Liquidity
        </h3>

        {!isConnected ? (
          <div className="add-liq-connect-cta">
            <p>Connect your wallet to add liquidity and earn fees from every swap.</p>
            <button className="btn-accent" onClick={() => openConnectModal()}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="7" width="12" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Connect Wallet
            </button>
          </div>
        ) : (
          <>
            <div className="add-liq-inputs">
              <div className="add-liq-input-group">
                <label className="add-liq-label">{fmtAsset(pool.token0)}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  className="add-liq-input"
                  value={addAmount0}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9.]/g, '');
                    if ((v.match(/\./g) || []).length <= 1) setAddAmount0(v);
                  }}
                />
              </div>
              <div className="add-liq-input-group">
                <label className="add-liq-label">{fmtAsset(pool.token1)}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  className="add-liq-input"
                  value={addAmount1}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9.]/g, '');
                    if ((v.match(/\./g) || []).length <= 1) setAddAmount1(v);
                  }}
                />
              </div>
            </div>

            {addEstimate && (
              <div className="add-liq-preview">
                <span className="add-liq-preview-label">Estimated LP tokens</span>
                <span className="add-liq-preview-value">{fmt(addEstimate.lpMinted)}</span>
              </div>
            )}

            <button
              className="action-btn btn-accent add-liq-btn"
              disabled={rawAdd0 <= 0n || rawAdd1 <= 0n || adding}
              onClick={handleAddLiquidity}
            >
              {adding ? (
                <><span className="spinner" /> Adding...</>
              ) : rawAdd0 <= 0n || rawAdd1 <= 0n ? (
                'Enter amounts'
              ) : (
                'Add Liquidity'
              )}
            </button>

            {addResult && (
              <div className={`tx-toast ${addResult.success ? 'success' : 'error'}`}>
                {addResult.message}
              </div>
            )}
          </>
        )}
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
