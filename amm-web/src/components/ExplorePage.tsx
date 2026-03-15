/**
 * ExplorePage — Explore page with Tokens, Pools, Transactions tabs,
 * global stats, search, and transaction feed.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSdk } from '../context/SdkContext';
import { useTokens, getTokenColor, getTokenLogo } from '../hooks/useTokens';
import { usePoolStats } from '../hooks/usePoolStats';
import { config } from '../config';
import type { PoolStateV2 } from '@dcc-amm/sdk';

type ExploreTab = 'tokens' | 'pools' | 'transactions';

interface TokenRow {
  assetId: string | null;
  name: string;
  symbol: string;
  decimals: number;
  totalReserve: bigint;
  poolCount: number;
  volume: bigint;
}

export function ExplorePage() {
  const sdk = useSdk();
  const navigate = useNavigate();
  const { tokens } = useTokens();
  const [pools, setPools] = useState<PoolStateV2[]>([]);
  const statsMap = usePoolStats(pools);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ExploreTab>('tokens');
  const [searchQuery, setSearchQuery] = useState('');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const allPools = await sdk.listPools();
        if (!cancelled) setPools(allPools);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [sdk]);

  // Aggregate token data from pools
  const tokenRows = useMemo(() => {
    const map = new Map<string, TokenRow>();

    for (const pool of pools) {
      // Token 0
      const key0 = pool.token0 || 'DCC';
      if (!map.has(key0)) {
        const t = tokens.find((tk) => (tk.assetId || 'DCC') === key0);
        map.set(key0, {
          assetId: key0 === 'DCC' ? null : key0,
          name: t?.name || (key0 === 'DCC' ? 'DCC' : key0.slice(0, 8) + '\u2026'),
          symbol: t?.name || (key0 === 'DCC' ? 'DCC' : key0.slice(0, 6)),
          decimals: t?.decimals ?? 8,
          totalReserve: 0n,
          poolCount: 0,
          volume: 0n,
        });
      }
      const row0 = map.get(key0)!;
      row0.totalReserve += pool.reserve0;
      row0.poolCount += 1;
      row0.volume += pool.volume0;

      // Token 1
      const key1 = pool.token1 || 'DCC';
      if (!map.has(key1)) {
        const t = tokens.find((tk) => (tk.assetId || 'DCC') === key1);
        map.set(key1, {
          assetId: key1 === 'DCC' ? null : key1,
          name: t?.name || (key1 === 'DCC' ? 'DCC' : key1.slice(0, 8) + '\u2026'),
          symbol: t?.name || (key1 === 'DCC' ? 'DCC' : key1.slice(0, 6)),
          decimals: t?.decimals ?? 8,
          totalReserve: 0n,
          poolCount: 0,
          volume: 0n,
        });
      }
      const row1 = map.get(key1)!;
      row1.totalReserve += pool.reserve1;
      row1.poolCount += 1;
      row1.volume += pool.volume1;
    }

    return Array.from(map.values()).sort((a, b) =>
      Number(b.totalReserve - a.totalReserve)
    );
  }, [pools, tokens]);

  // Summary stats
  const totalTvl = useMemo(() => {
    let sum = 0n;
    for (const pool of pools) sum += pool.reserve0 + pool.reserve1;
    return sum;
  }, [pools]);

  const totalVolume = useMemo(() => {
    let sum = 0n;
    for (const pool of pools) sum += pool.volume0 + pool.volume1;
    return sum;
  }, [pools]);

  const totalSwaps = useMemo(() => {
    let sum = 0;
    for (const pool of pools) sum += pool.swapCount;
    return sum;
  }, [pools]);

  const fmt = (val: bigint, decimals = 8): string => {
    if (val === 0n) return '0';
    const str = val.toString().padStart(decimals + 1, '0');
    const int = str.slice(0, str.length - decimals);
    const frac = str.slice(str.length - decimals, str.length - decimals + 4).replace(/0+$/, '');
    return frac ? `${Number(int).toLocaleString()}.${frac}` : Number(int).toLocaleString();
  };

  const fmtCompact = (val: bigint, decimals = 8): string => {
    const num = Number(val) / 10 ** decimals;
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
    return num.toFixed(2);
  };

  const fmtAsset = (s: string) => {
    if (s === 'DCC') return 'DCC';
    const t = tokens.find((tk) => tk.assetId === s);
    return t?.name || s.slice(0, 8) + '\u2026';
  };

  const getDecimals = (assetId: string | null): number => {
    if (!assetId || assetId === 'DCC') return 8;
    const t = tokens.find((tk) => tk.assetId === assetId);
    return t?.decimals ?? 8;
  };

  // Fetch transactions from indexer
  useEffect(() => {
    if (activeTab !== 'transactions') return;
    let cancelled = false;
    async function loadTx() {
      setTxLoading(true);
      try {
        const res = await fetch(`${config.indexerUrl}/swaps?limit=50`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setTransactions(Array.isArray(data) ? data : data.swaps || []);
        }
      } catch {
        // indexer may be unavailable
      } finally {
        if (!cancelled) setTxLoading(false);
      }
    }
    loadTx();
    const interval = setInterval(loadTx, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeTab]);

  // Filtered token rows
  const filteredTokenRows = useMemo(() => {
    if (!searchQuery.trim()) return tokenRows;
    const q = searchQuery.toLowerCase();
    return tokenRows.filter((r) =>
      r.name.toLowerCase().includes(q) || r.symbol.toLowerCase().includes(q)
    );
  }, [tokenRows, searchQuery]);

  // Filtered pools
  const filteredPools = useMemo(() => {
    if (!searchQuery.trim()) return pools;
    const q = searchQuery.toLowerCase();
    return pools.filter((p) =>
      fmtAsset(p.token0).toLowerCase().includes(q) ||
      fmtAsset(p.token1).toLowerCase().includes(q)
    );
  }, [pools, searchQuery]);

  return (
    <div className="explore-page">
      {/* Stats bar */}
      <div className="explore-stats-bar">
        <div className="explore-stat-card">
          <span className="explore-stat-label">Total TVL</span>
          <span className="explore-stat-value">{fmtCompact(totalTvl)} DCC</span>
        </div>
        <div className="explore-stat-card">
          <span className="explore-stat-label">Total Volume</span>
          <span className="explore-stat-value">{fmtCompact(totalVolume)} DCC</span>
        </div>
        <div className="explore-stat-card">
          <span className="explore-stat-label">Pools</span>
          <span className="explore-stat-value">{pools.length}</span>
        </div>
        <div className="explore-stat-card">
          <span className="explore-stat-label">Total Swaps</span>
          <span className="explore-stat-value">{totalSwaps.toLocaleString()}</span>
        </div>
      </div>

      {/* Search */}
      <div className="explore-search-wrap">
        <svg className="pool-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          className="pool-search-input"
          placeholder={activeTab === 'tokens' ? 'Search tokens...' : activeTab === 'pools' ? 'Search pools...' : 'Search...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Sub-tabs */}
      <div className="explore-tabs">
        <div className="explore-tab-list">
          {(['tokens', 'pools', 'transactions'] as ExploreTab[]).map((tab) => (
            <button
              key={tab}
              className={`explore-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="explore-loading">
          <span className="spinner lg" />
          <p>Loading data...</p>
        </div>
      ) : (
        <>
          {/* ──── Tokens Tab ──── */}
          {activeTab === 'tokens' && (
            <div className="explore-table-wrap">
              <table className="explore-table">
                <thead>
                  <tr>
                    <th className="col-num">#</th>
                    <th className="col-name">Token name</th>
                    <th className="col-right">TVL</th>
                    <th className="col-right">Volume</th>
                    <th className="col-right">Pools</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTokenRows.map((row, idx) => (
                    <tr key={row.assetId || 'DCC'}>
                      <td className="col-num">{idx + 1}</td>
                      <td className="col-name">
                        <div className="explore-token-cell">
                          {(() => {
                            const logo = getTokenLogo(row.name, row.assetId);
                            return logo
                              ? <img src={logo} alt={row.name} className="explore-token-logo" />
                              : <span className="explore-token-dot" style={{ background: getTokenColor(row.assetId) }} />;
                          })()}
                          <span className="explore-token-name">{row.name}</span>
                          <span className="explore-token-symbol">{row.symbol}</span>
                        </div>
                      </td>
                      <td className="col-right">{fmt(row.totalReserve, row.decimals)}</td>
                      <td className="col-right">{fmt(row.volume, row.decimals)}</td>
                      <td className="col-right">{row.poolCount}</td>
                    </tr>
                  ))}
                  {filteredTokenRows.length === 0 && (
                    <tr><td colSpan={5} className="explore-empty">No tokens found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ──── Pools Tab ──── */}
          {activeTab === 'pools' && (
            <div className="explore-table-wrap">
              <table className="explore-table">
                <thead>
                  <tr>
                    <th className="col-num">#</th>
                    <th className="col-name">Pool</th>
                    <th className="col-right">Fee tier</th>
                    <th className="col-right">TVL</th>
                    <th className="col-right">APY</th>
                    <th className="col-right">Volume</th>
                    <th className="col-right">Swaps</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPools.map((pool, idx) => {
                    const stats = statsMap.get(pool.poolId);
                    const apy = stats?.apy ?? 0;
                    const tvl = pool.reserve0 + pool.reserve1;
                    const vol = pool.volume0 + pool.volume1;
                    return (
                      <tr
                        key={pool.poolId}
                        className="explore-row-clickable"
                        onClick={() => navigate(`/pools/${encodeURIComponent(pool.poolId)}`)}
                      >
                        <td className="col-num">{idx + 1}</td>
                        <td className="col-name">
                          <div className="explore-pool-cell">
                            <div className="explore-pool-logos">
                              {(() => {
                                const logo = getTokenLogo(fmtAsset(pool.token0), pool.token0 === 'DCC' ? null : pool.token0);
                                return logo
                                  ? <img src={logo} alt={fmtAsset(pool.token0)} className="explore-pool-logo" />
                                  : <span className="explore-pool-dot" style={{ background: getTokenColor(pool.token0 === 'DCC' ? null : pool.token0) }} />;
                              })()}
                              {(() => {
                                const logo = getTokenLogo(fmtAsset(pool.token1), pool.token1 === 'DCC' ? null : pool.token1);
                                return logo
                                  ? <img src={logo} alt={fmtAsset(pool.token1)} className="explore-pool-logo overlap" />
                                  : <span className="explore-pool-dot overlap" style={{ background: getTokenColor(pool.token1 === 'DCC' ? null : pool.token1) }} />;
                              })()}
                            </div>
                            <span className="explore-pool-name">
                              {fmtAsset(pool.token0)}/{fmtAsset(pool.token1)}
                            </span>
                            {config.verifiedPools.has(pool.poolId) && (
                              <span className="verified-badge" title="Verified">
                                <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M6.5 11.5l-3-3 1.4-1.4L6.5 8.7l4.6-4.6 1.4 1.4z" fill="currentColor"/></svg>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="col-right">{Number(pool.feeBps) / 100}%</td>
                        <td className="col-right">{fmtCompact(tvl)}</td>
                        <td className="col-right">
                          <span className={apy > 0 ? 'text-green' : ''}>{apy > 0 ? `${apy.toFixed(2)}%` : '--'}</span>
                        </td>
                        <td className="col-right">{fmtCompact(vol)}</td>
                        <td className="col-right">{pool.swapCount.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                  {filteredPools.length === 0 && (
                    <tr><td colSpan={7} className="explore-empty">No pools found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ──── Transactions Tab ──── */}
          {activeTab === 'transactions' && (
            <div className="explore-table-wrap">
              {txLoading && transactions.length === 0 ? (
                <div className="explore-loading">
                  <span className="spinner lg" />
                  <p>Loading transactions...</p>
                </div>
              ) : transactions.length === 0 ? (
                <div className="explore-coming-soon">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <h3>No Transactions Yet</h3>
                  <p>Swap transactions will appear here once the indexer is running.</p>
                </div>
              ) : (
                <table className="explore-table">
                  <thead>
                    <tr>
                      <th className="col-name">Type</th>
                      <th className="col-name">Pair</th>
                      <th className="col-right">Amount In</th>
                      <th className="col-right">Amount Out</th>
                      <th className="col-right">Time</th>
                      <th className="col-right">Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.slice(0, 50).map((tx: any, idx: number) => (
                      <tr key={tx.txId || idx}>
                        <td className="col-name">
                          <span className={`tx-type-badge ${tx.type || 'swap'}`}>{tx.type || 'Swap'}</span>
                        </td>
                        <td className="col-name">
                          {fmtAsset(tx.token0 || tx.inputAsset || 'DCC')}/
                          {fmtAsset(tx.token1 || tx.outputAsset || '?')}
                        </td>
                        <td className="col-right">{tx.amountIn ? fmtCompact(BigInt(tx.amountIn)) : '--'}</td>
                        <td className="col-right">{tx.amountOut ? fmtCompact(BigInt(tx.amountOut)) : '--'}</td>
                        <td className="col-right">
                          {tx.timestamp ? new Date(tx.timestamp).toLocaleTimeString() : '--'}
                        </td>
                        <td className="col-right">
                          {tx.txId && (
                            <a
                              href={`${config.explorerUrl}/tx/${tx.txId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="tx-link"
                            >↗</a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
