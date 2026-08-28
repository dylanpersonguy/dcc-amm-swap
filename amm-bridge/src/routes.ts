/**
 * Bridge API routes — Express handlers for deposit, fees, health, and admin endpoints.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { validators } from '@decentralchain/transactions';
import { config } from './config';
import * as db from './db';
import * as solana from './solana';
import { processDeposit } from './dcc';
import { getDccPriceUsd } from './pricing';

const router = Router();

/**
 * Shared validation for both deposit-creation endpoints. Rejects malformed
 * input with a clear 400 instead of letting it silently produce garbage
 * (NaN propagating through dccAmount, an order created against a
 * recipient address that can never actually be paid out, etc).
 */
function validateDepositInput(body: any, allowedCoins: string[]): string | null {
  const { coin, amountUsd, dccRecipient, userId } = body;

  if (!coin || !amountUsd || !dccRecipient || !userId) {
    return 'Required fields: coin, amountUsd, dccRecipient, userId';
  }
  if (!allowedCoins.includes(coin)) {
    return `coin must be one of: ${allowedCoins.join(', ')}`;
  }
  if (typeof amountUsd !== 'number' || !Number.isFinite(amountUsd) || amountUsd <= 0) {
    return 'amountUsd must be a positive finite number';
  }
  const userIdNum = Number(userId);
  if (!Number.isInteger(userIdNum) || userIdNum <= 0) {
    return 'userId must be a positive integer';
  }
  if (!validators.isValidAddress(dccRecipient, config.dccChainId.charCodeAt(0))) {
    return 'dccRecipient is not a valid DecentralChain address';
  }
  return null;
}

// ── Health ─────────────────────────────────────────────────────────

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const solBalance = await solana.getSolBalance('11111111111111111111111111111111').catch(() => -1);
    const solOk = solBalance >= 0;
    res.json({
      status: solOk ? 'ok' : 'degraded',
      solana: solOk,
      dcc: true,
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.json({
      status: 'degraded',
      solana: false,
      dcc: true,
      timestamp: new Date().toISOString(),
    });
  }
});

// ── Deposit Limits ─────────────────────────────────────────────────

