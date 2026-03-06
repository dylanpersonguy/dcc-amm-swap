/**
 * SQLite database — stores user wallets, settings, and trade history.
 *
 * Each Telegram user can have one or more wallets. The "active" wallet
 * is used for trading. Seed phrases are stored encrypted (AES-256-GCM)
 * using a per-user key derived from their Telegram user ID + a server secret.
 */

import Database from 'better-sqlite3';
import crypto from 'crypto';
import { config } from './config';
import path from 'path';
import fs from 'fs';

// ── Encryption ─────────────────────────────────────────────────────

const SERVER_SECRET = process.env.ENCRYPTION_SECRET || 'dcc-amm-bot-default-secret-change-me';

function deriveKey(userId: number): Buffer {
  return crypto.pbkdf2Sync(
    `${SERVER_SECRET}:${userId}`,
    'dcc-amm-salt',
    100000,
    32,
    'sha256'
  );
}

function encrypt(text: string, userId: number): string {
  const key = deriveKey(userId);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function decrypt(data: string, userId: number): string {
  const key = deriveKey(userId);
  const [ivHex, tagHex, encrypted] = data.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ── Types ──────────────────────────────────────────────────────────

export interface UserWallet {
  id: number;
  userId: number;
  label: string;
  address: string;
  publicKey: string;
  encryptedSeed: string;
  isActive: boolean;
  createdAt: number;
}

export interface UserSettings {
  userId: number;
  slippageBps: number;
  feeTier: number;
  buyPresets: string;    // JSON array of preset DCC amounts
  sellPresets: string;   // JSON array of preset % amounts
  autoConfirm: boolean;
  showPnl: boolean;
}

export interface TradeRecord {
  id: number;
  userId: number;
  txId: string;
  type: 'buy' | 'sell' | 'add_liq' | 'remove_liq';
  assetIn: string;
  assetOut: string;
  amountIn: string;
  amountOut: string;
  timestamp: number;
  poolId: string;
}

export interface ReferralRecord {
  id: number;
  referrerUserId: number;
  referredUserId: number;
  createdAt: number;
}

export interface ReferralReward {
  id: number;
  userId: number;              // referrer who earned the reward
  fromUserId: number;          // the user whose trade generated the reward
  tradeId: number;
  layer: number;               // 1-10 (referral depth)
  feeAmountRaw: string;        // the 1% fee from the trade (raw)
  rewardAmountRaw: string;     // commission earned (raw)
  feeAsset: string;            // asset ID of the fee ('DCC' for native)
  claimed: boolean;            // whether the reward has been claimed
  createdAt: number;
}

export interface ReferralStats {
  totalReferred: number;
  directReferrals: number;
  indirectReferrals: number;
  totalVolumeDcc: string;           // aggregate volume from referred users
  earnedByLayer: string[];          // per-layer commission earned (raw), index 0 = Layer 1
  earnedTotal: string;              // total commission earned (raw)
  claimableTotal: string;           // total unclaimed commission (raw)
  claimedTotal: string;             // total already claimed (raw)
  tradeCountReferred: number;       // trades made by referred users
}

export interface BuyDccOrder {
  id: number;
  bridgeId: string;                 // bridge API order ID
  userId: number;
  coin: string;                     // SOL, USDT, USDC
  depositAddress: string;           // Solana address to send to
  depositAmount: string;            // amount of coin to send
  dccAmount: string;                // DCC to receive
  amountUsd: number;                // USD equivalent
  status: 'pending' | 'confirming' | 'completed' | 'expired' | 'failed';
  dccTxId: string | null;           // DCC on-chain tx ID when completed
  expiresAt: number;                // unix timestamp
  createdAt: number;
}

// ── Database ───────────────────────────────────────────────────────

let db: Database.Database;

export function initDb(): void {
  const dir = path.dirname(config.dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      label TEXT NOT NULL DEFAULT 'Main Wallet',
      address TEXT NOT NULL,
      public_key TEXT NOT NULL,
      encrypted_seed TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);

    CREATE TABLE IF NOT EXISTS settings (
      user_id INTEGER PRIMARY KEY,
      slippage_bps INTEGER NOT NULL DEFAULT 50,
      fee_tier INTEGER NOT NULL DEFAULT 30,
      buy_presets TEXT NOT NULL DEFAULT '[0.1, 0.5, 1, 5]',
      sell_presets TEXT NOT NULL DEFAULT '[25, 50, 75, 100]',
      auto_confirm INTEGER NOT NULL DEFAULT 0,
      show_pnl INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tx_id TEXT NOT NULL,
      type TEXT NOT NULL,
      asset_in TEXT NOT NULL,
      asset_out TEXT NOT NULL,
      amount_in TEXT NOT NULL,
      amount_out TEXT NOT NULL,
      timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
      pool_id TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id);

    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_user_id INTEGER NOT NULL,
      referred_user_id INTEGER NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id);
    CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_user_id);

    CREATE TABLE IF NOT EXISTS referral_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      from_user_id INTEGER NOT NULL,
      trade_id INTEGER NOT NULL,
      layer INTEGER NOT NULL DEFAULT 1,
      fee_amount_raw TEXT NOT NULL DEFAULT '0',
      reward_amount_raw TEXT NOT NULL DEFAULT '0',
      fee_asset TEXT NOT NULL DEFAULT 'DCC',
      claimed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_rewards_user ON referral_rewards(user_id);
    CREATE INDEX IF NOT EXISTS idx_rewards_trade ON referral_rewards(trade_id);

    CREATE TABLE IF NOT EXISTS buy_dcc_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bridge_id TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      coin TEXT NOT NULL,
      deposit_address TEXT NOT NULL,
      deposit_amount TEXT NOT NULL,
      dcc_amount TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      dcc_tx_id TEXT,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_buy_dcc_user ON buy_dcc_orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_buy_dcc_bridge ON buy_dcc_orders(bridge_id);
  `);

  // ── Migrations for existing databases ─────────────────────────
  try {
    db.exec(`ALTER TABLE referral_rewards ADD COLUMN fee_asset TEXT NOT NULL DEFAULT 'DCC'`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE referral_rewards ADD COLUMN claimed INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }
}

// ── Wallet CRUD ────────────────────────────────────────────────────

export function createWallet(
  userId: number,
  label: string,
  address: string,
  publicKey: string,
  seed: string
): UserWallet {
  const encSeed = encrypt(seed, userId);

  // Deactivate other wallets
  db.prepare('UPDATE wallets SET is_active = 0 WHERE user_id = ?').run(userId);

  const result = db.prepare(
    `INSERT INTO wallets (user_id, label, address, public_key, encrypted_seed, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`
  ).run(userId, label, address, publicKey, encSeed);

  return {
    id: result.lastInsertRowid as number,
    userId,
    label,
    address,
    publicKey,
    encryptedSeed: encSeed,
    isActive: true,
    createdAt: Math.floor(Date.now() / 1000),
  };
}

export function getActiveWallet(userId: number): UserWallet | null {
  const row = db.prepare(
    'SELECT * FROM wallets WHERE user_id = ? AND is_active = 1'
  ).get(userId) as any;
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    address: row.address,
    publicKey: row.public_key,
    encryptedSeed: row.encrypted_seed,
    isActive: true,
    createdAt: row.created_at,
  };
}

export function getUserWallets(userId: number): UserWallet[] {
  const rows = db.prepare(
    'SELECT * FROM wallets WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId) as any[];
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    label: r.label,
    address: r.address,
    publicKey: r.public_key,
    encryptedSeed: r.encrypted_seed,
    isActive: r.is_active === 1,
    createdAt: r.created_at,
  }));
}

export function setActiveWallet(userId: number, walletId: number): void {
  db.prepare('UPDATE wallets SET is_active = 0 WHERE user_id = ?').run(userId);
  db.prepare('UPDATE wallets SET is_active = 1 WHERE id = ? AND user_id = ?').run(walletId, userId);
}

export function deleteWallet(userId: number, walletId: number): void {
  db.prepare('DELETE FROM wallets WHERE id = ? AND user_id = ?').run(walletId, userId);
}

export function getWalletSeed(userId: number, walletId?: number): string | null {
  const wallet = walletId
    ? (db.prepare('SELECT * FROM wallets WHERE id = ? AND user_id = ?').get(walletId, userId) as any)
    : (db.prepare('SELECT * FROM wallets WHERE user_id = ? AND is_active = 1').get(userId) as any);
  if (!wallet) return null;
  return decrypt(wallet.encrypted_seed, userId);
}

// ── Settings CRUD ──────────────────────────────────────────────────

export function getSettings(userId: number): UserSettings {
  let row = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId) as any;
  if (!row) {
    db.prepare('INSERT INTO settings (user_id) VALUES (?)').run(userId);
    row = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId) as any;
  }
  return {
    userId: row.user_id,
    slippageBps: row.slippage_bps,
    feeTier: row.fee_tier,
    buyPresets: row.buy_presets,
    sellPresets: row.sell_presets,
    autoConfirm: row.auto_confirm === 1,
    showPnl: row.show_pnl === 1,
  };
}

export function updateSettings(userId: number, updates: Partial<UserSettings>): void {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.slippageBps !== undefined) { fields.push('slippage_bps = ?'); values.push(updates.slippageBps); }
  if (updates.feeTier !== undefined) { fields.push('fee_tier = ?'); values.push(updates.feeTier); }
  if (updates.buyPresets !== undefined) { fields.push('buy_presets = ?'); values.push(updates.buyPresets); }
  if (updates.sellPresets !== undefined) { fields.push('sell_presets = ?'); values.push(updates.sellPresets); }
  if (updates.autoConfirm !== undefined) { fields.push('auto_confirm = ?'); values.push(updates.autoConfirm ? 1 : 0); }
  if (updates.showPnl !== undefined) { fields.push('show_pnl = ?'); values.push(updates.showPnl ? 1 : 0); }

  if (fields.length > 0) {
    values.push(userId);
    db.prepare(`UPDATE settings SET ${fields.join(', ')} WHERE user_id = ?`).run(...values);
  }
}

// ── Trade History ──────────────────────────────────────────────────

export function recordTrade(trade: Omit<TradeRecord, 'id' | 'timestamp'>): number {
  const result = db.prepare(
    `INSERT INTO trades (user_id, tx_id, type, asset_in, asset_out, amount_in, amount_out, pool_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(trade.userId, trade.txId, trade.type, trade.assetIn, trade.assetOut, trade.amountIn, trade.amountOut, trade.poolId);
  return result.lastInsertRowid as number;
}

export function getTradeHistory(userId: number, limit = 10): TradeRecord[] {
  const rows = db.prepare(
    'SELECT * FROM trades WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?'
  ).all(userId, limit) as any[];
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    txId: r.tx_id,
    type: r.type,
    assetIn: r.asset_in,
    assetOut: r.asset_out,
    amountIn: r.amount_in,
    amountOut: r.amount_out,
    timestamp: r.timestamp,
    poolId: r.pool_id,
  }));
}

