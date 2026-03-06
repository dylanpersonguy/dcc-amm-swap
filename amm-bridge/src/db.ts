/**
 * Bridge database — SQLite storage for deposit orders and transfer tracking.
 */

import Database from 'better-sqlite3';
import { config } from './config';
import path from 'path';
import fs from 'fs';

let db: Database.Database;

export type OrderStatus = 'pending' | 'confirming' | 'completed' | 'expired' | 'failed';

export interface DepositOrder {
  id: string;
  userId: number;
  coin: string;
  depositAddress: string;
  depositAmount: string;
  dccAmount: string;
  dccRecipient: string;
  amountUsd: number;
  networkFee: string;
  bridgeFee: string;
  status: OrderStatus;
  solTxId: string | null;
  dccTxId: string | null;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
}

export function initDb(): void {
  const dir = path.dirname(config.dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS deposit_orders (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      coin TEXT NOT NULL,
      deposit_address TEXT NOT NULL,
      deposit_amount TEXT NOT NULL,
      dcc_amount TEXT NOT NULL,
      dcc_recipient TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      network_fee TEXT NOT NULL DEFAULT '0',
      bridge_fee TEXT NOT NULL DEFAULT '0',
      status TEXT NOT NULL DEFAULT 'pending',
      sol_tx_id TEXT,
      dcc_tx_id TEXT,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_orders_user ON deposit_orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON deposit_orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_address ON deposit_orders(deposit_address);
  `);
}

export function createOrder(order: Omit<DepositOrder, 'createdAt' | 'updatedAt' | 'solTxId' | 'dccTxId'>): DepositOrder {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO deposit_orders (id, user_id, coin, deposit_address, deposit_amount, dcc_amount, dcc_recipient, amount_usd, network_fee, bridge_fee, status, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    order.id, order.userId, order.coin, order.depositAddress,
    order.depositAmount, order.dccAmount, order.dccRecipient,
    order.amountUsd, order.networkFee, order.bridgeFee,
    order.status, order.expiresAt, now, now,
  );
  return { ...order, solTxId: null, dccTxId: null, createdAt: now, updatedAt: now };
}

export function getOrder(id: string): DepositOrder | null {
  const row = db.prepare('SELECT * FROM deposit_orders WHERE id = ?').get(id) as any;
  return row ? mapRow(row) : null;
}

export function updateOrderStatus(id: string, status: OrderStatus, solTxId?: string, dccTxId?: string): void {
  const now = Math.floor(Date.now() / 1000);
  const fields = ['status = ?', 'updated_at = ?'];
  const values: any[] = [status, now];
  if (solTxId !== undefined) { fields.push('sol_tx_id = ?'); values.push(solTxId); }
  if (dccTxId !== undefined) { fields.push('dcc_tx_id = ?'); values.push(dccTxId); }
  values.push(id);
  db.prepare(`UPDATE deposit_orders SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function getOrdersByAddress(address: string): DepositOrder[] {
  const rows = db.prepare(
    'SELECT * FROM deposit_orders WHERE deposit_address = ? ORDER BY created_at DESC'
  ).all(address) as any[];
  return rows.map(mapRow);
}

export function getOrdersByUser(userId: number, limit = 50): DepositOrder[] {
  const rows = db.prepare(
    'SELECT * FROM deposit_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(userId, limit) as any[];
  return rows.map(mapRow);
}

export function getHistoryByDccAddress(dccAddress: string): DepositOrder[] {
  const rows = db.prepare(
    'SELECT * FROM deposit_orders WHERE dcc_recipient = ? ORDER BY created_at DESC'
  ).all(dccAddress) as any[];
  return rows.map(mapRow);
}

export function getPendingOrders(): DepositOrder[] {
  const rows = db.prepare(
    `SELECT * FROM deposit_orders WHERE status IN ('pending', 'confirming') ORDER BY created_at ASC`
  ).all() as any[];
  return rows.map(mapRow);
}

export function getExpiredOrders(): DepositOrder[] {
  const now = Math.floor(Date.now() / 1000);
  const rows = db.prepare(
    `SELECT * FROM deposit_orders WHERE status = 'pending' AND expires_at < ?`
  ).all(now) as any[];
  return rows.map(mapRow);
}

export function getAllOrders(limit = 100): DepositOrder[] {
  const rows = db.prepare(
    'SELECT * FROM deposit_orders ORDER BY created_at DESC LIMIT ?'
  ).all(limit) as any[];
  return rows.map(mapRow);
}

export function getStats(): {
  totalOrders: number;
  completed: number;
  pending: number;
  totalDcc: string;
  totalUsd: number;
} {
  const total = (db.prepare('SELECT COUNT(*) as c FROM deposit_orders').get() as any).c;
  const completed = (db.prepare("SELECT COUNT(*) as c FROM deposit_orders WHERE status = 'completed'").get() as any).c;
  const pending = (db.prepare("SELECT COUNT(*) as c FROM deposit_orders WHERE status IN ('pending', 'confirming')").get() as any).c;
  const dcc = (db.prepare("SELECT COALESCE(SUM(CAST(dcc_amount AS REAL)), 0) as s FROM deposit_orders WHERE status = 'completed'").get() as any).s;
  const usd = (db.prepare("SELECT COALESCE(SUM(amount_usd), 0) as s FROM deposit_orders WHERE status = 'completed'").get() as any).s;
  return { totalOrders: total, completed, pending, totalDcc: String(dcc), totalUsd: usd };
}

function mapRow(r: any): DepositOrder {
  return {
    id: r.id,
    userId: r.user_id,
    coin: r.coin,
    depositAddress: r.deposit_address,
    depositAmount: r.deposit_amount,
    dccAmount: r.dcc_amount,
    dccRecipient: r.dcc_recipient,
    amountUsd: r.amount_usd,
    networkFee: r.network_fee,
    bridgeFee: r.bridge_fee,
    status: r.status,
    solTxId: r.sol_tx_id,
    dccTxId: r.dcc_tx_id,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
