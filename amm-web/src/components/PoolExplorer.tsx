/**
 * PoolExplorer — card-based pool browser with search, filters,
 * sort, favorites, and skeleton loaders.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSdk } from '../context/SdkContext';
import { getTokenColor, useTokens } from '../hooks/useTokens';
import { getTokenLogo } from '../hooks/useTokens';
import { usePoolStats } from '../hooks/usePoolStats';
import { useFavorites } from '../hooks/useFavorites';
import { SkeletonPoolGrid } from './SkeletonLoaders';
import { config } from '../config';
import type { PoolStateV2 } from '@dcc-amm/sdk';

type SortField = 'tvl' | 'apy' | 'volume' | 'swaps';

export function PoolExplorer() {
  const sdk = useSdk();
  const navigate = useNavigate();
  const { tokens } = useTokens();
  const [pools, setPools] = useState<PoolStateV2[]>([]);
  const statsMap = usePoolStats(pools);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isFavorite, toggleFavorite } = useFavorites();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('tvl');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [feeTierFilter, setFeeTierFilter] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    let isFirst = true;

    async function fetchPools() {
      try {
        if (isFirst) setLoading(true);
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
        isFirst = false;
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

  const fmtAsset = (s: string) => {
    if (s === 'DCC') return 'DCC';
    const t = tokens.find((tk) => tk.assetId === s);
    return t?.name || s.slice(0, 8) + '\u2026';
  };

  const getDecimals = (assetId: string): number => {
    if (!assetId || assetId === 'DCC') return 8;
    const t = tokens.find((tk) => tk.assetId === assetId);
    return t?.decimals ?? 8;
  };

  // Filtered and sorted pools
  const filteredPools = useMemo(() => {
    let result = [...pools];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        fmtAsset(p.token0).toLowerCase().includes(q) ||
        fmtAsset(p.token1).toLowerCase().includes(q) ||
        p.poolId.toLowerCase().includes(q)
      );
    }

    // Favorites filter
    if (showFavoritesOnly) {
      result = result.filter((p) => isFavorite(p.poolId));
    }

    // Fee tier filter
    if (feeTierFilter !== 'all') {
      result = result.filter((p) => String(p.feeBps) === feeTierFilter);
    }

    // Sort
    result.sort((a, b) => {
      const sA = statsMap.get(a.poolId);
      const sB = statsMap.get(b.poolId);
      switch (sortBy) {
        case 'apy': return ((sB?.apy ?? 0) - (sA?.apy ?? 0));
        case 'volume': return Number(sB?.volume24h ?? 0) - Number(sA?.volume24h ?? 0);
        case 'swaps': return b.swapCount - a.swapCount;
        case 'tvl':
        default:
          return Number((b.reserve0 + b.reserve1) - (a.reserve0 + a.reserve1));
      }
    });

    return result;
  }, [pools, search, showFavoritesOnly, feeTierFilter, sortBy, statsMap, isFavorite]);

  // Show detail view when a pool is selected — using React Router now
  // (navigates to /pools/:poolId)

  if (loading) {
    return (
      <div className="panel-card pool-explorer">
        <div className="panel-header"><h2>Pools</h2></div>
        <SkeletonPoolGrid />
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
        <span className="pool-count">{filteredPools.length} pool{filteredPools.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Search and filters */}
      <div className="pool-filters">
        <div className="pool-search-wrap">
          <svg className="pool-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            className="pool-search-input"
            placeholder="Search pools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="pool-filter-row">
          <button
            className={`filter-chip ${showFavoritesOnly ? 'active' : ''}`}
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill={showFavoritesOnly ? 'currentColor' : 'none'}>
              <path d="M8 1l2 4h4l-3 3 1 5-4-2-4 2 1-5-3-3h4z" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
            Favorites
          </button>
          <select
            className="filter-select"
            value={feeTierFilter}
            onChange={(e) => setFeeTierFilter(e.target.value)}
          >
            <option value="all">All Fees</option>
            <option value="10">0.1%</option>
            <option value="35">0.35%</option>
            <option value="100">1.0%</option>
          </select>
          <select
            className="filter-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortField)}
          >
            <option value="tvl">Sort: TVL</option>
            <option value="apy">Sort: APY</option>
            <option value="volume">Sort: Volume</option>
            <option value="swaps">Sort: Swaps</option>
          </select>
        </div>
      </div>

      {filteredPools.length === 0 ? (
        <div className="empty-state">
          <p>{search ? 'No pools match your search' : 'No pools yet'}</p>
        </div>
      ) : (
        <div className="pool-grid">
          {filteredPools.map((pool) => (
          <div
            key={pool.poolId}
            className="pool-card pool-card-clickable"
            onClick={() => navigate(`/pools/${encodeURIComponent(pool.poolId)}`)}
          >
            <div className="pool-card-header">
              <div className="pool-pair">
                <button
                  className={`fav-star ${isFavorite(pool.poolId) ? 'active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(pool.poolId); }}
                  aria-label={isFavorite(pool.poolId) ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill={isFavorite(pool.poolId) ? 'currentColor' : 'none'}>
                    <path d="M8 1l2 4h4l-3 3 1 5-4-2-4 2 1-5-3-3h4z" stroke="currentColor" strokeWidth="1.2"/>
                  </svg>
                </button>
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
              const stats = statsMap.get(pool.poolId);
              const apy = stats?.apy ?? 0;
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
      )}
    </div>
  );
}
