/**
 * Tests for src/db.ts — wallet encryption round-trip, wallet/settings CRUD,
 * trade history, and the referral system (including cycle rejection).
 *
 * Uses a REAL in-memory SQLite database (better-sqlite3 `:memory:`) rather
 * than mocks. ENCRYPTION_SECRET must be set before db.ts is first required,
 * since the module throws at import time if it's missing.
 */

export {}; // force module scope (this file has no top-level `import`, which
// would otherwise make TS treat it as a global script, colliding with the
// `db`/`trading` bindings other require()-only test files declare)

process.env.ENCRYPTION_SECRET = 'unit-test-secret-do-not-use-in-prod';

const db = require('./db') as typeof import('./db');

beforeEach(() => {
  // Fresh in-memory database for every test — full isolation, no cross-test
  // state leakage, no filesystem writes.
  db.initDb(':memory:');
});

describe('wallet seed encryption', () => {
  it('round-trips a seed phrase through createWallet -> getWalletSeed', () => {
    const seed = 'this is a fake fifteen word seed phrase used only for testing purposes ok';
    const wallet = db.createWallet(111, 'Main', 'addr-111', 'pubkey-111', seed);

    const recovered = db.getWalletSeed(111, wallet.id);
    expect(recovered).toBe(seed);
  });

  it('stores the seed encrypted, not in plaintext, on the wallet record', () => {
    const seed = 'super-secret-seed-phrase-should-never-appear-in-storage';
    const wallet = db.createWallet(222, 'Main', 'addr-222', 'pubkey-222', seed);

    expect(wallet.encryptedSeed).not.toContain(seed);
    // iv:tag:ciphertext hex format
    expect(wallet.encryptedSeed.split(':')).toHaveLength(3);
  });

  it('produces different ciphertext for the same seed across different users', () => {
    const seed = 'shared-seed-phrase-for-two-different-users-in-this-test';
    const walletA = db.createWallet(333, 'Main', 'addr-a', 'pubkey-a', seed);
    const walletB = db.createWallet(444, 'Main', 'addr-b', 'pubkey-b', seed);

    expect(walletA.encryptedSeed).not.toBe(walletB.encryptedSeed);
    expect(db.getWalletSeed(333, walletA.id)).toBe(seed);
    expect(db.getWalletSeed(444, walletB.id)).toBe(seed);
  });

  it('getWalletSeed is scoped to the owning user — a wrong user id yields null, not another user\'s seed', () => {
    const seed = 'this-seed-belongs-only-to-user-555-nobody-else';
    const wallet = db.createWallet(555, 'Main', 'addr-555', 'pubkey-555', seed);

    // getWalletSeed looks up the wallet row by (id, user_id) together, so a
    // mismatched user id must never leak (or attempt to decrypt) the seed.
    expect(db.getWalletSeed(556, wallet.id)).toBeNull();
    expect(db.getWalletSeed(555, wallet.id)).toBe(seed);
  });

  it('getWalletSeed returns null when there is no active wallet', () => {
    expect(db.getWalletSeed(9999)).toBeNull();
  });
});

