/**
 * Regression tests for computeSellAmountRaw() in src/handlers/token-detect.ts
 * — the Trojan-style sell-flow fix.
 *
 * The bug: a DCC-denominated preset ("sell ~5 DCC worth of this token") used
 * to be reinterpreted directly as raw token units, executing the wrong
 * amount on real trades. The fix converts via the live pool reserve ratio:
 *   amountRaw = (dccAmountRaw * tokenReserve) / dccReserve
 *
 * These tests confirm the conversion is mathematically correct, that it
 * genuinely differs from the old buggy passthrough when reserves/decimals
 * don't coincidentally match 1:1, and that the amountRaw <= 0n guard fires.
 */

import type { PoolInfo } from '../services/trading';

// token-detect.ts transitively imports src/db.ts (for getSettings), which
// throws at import time if ENCRYPTION_SECRET is unset -- set it before the
// require() below pulls the module in. A plain require (not a static ES
// import) keeps this statement in source order rather than letting it be
// compiled ahead of the assignment.
process.env.ENCRYPTION_SECRET = 'unit-test-secret-do-not-use-in-prod';
const { computeSellAmountRaw } = require('./token-detect') as typeof import('./token-detect');

function makePool(overrides: Partial<Pick<PoolInfo, 'token0' | 'reserve0' | 'reserve1'>>): Pick<PoolInfo, 'token0' | 'reserve0' | 'reserve1'> {
  return {
    token0: 'TOKEN_ASSET_ID',
    reserve0: 0n,
    reserve1: 0n,
    ...overrides,
  };
}

describe('computeSellAmountRaw', () => {
  const assetId = 'TOKEN_ASSET_ID';

  it('converts a DCC-denominated sell amount via the pool reserve ratio (token is token0)', () => {
    // DCC reserve = 1000 DCC (8 decimals) = 1000_00000000n
    // Token reserve = 50000 TOKEN (6 decimals) = 50000_000000n
    // pool.token0 = the token, pool.reserve0 = tokenReserve, pool.reserve1 = dccReserve
    const dccReserve = 1000_00000000n;
    const tokenReserve = 50000_000000n;
    const pool = makePool({ token0: assetId, reserve0: tokenReserve, reserve1: dccReserve });

    // "Sell 5 DCC worth" -> 5 DCC raw = 5_00000000n
    const dccAmountRaw = 5_00000000n;
    const result = computeSellAmountRaw(dccAmountRaw, assetId, pool);

    // Expected: (dccRaw * tokenReserve) / dccReserve
    const expected = (dccAmountRaw * tokenReserve) / dccReserve;
    expect(result).toBe(expected);
    expect(result).toBe(250_000000n); // 5/1000 of the token reserve = 250 tokens raw
  });

  it('converts correctly when the token is token1 instead of token0', () => {
    const dccReserve = 2000_00000000n;
    const tokenReserve = 100000_00n; // 2 decimals, arbitrary
    // pool.token0 is something else (DCC side), token1 is our target asset
    const pool: Pick<PoolInfo, 'token0' | 'reserve0' | 'reserve1'> = {
      token0: 'SOME_OTHER_ASSET_NOT_OURS',
      reserve0: dccReserve,
      reserve1: tokenReserve,
    };

    const dccAmountRaw = 20_00000000n; // sell 20 DCC worth
    const result = computeSellAmountRaw(dccAmountRaw, assetId, pool);

    const expected = (dccAmountRaw * tokenReserve) / dccReserve;
    expect(result).toBe(expected);
  });

  it('does NOT pass the DCC raw amount straight through as token raw units when reserves/decimals differ', () => {
    // This is the exact regression the fix targets: with a DCC reserve of
    // 1000 DCC (8 dp) and a token reserve of 50000 units (6 dp), a naive
    // "sell 5 DCC worth" -> literal 5 * 1e8 raw token units passthrough
    // (the old bug) must NOT be what comes out.
    const dccReserve = 1000_00000000n;
    const tokenReserve = 50000_000000n;
    const pool = makePool({ token0: assetId, reserve0: tokenReserve, reserve1: dccReserve });

    const dccAmountRaw = 5_00000000n; // "5 DCC worth" preset
    const oldBuggyPassthrough = dccAmountRaw; // old code used dccRaw directly as amountRaw for sells
    const result = computeSellAmountRaw(dccAmountRaw, assetId, pool);

    expect(result).not.toBe(oldBuggyPassthrough);
    expect(result).toBe(250_000000n);
  });

  it('the old buggy passthrough would coincidentally match only when reserves are exactly 1:1', () => {
    const equalReserve = 1000_00000000n;
    const pool = makePool({ token0: assetId, reserve0: equalReserve, reserve1: equalReserve });

    const dccAmountRaw = 5_00000000n;
    const result = computeSellAmountRaw(dccAmountRaw, assetId, pool);

    // Only in this special 1:1 case does the correct conversion equal the
    // naive passthrough -- demonstrating why the old bug went unnoticed on
    // some pools but silently mis-executed trades on others.
    expect(result).toBe(dccAmountRaw);
  });

  it('throws when the computed amount is zero or negative (amount too small to execute)', () => {
    // Token reserve so much smaller than DCC reserve that a tiny DCC amount
    // rounds down to 0 raw token units.
    const dccReserve = 1_000_000_000_000n; // huge DCC reserve
    const tokenReserve = 1n; // vanishingly small token reserve
    const pool = makePool({ token0: assetId, reserve0: tokenReserve, reserve1: dccReserve });

    const dccAmountRaw = 1n; // smallest possible unit

    expect(() => computeSellAmountRaw(dccAmountRaw, assetId, pool)).toThrow(
      'Amount too small to execute — try a larger amount.'
    );
  });

  it('throws when dccAmountRaw is zero', () => {
    const pool = makePool({ token0: assetId, reserve0: 1000n, reserve1: 1000n });
    expect(() => computeSellAmountRaw(0n, assetId, pool)).toThrow(/too small/);
  });

  it('handles a large, realistic conversion without precision loss (bigint math, no floating point)', () => {
    const dccReserve = 123_456_78901234n; // arbitrary large reserve
    const tokenReserve = 987_654_321_00000000n;
    const pool = makePool({ token0: assetId, reserve0: tokenReserve, reserve1: dccReserve });

    const dccAmountRaw = 999_99999999n;
    const result = computeSellAmountRaw(dccAmountRaw, assetId, pool);

    expect(result).toBe((dccAmountRaw * tokenReserve) / dccReserve);
  });
});
