import { describe, it, expect } from 'vitest';
import { getTokenLogo, getTokenColor } from './useTokens';

describe('getTokenLogo', () => {
  it('matches a known token name exactly, case-insensitively', () => {
    expect(getTokenLogo('USDC')).toBe('/tokens/usdc.png');
    expect(getTokenLogo('usdc')).toBe('/tokens/usdc.png');
    expect(getTokenLogo('dcc')).toBe('/logo.png');
  });

  it('prefers an asset-ID lookup over a name match', () => {
    expect(
      getTokenLogo('Totally Unrelated Name', '8MFwa1h8Y6SBc6B3BJwYfC4Fe13EFx5ifkAziXAZRVvc')
    ).toBe('/tokens/staked-dcc.png');
  });

  it('falls back to a partial/keyword match in the name', () => {
    expect(getTokenLogo('Wrapped Bitcoin')).toBe('/tokens/bitcoin.png');
    expect(getTokenLogo('Tether USD')).toBe('/tokens/usdt.png');
  });

  it('returns null when there is no name and no asset-ID match', () => {
    expect(getTokenLogo(null)).toBeNull();
    expect(getTokenLogo(undefined)).toBeNull();
    expect(getTokenLogo(null, 'some-unknown-asset-id')).toBeNull();
  });

  it('returns null for a name with no matching keyword', () => {
    expect(getTokenLogo('Completely Unknown Token')).toBeNull();
  });
});

describe('getTokenColor', () => {
  it('returns the fixed accent color for DCC (null id or "DCC")', () => {
    expect(getTokenColor(null)).toBe('#58a6ff');
    expect(getTokenColor('DCC')).toBe('#58a6ff');
  });

  it('is deterministic for the same asset ID', () => {
    const id = 'SomeAssetId123';
    expect(getTokenColor(id)).toBe(getTokenColor(id));
  });

  it('returns a well-formed hsl() string for a non-DCC asset', () => {
    expect(getTokenColor('SomeAssetId123')).toMatch(/^hsl\(\d+, 60%, 60%\)$/);
  });

  it('differentiates unrelated asset IDs', () => {
    expect(getTokenColor('AssetOne')).not.toBe(getTokenColor('AssetTwo'));
  });
});
