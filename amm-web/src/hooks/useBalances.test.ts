import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBalances } from './useBalances';

// useBalances reads the connected wallet via useWallet(). Mock it directly
// rather than standing up a full WalletProvider so the test controls
// address/isConnected precisely.
vi.mock('../context/WalletContext', () => ({
  useWallet: () => ({ address: 'test-address-123', isConnected: true }),
}));

type FakeResponse = { ok: boolean; json: () => Promise<unknown> };

/** A fetch call captured before it resolves, so the test can control ordering. */
interface CapturedCall {
  url: string;
  resolve: (value: FakeResponse) => void;
}

/** Flush both the microtask queue and any chained `.then`/`await` continuations. */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('useBalances', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('stale-response guard (refreshToken)', () => {
    let calls: CapturedCall[];

    beforeEach(() => {
      calls = [];
      global.fetch = vi.fn((url: string) => {
        return new Promise<FakeResponse>((resolve) => {
          calls.push({ url: String(url), resolve });
        });
      }) as unknown as typeof fetch;
    });

    it('keeps the result of a later refresh() even if an earlier refresh() resolves after it', async () => {
      const { result, unmount } = renderHook(() => useBalances());

      // Mounting triggers an automatic refresh() (consumes refreshToken #1).
      // Drain its two fetches first so it doesn't interfere with the
      // overlapping-refresh scenario below.
      await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(1));
      await act(async () => {
        calls[0].resolve({ ok: true, json: async () => ({ balance: '0' }) });
        await flush();
      });
      await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(2));
      await act(async () => {
        calls[1].resolve({ ok: true, json: async () => ({ balances: [] }) });
        await flush();
      });
      await waitFor(() => expect(result.current.loading).toBe(false));

      // --- Overlapping refresh scenario ---
      // Call A starts first (refreshToken #2) but we'll resolve it LAST.
      act(() => {
        result.current.refresh();
      });
      await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(3));
      const callADcc = calls[2];

      // Call B starts second (refreshToken #3) and we resolve it FIRST,
      // simulating a newer refresh (e.g. after switching wallets) winning
      // the race against a slower, now-stale, in-flight fetch.
      act(() => {
        result.current.refresh();
      });
      await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(4));
      const callBDcc = calls[3];

      // Resolve call B fully first.
      await act(async () => {
        callBDcc.resolve({ ok: true, json: async () => ({ balance: '2000' }) });
        await flush();
      });
      await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(5));
      const callBAssets = calls[4];
      await act(async () => {
        callBAssets.resolve({
          ok: true,
          json: async () => ({ balances: [{ assetId: 'AST_B', balance: 200 }] }),
        });
        await flush();
      });

      // Call B (the newer refresh) should have already applied its result.
      await waitFor(() => expect(result.current.getBalance('DCC')).toBe(2000n));
      expect(result.current.getBalance('AST_B')).toBe(200n);

      // Now let the STALE call A resolve, after call B already finished.
      await act(async () => {
        callADcc.resolve({ ok: true, json: async () => ({ balance: '1000' }) });
        await flush();
      });
      await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(6));
      const callAAssets = calls[5];
      await act(async () => {
        callAAssets.resolve({
          ok: true,
          json: async () => ({ balances: [{ assetId: 'AST_A', balance: 100 }] }),
        });
        await flush();
      });

      // The stale call A must NOT have clobbered call B's newer result.
      expect(result.current.getBalance('DCC')).toBe(2000n);
      expect(result.current.getBalance('AST_B')).toBe(200n);
      expect(result.current.getBalance('AST_A')).toBe(0n);

      unmount();
    });
  });

  describe('formatBalance', () => {
    beforeEach(() => {
      global.fetch = vi.fn((url: string) => {
        if (String(url).includes('/addresses/balance/')) {
          return Promise.resolve({ ok: true, json: async () => ({ balance: '123456789' }) });
        }
        if (String(url).includes('/assets/balance/')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              balances: [
                { assetId: 'FOO', balance: 1234 },
                { assetId: 'WHOLE', balance: 100000000 },
              ],
            }),
          });
        }
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }) as unknown as typeof fetch;
    });

    it('formats a balance, truncated to 4 fractional digits', async () => {
      const { result, unmount } = renderHook(() => useBalances());
      await waitFor(() => expect(result.current.loading).toBe(false));
      // 123456789 raw / 1e8 decimals = 1.23456789 -> shown truncated to 4 frac digits
      expect(result.current.formatBalance('DCC', 8)).toBe('1.2345');
      unmount();
    });

    it('formats an asset balance using its own decimals', async () => {
      const { result, unmount } = renderHook(() => useBalances());
      await waitFor(() => expect(result.current.loading).toBe(false));
      // 1234 raw / 1e2 decimals = 12.34
      expect(result.current.formatBalance('FOO', 2)).toBe('12.34');
      unmount();
    });

    it('strips trailing zero fractional digits down to a whole number', async () => {
      const { result, unmount } = renderHook(() => useBalances());
      await waitFor(() => expect(result.current.loading).toBe(false));
      // 100000000 raw / 1e8 decimals = 1.00000000 -> whole number, no decimal point
      expect(result.current.formatBalance('WHOLE', 8)).toBe('1');
      unmount();
    });

    it('returns "0" for an unknown/zero balance regardless of decimals', async () => {
      const { result, unmount } = renderHook(() => useBalances());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.formatBalance('does-not-exist', 8)).toBe('0');
      unmount();
    });
  });
});
