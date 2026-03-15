/**
 * useBalances — fetches wallet balances for all tokens.
 * Returns a map of assetId → raw balance (bigint).
 * Polls every 15s and refreshes after transactions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '../context/WalletContext';
import { config } from '../config';

export function useBalances() {
  const { address, isConnected } = useWallet();
  const [balances, setBalances] = useState<Map<string, bigint>>(new Map());
  const [loading, setLoading] = useState(false);
  const refreshToken = useRef(0);

  const refresh = useCallback(async () => {
    if (!isConnected || !address) {
      setBalances(new Map());
      return;
    }

    try {
      setLoading(true);
      const map = new Map<string, bigint>();

      // Fetch DCC balance
      const dccRes = await fetch(`${config.nodeUrl}/addresses/balance/${address}`);
      if (dccRes.ok) {
        const data = await dccRes.json();
        map.set('DCC', BigInt(data.balance || 0));
      }

      // Fetch all asset balances
      const assetsRes = await fetch(`${config.nodeUrl}/assets/balance/${address}`);
      if (assetsRes.ok) {
        const data = await assetsRes.json();
        for (const b of data.balances || []) {
          if (b.balance > 0) {
            map.set(b.assetId, BigInt(b.balance));
          }
        }
      }

      setBalances(map);
    } catch (err) {
      console.error('[useBalances] Failed to fetch balances:', err);
    } finally {
      setLoading(false);
    }
  }, [address, isConnected]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  const getBalance = useCallback(
    (assetId: string): bigint => {
      const key = (!assetId || assetId === 'DCC') ? 'DCC' : assetId;
      return balances.get(key) ?? 0n;
    },
    [balances]
  );

  const formatBalance = useCallback(
    (assetId: string, decimals: number): string => {
      const raw = getBalance(assetId);
      if (raw === 0n) return '0';
      const str = raw.toString().padStart(decimals + 1, '0');
      const int = str.slice(0, str.length - decimals);
      const frac = str.slice(str.length - decimals, str.length - decimals + 4).replace(/0+$/, '');
      return frac ? `${int}.${frac}` : int;
    },
    [getBalance]
  );

  return { balances, getBalance, formatBalance, loading, refresh };
}
