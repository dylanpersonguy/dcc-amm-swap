/**
 * Buy DCC handler — cross-chain purchase flow.
 *
 * Flow:
 *  1. User taps "💳 Buy DCC" on home screen
 *  2. Choose payment coin (SOL / USDT / USDC on Solana)
 *  3. Choose DCC amount (preset or custom)
 *  4. Bridge generates a Solana deposit address
 *  5. User sends crypto, bridge monitors & sends DCC to their wallet
 *  6. User can check status of pending orders
 */

import { Bot, Context } from 'grammy';
import {
  getActiveWallet,
  createBuyDccOrder,
  getPendingBuyDccOrders,
  getBuyDccOrder,
  updateBuyDccOrderStatus,
  getBuyDccHistory,
} from '../db';
import * as bridge from '../services/bridge';
import * as fmt from '../ui/format';
import * as kb from '../ui/keyboards';

// ── Session state for custom amount input ──────────────────────────

const sessions = new Map<number, { step: 'awaiting_dcc_amount'; coin: bridge.BridgeCoin }>();

// ── Register handlers ──────────────────────────────────────────────

export function registerBuyDccHandlers(bot: Bot) {
  // ── Step 1: Show coin selection ──────────────────────────────
  bot.callbackQuery('menu:buy_dcc', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showCoinSelect(ctx);
  });

  // ── Step 2: Coin selected → show amount presets ──────────────
  bot.callbackQuery(/^bdcc:coin:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const coin = ctx.callbackQuery.data.split(':')[2] as bridge.BridgeCoin;
    if (!bridge.SUPPORTED_COINS[coin]) return;
    await showAmountSelect(ctx, coin);
  });

  // ── Step 3a: Preset amount selected → create deposit ─────────
  bot.callbackQuery(/^bdcc:amt:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const parts = ctx.callbackQuery.data.split(':');
    const coin = parts[2] as bridge.BridgeCoin;
    const dccAmount = parseInt(parts[3], 10);
    if (!coin || isNaN(dccAmount) || dccAmount <= 0) return;
    await createDepositOrder(ctx, coin, dccAmount);
  });

  // ── Step 3b: Custom amount → prompt for text input ───────────
  bot.callbackQuery(/^bdcc:custom:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const coin = ctx.callbackQuery.data.split(':')[2] as bridge.BridgeCoin;
    if (!bridge.SUPPORTED_COINS[coin]) return;
    const userId = ctx.from?.id;
    if (!userId) return;

    sessions.set(userId, { step: 'awaiting_dcc_amount', coin });

    await ctx.editMessageText(
      `✏️ <b>Custom Amount</b>\n` +
        `${fmt.thinDivider()}\n\n` +
        `Enter how many <b>DCC</b> you want to buy.\n` +
        `Price: <b>$${bridge.DCC_PRICE_USD}</b> per DCC\n\n` +
        `<i>Example: Type </i><code>1000</code><i> to buy 1,000 DCC for $${(1000 * bridge.DCC_PRICE_USD).toFixed(2)}</i>`,
      { parse_mode: 'HTML', reply_markup: kb.backKeyboard('menu:buy_dcc') },
    ).catch(() => {});
  });

  // ── Text input handler for custom amount ─────────────────────
  bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from!.id;
    const session = sessions.get(userId);
    if (!session || session.step !== 'awaiting_dcc_amount') return next();

    sessions.delete(userId);
    const text = ctx.message!.text!.trim().replace(/[,$]/g, '');
    const dccAmount = parseInt(text, 10);

    if (isNaN(dccAmount) || dccAmount <= 0) {
      await ctx.reply(
        '❌ Invalid amount. Please enter a positive number.',
        { parse_mode: 'HTML', reply_markup: kb.backKeyboard('menu:buy_dcc') },
      );
      return;
    }

    if (dccAmount < 10) {
      await ctx.reply(
        '❌ Minimum purchase is <b>10 DCC</b> ($0.50).',
        { parse_mode: 'HTML', reply_markup: kb.backKeyboard('menu:buy_dcc') },
      );
      return;
    }

    if (dccAmount > 1000000) {
      await ctx.reply(
        '❌ Maximum purchase is <b>1,000,000 DCC</b> ($50,000).',
        { parse_mode: 'HTML', reply_markup: kb.backKeyboard('menu:buy_dcc') },
      );
      return;
    }

    await createDepositOrder(ctx, session.coin, dccAmount);
  });

  // ── Check order status ───────────────────────────────────────
  bot.callbackQuery(/^bdcc:status:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const bridgeId = ctx.callbackQuery.data.split(':').slice(2).join(':');
    await showOrderStatus(ctx, bridgeId);
  });

  // ── My orders ────────────────────────────────────────────────
  bot.callbackQuery('bdcc:orders', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showMyOrders(ctx);
  });

  // ── Back to coin select ──────────────────────────────────────
  bot.callbackQuery('bdcc:back', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showCoinSelect(ctx);
  });
}

