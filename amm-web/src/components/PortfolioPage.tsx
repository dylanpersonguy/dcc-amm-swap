/**
 * PortfolioPage — dashboard showing all token balances, LP positions, earned fees, total value.
 */

import React, { useState, useEffect } from 'react';
import { useSdk } from '../context/SdkContext';
import { useWallet } from '../context/WalletContext';
import { useTokens, getTokenColor, getTokenLogo } from '../hooks/useTokens';
import { useBalances } from '../hooks/useBalances';
import { config } from '../config';
import { SkeletonLine } from './SkeletonLoaders';
import type { PoolStateV2 } from '@dcc-amm/sdk';

interface LpPosition {
  pool: PoolStateV2;
  lpBalance: bigint;
  sharePercent: number;
  value0: bigint;
  value1: bigint;
  fees0: bigint;
  fees1: bigint;
}

export function PortfolioPage() {
  const sdk = useSdk();
  const { address, isConnected, openConnectModal } = useWallet();
  const { tokens } = useTokens();
  const { getBalance, formatBalance, loading: balancesLoading } = useBalances();
  const [positions, setPositions] = useState<LpPosition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isConnected || !address) {
      setPositions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const allPools = await sdk.listPools();
        const userPos: LpPosition[] = [];
        for (const pool of allPools) {
          let lpBalance = 0n;
          if (pool.lpAssetId) lpBalance = await sdk.getBalance(address!, pool.lpAssetId);
          if (lpBalance === 0n) lpBalance = await sdk.getLpBalance(pool.poolId, address!);
          if (lpBalance > 0n && pool.lpSupply > 0n) {
            const sharePercent = Number(lpBalance * 10000n / pool.lpSupply) / 100;
            userPos.push({
              pool,
              lpBalance,
              sharePercent,
              value0: (pool.reserve0 * lpBalance) / pool.lpSupply,
              value1: (pool.reserve1 * lpBalance) / pool.lpSupply,
              fees0: (pool.fees0 * lpBalance) / pool.lpSupply,
              fees1: (pool.fees1 * lpBalance) / pool.lpSupply,
            });
          }
        }
        if (!cancelled) setPositions(userPos);
      } catch {
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [sdk, address, isConnected]);

  const fmt = (val: bigint, decimals = 8): string => {
    if (val === 0n) return '0';
    const str = val.toString().padStart(decimals + 1, '0');
    const int = str.slice(0, str.length - decimals);
    const frac = str.slice(str.length - decimals, str.length - decimals + 4).replace(/0+$/, '');
    return frac ? `${int}.${frac}` : int;
  };

  const getDecimals = (assetId: string | null): number => {
    if (!assetId || assetId === 'DCC') return 8;
    const t = tokens.find((tk) => tk.assetId === assetId);
    return t?.decimals ?? 8;
  };

  const fmtAsset = (s: string) => {
    if (!s || s === 'DCC') return 'DCC';
    const t = tokens.find((tk) => tk.assetId === s);
    return t?.name || s.slice(0, 8) + '…';
  };

  if (!isConnected) {
    return (
      <div className="panel-card portfolio-page">
        <div className="panel-header"><h2>Portfolio</h2></div>
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="empty-illustration">
            <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M2 9h20M8 3v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="12" cy="15" r="2" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          <p>Connect your wallet to view your portfolio</p>
          <button className="btn-accent" onClick={() => openConnectModal()}>Connect Wallet</button>
        </div>
      </div>
    );
  }

  return (
    <div className="portfolio-page">
      {/* Wallet Overview */}
      <div className="panel-card">
        <div className="panel-header"><h2>Wallet Balances</h2></div>
        <div className="portfolio-balances">
          {balancesLoading ? (
            <div className="portfolio-skeleton">
              {[1,2,3].map(i => <SkeletonLine key={i} width="100%" height={40} />)}
            </div>
          ) : (
            <div className="portfolio-token-list">
              {tokens.filter(t => getBalance(t.assetId === null ? 'DCC' : t.assetId) > 0n).map((token) => {
                const id = token.assetId === null ? 'DCC' : token.assetId;
                const logo = getTokenLogo(token.name, token.assetId);
                return (
                  <div key={id} className="portfolio-token-row">
                    <div className="portfolio-token-info">
                      {logo
                        ? <img src={logo} alt={token.name} className="portfolio-token-logo" />
                        : <span className="portfolio-token-dot" style={{background: getTokenColor(token.assetId)}} />
                      }
                      <div>
                        <span className="portfolio-token-name">{token.name}</span>
                        {token.assetId && (
                          <span className="portfolio-token-id">{token.assetId.slice(0,8)}…</span>
                        )}
                      </div>
                    </div>
                    <span className="portfolio-token-bal">{formatBalance(id, token.decimals)}</span>
                  </div>
                );
              })}
              {tokens.filter(t => getBalance(t.assetId === null ? 'DCC' : t.assetId) > 0n).length === 0 && (
                <div className="empty-state compact">
                  <p>No token balances found</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* LP Positions */}
      <div className="panel-card">
        <div className="panel-header"><h2>LP Positions</h2></div>
        {loading ? (
          <div className="portfolio-skeleton">
            {[1,2].map(i => <SkeletonLine key={i} width="100%" height={60} />)}
          </div>
        ) : positions.length === 0 ? (
          <div className="empty-state compact">
            <p>No liquidity positions found</p>
          </div>
        ) : (
          <div className="portfolio-positions">
            {positions.map(({ pool, lpBalance, sharePercent, value0, value1, fees0, fees1 }) => (
              <div key={pool.poolId} className="portfolio-position-card">
                <div className="portfolio-pos-header">
                  <div className="pool-pair">
                    {(() => {
                      const logo = getTokenLogo(fmtAsset(pool.token0), pool.token0 === 'DCC' ? null : pool.token0);
                      return logo
                        ? <img src={logo} alt={fmtAsset(pool.token0)} className="pool-dot-logo" />
                        : <span className="pool-dot" style={{background: getTokenColor(pool.token0 === 'DCC' ? null : pool.token0)}} />;
                    })()}
                    {(() => {
                      const logo = getTokenLogo(fmtAsset(pool.token1), pool.token1 === 'DCC' ? null : pool.token1);
                      return logo
                        ? <img src={logo} alt={fmtAsset(pool.token1)} className="pool-dot-logo" style={{marginLeft:-6}} />
                        : <span className="pool-dot" style={{background: getTokenColor(pool.token1 === 'DCC' ? null : pool.token1), marginLeft:-6}} />;
                    })()}
                    <span className="pool-pair-name">{fmtAsset(pool.token0)} / {fmtAsset(pool.token1)}</span>
                  </div>
                  <span className="pool-fee-badge">{Number(pool.feeBps)/100}%</span>
                </div>
                <div className="portfolio-pos-stats">
                  <div className="portfolio-pos-stat">
                    <span className="label">Pool Share</span>
                    <span className="value">{sharePercent.toFixed(2)}%</span>
                  </div>
                  <div className="portfolio-pos-stat">
                    <span className="label">LP Tokens</span>
                    <span className="value">{fmt(lpBalance)}</span>
                  </div>
                  <div className="portfolio-pos-stat">
                    <span className="label">{fmtAsset(pool.token0)}</span>
                    <span className="value">{fmt(value0, getDecimals(pool.token0))}</span>
                  </div>
                  <div className="portfolio-pos-stat">
                    <span className="label">{fmtAsset(pool.token1)}</span>
                    <span className="value">{fmt(value1, getDecimals(pool.token1))}</span>
                  </div>
                </div>
                {(fees0 > 0n || fees1 > 0n) && (
                  <div className="portfolio-pos-earnings">
                    <span className="label">Earned Fees:</span>
                    {fees0 > 0n && <span className="earning">{fmt(fees0, getDecimals(pool.token0))} {fmtAsset(pool.token0)}</span>}
                    {fees1 > 0n && <span className="earning">{fmt(fees1, getDecimals(pool.token1))} {fmtAsset(pool.token1)}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contract Info */}
      <div className="panel-card contract-info-card">
        <div className="panel-header"><h2>Protocol Info</h2></div>
        <div className="contract-info">
          <div className="contract-info-row">
            <span className="contract-info-label">AMM Contract</span>
            <div className="contract-info-address">
              <span className="mono">{config.dAppAddress}</span>
              <a
                href={`${config.explorerUrl}/address/${config.dAppAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="contract-explorer-link"
                title="View on Explorer"
              >↗</a>
            </div>
          </div>
          <div className="contract-info-row">
            <span className="contract-info-label">Router Contract</span>
            <div className="contract-info-address">
              <span className="mono">{config.routerAddress}</span>
              <a
                href={`${config.explorerUrl}/address/${config.routerAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="contract-explorer-link"
                title="View on Explorer"
              >↗</a>
            </div>
          </div>
          <div className="contract-info-row">
            <span className="contract-info-label">Network</span>
            <span>DecentralChain Mainnet (chain: {config.chainId})</span>
          </div>
        </div>
      </div>
    </div>
  );
}