export function getTradeCount(userId: number): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM trades WHERE user_id = ?').get(userId) as any;
  return row.count;
}

// ── Referral System ────────────────────────────────────────────────

/**
 * Record a referral — returns true if newly recorded, false if user was already referred.
 */
export function recordReferral(referrerUserId: number, referredUserId: number): boolean {
  // Can't refer yourself
  if (referrerUserId === referredUserId) return false;

  // Check if user already has a referrer
  const existing = db.prepare(
    'SELECT id FROM referrals WHERE referred_user_id = ?'
  ).get(referredUserId);
  if (existing) return false;

  db.prepare(
    'INSERT INTO referrals (referrer_user_id, referred_user_id) VALUES (?, ?)'
  ).run(referrerUserId, referredUserId);
  return true;
}

/**
 * Get referrer of a user, if any.
 */
export function getReferrer(userId: number): number | null {
  const row = db.prepare(
    'SELECT referrer_user_id FROM referrals WHERE referred_user_id = ?'
  ).get(userId) as any;
  return row ? row.referrer_user_id : null;
}

/**
 * Get direct referral count (users who signed up via your link).
 */
export function getDirectReferralCount(userId: number): number {
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM referrals WHERE referrer_user_id = ?'
  ).get(userId) as any;
  return row.count;
}