// ── Step 1: Coin selection screen ──────────────────────────────────

async function showCoinSelect(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const wallet = getActiveWallet(userId);
  if (!wallet) {
    await ctx.editMessageText(
      '⚠️ <b>Wallet Required</b>\n\n' +
        'Create a wallet first to receive your DCC.\n' +
        'Tap "Create Wallet" on the home screen.',
      { parse_mode: 'HTML', reply_markup: kb.backKeyboard('menu:home') },
    ).catch(() => {});
    return;
  }

  // Check for pending orders
  const pending = getPendingBuyDccOrders(userId);

  const lines: string[] = [];
  lines.push('� <b>Buy DCC with Crypto</b>');
  lines.push(fmt.divider());
  lines.push('');
  lines.push('🌉 <b>Cross-Chain Bridge</b> — Solana → DCC');
  lines.push('');
  lines.push('Send <b>SOL</b>, <b>USDT</b>, or <b>USDC</b> on the <b>Solana</b> network');
  lines.push('and receive DCC directly in your bot wallet!');
  lines.push('');
  lines.push(`💰 Price: <b>$${bridge.DCC_PRICE_USD}</b> per DCC`);
  lines.push('');
  lines.push(fmt.sparkDivider());
  lines.push('');
  lines.push('🪙 <b>Choose your payment coin:</b>');

  if (pending.length > 0) {
    lines.push('');
    lines.push(fmt.thinDivider());
    lines.push(`⏳ You have <b>${pending.length}</b> pending order(s)`);
  }

  const text = lines.join('\n');

  const keyboard = kb.buyDccCoinKeyboard(pending.length > 0);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(() => {});
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}

// ── Step 2: Amount selection ───────────────────────────────────────

async function showAmountSelect(ctx: Context, coin: bridge.BridgeCoin) {
  const coinInfo = bridge.SUPPORTED_COINS[coin];

  const lines: string[] = [];
  lines.push(`� <b>Buy DCC with ${coinInfo.emoji} ${coin}</b>`);
  lines.push(fmt.divider());
  lines.push('');
  lines.push(`Network: <b>Solana</b>`);
  lines.push(`Price: <b>$${bridge.DCC_PRICE_USD}</b> per DCC`);
  lines.push('');
  lines.push(fmt.thinDivider());
  lines.push('');
  lines.push('📊 <b>Select DCC amount to buy:</b>');
  lines.push('');

  // Show price in the selected coin
  const presets = [100, 500, 1000, 5000, 10000, 50000];
  for (const dcc of presets) {
    const usd = bridge.dccToUsd(dcc);
    lines.push(`  • <b>${dcc.toLocaleString()} DCC</b> = $${usd.toFixed(2)}`);
  }
  lines.push('');
  lines.push('<i>Or tap ✏️ Custom to enter any amount</i>');

  const text = lines.join('\n');
  const keyboard = kb.buyDccAmountKeyboard(coin);

  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(() => {});
}

// ── Step 3: Create deposit order ───────────────────────────────────