describe('wallet CRUD', () => {
  it('createWallet marks the new wallet active and deactivates prior wallets', () => {
    const w1 = db.createWallet(10, 'First', 'addr-1', 'pk-1', 'seed-one-one-one-one-one-one-one');
    expect(w1.isActive).toBe(true);

    const w2 = db.createWallet(10, 'Second', 'addr-2', 'pk-2', 'seed-two-two-two-two-two-two-two');
    expect(w2.isActive).toBe(true);

    const wallets = db.getUserWallets(10);
    expect(wallets).toHaveLength(2);
    const first = wallets.find((w) => w.id === w1.id)!;
    const second = wallets.find((w) => w.id === w2.id)!;
    expect(first.isActive).toBe(false);
    expect(second.isActive).toBe(true);
  });

  it('getActiveWallet returns the currently active wallet', () => {
    db.createWallet(20, 'A', 'addr-a', 'pk-a', 'seed-a-seed-a-seed-a-seed-a-seed');
    const w2 = db.createWallet(20, 'B', 'addr-b', 'pk-b', 'seed-b-seed-b-seed-b-seed-b-seed');

    const active = db.getActiveWallet(20);
    expect(active?.id).toBe(w2.id);
    expect(active?.label).toBe('B');
  });

  it('getActiveWallet returns null for a user with no wallets', () => {
    expect(db.getActiveWallet(31415)).toBeNull();
  });

  it('setActiveWallet switches which wallet is active', () => {
    const w1 = db.createWallet(30, 'A', 'addr-a', 'pk-a', 'seed-a-seed-a-seed-a-seed-a-seed');
    const w2 = db.createWallet(30, 'B', 'addr-b', 'pk-b', 'seed-b-seed-b-seed-b-seed-b-seed');
    expect(db.getActiveWallet(30)?.id).toBe(w2.id);

    db.setActiveWallet(30, w1.id);
    expect(db.getActiveWallet(30)?.id).toBe(w1.id);

    const wallets = db.getUserWallets(30);
    expect(wallets.filter((w) => w.isActive)).toHaveLength(1);
  });

  it('setActiveWallet is scoped to the owning user (cannot activate another user\'s wallet)', () => {
    const otherUsersWallet = db.createWallet(40, 'Victim', 'addr-v', 'pk-v', 'seed-v-seed-v-seed-v-seed-v-seed');
    db.createWallet(41, 'Attacker', 'addr-atk', 'pk-atk', 'seed-atk-seed-atk-seed-atk-seed');

    // Attempt to activate user 40's wallet under user 41's id. The update is
    // scoped by `id AND user_id`, so it must match zero rows.
    db.setActiveWallet(41, otherUsersWallet.id);

    // Victim's wallet is completely unaffected.
    expect(db.getActiveWallet(40)?.id).toBe(otherUsersWallet.id);
    // Attacker's own wallet got deactivated (setActiveWallet always clears
    // the caller's actives first) but nothing was activated in its place —
    // the exploit attempt must never leave the attacker holding the
    // victim's wallet as "active".
    expect(db.getActiveWallet(41)).toBeNull();
  });

  it('deleteWallet removes a wallet scoped to its owner', () => {
    const w1 = db.createWallet(50, 'A', 'addr-a', 'pk-a', 'seed-a-seed-a-seed-a-seed-a-seed');
    db.deleteWallet(50, w1.id);
    expect(db.getUserWallets(50)).toHaveLength(0);
  });

  it('deleteWallet does not delete another user\'s wallet', () => {
    const victimWallet = db.createWallet(60, 'Victim', 'addr-v', 'pk-v', 'seed-v-seed-v-seed-v-seed-v-seed');
    db.deleteWallet(61, victimWallet.id); // wrong owner
    expect(db.getUserWallets(60)).toHaveLength(1);
  });
});

describe('settings CRUD', () => {
  it('getSettings creates default settings on first access', () => {
    const settings = db.getSettings(70);
    expect(settings.slippageBps).toBe(50);
    expect(settings.feeTier).toBe(30);
    expect(settings.autoConfirm).toBe(false);
    expect(settings.showPnl).toBe(true);
  });

  it('updateSettings persists partial updates', () => {
    db.getSettings(80); // ensure row exists
    db.updateSettings(80, { slippageBps: 150, autoConfirm: true });

    const settings = db.getSettings(80);
    expect(settings.slippageBps).toBe(150);
    expect(settings.autoConfirm).toBe(true);
    expect(settings.feeTier).toBe(30); // untouched field retains default
  });

  it('updateSettings with no fields is a safe no-op', () => {
    db.getSettings(90);
    expect(() => db.updateSettings(90, {})).not.toThrow();
  });
});

describe('trade history', () => {
  it('records trades and retrieves them ordered by timestamp descending', () => {
    db.recordTrade({ userId: 100, txId: 'tx1', type: 'buy', assetIn: 'DCC', assetOut: 'TOK', amountIn: '100', amountOut: '50', poolId: 'p1' });
    db.recordTrade({ userId: 100, txId: 'tx2', type: 'sell', assetIn: 'TOK', assetOut: 'DCC', amountIn: '20', amountOut: '40', poolId: 'p1' });

    const history = db.getTradeHistory(100);
    expect(history).toHaveLength(2);
    expect(history.map((t) => t.txId).sort()).toEqual(['tx1', 'tx2']);
    // timestamp has 1-second resolution (unixepoch()), so trades recorded
    // within the same tick can legitimately tie -- assert the DESC ordering
    // property itself rather than a specific tiebreak order.
    expect(history[0].timestamp).toBeGreaterThanOrEqual(history[1].timestamp);
    expect(db.getTradeCount(100)).toBe(2);
  });

  it('respects the limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      db.recordTrade({ userId: 101, txId: `tx${i}`, type: 'buy', assetIn: 'DCC', assetOut: 'TOK', amountIn: '1', amountOut: '1', poolId: 'p1' });
    }
    expect(db.getTradeHistory(101, 3)).toHaveLength(3);
    expect(db.getTradeCount(101)).toBe(5);
  });

  it('scopes trade history per user', () => {
    db.recordTrade({ userId: 102, txId: 'a', type: 'buy', assetIn: 'DCC', assetOut: 'TOK', amountIn: '1', amountOut: '1', poolId: 'p1' });
    db.recordTrade({ userId: 103, txId: 'b', type: 'buy', assetIn: 'DCC', assetOut: 'TOK', amountIn: '1', amountOut: '1', poolId: 'p1' });

    expect(db.getTradeHistory(102)).toHaveLength(1);
    expect(db.getTradeHistory(103)).toHaveLength(1);
  });
});

