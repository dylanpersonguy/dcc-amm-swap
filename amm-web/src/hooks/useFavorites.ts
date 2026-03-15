/**
 * useFavorites — persist starred/favorited pool IDs in localStorage.
 */

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'dcc-amm-favorites';

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveFavorites(favs: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favs]));
  } catch {}
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);

  const toggleFavorite = useCallback((poolId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(poolId)) next.delete(poolId);
      else next.add(poolId);
      saveFavorites(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (poolId: string) => favorites.has(poolId),
    [favorites]
  );

  return { favorites, toggleFavorite, isFavorite };
}
