/**
 * Tests for backupDb() in src/db.ts — online .backup() to a timestamped
 * file under a `backups/` dir alongside the database, pruned beyond
 * MAX_BACKUPS (14) files.
 *
 * backupDb()'s BACKUP_DIR constant is derived from config.dbPath at module
 * load time, so DB_PATH must be set to a real, writable temp path *before*
 * db.ts (and config.ts) are first required — hence the plain `require()`
 * calls below instead of top-level `import`, which TypeScript would hoist
 * ahead of the env var assignment.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amm-bot-backup-test-'));
const dbFile = path.join(tmpRoot, 'test-bot.db');

process.env.ENCRYPTION_SECRET = 'unit-test-secret-do-not-use-in-prod';
process.env.DB_PATH = dbFile;

const db = require('./db') as typeof import('./db');

const backupDir = path.join(tmpRoot, 'backups');

beforeAll(() => {
  db.initDb();
});

afterAll(() => {
  delete process.env.DB_PATH;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

afterEach(() => {
  // Clean the backups dir between tests so pruning tests start from a known state.
  if (fs.existsSync(backupDir)) {
    for (const f of fs.readdirSync(backupDir)) {
      fs.unlinkSync(path.join(backupDir, f));
    }
  }
});

describe('backupDb', () => {
  it('creates a timestamped .db file in a backups/ dir next to the database', async () => {
    const dest = await db.backupDb();

    expect(fs.existsSync(dest)).toBe(true);
    expect(path.dirname(dest)).toBe(backupDir);
    expect(path.basename(dest)).toMatch(/^bot-.*\.db$/);
  });

  it('the backup file is a valid, readable copy of the source database', async () => {
    db.createWallet(1, 'Main', 'addr-1', 'pk-1', 'seed-seed-seed-seed-seed-seed-se');
    const dest = await db.backupDb();

    const Database = require('better-sqlite3');
    const copy = new Database(dest, { readonly: true });
    const rows = copy.prepare('SELECT * FROM wallets').all();
    copy.close();

    expect(rows).toHaveLength(1);
    expect((rows[0] as any).address).toBe('addr-1');
  });

  it('prunes backups beyond MAX_BACKUPS (14), keeping the newest', async () => {
    fs.mkdirSync(backupDir, { recursive: true });

    // Pre-seed 16 dummy backup files with names that sort in creation order,
    // then trigger one more real backup — pruning should bring the total
    // back down to 14, deleting the oldest by filename sort order.
    const dummyNames: string[] = [];
    for (let i = 0; i < 16; i++) {
      const name = `bot-2020-01-01T00-00-${String(i).padStart(2, '0')}-000Z.db`;
      dummyNames.push(name);
      fs.writeFileSync(path.join(backupDir, name), 'dummy');
    }

    await db.backupDb(); // 17th file created, then prune should cut down to 14

    const remaining = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db'));
    expect(remaining.length).toBe(14);

    // The oldest dummy files (lowest sort order) must be the ones pruned.
    const sortedDummies = [...dummyNames].sort();
    const oldestDummies = sortedDummies.slice(0, 3); // 17 total - 14 kept = 3 pruned
    for (const oldest of oldestDummies) {
      expect(remaining).not.toContain(oldest);
    }
  });

  it('does not prune when at or under MAX_BACKUPS', async () => {
    fs.mkdirSync(backupDir, { recursive: true });
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(path.join(backupDir, `bot-2020-01-01T00-00-0${i}-000Z.db`), 'dummy');
    }

    await db.backupDb(); // 6 total, well under 14

    const remaining = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db'));
    expect(remaining.length).toBe(6);
  });
});
