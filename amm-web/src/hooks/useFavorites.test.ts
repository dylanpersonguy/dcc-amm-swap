import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFavorites } from './useFavorites';

const STORAGE_KEY = 'dcc-amm-favorites';

describe('useFavorites', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts empty when nothing is stored', () => {
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites.size).toBe(0);
    expect(result.current.isFavorite('pool-1')).toBe(false);
  });

  it('toggles a pool into favorites and persists it', () => {
    const { result } = renderHook(() => useFavorites());

    act(() => result.current.toggleFavorite('pool-1'));

    expect(result.current.isFavorite('pool-1')).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')).toEqual(['pool-1']);
  });

  it('toggles a pool back out of favorites', () => {
    const { result } = renderHook(() => useFavorites());

    act(() => result.current.toggleFavorite('pool-1'));
    act(() => result.current.toggleFavorite('pool-1'));

    expect(result.current.isFavorite('pool-1')).toBe(false);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')).toEqual([]);
  });

  it('loads previously persisted favorites on mount', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['pool-9']));
    const { result } = renderHook(() => useFavorites());
    expect(result.current.isFavorite('pool-9')).toBe(true);
  });

  it('falls back to an empty set when localStorage holds invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites.size).toBe(0);
  });
});
