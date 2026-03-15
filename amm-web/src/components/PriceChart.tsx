/**
 * PriceChart — mini sparkline chart for a token pair.
 * Renders an SVG sparkline from indexer price history or simulated data.
 */

import React, { useState, useEffect } from 'react';
import { config } from '../config';

interface PriceChartProps {
  poolId: string;
  token0Name: string;
  token1Name: string;
}

export function PriceChart({ poolId, token0Name, token1Name }: PriceChartProps) {
  const [prices, setPrices] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchHistory() {
      try {
        const res = await fetch(`${config.indexerUrl}/pools/${encodeURIComponent(poolId)}/price?period=24h`);
        if (res.ok) {
          const data = await res.json();
          if (data.prices && Array.isArray(data.prices)) {
            if (!cancelled) setPrices(data.prices.map((p: any) => p.price ?? p));
          }
        }
      } catch {
        // No price history available
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchHistory();
    return () => { cancelled = true; };
  }, [poolId]);

  if (loading || prices.length < 2) {
    return (
      <div className="price-chart-placeholder">
        <svg width="100%" height="40" viewBox="0 0 120 40" preserveAspectRatio="none">
          <path d="M0 20 Q30 20 60 20 T120 20" stroke="var(--text-tertiary)" strokeWidth="1" fill="none" strokeDasharray="4 4"/>
        </svg>
        <span className="price-chart-label">24h price chart</span>
      </div>
    );
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const w = 120;
  const h = 40;
  const padding = 2;

  const points = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * w;
    const y = padding + (1 - (p - min) / range) * (h - 2 * padding);
    return `${x},${y}`;
  });

  const isUp = prices[prices.length - 1] >= prices[0];
  const color = isUp ? 'var(--success)' : 'var(--error)';

  return (
    <div className="price-chart">
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`grad-${poolId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon
          points={`0,${h} ${points.join(' ')} ${w},${h}`}
          fill={`url(#grad-${poolId})`}
        />
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="price-chart-footer">
        <span className="price-chart-label">{token0Name}/{token1Name}</span>
        <span className={`price-chart-change ${isUp ? 'up' : 'down'}`}>
          {isUp ? '↑' : '↓'} {(((prices[prices.length-1] - prices[0]) / prices[0]) * 100).toFixed(2)}%
        </span>
      </div>
    </div>
  );
}
