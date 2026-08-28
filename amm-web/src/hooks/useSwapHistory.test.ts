import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwapHistory } from './useSwapHistory';

const STORAGE_KEY = 'dcc-amm-swap-history';

describe('useSwapHistory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts empty when nothing is stored', () => {
    const { result } = renderHook(() => useSwapHistory());
    expect(result.current.history).toEqual([]);
  });

  it('adds an entry to the front of history with a generated id/timestamp', () => {
    const { result } = renderHook(() => useSwapHistory());

    act(() =>
      result.current.addEntry({
        inputAsset: 'DCC',
        outputAsset: 'FOO',
        inputAmount: '1',
        outputAmount: '2',
        txId: 'tx1',
      })
    );

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0]).toMatchObject({
      inputAsset: 'DCC',
      outputAsset: 'FOO',
      txId: 'tx1',
    });
    expect(result.current.history[0].id).toMatch(/^swap-/);
    expect(typeof result.current.history[0].timestamp).toBe('number');
  });

  it('caps history at 10 entries, dropping the oldest first', () => {
    const { result } = renderHook(() => useSwapHistory());

    act(() => {
      for (let i = 0; i < 12; i++) {
        result.current.addEntry({
          inputAsset: 'DCC',
          outputAsset: 'FOO',
          inputAmount: String(i),
          outputAmount: '0',
          txId: `tx${i}`,
        });
      }
    });

    expect(result.current.history).toHaveLength(10);
    // Newest entry (tx11) is at the front.
    expect(result.current.history[0].txId).toBe('tx11');
    // The two oldest entries fell off the end.
    const txIds = result.current.history.map((h) => h.txId);
    expect(txIds).not.toContain('tx0');
    expect(txIds).not.toContain('tx1');
  });

  it('persists entries to localStorage', () => {
    const { result } = renderHook(() => useSwapHistory());

    act(() =>
      result.current.addEntry({
        inputAsset: 'DCC',
        outputAsset: 'FOO',
        inputAmount: '1',
        outputAmount: '2',
        txId: 'tx1',
      })
    );

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].txId).toBe('tx1');
  });

  it('clears history and removes it from localStorage', () => {
    const { result } = renderHook(() => useSwapHistory());

    act(() =>
      result.current.addEntry({
        inputAsset: 'DCC',
        outputAsset: 'FOO',
        inputAmount: '1',
        outputAmount: '2',
        txId: 'tx1',
      })
    );
    act(() => result.current.clearHistory());

    expect(result.current.history).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
