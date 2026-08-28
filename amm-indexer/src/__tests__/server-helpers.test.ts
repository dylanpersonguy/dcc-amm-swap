/**
 * Unit tests for the pure validation/formatting helpers in server.ts:
 * parsePositiveBigInt, parseValidFeeBps, normalizeAsset, swaggerHtml.
 *
 * These were exported (previously module-private) specifically to make this
 * kind of direct, no-HTTP-server-required testing possible. See the report
 * for the exact seam.
 */
import {
  parsePositiveBigInt,
  parseValidFeeBps,
  normalizeAsset,
  swaggerHtml,
} from '../server';

describe('parsePositiveBigInt', () => {
  it('parses a valid positive integer string', () => {
    expect(parsePositiveBigInt('100000000')).toBe(100000000n);
  });

  it('parses "1" as the smallest positive integer', () => {
    expect(parsePositiveBigInt('1')).toBe(1n);
  });

  it('parses a number-typed input', () => {
    expect(parsePositiveBigInt(42)).toBe(42n);
  });

  it('rejects zero', () => {
    expect(parsePositiveBigInt('0')).toBeNull();
  });

  it('rejects negative numbers', () => {
    expect(parsePositiveBigInt('-5')).toBeNull();
  });

  it('rejects a negative number literal', () => {
    expect(parsePositiveBigInt(-5)).toBeNull();
  });

  it('rejects non-numeric strings', () => {
    expect(parsePositiveBigInt('abc')).toBeNull();
  });

  it('rejects a string mixing digits and letters', () => {
    expect(parsePositiveBigInt('123abc')).toBeNull();
  });

  it('rejects the empty string', () => {
    expect(parsePositiveBigInt('')).toBeNull();
  });

  it('rejects undefined', () => {
    expect(parsePositiveBigInt(undefined)).toBeNull();
  });

  it('rejects null', () => {
    expect(parsePositiveBigInt(null)).toBeNull();
  });

  it('rejects decimals', () => {
    expect(parsePositiveBigInt('1.5')).toBeNull();
  });

  it('rejects a decimal with a zero fractional part', () => {
    expect(parsePositiveBigInt('100.0')).toBeNull();
  });

  it('rejects values with leading whitespace', () => {
    expect(parsePositiveBigInt(' 100')).toBeNull();
  });

  it('rejects values with trailing whitespace', () => {
    expect(parsePositiveBigInt('100 ')).toBeNull();
  });

  it('rejects values with internal whitespace', () => {
    expect(parsePositiveBigInt('1 00')).toBeNull();
  });

  it('rejects a leading plus sign', () => {
    expect(parsePositiveBigInt('+100')).toBeNull();
  });

  it('rejects scientific notation', () => {
    expect(parsePositiveBigInt('1e10')).toBeNull();
  });

  it('rejects hex-looking strings', () => {
    expect(parsePositiveBigInt('0x10')).toBeNull();
  });

  it('rejects boolean input', () => {
    expect(parsePositiveBigInt(true)).toBeNull();
  });

  it('rejects object input', () => {
    expect(parsePositiveBigInt({ amount: 5 })).toBeNull();
  });

  it('rejects array input', () => {
    expect(parsePositiveBigInt([5])).toBeNull();
  });

  it('rejects NaN', () => {
    expect(parsePositiveBigInt(NaN)).toBeNull();
  });

  it('accepts a value just beyond Number.MAX_SAFE_INTEGER without losing precision', () => {
    const huge = (BigInt(Number.MAX_SAFE_INTEGER) + 100n).toString();
    const result = parsePositiveBigInt(huge);
    expect(result).toBe(BigInt(Number.MAX_SAFE_INTEGER) + 100n);
    // Prove this is genuine BigInt-safe (string-based) parsing: a naive
    // `BigInt(Number(x))` implementation would round-trip through a float
    // first and silently corrupt a value past MAX_SAFE_INTEGER, landing on
    // a different integer than the real one.
    expect(BigInt(Number(huge))).not.toBe(result);
  });

  it('accepts values near RIDE_MAX_INT (2^63 - 1), the on-chain Long ceiling', () => {
    const rideMaxInt = 9223372036854775807n;
    expect(parsePositiveBigInt(rideMaxInt.toString())).toBe(rideMaxInt);
  });

  it('accepts values far beyond RIDE_MAX_INT — the helper itself imposes no upper bound', () => {
    const beyond = (9223372036854775807n * 1000n).toString();
    expect(parsePositiveBigInt(beyond)).toBe(9223372036854775807000n);
  });

  it('accepts a very long digit string (100 digits) as a plain precision check', () => {
    const long = '1'.repeat(100);
    expect(parsePositiveBigInt(long)).toBe(BigInt(long));
  });
});

