/**
 * Tests for pure formatting helpers in src/ui/format.ts. These carry no
 * side effects and no external dependencies (beyond @dcc-amm/sdk's
 * fromRawAmount, already covered by its own package tests), so this
 * focuses on format.ts's own logic: percent/compact-number formatting,
 * short-address/asset truncation, and message assembly — including the
 * "Showing N of M trades" trade-history count added this session.
 */

import * as fmt from './format';

describe('fmtDcc / fmtToken', () => {
  it('formats DCC (8 decimals) raw amounts', () => {
    expect(fmt.fmtDcc(100_000_000n)).toBe('1');
    expect(fmt.fmtDcc(150_000_000n)).toBe('1.5');
    expect(fmt.fmtDcc(0n)).toBe('0');
  });

  it('formats arbitrary-decimal token raw amounts', () => {
    expect(fmt.fmtToken(1_000_000n, 6)).toBe('1');
    expect(fmt.fmtToken(1_500_000n, 6)).toBe('1.5');
    expect(fmt.fmtToken(100n, 0)).toBe('100');
  });
});

describe('fmtUsd', () => {
  it('formats with exactly 2 decimal places and thousands separators', () => {
    expect(fmt.fmtUsd(1234.5)).toBe('1,234.50');
    expect(fmt.fmtUsd(0)).toBe('0.00');
    expect(fmt.fmtUsd(1000000)).toBe('1,000,000.00');
  });
});

describe('fmtPercent', () => {
  it('converts basis points to a percent string with 2 decimals', () => {
    expect(fmt.fmtPercent(50)).toBe('0.50%');
    expect(fmt.fmtPercent(100)).toBe('1.00%');
    expect(fmt.fmtPercent(35)).toBe('0.35%');
  });

  it('handles zero', () => {
    expect(fmt.fmtPercent(0)).toBe('0.00%');
  });

  it('handles large bps values (e.g. an 80% referral commission expressed in bps)', () => {
    expect(fmt.fmtPercent(8000)).toBe('80.00%');
  });
});

describe('fmtCompact', () => {
  it('formats small numbers with fixed decimals (capped at 4)', () => {
    expect(fmt.fmtCompact(150_000_000n, 8)).toBe('1.5000');
    expect(fmt.fmtCompact(0n, 8)).toBe('0.0000');
  });

  it('uses at least 2 decimals when the token has fewer than 2 decimals itself', () => {
    expect(fmt.fmtCompact(5n, 0)).toBe('5.00');
  });

  it('abbreviates thousands with K', () => {
    expect(fmt.fmtCompact(1_500_000_000_000n, 8)).toBe('15.00K'); // 1.5e12 raw / 1e8 = 15,000
  });

  it('abbreviates millions with M', () => {
    // 2,500,000 tokens at 8 decimals raw
    expect(fmt.fmtCompact(250_000_000_000_000n, 8)).toBe('2.50M');
  });

  it('abbreviates billions with B', () => {
    // 3,000,000,000 tokens at 8 decimals raw
    expect(fmt.fmtCompact(300_000_000_000_000_000n, 8)).toBe('3.00B');
  });

  it('handles the boundary just under 1,000 without abbreviation', () => {
    expect(fmt.fmtCompact(999_00000000n, 8)).toBe('999.0000');
  });
});

describe('shortAddr / shortAsset', () => {
  it('truncates a long address to first 6 + last 4 chars', () => {
    const addr = '3PAbcdEFGHijklmnopQRSTuvwxYZ12345';
    expect(fmt.shortAddr(addr)).toBe('3PAbcd···2345');
  });

  it('shortens a non-DCC asset id to its first 6 chars', () => {
    expect(fmt.shortAsset('7xKXtg2CW87d97TXJSDpbD5jBkheTqA')).toBe('7xKXtg···');
  });

  it('renders DCC and null asset ids as the literal "DCC"', () => {
    expect(fmt.shortAsset(null)).toBe('DCC');
    expect(fmt.shortAsset('DCC')).toBe('DCC');
  });
});

describe('errorMessage / loadingMessage', () => {
  it('embeds title and detail in an error message', () => {
    const msg = fmt.errorMessage('Swap failed', 'Insufficient balance');
    expect(msg).toContain('Swap failed');
    expect(msg).toContain('Insufficient balance');
  });

  it('embeds the action in a loading message', () => {
    expect(fmt.loadingMessage('Executing swap')).toContain('Executing swap');
  });
});

describe('tradeHistoryMessage', () => {
  const sampleTrades = [
    { type: 'buy', assetIn: 'DCC', assetOut: 'TOK', amountIn: '10', amountOut: '500', txId: 'tx1', timestamp: 1700000000 },
    { type: 'sell', assetIn: 'TOK', assetOut: 'DCC', amountIn: '250', amountOut: '5', txId: 'tx2', timestamp: 1700000100 },
  ];

  it('renders "No trades yet" for an empty list', () => {
    const msg = fmt.tradeHistoryMessage([]);
    expect(msg).toContain('No trades yet');
  });

  it('renders each trade\'s type and amounts', () => {
    const msg = fmt.tradeHistoryMessage(sampleTrades);
    expect(msg).toContain('BUY');
    expect(msg).toContain('SELL');
    expect(msg).toContain('10 → 500');
    expect(msg).toContain('250 → 5');
  });

  it('omits the "Showing N of M" line when totalCount is not given', () => {
    const msg = fmt.tradeHistoryMessage(sampleTrades);
    expect(msg).not.toContain('Showing');
  });

  it('omits the "Showing N of M" line when totalCount equals the returned trade count', () => {
    const msg = fmt.tradeHistoryMessage(sampleTrades, sampleTrades.length);
    expect(msg).not.toContain('Showing');
  });

  it('shows "Showing N of M trades" when more trades exist than are displayed', () => {
    const msg = fmt.tradeHistoryMessage(sampleTrades, 25);
    expect(msg).toContain('Showing 2 of 25 trades');
  });

  it('does not show the count line for an empty list even with a totalCount', () => {
    const msg = fmt.tradeHistoryMessage([], 10);
    expect(msg).not.toContain('Showing');
    expect(msg).toContain('No trades yet');
  });
});

describe('swapSuccessMessage', () => {
  it('includes sent/received amounts and the bot fee when provided', () => {
    const msg = fmt.swapSuccessMessage('DCC', 'TOK', '10', '500', 'tx-abc', '0.1');
    expect(msg).toContain('10 DCC');
    expect(msg).toContain('500 TOK');
    expect(msg).toContain('0.1 DCC');
    expect(msg).toContain('tx-abc');
  });

  it('omits the bot fee line when not provided', () => {
    const msg = fmt.swapSuccessMessage('DCC', 'TOK', '10', '500', 'tx-abc');
    expect(msg).not.toContain('Bot Fee');
  });
});

describe('poolCardMessage', () => {
  it('renders both reserves and both price directions', () => {
    const msg = fmt.poolCardMessage({
      token0Name: 'DCC',
      token1Name: 'TOK',
      reserve0: 1000_00000000n,
      reserve1: 50000_000000n,
      token0Decimals: 8,
      token1Decimals: 6,
      feeBps: 35,
      swapCount: 42,
      price0to1: '50',
      price1to0: '0.02',
    });
    expect(msg).toContain('DCC / TOK');
    expect(msg).toContain('0.35%');
    expect(msg).toContain('42');
    expect(msg).toContain('50');
    expect(msg).toContain('0.02');
  });
});