describe('referral system', () => {
  it('records a simple, non-cyclic referral', () => {
    const ok = db.recordReferral(1, 2); // user 1 refers user 2
    expect(ok).toBe(true);
    expect(db.getReferrer(2)).toBe(1);
    expect(db.getDirectReferralCount(1)).toBe(1);
  });

  it('rejects self-referral', () => {
    expect(db.recordReferral(5, 5)).toBe(false);
    expect(db.getReferrer(5)).toBeNull();
  });

  it('rejects a second referrer for an already-referred user', () => {
    expect(db.recordReferral(1, 2)).toBe(true);
    expect(db.recordReferral(3, 2)).toBe(false); // user 2 already has a referrer
    expect(db.getReferrer(2)).toBe(1); // unchanged
  });

  it('supports a normal non-cyclic multi-hop chain (A -> B -> C -> D)', () => {
    expect(db.recordReferral(1, 2)).toBe(true); // A refers B
    expect(db.recordReferral(2, 3)).toBe(true); // B refers C
    expect(db.recordReferral(3, 4)).toBe(true); // C refers D

    expect(db.getReferrer(2)).toBe(1);
    expect(db.getReferrer(3)).toBe(2);
    expect(db.getReferrer(4)).toBe(3);
  });

  it('rejects a direct 2-cycle (A refers B, then B refers A)', () => {
    expect(db.recordReferral(1, 2)).toBe(true); // A -> B
    expect(db.recordReferral(2, 1)).toBe(false); // B -> A would close a loop

    expect(db.getReferrer(1)).toBeNull(); // A still has no referrer
    expect(db.getReferrer(2)).toBe(1);
  });

  it('rejects a 3-hop cycle (A refers B, B refers C, then C refers A)', () => {
    // This is the exact scenario described in the fix: two or three
    // colluding accounts closing a loop to farm referral commissions off
    // each other's trades indefinitely.
    expect(db.recordReferral(1, 2)).toBe(true); // A refers B
    expect(db.recordReferral(2, 3)).toBe(true); // B refers C
    expect(db.recordReferral(3, 1)).toBe(false); // C refers A -- must be rejected

    expect(db.getReferrer(1)).toBeNull();
    expect(db.getReferrer(2)).toBe(1);
    expect(db.getReferrer(3)).toBe(2);
  });

  it('rejects a longer cycle several hops deep', () => {
    // A -> B -> C -> D -> E -> F, then F -> A must be rejected.
    const chain = [1, 2, 3, 4, 5, 6];
    for (let i = 0; i < chain.length - 1; i++) {
      expect(db.recordReferral(chain[i], chain[i + 1])).toBe(true);
    }
    expect(db.recordReferral(6, 1)).toBe(false);
    expect(db.getReferrer(1)).toBeNull();
  });

  it('allows an unrelated referrer to refer someone even while other chains exist', () => {
    expect(db.recordReferral(1, 2)).toBe(true);
    expect(db.recordReferral(2, 3)).toBe(true);
    // Totally separate chain — must not be affected by the A->B->C chain above.
    expect(db.recordReferral(100, 101)).toBe(true);
    expect(db.getReferrer(101)).toBe(100);
  });

  it('getIndirectReferralCount counts layer-2 referrals', () => {
    db.recordReferral(1, 2); // direct
    db.recordReferral(1, 3); // direct
    db.recordReferral(2, 4); // indirect (via 2)
    db.recordReferral(3, 5); // indirect (via 3)

    expect(db.getDirectReferralCount(1)).toBe(2);
    expect(db.getIndirectReferralCount(1)).toBe(2);
    expect(db.getDirectReferralIds(1).sort()).toEqual([2, 3]);
  });

  it('getReferralVolume sums only DCC-denominated trades from direct referrals', () => {
    db.recordReferral(1, 2);
    db.recordTrade({ userId: 2, txId: 'v1', type: 'buy', assetIn: 'DCC', assetOut: 'TOK', amountIn: '1000', amountOut: '1', poolId: 'p1' });
    db.recordTrade({ userId: 2, txId: 'v2', type: 'sell', assetIn: 'TOK', assetOut: 'DCC', amountIn: '5', amountOut: '2000', poolId: 'p1' }); // amount_in is TOK, not DCC -- excluded
    db.recordTrade({ userId: 2, txId: 'v3', type: 'buy', assetIn: 'DCC', assetOut: 'TOK', amountIn: '500', amountOut: '1', poolId: 'p1' });

    expect(db.getReferralVolume(1)).toBe(1500n);
    expect(db.getReferredTradeCount(1)).toBe(3);
  });
});

