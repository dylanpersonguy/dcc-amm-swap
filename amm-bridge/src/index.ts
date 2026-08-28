/**
 * DCC Bridge API — Express server entry point.
 *
 * Monitors Solana deposits and sends DCC payouts automatically.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import * as db from './db';
import { initSolana, checkPendingDeposits, getTreasuryKeypair } from './solana';
import { processDeposit, resweepStaleOrders } from './dcc';
import routes from './routes';
import { getSwaggerSpec } from './swagger';
import { rateLimit } from './rate-limit';

const app = express();
// Railway sits in front of this as a reverse proxy — without this, req.ip
// resolves to Railway's edge for every request, collapsing the rate limiter
// to one shared bucket across all clients instead of one per real client.
app.set('trust proxy', true);

// ── Middleware ──────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 60 }));
// Order creation does real work (keypair derivation, a DB write) per call —
// a tighter limit than the general one above.
app.use(['/deposit', '/deposit/spl'], rateLimit({ windowMs: 60_000, max: 10 }));

// Swagger UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(getSwaggerSpec(), {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'DCC Bridge API Docs',
}));
// JSON spec endpoint
app.get('/docs.json', (_req, res) => res.json(getSwaggerSpec()));

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
  console.log(`  🏦 Treasury address (sweep destination — fund with ~0.05 SOL for fees): ${getTreasuryKeypair().publicKey.toBase58()}`);

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

  // Retry sweeping any completed order that didn't make it to treasury yet
  // (transient RPC failure, treasury briefly out of fee SOL, etc).
  const SWEEP_RETRY_INTERVAL = 5 * 60_000;
  setInterval(async () => {
    try {
      await resweepStaleOrders();
    } catch (err) {
      console.error('Sweep retry error:', err);
    }
  }, SWEEP_RETRY_INTERVAL);
  console.log(`  ✅ Sweep retry running (every ${SWEEP_RETRY_INTERVAL / 60_000}m)`);

  // Periodic on-volume backup — guards against app-level corruption or a
  // bad migration, not a substitute for off-volume disaster recovery.
  const BACKUP_INTERVAL = 6 * 60 * 60_000;
  setInterval(async () => {
    try {
      const dest = await db.backupDb();
      console.log(`  💾 DB backup written: ${dest}`);
    } catch (err) {
      console.error('Backup error:', err);
    }
  }, BACKUP_INTERVAL);
  console.log(`  ✅ DB backup running (every ${BACKUP_INTERVAL / 3_600_000}h)`);

  // Start Express server
  app.listen(config.port, () => {
    console.log(`\n🚀 Bridge API listening on http://localhost:${config.port}`);
    console.log(`   📖 Swagger docs: http://localhost:${config.port}/docs`);
    console.log(`   DCC price: $${config.dccPriceUsd}`);
    console.log(`   Bridge fee: ${config.bridgeFeePct}%`);
    console.log(`   Deposit expiry: ${config.depositExpiryMs / 60000} minutes\n`);
  });
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
