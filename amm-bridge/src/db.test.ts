/**
 * Order CRUD + backup tests against a real (temp-file) SQLite database —
 * not a mock — so these exercise the actual SQL, including the WAL journal
 * mode and the schema migration path in initDb().
 *
 * config.dbPath is computed once, at module-load time, from process.env.DB_PATH
 * (see src/config.ts). We set that env var and then require('./db') fresh
 * (after jest.resetModules()) so this test's db.ts picks up a private,
 * disposable database file instead of the real one under data/bridge.db.
 */
import path from 'path';
import os from 'os';
import fs from 'fs';

const TEST_DB_PATH = path.join(
  os.tmpdir(),
  `amm-bridge-db-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
const BACKUP_DIR = path.join(path.dirname(TEST_DB_PATH), 'backups');
const MAX_BACKUPS = 14;

let db: any;

beforeAll(() => {
  process.env.DB_PATH = TEST_DB_PATH;
  jest.resetModules();
  db = require('./db');
  db.initDb();
});

afterAll(() => {
  delete process.env.DB_PATH;
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(TEST_DB_PATH + suffix)) fs.unlinkSync(TEST_DB_PATH + suffix);
  }
  if (fs.existsSync(BACKUP_DIR)) {
    for (const f of fs.readdirSync(BACKUP_DIR)) fs.unlinkSync(path.join(BACKUP_DIR, f));
    fs.rmdirSync(BACKUP_DIR);
  }
});

let seq = 0;
function makeOrder(overrides: Partial<Parameters<typeof db.createOrder>[0]> = {}) {
  seq += 1;
  const now = Math.floor(Date.now() / 1000);
  return db.createOrder({
    id: `order-${seq}-${Math.random().toString(36).slice(2)}`,
    userId: 1,
    coin: 'SOL',
    depositAddress: `DepositAddr${seq}`,
    depositAmount: '1.000000',
    dccAmount: '100',
    dccRecipient: `Recipient${seq}`,
    amountUsd: 100,
    networkFee: '0',
    bridgeFee: '0.01',
    status: 'pending',
    expiresAt: now + 1800,
    ...overrides,
  });
}

describe('createOrder / getOrder', () => {
  it('persists an order and reads it back with the right shape', () => {
    const order = makeOrder({ userId: 55, amountUsd: 250 });
    const fetched = db.getOrder(order.id);
    expect(fetched).not.toBeNull();
    expect(fetched.id).toBe(order.id);
    expect(fetched.userId).toBe(55);
    expect(fetched.amountUsd).toBe(250);
    expect(fetched.status).toBe('pending');
    expect(fetched.solTxId).toBeNull();
    expect(fetched.dccTxId).toBeNull();
    expect(fetched.sweepTxId).toBeNull();
    expect(typeof fetched.createdAt).toBe('number');
    expect(typeof fetched.updatedAt).toBe('number');
  });

  it('returns null for an unknown order id', () => {
    expect(db.getOrder('does-not-exist')).toBeNull();
  });
});

describe('updateOrderStatus — order lifecycle', () => {
  it('moves pending -> confirming -> completed and records tx ids', () => {
    const order = makeOrder({ status: 'pending' });

    db.updateOrderStatus(order.id, 'confirming');
    expect(db.getOrder(order.id).status).toBe('confirming');

    db.updateOrderStatus(order.id, 'completed', 'sol-tx-abc', 'dcc-tx-xyz');
    const completed = db.getOrder(order.id);
    expect(completed.status).toBe('completed');
    expect(completed.solTxId).toBe('sol-tx-abc');
    expect(completed.dccTxId).toBe('dcc-tx-xyz');
  });

  it('moves pending -> expired', () => {
    const order = makeOrder({ status: 'pending' });
    db.updateOrderStatus(order.id, 'expired');
    expect(db.getOrder(order.id).status).toBe('expired');
  });

  it('moves confirming -> failed without requiring tx ids', () => {
    const order = makeOrder({ status: 'confirming' });
    db.updateOrderStatus(order.id, 'failed');
    const failed = db.getOrder(order.id);
    expect(failed.status).toBe('failed');
    expect(failed.dccTxId).toBeNull();
  });

  it('bumps updatedAt on every transition', () => {
    const order = makeOrder({ status: 'pending' });
    const before = db.getOrder(order.id).updatedAt;
    // Force a distinguishable timestamp regardless of clock resolution.
    jest.spyOn(Date, 'now').mockReturnValue((before + 5) * 1000);
    db.updateOrderStatus(order.id, 'confirming');
    jest.spyOn(Date, 'now').mockRestore();
    expect(db.getOrder(order.id).updatedAt).toBeGreaterThan(before);
  });
});

describe('getPendingOrders', () => {
  it('includes pending and confirming orders, excludes terminal states', () => {
    const pending = makeOrder({ status: 'pending' });
    const confirming = makeOrder({ status: 'confirming' });
    const completed = makeOrder({ status: 'completed' });
    const expired = makeOrder({ status: 'expired' });
    const failed = makeOrder({ status: 'failed' });

    const ids = db.getPendingOrders().map((o: { id: string }) => o.id);
    expect(ids).toEqual(expect.arrayContaining([pending.id, confirming.id]));
    expect(ids).not.toContain(completed.id);
    expect(ids).not.toContain(expired.id);
    expect(ids).not.toContain(failed.id);
  });
});

describe('getUnsweptCompletedOrders / markSwept', () => {
  it('only returns completed orders that have not been swept yet', () => {
    const unswept = makeOrder({ status: 'completed' });
    const stillPending = makeOrder({ status: 'pending' });

    const swept = makeOrder({ status: 'completed' });
    db.markSwept(swept.id, 'sweep-tx-1');

    const ids = db.getUnsweptCompletedOrders().map((o: { id: string }) => o.id);
    expect(ids).toContain(unswept.id);
    expect(ids).not.toContain(swept.id);
    expect(ids).not.toContain(stillPending.id);
  });

  it('markSwept records the sweep tx id and removes the order from the unswept set', () => {
    const order = makeOrder({ status: 'completed' });
    expect(db.getUnsweptCompletedOrders().map((o: { id: string }) => o.id)).toContain(order.id);

    db.markSwept(order.id, 'sweep-tx-42');

    const fetched = db.getOrder(order.id);
    expect(fetched.sweepTxId).toBe('sweep-tx-42');
    expect(db.getUnsweptCompletedOrders().map((o: { id: string }) => o.id)).not.toContain(order.id);
  });
});

describe('getExpiredOrders', () => {
  it('returns only pending orders whose expiry is in the past', () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredPending = makeOrder({ status: 'pending', expiresAt: now - 100 });
    const futurePending = makeOrder({ status: 'pending', expiresAt: now + 1800 });
    // A confirming order past its original expiry should NOT show up here —
    // getExpiredOrders only looks at orders still sitting in 'pending'.
    const expiredButConfirming = makeOrder({ status: 'confirming', expiresAt: now - 100 });

    const ids = db.getExpiredOrders().map((o: { id: string }) => o.id);
    expect(ids).toContain(expiredPending.id);
    expect(ids).not.toContain(futurePending.id);
    expect(ids).not.toContain(expiredButConfirming.id);
  });
});

describe('getHistoryByDccAddress / getOrdersByAddress / getOrdersByUser', () => {
  it('filters by dcc recipient address', () => {
    const recipient = `HistoryRecipient-${Math.random()}`;
    const mine = makeOrder({ dccRecipient: recipient });
    const other = makeOrder({});

    const ids = db.getHistoryByDccAddress(recipient).map((o: { id: string }) => o.id);
    expect(ids).toEqual([mine.id]);
    expect(ids).not.toContain(other.id);
  });

  it('filters by deposit address', () => {
    const depositAddress = `DepositFilter-${Math.random()}`;
    const mine = makeOrder({ depositAddress });
    db.getOrdersByAddress(depositAddress).forEach((o: { depositAddress: string }) => {
      expect(o.depositAddress).toBe(depositAddress);
    });
    expect(db.getOrdersByAddress(depositAddress).map((o: { id: string }) => o.id)).toContain(mine.id);
  });

  it('filters by user id and respects the limit', () => {
    const userId = Math.floor(Math.random() * 1_000_000) + 1;
    makeOrder({ userId });
    makeOrder({ userId });
    makeOrder({ userId });

    const all = db.getOrdersByUser(userId, 50);
    expect(all).toHaveLength(3);

    const limited = db.getOrdersByUser(userId, 2);
    expect(limited).toHaveLength(2);
  });
});

describe('getStats', () => {
  // Reuses the shared per-file database (already populated by earlier tests)
  // and asserts on the *delta* from two new orders, rather than spinning up
  // yet another isolated database — simpler, and avoids leaking another temp
  // file that would need its own cleanup.
  it('reflects order counts and sums only completed amounts', () => {
    const before = db.getStats();

    makeOrder({ status: 'completed', dccAmount: '500', amountUsd: 100 });
    makeOrder({ status: 'pending', dccAmount: '500', amountUsd: 40 });

    const after = db.getStats();
    expect(after.totalOrders).toBe(before.totalOrders + 2);
    expect(after.completed).toBe(before.completed + 1);
    expect(after.pending).toBe(before.pending + 1);
    expect(Number(after.totalDcc)).toBe(Number(before.totalDcc) + 500);
    expect(after.totalUsd).toBe(before.totalUsd + 100);
  });
});

describe('backupDb', () => {
  it('writes a timestamped backup file that is a valid, readable database', async () => {
    makeOrder({});
    const dest = await db.backupDb();
    expect(fs.existsSync(dest)).toBe(true);
    expect(path.dirname(dest)).toBe(BACKUP_DIR);

    const Database = require('better-sqlite3');
    const backupHandle = new Database(dest, { readonly: true });
    const row = backupHandle.prepare('SELECT COUNT(*) as c FROM deposit_orders').get() as { c: number };
    expect(row.c).toBeGreaterThan(0);
    backupHandle.close();
  });

  it('prunes backups beyond the 14 most recent', async () => {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    // Clear out anything left behind by the previous test (or a prior run)
    // so the count below starts from a known baseline.
    for (const f of fs.readdirSync(BACKUP_DIR)) fs.unlinkSync(path.join(BACKUP_DIR, f));
    // Seed 15 fake, lexicographically-sortable-oldest backup files.
    for (let i = 0; i < 15; i += 1) {
      const stamp = `2020-01-${String(i + 1).padStart(2, '0')}T00-00-00-000Z`;
      fs.writeFileSync(path.join(BACKUP_DIR, `bridge-${stamp}.db`), 'placeholder');
    }
    expect(fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db'))).toHaveLength(15);

    // A real backup, timestamped today (2026), sorts after all the seeded
    // 2020 placeholders, so pruning should remove the oldest ones first.
    await db.backupDb();

    const remaining = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db')).sort();
    expect(remaining).toHaveLength(MAX_BACKUPS);
    // The very oldest seeded file must be the one pruned away.
    expect(remaining).not.toContain('bridge-2020-01-01T00-00-00-000Z.db');
    // The most recent (real, today-stamped) backup must survive.
    expect(remaining[remaining.length - 1]).not.toMatch(/^bridge-2020/);
  });
});