/**
 * Get indirect referrals (layer 2 — users referred by your direct referrals).
 */
export function getIndirectReferralCount(userId: number): number {
  const row = db.prepare(
    `SELECT COUNT(*) as count FROM referrals r2
     WHERE r2.referrer_user_id IN (
       SELECT r1.referred_user_id FROM referrals r1
       WHERE r1.referrer_user_id = ?
     )`
  ).get(userId) as any;
  return row.count;
}

/**
 * Get all direct referral user IDs.
 */
export function getDirectReferralIds(userId: number): number[] {
  const rows = db.prepare(
    'SELECT referred_user_id FROM referrals WHERE referrer_user_id = ? ORDER BY created_at DESC'
  ).all(userId) as any[];
  return rows.map((r) => r.referred_user_id);
}

/**
 * Get aggregate trade volume (in DCC raw) from all direct referrals.
 */
export function getReferralVolume(userId: number): bigint {
  // Sum amount_in for all DCC-denominated trades by referred users
  const row = db.prepare(
    `SELECT COALESCE(SUM(CAST(t.amount_in AS INTEGER)), 0) as vol
     FROM trades t
     INNER JOIN referrals r ON r.referred_user_id = t.user_id
     WHERE r.referrer_user_id = ?
       AND t.asset_in = 'DCC'`
  ).get(userId) as any;
  return BigInt(row.vol || '0');
}