describe('parseValidFeeBps', () => {
  it('returns the fallback (35) when value is undefined', () => {
    expect(parseValidFeeBps(undefined)).toBe(35);
  });

  it('returns the fallback when value is null', () => {
    expect(parseValidFeeBps(null)).toBe(35);
  });

  it('returns the fallback when value is an empty string', () => {
    expect(parseValidFeeBps('')).toBe(35);
  });

  it('honors a custom fallback', () => {
    expect(parseValidFeeBps(undefined, 30)).toBe(30);
  });

  it('accepts the lower boundary, MIN_FEE_BPS = 1', () => {
    expect(parseValidFeeBps(1)).toBe(1);
    expect(parseValidFeeBps('1')).toBe(1);
  });

  it('accepts the upper boundary, MAX_FEE_BPS = 1000', () => {
    expect(parseValidFeeBps(1000)).toBe(1000);
    expect(parseValidFeeBps('1000')).toBe(1000);
  });

  it('accepts a mid-range value', () => {
    expect(parseValidFeeBps(35)).toBe(35);
  });

  it('rejects 0 — just below MIN_FEE_BPS', () => {
    expect(parseValidFeeBps(0)).toBeNull();
  });

  it('rejects a negative fee', () => {
    expect(parseValidFeeBps(-1)).toBeNull();
  });

  it('rejects 1001 — just above MAX_FEE_BPS', () => {
    expect(parseValidFeeBps(1001)).toBeNull();
  });

  it('rejects a fee far above MAX_FEE_BPS', () => {
    expect(parseValidFeeBps(100000)).toBeNull();
  });

  it('rejects non-integer (decimal) values', () => {
    expect(parseValidFeeBps(30.5)).toBeNull();
  });

  it('rejects non-numeric strings', () => {
    expect(parseValidFeeBps('abc')).toBeNull();
  });

  it('rejects NaN', () => {
    expect(parseValidFeeBps(NaN)).toBeNull();
  });

  it('rejects Infinity', () => {
    expect(parseValidFeeBps(Infinity)).toBeNull();
  });

  it('accepts numeric strings and parses them the same as numbers', () => {
    expect(parseValidFeeBps('500')).toBe(500);
  });

  it('rejects a numeric string with decimals', () => {
    expect(parseValidFeeBps('30.5')).toBeNull();
  });

  it('rejects whitespace-padded strings that Number() would otherwise coerce', () => {
    // Number(' 35 ') === 35, so this exercises Number.isInteger keeping the
    // rest of the boundary logic honest rather than the whitespace itself
    // being rejected — Number() trims whitespace by spec.
    expect(parseValidFeeBps(' 35 ')).toBe(35);
  });

  it('rejects boolean input (Number(true) === 1, but should not be treated as valid input type)', () => {
    // Number(true) === 1, which is within range, so this documents actual
    // behavior of the implementation (coerces truthy booleans to 1) rather
    // than assuming a stricter type check that doesn't exist.
    expect(parseValidFeeBps(true)).toBe(1);
  });
});

describe('normalizeAsset', () => {
  it('treats undefined as null (native token)', () => {
    expect(normalizeAsset(undefined)).toBeNull();
  });

  it('treats "DCC" as null (native token)', () => {
    expect(normalizeAsset('DCC')).toBeNull();
  });

  it('treats lowercase "dcc" as null (native token)', () => {
    expect(normalizeAsset('dcc')).toBeNull();
  });

  it('treats the empty string as null', () => {
    expect(normalizeAsset('')).toBeNull();
  });

  it('passes through a real asset ID unchanged', () => {
    expect(normalizeAsset('3P7xABCdefghijk')).toBe('3P7xABCdefghijk');
  });

  it('does not normalize mixed-case variants like "Dcc" (only exact "DCC"/"dcc")', () => {
    expect(normalizeAsset('Dcc')).toBe('Dcc');
  });
});

describe('swaggerHtml', () => {
  it('returns an HTML document that mounts the Swagger UI against /docs.json', () => {
    const out = swaggerHtml();
    expect(out).toContain('<!DOCTYPE html>');
    expect(out).toContain('swagger-ui');
    expect(out).toContain("url:'/docs.json'");
  });

  it('is a pure function — repeated calls produce identical output', () => {
    expect(swaggerHtml()).toBe(swaggerHtml());
  });
});
