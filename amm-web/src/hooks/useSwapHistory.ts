/**
 * useSwapHistory — stores user's recent swap history in localStorage.
 */

import { useState, useCallback } from 'react';

export interface SwapHistoryEntry {
  id: string;
  inputAsset: string;
  outputAsset: string;
  inputAmount: string;
  outputAmount: string;
  txId: string;
  timestamp: number;
}

const STORAGE_KEY = 'dcc-amm-swap-history';
const MAX_ENTRIES = 10;

function loadHistory(): SwapHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: SwapHistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // localStorage full or unavailable
  }
}

export function useSwapHistory() {
  const [history, setHistory] = useState<SwapHistoryEntry[]>(loadHistory);

  const addEntry = useCallback(
    (entry: Omit<SwapHistoryEntry, 'id' | 'timestamp'>) => {
      const newEntry: SwapHistoryEntry = {
        ...entry,
        id: `swap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
      };
      setHistory((prev) => {
        const next = [newEntry, ...prev].slice(0, MAX_ENTRIES);
        saveHistory(next);
        return next;
      });
    },
    []
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { history, addEntry, clearHistory };
}