/**
 * Record a referral reward (commission earned from a referred user's trade).
 */
export function recordReferralReward(
  userId: number,
  fromUserId: number,
  tradeId: number,
  layer: number,
  feeAmountRaw: string,
  rewardAmountRaw: string,
  feeAsset: string = 'DCC',
): void {
  db.prepare(
    `INSERT INTO referral_rewards (user_id, from_user_id, trade_id, layer, fee_amount_raw, reward_amount_raw, fee_asset)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, fromUserId, tradeId, layer, feeAmountRaw, rewardAmountRaw, feeAsset);
}

/**
 * Get total commission earned by layer.
 */
export function getEarnedByLayer(userId: number, layer: number): bigint {
  const row = db.prepare(
    `SELECT COALESCE(SUM(CAST(reward_amount_raw AS INTEGER)), 0) as total
     FROM referral_rewards WHERE user_id = ? AND layer = ?`
  ).get(userId, layer) as any;
  return BigInt(row.total || '0');
}

/**
 * Get total commission earned across all layers.
 */
export function getTotalEarned(userId: number): bigint {
  const row = db.prepare(
    `SELECT COALESCE(SUM(CAST(reward_amount_raw AS INTEGER)), 0) as total
     FROM referral_rewards WHERE user_id = ?`
  ).get(userId) as any;
  return BigInt(row.total || '0');
}

/**
 * Get total number of trades from referred users.
 */
export function getReferredTradeCount(userId: number): number {
  const row = db.prepare(
    `SELECT COUNT(*) as count FROM trades t
     INNER JOIN referrals r ON r.referred_user_id = t.user_id
     WHERE r.referrer_user_id = ?`
  ).get(userId) as any;
  return row.count;
}

/**
 * Get recent referral reward entries for a user.
 */
export function getRecentRewards(userId: number, limit = 10): ReferralReward[] {
  const rows = db.prepare(
    `SELECT * FROM referral_rewards WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
  ).all(userId, limit) as any[];
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    fromUserId: r.from_user_id,
    tradeId: r.trade_id,
    layer: r.layer as number,
    feeAmountRaw: r.fee_amount_raw,
    rewardAmountRaw: r.reward_amount_raw,
    feeAsset: r.fee_asset || 'DCC',
    claimed: r.claimed === 1,
    createdAt: r.created_at,
  }));
}

/**
 * Get total claimable (unclaimed) rewards for a user, grouped by asset.
 * Returns a map of assetId -> total raw amount.
 */
export function getClaimableByAsset(userId: number): Map<string, bigint> {
  const rows = db.prepare(
    `SELECT fee_asset, COALESCE(SUM(CAST(reward_amount_raw AS INTEGER)), 0) as total
     FROM referral_rewards WHERE user_id = ? AND claimed = 0
     GROUP BY fee_asset`
  ).all(userId) as any[];
  const result = new Map<string, bigint>();
  for (const r of rows) {
    const amt = BigInt(r.total || '0');
    if (amt > 0n) result.set(r.fee_asset || 'DCC', amt);
  }
  return result;
}

/**
 * Get total claimable DCC (unclaimed rewards where fee_asset = 'DCC').
 */
export function getClaimableDcc(userId: number): bigint {
  const row = db.prepare(
    `SELECT COALESCE(SUM(CAST(reward_amount_raw AS INTEGER)), 0) as total
     FROM referral_rewards WHERE user_id = ? AND claimed = 0 AND fee_asset = 'DCC'`
  ).get(userId) as any;
  return BigInt(row.total || '0');
}

/**
 * Get total already-claimed DCC.
 */
export function getClaimedDcc(userId: number): bigint {
  const row = db.prepare(
    `SELECT COALESCE(SUM(CAST(reward_amount_raw AS INTEGER)), 0) as total
     FROM referral_rewards WHERE user_id = ? AND claimed = 1 AND fee_asset = 'DCC'`
  ).get(userId) as any;
  return BigInt(row.total || '0');
}

/**
 * Mark all unclaimed DCC rewards as claimed for a user.
 * Returns the number of rows updated.
 */