async function createDepositOrder(ctx: Context, coin: bridge.BridgeCoin, dccAmount: number) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const wallet = getActiveWallet(userId);
  if (!wallet) {
    await ctx.reply(
      '⚠️ Create a wallet first to receive DCC.',
      { parse_mode: 'HTML', reply_markup: kb.backKeyboard('menu:home') },
    );
    return;
  }

  const amountUsd = bridge.dccToUsd(dccAmount);
  const coinInfo = bridge.SUPPORTED_COINS[coin];

  // Show "processing" message
  const processingMsg = await ctx.reply(
    `⏳ <b>Creating deposit order...</b>\n\n` +
      `${coinInfo.emoji} ${coin} → <b>${dccAmount.toLocaleString()} DCC</b> ($${amountUsd.toFixed(2)})`,
    { parse_mode: 'HTML' },
  );

  try {
    // Call bridge API to create deposit
    const depositReq: bridge.DepositRequest = {
      coin,
      amountUsd,
      dccAmount,
      dccRecipient: wallet.address,
      userId,
    };

    const deposit = coin === 'SOL'
      ? await bridge.createDeposit(depositReq)
      : await bridge.createSplDeposit(depositReq);

    // Save order in DB
    const expiresAt = Math.floor(new Date(deposit.expiresAt).getTime() / 1000);
    createBuyDccOrder({
      bridgeId: deposit.id,
      userId,
      coin,
      depositAddress: deposit.depositAddress,
      depositAmount: deposit.depositAmount,
      dccAmount: deposit.dccAmount,
      amountUsd,
      expiresAt,
    });

    // Show deposit instructions
    const lines: string[] = [];
    lines.push('✅ <b>Deposit Order Created!</b>');
    lines.push(fmt.divider());
    lines.push('');
    lines.push(`📋 <b>Order ID:</b> <code>${deposit.id}</code>`);
    lines.push('');
    lines.push(fmt.sparkDivider());
    lines.push('');
    lines.push(`${coinInfo.emoji} <b>Send exactly:</b>`);
    lines.push(`<code>${deposit.depositAmount} ${coin}</code>`);
    lines.push('');
    lines.push('📍 <b>To this Solana address:</b>');
    lines.push(`<code>${deposit.depositAddress}</code>`);
    lines.push('');
    lines.push(fmt.sparkDivider());
    lines.push('');
    lines.push(`💎 <b>You will receive:</b> ${dccAmount.toLocaleString()} DCC`);
    lines.push(`📍 <b>To wallet:</b> <code>${wallet.address}</code>`);
    lines.push('');
    lines.push(fmt.thinDivider());
    lines.push('');
    lines.push('⚠️ <b>Important:</b>');
    lines.push(`  • Send on <b>Solana</b> network only`);
    lines.push(`  • Send <b>exactly</b> the amount shown`);
    lines.push(`  • Deposit expires in <b>30 minutes</b>`);
    lines.push(`  • DCC sent automatically once confirmed`);

    const text = lines.join('\n');
    const keyboard = kb.buyDccDepositKeyboard(deposit.id);

    // Edit the processing message
    await ctx.api.editMessageText(
      processingMsg.chat.id,
      processingMsg.message_id,
      text,
      { parse_mode: 'HTML', reply_markup: keyboard },
    ).catch(() => {});

  } catch (err: any) {
    console.error('Bridge deposit creation failed:', err);

    // Show error with fallback manual info
    const lines: string[] = [];
    lines.push('⚠️ <b>Bridge Temporarily Unavailable</b>');
    lines.push(fmt.divider());
    lines.push('');
    lines.push('The cross-chain bridge is currently offline.');
    lines.push('');
    lines.push(fmt.thinDivider());
    lines.push('');
    lines.push('💡 <b>Manual Purchase:</b>');
    lines.push('');
    lines.push(`You want: <b>${dccAmount.toLocaleString()} DCC</b> ($${amountUsd.toFixed(2)})`);
    lines.push(`Pay with: <b>${coinInfo.emoji} ${coin}</b> on Solana`);
    lines.push('');
    lines.push('📧 Contact support or try again later.');
    lines.push('');
    lines.push(`<i>Error: ${err.message || 'Connection refused'}</i>`);

    await ctx.api.editMessageText(
      processingMsg.chat.id,
      processingMsg.message_id,
      lines.join('\n'),
      { parse_mode: 'HTML', reply_markup: kb.backKeyboard('menu:buy_dcc') },
    ).catch(() => {});
  }
}

// ── Order status check ─────────────────────────────────────────────