router.get('/deposit/limits', async (_req: Request, res: Response) => {
  try {
    const solPrice = await solana.getCoinPriceUsd('SOL');
    const dccPrice = await getDccPriceUsd();
    const minUsd = 10 * dccPrice;   // 10 DCC minimum
    const maxUsd = 1_000_000 * dccPrice; // 1M DCC max

    res.json({
      minUsd,
      maxUsd,
      coins: [
        {
          coin: 'SOL',
          minAmount: (minUsd / solPrice).toFixed(6),
          maxAmount: (maxUsd / solPrice).toFixed(6),
          decimals: 9,
          price: solPrice,
        },
        {
          coin: 'USDT',
          minAmount: minUsd.toFixed(2),
          maxAmount: maxUsd.toFixed(2),
          decimals: 6,
          price: 1.0,
        },
        {
          coin: 'USDC',
          minAmount: minUsd.toFixed(2),
          maxAmount: maxUsd.toFixed(2),
          decimals: 6,
          price: 1.0,
        },
      ],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Create Deposit (SOL — native) ─────────────────────────────────

router.post('/deposit', async (req: Request, res: Response) => {
  try {
    const validationError = validateDepositInput(req.body, ['SOL']);
    if (validationError) return res.status(400).json({ error: validationError });
    const { coin, amountUsd, dccRecipient, userId } = req.body;

    const orderId = uuid();
    const depositKeypair = solana.generateDepositKeypair(orderId);
    const depositAddress = depositKeypair.publicKey.toBase58();

    // Calculate deposit amount in coin units
    const depositAmount = await solana.coinAmountForUsd(coin, amountUsd);

    // Calculate fees
    const bridgeFeeUsd = amountUsd * (config.bridgeFeePct / 100);
    const bridgeFeeAmount = await solana.coinAmountForUsd(coin, bridgeFeeUsd);

    // dccAmount is ALWAYS computed here from amountUsd and the current server
    // price — never trust a client-supplied payout amount, or anyone could
    // request an arbitrary DCC payout against a tiny real deposit.
    const dccPrice = await getDccPriceUsd();
    const netUsd = amountUsd - bridgeFeeUsd;
    const dccAmount = Math.floor(netUsd / dccPrice);

    const expiresAt = Math.floor(Date.now() / 1000) + Math.floor(config.depositExpiryMs / 1000);

    const order = db.createOrder({
      id: orderId,
      userId: Number(userId),
      coin,
      depositAddress,
      depositAmount,
      dccAmount: String(dccAmount),
      dccRecipient,
      amountUsd: Number(amountUsd),
      networkFee: '0',
      bridgeFee: bridgeFeeAmount,
      status: 'pending',
      expiresAt,
    });

    res.json({
      id: order.id,
      depositAddress: order.depositAddress,
      depositAmount: order.depositAmount,
      coin: order.coin,
      dccAmount: order.dccAmount,
      expiresAt: new Date(order.expiresAt * 1000).toISOString(),
      status: order.status,
    });
  } catch (err: any) {
    console.error('Create deposit error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Create SPL Deposit (USDT/USDC) ────────────────────────────────

router.post('/deposit/spl', async (req: Request, res: Response) => {
  try {
    const validationError = validateDepositInput(req.body, ['USDT', 'USDC']);
    if (validationError) return res.status(400).json({ error: validationError });
    const { coin, amountUsd, dccRecipient, userId } = req.body;

    const orderId = uuid();
    const depositKeypair = solana.generateDepositKeypair(orderId);
    const depositAddress = depositKeypair.publicKey.toBase58();

    const depositAmount = await solana.coinAmountForUsd(coin, amountUsd);
    const bridgeFeeUsd = amountUsd * (config.bridgeFeePct / 100);
    const bridgeFeeAmount = await solana.coinAmountForUsd(coin, bridgeFeeUsd);

    // See /deposit above — dccAmount is always server-computed, never trusted from the client.
    const dccPrice = await getDccPriceUsd();
    const netUsd = amountUsd - bridgeFeeUsd;
    const dccAmount = Math.floor(netUsd / dccPrice);

    const expiresAt = Math.floor(Date.now() / 1000) + Math.floor(config.depositExpiryMs / 1000);

    const order = db.createOrder({
      id: orderId,
      userId: Number(userId),
      coin,
      depositAddress,
      depositAmount,
      dccAmount: String(dccAmount),
      dccRecipient,
      amountUsd: Number(amountUsd),
      networkFee: '0',
      bridgeFee: bridgeFeeAmount,
      status: 'pending',
      expiresAt,
    });

    res.json({
      id: order.id,
      depositAddress: order.depositAddress,
      depositAmount: order.depositAmount,
      coin: order.coin,
      dccAmount: order.dccAmount,
      expiresAt: new Date(order.expiresAt * 1000).toISOString(),
      status: order.status,
    });
  } catch (err: any) {
    console.error('Create SPL deposit error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Get History by DCC Address ─────────────────────────────────────

router.get('/history/:address', (req: Request, res: Response) => {
  try {
    const orders = db.getHistoryByDccAddress(req.params.address);
    res.json(
      orders.map((o) => ({
        id: o.id,
        status: o.status,
        depositAddress: o.depositAddress,
        depositAmount: o.depositAmount,
        coin: o.coin,
        dccAmount: o.dccAmount,
        dccTxId: o.dccTxId,
        confirmedAt: o.status === 'completed' ? new Date(o.updatedAt * 1000).toISOString() : undefined,
        expiresAt: new Date(o.expiresAt * 1000).toISOString(),
      })),
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Fees ───────────────────────────────────────────────────────────

router.get('/fees', async (_req: Request, res: Response) => {
  const dccPriceUsd = await getDccPriceUsd();
  res.json({
    bridgeFeePct: config.bridgeFeePct,
    dccPriceUsd,
    description: `${config.bridgeFeePct}% bridge fee on deposits`,
  });
});

router.get('/fees/quote', async (req: Request, res: Response) => {
  try {
    const coin = (req.query.coin as string || 'SOL').toUpperCase();
    const amountUsd = parseFloat(req.query.amountUsd as string || '0');

    if (!amountUsd || amountUsd <= 0) {
      return res.status(400).json({ error: 'Invalid amountUsd' });
    }

    const coinPrice = await solana.getCoinPriceUsd(coin);
    const dccPriceUsd = await getDccPriceUsd();
    const bridgeFeeUsd = amountUsd * (config.bridgeFeePct / 100);
    const netUsd = amountUsd - bridgeFeeUsd;
    const dccReceived = Math.floor(netUsd / dccPriceUsd);

    res.json({
      coin,
      amountUsd,
      networkFee: '0',
      bridgeFee: (bridgeFeeUsd / coinPrice).toFixed(coin === 'SOL' ? 6 : 2),
      totalFee: (bridgeFeeUsd / coinPrice).toFixed(coin === 'SOL' ? 6 : 2),
      dccReceived: String(dccReceived),
      rate: 1 / dccPriceUsd,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stats ──────────────────────────────────────────────────────────

router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = db.getStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get Order Status (wildcard — keep AFTER all named routes) ──────

router.get('/:id', (req: Request, res: Response) => {
  try {
    const order = db.getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json({
      id: order.id,
      status: order.status,
      depositAddress: order.depositAddress,
      depositAmount: order.depositAmount,
      coin: order.coin,
      dccAmount: order.dccAmount,
      dccTxId: order.dccTxId,
      confirmedAt: order.status === 'completed' ? new Date(order.updatedAt * 1000).toISOString() : undefined,
      expiresAt: new Date(order.expiresAt * 1000).toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin Endpoints ────────────────────────────────────────────────

function adminAuth(req: Request, res: Response): boolean {
  const key = req.headers['x-api-key'] || req.query.apiKey;
  if (!config.adminApiKey || key !== config.adminApiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

router.get('/admin/orders', (req: Request, res: Response) => {
  if (!adminAuth(req, res)) return;
  const limit = parseInt(req.query.limit as string || '100', 10);
  const orders = db.getAllOrders(limit);
  res.json({ count: orders.length, orders });
});

router.get('/admin/pending', (req: Request, res: Response) => {
  if (!adminAuth(req, res)) return;
  const orders = db.getPendingOrders();
  res.json({ count: orders.length, orders });
});

router.post('/admin/retry/:id', async (req: Request, res: Response) => {
  if (!adminAuth(req, res)) return;
  try {
    const order = db.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'failed') {
      return res.status(400).json({ error: 'Can only retry failed orders' });
    }
    db.updateOrderStatus(order.id, 'confirming');
    await processDeposit(order);
    const updated = db.getOrder(order.id);
    res.json({ success: true, order: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
