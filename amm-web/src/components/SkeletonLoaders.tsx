/**
 * Skeleton loaders — replace spinners with layout-matching placeholders.
 */

import React from 'react';

export function SkeletonLine({ width = '100%', height = 16 }: { width?: string | number; height?: number }) {
  return <div className="skeleton-line" style={{ width, height }} />;
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-card-header">
        <div className="skeleton-circle" />
        <div className="skeleton-circle" style={{ marginLeft: -6 }} />
        <SkeletonLine width="60%" height={14} />
      </div>
      <SkeletonLine width="40%" height={20} />
      <div className="skeleton-card-stats">
        <SkeletonLine width="100%" height={12} />
        <SkeletonLine width="100%" height={12} />
        <SkeletonLine width="80%" height={12} />
      </div>
    </div>
  );
}

export function SkeletonPoolGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="pool-grid">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonSwapPanel() {
  return (
    <div className="panel-card skeleton-swap">
      <div className="skeleton-swap-header">
        <SkeletonLine width={60} height={20} />
      </div>
      <div className="skeleton-token-field">
        <SkeletonLine width="40%" height={12} />
        <div className="skeleton-token-row">
          <SkeletonLine width="50%" height={32} />
          <div className="skeleton-pill" />
        </div>
      </div>
      <div className="skeleton-flip" />
      <div className="skeleton-token-field">
        <SkeletonLine width="40%" height={12} />
        <div className="skeleton-token-row">
          <SkeletonLine width="50%" height={32} />
          <div className="skeleton-pill" />
        </div>
      </div>
      <div className="skeleton-button" />
    </div>
  );
}

export function SkeletonTableRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="skeleton-row">
      {Array.from({ length: cols }, (_, i) => (
        <td key={i}><SkeletonLine width={i === 0 ? 30 : '80%'} height={14} /></td>
      ))}
    </tr>
  );
}

export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonTableRow key={i} cols={cols} />
      ))}
    </>
  );
}