async function showOrderStatus(ctx: Context, bridgeId: string) {
  const order = getBuyDccOrder(bridgeId);
  if (!order) {
    await ctx.editMessageText(
      '❌ Order not found.',
      { parse_mode: 'HTML', reply_markup: kb.backKeyboard('menu:buy_dcc') },
    ).catch(() => {});
    return;
  }

  // Try to get live status from bridge API
  let liveStatus = order.status;
  let dccTxId = order.dccTxId;
  try {
    const status = await bridge.getDepositStatus(order.bridgeId);
    liveStatus = status.status;
    dccTxId = status.dccTxId || null;
    if (liveStatus !== order.status) {
      updateBuyDccOrderStatus(order.bridgeId, liveStatus, dccTxId || undefined);
    }
  } catch {
    // Use cached status
  }

  const coinInfo = bridge.SUPPORTED_COINS[order.coin as bridge.BridgeCoin] || {
    emoji: '🪙', symbol: order.coin,
  };

  const statusEmoji: Record<string, string> = {
    pending: '⏳',
    confirming: '🔄',
    completed: '✅',
    expired: '⌛',
    failed: '❌',
  };

  const lines: string[] = [];
  lines.push(`${statusEmoji[liveStatus] || '❓'} <b>Order Status: ${liveStatus.toUpperCase()}</b>`);
  lines.push(fmt.divider());
  lines.push('');
  lines.push(`📋 <b>Order:</b> <code>${order.bridgeId}</code>`);
  lines.push(`🪙 <b>Coin:</b> ${coinInfo.emoji} ${order.coin}`);
  lines.push(`💰 <b>Deposit:</b> ${order.depositAmount} ${order.coin}`);
  lines.push(`💎 <b>DCC:</b> ${order.dccAmount}`);
  lines.push(`💵 <b>Value:</b> $${order.amountUsd.toFixed(2)}`);
  lines.push('');

  if (liveStatus === 'pending') {
    lines.push('📍 <b>Send to:</b>');
    lines.push(`<code>${order.depositAddress}</code>`);
    lines.push('');
    const expiresIn = order.expiresAt - Math.floor(Date.now() / 1000);
    if (expiresIn > 0) {
      const mins = Math.ceil(expiresIn / 60);
      lines.push(`⏱️ Expires in <b>${mins} min</b>`);
    } else {
      lines.push('⏱️ <b>Expired</b>');
    }
  } else if (liveStatus === 'confirming') {
    lines.push('🔄 Deposit detected! Waiting for confirmations...');
  } else if (liveStatus === 'completed') {
    lines.push('✅ DCC has been sent to your wallet!');
    if (dccTxId) {
      lines.push(`🔗 ${fmt.txLink(dccTxId)}`);
    }
  } else if (liveStatus === 'expired') {
    lines.push('⌛ This order has expired. Create a new one.');
  } else if (liveStatus === 'failed') {
    lines.push('❌ Something went wrong. Contact support.');
  }

  const keyboard = liveStatus === 'pending' || liveStatus === 'confirming'
    ? kb.buyDccStatusKeyboard(order.bridgeId)
    : kb.backKeyboard('menu:buy_dcc');

  await ctx.editMessageText(lines.join('\n'), {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  }).catch(() => {});
}

// ── My orders list ─────────────────────────────────────────────────

async function showMyOrders(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const orders = getBuyDccHistory(userId, 10);

  if (orders.length === 0) {
    await ctx.editMessageText(
      '📭 <b>No buy orders yet.</b>\n\nTap "� Buy DCC" to get started!',
      { parse_mode: 'HTML', reply_markup: kb.backKeyboard('menu:buy_dcc') },
    ).catch(() => {});
    return;
  }

  const statusEmoji: Record<string, string> = {
    pending: '⏳', confirming: '🔄', completed: '✅', expired: '⌛', failed: '❌',
  };

  const lines: string[] = [];
  lines.push('📜 <b>Your Buy Orders</b>');
  lines.push(fmt.divider());
  lines.push('');

  for (const o of orders) {
    const emoji = statusEmoji[o.status] || '❓';
    const date = new Date(o.createdAt * 1000).toLocaleDateString();
    lines.push(
      `${emoji} <b>${o.dccAmount} DCC</b> via ${o.coin} — $${o.amountUsd.toFixed(2)} — ${date}`
    );
  }

  const text = lines.join('\n');
  const keyboard = kb.buyDccOrdersKeyboard(orders);

  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(() => {});
}
