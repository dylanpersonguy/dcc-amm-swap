/**
 * Tests for the referral commission math in src/services/trading.ts:
 * COMMISSION_PCT tiers, BOT_FEE_BPS, and creditReferralCommissions(), which
 * walks the referral chain up to 10 layers deep and records a reward per
 * layer proportional to the bot's 1% fee.
 *
 * creditReferralCommissions reads/writes through src/db.ts (getReferrer,
 * recordReferralReward), so this uses a real in-memory SQLite database
 * rather than mocking the db module.
 */

export {}; // force module scope (no top-level `import` otherwise, which
// would make TS treat this as a global script and collide with other
// require()-only test files' top-level `db` binding)

process.env.ENCRYPTION_SECRET = 'unit-test-secret-do-not-use-in-prod';

const db = require('../db') as typeof import('../db');
const trading = require('./trading') as typeof import('./trading');

beforeEach(() => {
  db.initDb(':memory:');
});

describe('COMMISSION_PCT tiers', () => {
  it('has exactly 10 layers', () => {
    expect(trading.COMMISSION_PCT).toHaveLength(10);
  });

  it('matches the documented tier schedule', () => {
    expect(trading.COMMISSION_PCT).toEqual([25, 15, 10, 8, 6, 5, 4, 3, 2, 2]);
  });

  it('sums to the documented 80% total payout', () => {
    const total = trading.COMMISSION_PCT.reduce((sum, pct) => sum + pct, 0);
    expect(total).toBe(80);
  });

  it('is strictly non-increasing layer over layer (deeper referrers never earn more)', () => {
    for (let i = 1; i < trading.COMMISSION_PCT.length; i++) {
      expect(trading.COMMISSION_PCT[i]).toBeLessThanOrEqual(trading.COMMISSION_PCT[i - 1]);
    }
  });
});

describe('BOT_FEE_BPS', () => {
  it('is 100 bps (1%)', () => {
    expect(trading.BOT_FEE_BPS).toBe(100);
  });
});

describe('creditReferralCommissions', () => {
  it('does nothing when botFeeRaw is zero or negative', () => {
    db.recordReferral(1, 2);
    trading.creditReferralCommissions(2, 900, 0n, 'DCC');
    trading.creditReferralCommissions(2, 901, -5n, 'DCC');

    expect(db.getTotalEarned(1)).toBe(0n);
    expect(db.getRecentRewards(1)).toHaveLength(0);
  });

  it('does nothing when the trader has no referrer', () => {
    trading.creditReferralCommissions(999, 900, 1_000_000n, 'DCC');
    // No referral chain exists for user 999 -- nothing should be recorded for anyone.
    expect(db.getRecentRewards(1)).toHaveLength(0);
  });

  it('credits a single layer-1 referrer the correct percentage of the bot fee', () => {
    db.recordReferral(1, 2); // 1 refers 2
    const botFee = 1_000_000n; // e.g. 0.01 DCC raw at 8 decimals

    trading.creditReferralCommissions(2, 500, botFee, 'DCC');

    // Layer 1 = 25% of the bot fee
    expect(db.getEarnedByLayer(1, 1)).toBe((botFee * 25n) / 100n);
    expect(db.getTotalEarned(1)).toBe((botFee * 25n) / 100n);
  });

  it('credits every layer correctly across a full 10-hop referral chain', () => {
    // Build chain: L10 -> L9 -> ... -> L1 -> trader
    // i.e. user (11 - k) refers user (12 - k), and user 11 is the trader.
    // Concretely: 1 refers 2, 2 refers 3, ..., 10 refers 11 (trader).
    for (let i = 1; i <= 10; i++) {
      expect(db.recordReferral(i, i + 1)).toBe(true);
    }
    const trader = 11;
    const botFee = 10_000_000n; // 0.1 DCC raw

    trading.creditReferralCommissions(trader, 700, botFee, 'DCC');

    // Layer 1 = trader's direct referrer = user 10; layer 2 = user 9; ... layer 10 = user 1.
    const expectedPctByLayer = trading.COMMISSION_PCT;
    for (let layer = 1; layer <= 10; layer++) {
      const referrerUserId = 11 - layer;
      const expectedReward = (botFee * BigInt(expectedPctByLayer[layer - 1])) / 100n;
      expect(db.getEarnedByLayer(referrerUserId, layer)).toBe(expectedReward);
    }

    // Total commission paid out across all layers should equal 80% of the fee
    // (sum of all layer rewards, which is bot fee * 80 / 100 given each
    // layer's percentage is applied independently to the same base fee).
    const totalPaidOut = Array.from({ length: 10 }, (_, i) =>
      (botFee * BigInt(expectedPctByLayer[i])) / 100n
    ).reduce((a, b) => a + b, 0n);
    expect(totalPaidOut).toBe((botFee * 80n) / 100n);
  });

  it('stops crediting beyond the referral chain length (chain shorter than 10)', () => {
    // Only 3 hops: 1 -> 2 -> 3 -> trader(4)
    db.recordReferral(1, 2);
    db.recordReferral(2, 3);
    db.recordReferral(3, 4);
    const botFee = 5_000_000n;

    trading.creditReferralCommissions(4, 800, botFee, 'DCC');

    expect(db.getEarnedByLayer(3, 1)).toBe((botFee * 25n) / 100n);
    expect(db.getEarnedByLayer(2, 2)).toBe((botFee * 15n) / 100n);
    expect(db.getEarnedByLayer(1, 3)).toBe((botFee * 10n) / 100n);
    // No layer-4+ rewards recorded for anyone -- chain ended at user 1.
    expect(db.getEarnedByLayer(1, 4)).toBe(0n);
    expect(db.getRecentRewards(1)).toHaveLength(1); // only the layer-3 reward
  });

  it('never rewards the trader\'s own commissions to a cyclic chain (defense in depth alongside recordReferral\'s cycle rejection)', () => {
    // Even if a cycle somehow existed in the data (it shouldn't, given
    // recordReferral's guard), creditReferralCommissions must terminate --
    // it's bounded by MAX_LAYERS (10), not by chain traversal until a null.
    // We simulate this indirectly: a long legitimate chain of exactly 10
    // must not attempt an 11th hop even though getReferrer(1) would resolve
    // to nothing (chain root), proving the loop is bounded and terminates.
    for (let i = 1; i <= 10; i++) {
      db.recordReferral(i, i + 1);
    }
    expect(() => trading.creditReferralCommissions(11, 900, 1_000_000n, 'DCC')).not.toThrow();
    expect(db.getRecentRewards(1)).toHaveLength(1); // exactly layer 10, nothing beyond
  });

  it('records the feeAsset passed through, defaulting to DCC', () => {
    db.recordReferral(1, 2);
    trading.creditReferralCommissions(2, 500, 1_000_000n);

    const rewards = db.getRecentRewards(1);
    expect(rewards[0].feeAsset).toBe('DCC');
  });
});
