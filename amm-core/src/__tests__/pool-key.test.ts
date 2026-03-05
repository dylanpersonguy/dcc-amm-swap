import {
  normalizeAssetId,
  canonicalSort,
  getPoolKey,
  getSwapDirection,
  poolStateKey,
} from '../pool-key';

describe('normalizeAssetId', () => {
  it('normalizes null to DCC', () => {
    expect(normalizeAssetId(null)).toBe('DCC');
  });

  it('normalizes undefined to DCC', () => {
    expect(normalizeAssetId(undefined)).toBe('DCC');
  });

  it('normalizes empty string to DCC', () => {
    expect(normalizeAssetId('')).toBe('DCC');
  });

  it('normalizes "DCC" to DCC', () => {
    expect(normalizeAssetId('DCC')).toBe('DCC');
  });

  it('passes through normal asset IDs', () => {
    expect(normalizeAssetId('3PAbcd123')).toBe('3PAbcd123');
  });
});

describe('canonicalSort', () => {
  it('sorts two asset IDs lexicographically', () => {
    expect(canonicalSort('BBB', 'AAA')).toEqual(['AAA', 'BBB']);
    expect(canonicalSort('AAA', 'BBB')).toEqual(['AAA', 'BBB']);
  });

  it('places DCC first (DCC < any base58 ID)', () => {
    expect(canonicalSort('3PAbcd', null)).toEqual(['DCC', '3PAbcd']);
    expect(canonicalSort(null, '3PAbcd')).toEqual(['DCC', '3PAbcd']);
  });

  it('is commutative', () => {
    const [a1, b1] = canonicalSort('TokenX', 'TokenY');
    const [a2, b2] = canonicalSort('TokenY', 'TokenX');
    expect(a1).toBe(a2);
    expect(b1).toBe(b2);
  });

  it('throws on same asset', () => {
    expect(() => canonicalSort('AAA', 'AAA')).toThrow('must be different');
    expect(() => canonicalSort(null, null)).toThrow('must be different');
    expect(() => canonicalSort('DCC', null)).toThrow('must be different');
  });
});

describe('getPoolKey', () => {
  it('returns deterministic key', () => {
    const key1 = getPoolKey('TokenA', 'TokenB');
    const key2 = getPoolKey('TokenB', 'TokenA');
    expect(key1).toBe(key2);
  });

  it('formats as A_B', () => {
    expect(getPoolKey('BBB', 'AAA')).toBe('AAA_BBB');
  });

  it('handles DCC pairs', () => {
    expect(getPoolKey(null, '3PAbcd')).toBe('DCC_3PAbcd');
  });
});

describe('getSwapDirection', () => {
  it('detects A→B direction', () => {
    const result = getSwapDirection('AAA_BBB', 'AAA');
    expect(result.isAToB).toBe(true);
    expect(result.assetA).toBe('AAA');
    expect(result.assetB).toBe('BBB');
  });

  it('detects B→A direction', () => {
    const result = getSwapDirection('AAA_BBB', 'BBB');
    expect(result.isAToB).toBe(false);
  });

  it('handles DCC as input', () => {
    const result = getSwapDirection('DCC_3PAbcd', null);
    expect(result.isAToB).toBe(true);
  });

  it('throws on invalid pool key', () => {
    expect(() => getSwapDirection('invalid', 'AAA')).toThrow('invalid pool key');
  });

  it('throws on asset not in pool', () => {
    expect(() => getSwapDirection('AAA_BBB', 'CCC')).toThrow('not in pool');
  });
});

describe('poolStateKey', () => {
  it('builds correct state key', () => {
    expect(poolStateKey('DCC_3PAbcd', 'reserveA')).toBe(
      'pool_DCC_3PAbcd_reserveA'
    );
  });
});