describe('referral rewards', () => {
  it('records and totals rewards by layer', () => {
    db.recordReferralReward(1, 2, 501, 1, '1000', '250', 'DCC');
    db.recordReferralReward(1, 2, 501, 2, '1000', '150', 'DCC');
    db.recordReferralReward(1, 3, 502, 1, '2000', '500', 'DCC');

    expect(db.getEarnedByLayer(1, 1)).toBe(750n); // 250 + 500
    expect(db.getEarnedByLayer(1, 2)).toBe(150n);
    expect(db.getTotalEarned(1)).toBe(900n);
  });

  it('getClaimableDcc / markDccRewardsClaimed / getClaimedDcc move rewards from claimable to claimed', () => {
    db.recordReferralReward(1, 2, 601, 1, '1000', '300', 'DCC');
    db.recordReferralReward(1, 2, 602, 1, '1000', '200', 'DCC');

    expect(db.getClaimableDcc(1)).toBe(500n);
    expect(db.getClaimedDcc(1)).toBe(0n);

    const updated = db.markDccRewardsClaimed(1);
    expect(updated).toBe(2);

    expect(db.getClaimableDcc(1)).toBe(0n);
    expect(db.getClaimedDcc(1)).toBe(500n);
  });

  it('getClaimableByAsset groups unclaimed rewards by fee asset', () => {
    db.recordReferralReward(1, 2, 701, 1, '1000', '300', 'DCC');
    db.recordReferralReward(1, 2, 702, 1, '1000', '100', 'OTHERASSET');

    const map = db.getClaimableByAsset(1);
    expect(map.get('DCC')).toBe(300n);
    expect(map.get('OTHERASSET')).toBe(100n);
  });

  it('getReferralStats aggregates direct/indirect counts, volume, and per-layer earnings', () => {
    db.recordReferral(1, 2);
    db.recordReferral(2, 3);
    db.recordTrade({ userId: 2, txId: 't1', type: 'buy', assetIn: 'DCC', assetOut: 'TOK', amountIn: '1000', amountOut: '1', poolId: 'p1' });
    // Raw integer amounts, as real callers always store (e.g. bigint.toString()).
    db.recordReferralReward(1, 2, 801, 1, '10', '3', 'DCC');

    const stats = db.getReferralStats(1);
    expect(stats.directReferrals).toBe(1);
    expect(stats.indirectReferrals).toBe(1);
    expect(stats.totalReferred).toBe(2);
    expect(stats.totalVolumeDcc).toBe('1000');
    expect(stats.earnedByLayer).toHaveLength(10);
    expect(stats.earnedByLayer[0]).toBe('3');
    expect(stats.earnedTotal).toBe('3');
  });
});

describe('buy DCC orders', () => {
  it('creates, updates, and retrieves buy-DCC orders', () => {
    const order = db.createBuyDccOrder({
      bridgeId: 'bridge-1',
      userId: 200,
      coin: 'USDT',
      depositAddress: 'sol-addr',
      depositAmount: '100',
      dccAmount: '5000',
      amountUsd: 100,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(order.status).toBe('pending');

    db.updateBuyDccOrderStatus('bridge-1', 'completed', 'dcc-tx-123');
    const fetched = db.getBuyDccOrder('bridge-1');
    expect(fetched?.status).toBe('completed');
    expect(fetched?.dccTxId).toBe('dcc-tx-123');
  });

  it('lists only pending/confirming orders for a user', () => {
    db.createBuyDccOrder({ bridgeId: 'b1', userId: 201, coin: 'SOL', depositAddress: 'a', depositAmount: '1', dccAmount: '1', amountUsd: 1, expiresAt: 0 });
    db.createBuyDccOrder({ bridgeId: 'b2', userId: 201, coin: 'SOL', depositAddress: 'a', depositAmount: '1', dccAmount: '1', amountUsd: 1, expiresAt: 0 });
    db.updateBuyDccOrderStatus('b2', 'completed');

    expect(db.getPendingBuyDccOrders(201)).toHaveLength(1);
    expect(db.getBuyDccHistory(201)).toHaveLength(2);
  });

  it('getBuyDccOrder returns null for unknown bridge id', () => {
    expect(db.getBuyDccOrder('does-not-exist')).toBeNull();
  });
});
