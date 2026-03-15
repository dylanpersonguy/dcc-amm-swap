/**
 * TransactionTracker — floating widget that tracks pending/confirmed transactions.
 * Like Uniswap's transaction history drawer.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { config } from '../config';

export type TxState = 'pending' | 'confirmed' | 'failed';

export interface TrackedTx {
  id: string;
  type: 'swap' | 'add-liquidity' | 'remove-liquidity' | 'create-pool';
  summary: string;
  state: TxState;
  timestamp: number;
  txId?: string;
}

interface TxTrackerContextValue {
  transactions: TrackedTx[];
  trackTransaction: (type: TrackedTx['type'], summary: string) => string;
  confirmTransaction: (trackId: string, txId: string) => void;
  failTransaction: (trackId: string) => void;
  clearAll: () => void;
}

const TxTrackerContext = createContext<TxTrackerContextValue | null>(null);

export function useTxTracker() {
  const ctx = useContext(TxTrackerContext);
  if (!ctx) throw new Error('useTxTracker must be inside TxTrackerProvider');
  return ctx;
}

let idCounter = 0;

export function TxTrackerProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<TrackedTx[]>([]);

  const trackTransaction = useCallback((type: TrackedTx['type'], summary: string) => {
    const trackId = `tx-${++idCounter}`;
    setTransactions((prev) => [
      { id: trackId, type, summary, state: 'pending', timestamp: Date.now() },
      ...prev,
    ]);
    return trackId;
  }, []);

  const confirmTransaction = useCallback((trackId: string, txId: string) => {
    setTransactions((prev) =>
      prev.map((tx) => (tx.id === trackId ? { ...tx, state: 'confirmed' as TxState, txId } : tx))
    );
  }, []);

  const failTransaction = useCallback((trackId: string) => {
    setTransactions((prev) =>
      prev.map((tx) => (tx.id === trackId ? { ...tx, state: 'failed' as TxState } : tx))
    );
  }, []);

  const clearAll = useCallback(() => setTransactions([]), []);

  return (
    <TxTrackerContext.Provider
      value={{ transactions, trackTransaction, confirmTransaction, failTransaction, clearAll }}
    >
      {children}
    </TxTrackerContext.Provider>
  );
}

/** Floating transaction history widget */
export function TransactionWidget() {
  const { transactions, clearAll } = useTxTracker();
  const [open, setOpen] = useState(false);

  const pendingCount = transactions.filter((tx) => tx.state === 'pending').length;

  if (transactions.length === 0) return null;

  return (
    <div className="tx-widget">
      <button className="tx-widget-toggle" onClick={() => setOpen(!open)}>
        {pendingCount > 0 && <span className="tx-widget-badge">{pendingCount}</span>}
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 4v4l3 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="tx-widget-drawer">
          <div className="tx-widget-header">
            <span>Recent Transactions</span>
            <button className="tx-widget-clear" onClick={clearAll}>Clear all</button>
          </div>
          <div className="tx-widget-list">
            {transactions.slice(0, 10).map((tx) => (
              <div key={tx.id} className={`tx-widget-item tx-${tx.state}`}>
                <div className="tx-widget-item-info">
                  <span className={`tx-widget-dot ${tx.state}`} />
                  <span className="tx-widget-summary">{tx.summary}</span>
                </div>
                <div className="tx-widget-item-meta">
                  <span className="tx-widget-time">
                    {new Date(tx.timestamp).toLocaleTimeString()}
                  </span>
                  {tx.txId && (
                    <a
                      href={`${config.explorerUrl}/tx/${tx.txId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tx-widget-link"
                    >
                      ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
