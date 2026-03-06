/**
 * DCC Bridge API — Express server entry point.
 *
 * Monitors Solana deposits and sends DCC payouts automatically.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { config } from './config';
import * as db from './db';
import { initSolana, checkPendingDeposits } from './solana';
import { processDeposit } from './dcc';
import routes from './routes';

const app = express();

// ── Middleware ──────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ── Routes ─────────────────────────────────────────────────────────

app.use(routes);

// ── Start ──────────────────────────────────────────────────────────

async function start(): Promise<void> {
  console.log('🌉 DCC Bridge API starting...');

  // Initialize database
  db.initDb();
  console.log('  ✅ Database initialized');

  // Initialize Solana connection
  initSolana();
  console.log('  ✅ Solana connection ready');

  // Start deposit monitoring loop (every 20 seconds)
  const POLL_INTERVAL = 20_000;
  setInterval(async () => {
    try {
      await checkPendingDeposits(async (order, _txSig) => {
        await processDeposit(order);
      });
    } catch (err) {
      console.error('Deposit monitor error:', err);
    }
  }, POLL_INTERVAL);
  console.log(`  ✅ Deposit monitor running (every ${POLL_INTERVAL / 1000}s)`);

  // Start Express server
  app.listen(config.port, () => {
    console.log(`\n🚀 Bridge API listening on http://localhost:${config.port}`);
    console.log(`   DCC price: $${config.dccPriceUsd}`);
    console.log(`   Bridge fee: ${config.bridgeFeePct}%`);
    console.log(`   Deposit expiry: ${config.depositExpiryMs / 60000} minutes\n`);
  });
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