export function markDccRewardsClaimed(userId: number): number {
  const result = db.prepare(
    `UPDATE referral_rewards SET claimed = 1
     WHERE user_id = ? AND claimed = 0 AND fee_asset = 'DCC'`
  ).run(userId);
  return result.changes;
}

/**
 * Full referral stats for a user.
 */
export function getReferralStats(userId: number): ReferralStats {
  const direct = getDirectReferralCount(userId);
  const indirect = getIndirectReferralCount(userId);
  const volume = getReferralVolume(userId);
  const tradeCount = getReferredTradeCount(userId);

  // Per-layer earnings (layers 1-10)
  const earnedByLayer: string[] = [];
  for (let i = 1; i <= 10; i++) {
    earnedByLayer.push(getEarnedByLayer(userId, i).toString());
  }

  const totalEarned = getTotalEarned(userId);
  const claimable = getClaimableDcc(userId);
  const claimed = getClaimedDcc(userId);

  return {
    totalReferred: direct + indirect,
    directReferrals: direct,
    indirectReferrals: indirect,
    totalVolumeDcc: volume.toString(),
    earnedByLayer,
    earnedTotal: totalEarned.toString(),
    claimableTotal: claimable.toString(),
    claimedTotal: claimed.toString(),
    tradeCountReferred: tradeCount,
  };
}

// ── Buy DCC Orders ─────────────────────────────────────────────────

/**
 * Create a buy-DCC order record.
 */
export function createBuyDccOrder(order: {
  bridgeId: string;
  userId: number;
  coin: string;
  depositAddress: string;
  depositAmount: string;
  dccAmount: string;
  amountUsd: number;
  expiresAt: number;
}): BuyDccOrder {
  const result = db.prepare(
    `INSERT INTO buy_dcc_orders (bridge_id, user_id, coin, deposit_address, deposit_amount, dcc_amount, amount_usd, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    order.bridgeId, order.userId, order.coin, order.depositAddress,
    order.depositAmount, order.dccAmount, order.amountUsd, order.expiresAt,
  );
  return {
    id: result.lastInsertRowid as number,
    bridgeId: order.bridgeId,
    userId: order.userId,
    coin: order.coin,
    depositAddress: order.depositAddress,
    depositAmount: order.depositAmount,
    dccAmount: order.dccAmount,
    amountUsd: order.amountUsd,
    status: 'pending',
    dccTxId: null,
    expiresAt: order.expiresAt,
    createdAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Update a buy-DCC order status.
 */
export function updateBuyDccOrderStatus(
  bridgeId: string,
  status: BuyDccOrder['status'],
  dccTxId?: string,
): void {
  if (dccTxId) {
    db.prepare(
      'UPDATE buy_dcc_orders SET status = ?, dcc_tx_id = ? WHERE bridge_id = ?'
    ).run(status, dccTxId, bridgeId);
  } else {
    db.prepare(
      'UPDATE buy_dcc_orders SET status = ? WHERE bridge_id = ?'
    ).run(status, bridgeId);
  }
}

/**
 * Get a buy-DCC order by bridge ID.
 */
export function getBuyDccOrder(bridgeId: string): BuyDccOrder | null {
  const row = db.prepare(
    'SELECT * FROM buy_dcc_orders WHERE bridge_id = ?'
  ).get(bridgeId) as any;
  if (!row) return null;
  return mapBuyDccRow(row);
}

/**
 * Get pending buy-DCC orders for a user.
 */
export function getPendingBuyDccOrders(userId: number): BuyDccOrder[] {
  const rows = db.prepare(
    `SELECT * FROM buy_dcc_orders WHERE user_id = ? AND status IN ('pending', 'confirming')
     ORDER BY created_at DESC`
  ).all(userId) as any[];
  return rows.map(mapBuyDccRow);
}

/**
 * Get buy-DCC order history for a user.
 */
export function getBuyDccHistory(userId: number, limit = 10): BuyDccOrder[] {
  const rows = db.prepare(
    'SELECT * FROM buy_dcc_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(userId, limit) as any[];
  return rows.map(mapBuyDccRow);
}

function mapBuyDccRow(r: any): BuyDccOrder {
  return {
    id: r.id,
    bridgeId: r.bridge_id,
    userId: r.user_id,
    coin: r.coin,
    depositAddress: r.deposit_address,
    depositAmount: r.deposit_amount,
    dccAmount: r.dcc_amount,
    amountUsd: r.amount_usd,
    status: r.status,
    dccTxId: r.dcc_tx_id || null,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  };
}
