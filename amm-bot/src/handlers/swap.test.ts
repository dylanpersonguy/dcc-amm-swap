/**
 * Regression tests for amount parsing in src/handlers/swap.ts.
 *
 * The old implementation computed raw amounts as
 * `BigInt(Math.round(amount * 10 ** decimals))`, which is subject to
 * floating-point precision drift for decimal strings that don't round-trip
 * exactly through IEEE 754 doubles. It was replaced with the SDK's
 * string-based `toRawAmount`, wired through two small exported helpers:
 * `resolveAmountDecimals` (decimals-by-direction) and `parseAmountToRaw`
 * (the actual conversion) -- both used verbatim by the preset-amount and
 * custom-amount-text callback handlers.
 */

export {}; // force module scope (no top-level `import` otherwise)

// swap.ts transitively imports src/db.ts (for getSettings), which throws at
// import time if ENCRYPTION_SECRET is unset.
process.env.ENCRYPTION_SECRET = 'unit-test-secret-do-not-use-in-prod';
const { resolveAmountDecimals, parseAmountToRaw } = require('./swap') as typeof import('./swap');

describe('resolveAmountDecimals', () => {
  it('always uses 8 decimals (DCC) for buys, regardless of token decimals', () => {
    expect(resolveAmountDecimals('buy', 6)).toBe(8);
    expect(resolveAmountDecimals('buy', 0)).toBe(8);
    expect(resolveAmountDecimals('buy', undefined)).toBe(8);
  });

  it('uses the token\'s own decimals for sells', () => {
    expect(resolveAmountDecimals('sell', 6)).toBe(6);
    expect(resolveAmountDecimals('sell', 0)).toBe(0);
    expect(resolveAmountDecimals('sell', 2)).toBe(2);
  });

  it('defaults to 8 decimals for sells when tokenDecimals is unknown', () => {
    expect(resolveAmountDecimals('sell', undefined)).toBe(8);
  });
});

describe('parseAmountToRaw — precision regression tests', () => {
  it('converts simple decimal amounts precisely at 8 decimals', () => {
    expect(parseAmountToRaw('0.1', 8)).toBe(10_000_000n);
    expect(parseAmountToRaw('1', 8)).toBe(100_000_000n);
    expect(parseAmountToRaw('0.5', 8)).toBe(50_000_000n);
  });

  it('converts a long, non-round decimal at full 8-decimal precision without drift', () => {
    // The classic float trap: 0.1 + 0.2 !== 0.3 in IEEE754, and
    // Math.round(123.45678901 * 1e8) can drift by 1 raw unit. The
    // string-based conversion must not.
    expect(parseAmountToRaw('123.45678901', 8)).toBe(12345678901n);
  });

  it('converts precisely at 6 decimals (e.g. a USDT-like token)', () => {
    expect(parseAmountToRaw('0.1', 6)).toBe(100_000n);
    expect(parseAmountToRaw('123.456789', 6)).toBe(123_456_789n);
    // Excess precision beyond 6 decimals is truncated, not rounded.
    expect(parseAmountToRaw('1.1234567', 6)).toBe(1_123_456n);
  });

  it('converts precisely at 0 decimals (whole-unit token)', () => {
    expect(parseAmountToRaw('100', 0)).toBe(100n);
    expect(parseAmountToRaw('42', 0)).toBe(42n);
  });

  it('matches known-correct raw values for every bot preset amount at 8 decimals', () => {
    const presets: Array<[string, bigint]> = [
      ['0.5', 50_000_000n],
      ['1', 100_000_000n],
      ['5', 500_000_000n],
      ['10', 1_000_000_000n],
      ['25', 2_500_000_000n],
      ['50', 5_000_000_000n],
    ];
    for (const [input, expected] of presets) {
      expect(parseAmountToRaw(input, 8)).toBe(expected);
    }
  });

  it('does not exhibit the old Math.round(amount * 10**decimals) drift for repeating-fraction-prone inputs', () => {
    // 0.29 * 1e8 in floating point is 28999999.999999996, which
    // `Math.round` happens to save here, but smaller/larger repeating
    // fractions are not so lucky -- the string-based path sidesteps the
    // whole class of bug by construction. Assert the exact expected value.
    const raw = parseAmountToRaw('0.29', 8);
    expect(raw).toBe(29_000_000n);

    const legacyFloatCompute = BigInt(Math.round(0.29 * 10 ** 8));
    expect(raw).toBe(legacyFloatCompute); // happens to agree here...

    // ...but for a value where float multiplication drifts below the
    // rounding boundary, the two approaches diverge -- pin the correct
    // (string-based) answer explicitly rather than trusting Math.round.
    expect(parseAmountToRaw('0.00000001', 8)).toBe(1n);
    expect(parseAmountToRaw('7.00000001', 8)).toBe(700000001n);
  });
});
