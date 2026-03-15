/**
 * OfflineBanner — shows when user is disconnected or node is unreachable.
 */

import React from 'react';
import { useOffline } from '../hooks/useOffline';

export function OfflineBanner() {
  const { isOffline, nodeDown, showBanner } = useOffline();

  if (!showBanner) return null;

  return (
    <div className="offline-banner">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M1 1l14 14M3.5 7.5a7 7 0 019 0M5.5 9.5a4.5 4.5 0 016 0M7 12a1.5 1.5 0 012 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <span>
        {isOffline
          ? 'You are offline — check your internet connection'
          : 'Node unreachable — data may be stale'}
      </span>
    </div>
  );
}
