/**
 * Swap handlers — token select → amount → preview → confirm → execute.
 *
 * Flow:
 *  1. User taps "Buy" or "Sell" from main menu
 *  2. Token list shown (from pools)
 *  3. User selects token
 *  4. Preset amount buttons + custom input
 *  5. Preview (quote) shown
 *  6. Confirm → execute
 */

import { Bot, Context, InlineKeyboard } from 'grammy';
import * as trading from '../services/trading';
import { getAssetInfo, getActiveWallet } from '../services/wallet';
import { getSettings } from '../db';
import * as fmt from '../ui/format';
import * as kb from '../ui/keyboards';

interface SwapSession {
  step: 'select_token' | 'enter_amount' | 'preview' | 'awaiting_custom_amount';
  direction: 'buy' | 'sell';
  tokenAssetId?: string;
  tokenName?: string;
  tokenDecimals?: number;
  amountRaw?: bigint;
  amountDisplay?: string;
}

const sessions = new Map<number, SwapSession>();

export function getSwapSession(userId: number): SwapSession | undefined {
  return sessions.get(userId);
}

export function setSwapSession(userId: number, session: SwapSession) {
  sessions.set(userId, session);
}

export function clearSwapSession(userId: number) {
  sessions.delete(userId);
}

export type { SwapSession };

export function registerSwapHandlers(bot: Bot) {
  /* ── Menu ──────────────────────────────────────── */

  bot.callbackQuery('menu:swap', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showSwapMenu(ctx);
  });

  /* ── Direction: buy or sell ─────────────────────── */

  bot.callbackQuery(/^swap:(buy|sell)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const direction = ctx.match![1] as 'buy' | 'sell';
    const userId = ctx.from!.id;

    const wallet = getActiveWallet(userId);
    if (!wallet) {
      await ctx.editMessageText('❌ Create a wallet first!', {
        parse_mode: 'HTML',
        reply_markup: kb.backKeyboard('menu:wallet'),
      }).catch(() => {});
      return;
    }

    sessions.set(userId, { step: 'select_token', direction });

    // Show available tokens from pools
    try {
      const pools = await trading.getPools();
      const tokens = extractTokens(pools);

      if (tokens.length === 0) {
        await ctx.editMessageText(
          '📊 No pools available yet. Check back later!',
          { parse_mode: 'HTML', reply_markup: kb.backKeyboard('menu:home') },
        );
        return;
      }

      const label = direction === 'buy' ? '🟢 BUY' : '🔴 SELL';
      const text =
        `${label} — <b>Select Token</b>\n\n` +
        'Choose which token to ' + direction + ':';

      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: kb.tokenSelectKeyboard(tokens, 'swap_select'),
      }).catch(() => {});
    } catch (err: any) {
      await ctx.editMessageText(fmt.errorMessage('Failed to load pools', err.message), {
        parse_mode: 'HTML',
        reply_markup: kb.backKeyboard('menu:home'),
      }).catch(() => {});
    }
  });

  /* ── Token selected ────────────────────────────── */

  bot.callbackQuery(/^swap_select:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from!.id;
    const session = sessions.get(userId);
    if (!session) return;

    const assetId = ctx.match![1];

    // Get token info
    try {
      const info = await getAssetInfo(assetId);
      session.tokenAssetId = assetId;
      session.tokenName = info?.name || 'Unknown';
      session.tokenDecimals = info?.decimals ?? 8;
      session.step = 'enter_amount';

      await showAmountSelection(ctx, session);
    } catch (err: any) {
      await ctx.editMessageText(fmt.errorMessage('Token error', err.message), {
        parse_mode: 'HTML',
        reply_markup: kb.backKeyboard('menu:swap'),
      }).catch(() => {});
    }
  });

  /* ── Preset DCC amounts ────────────────────────── */

  bot.callbackQuery(/^swap:amount:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from!.id;
    const session = sessions.get(userId);
    if (!session || !session.tokenAssetId) return;

    const rawVal = ctx.match![1];

    if (rawVal === 'custom') {
      session.step = 'awaiting_custom_amount';
      const unit = session.direction === 'buy' ? 'DCC' : (session.tokenName || 'tokens');
      await ctx.editMessageText(
        '✏️ <b>Enter Amount</b>\n\n' +
          `Type the amount of ${unit} to ${session.direction}:`,
        { parse_mode: 'HTML', reply_markup: kb.cancelKeyboard() },
      );
      return;
    }

    // Parse preset amount
    const amount = parseFloat(rawVal);
    if (isNaN(amount) || amount <= 0) return;

    // For buys, amount is in DCC (8 decimals). For sells, amount is in the token's units.
    const decimals = session.direction === 'sell' ? (session.tokenDecimals ?? 8) : 8;
    session.amountRaw = BigInt(Math.round(amount * 10 ** decimals));
    session.amountDisplay = amount.toString();
    session.step = 'preview';

    await showSwapPreview(ctx, session);
  });

  /* ── Confirm swap ──────────────────────────────── */

  bot.callbackQuery('swap:confirm', async (ctx) => {
    await ctx.answerCallbackQuery({ text: '⏳ Executing swap...' });
    const userId = ctx.from!.id;
    const session = sessions.get(userId);
    if (!session || !session.tokenAssetId || !session.amountRaw) return;

    const wallet = getActiveWallet(userId);
    if (!wallet) {
      await ctx.editMessageText('❌ No wallet found.', {
        parse_mode: 'HTML',
        reply_markup: kb.backKeyboard('menu:home'),
      }).catch(() => {});
      return;
    }

    // Show loading
    await ctx.editMessageText(fmt.loadingMessage('Executing swap'), {
      parse_mode: 'HTML',
    }).catch(() => {});

    try {
      const settings = getSettings(userId);
      const assetIn = session.direction === 'buy' ? null : session.tokenAssetId;
      const assetOut = session.direction === 'buy' ? session.tokenAssetId : null;

      const result = await trading.executeSwap(
        userId,
        session.amountRaw,
        assetIn,
        assetOut,
        settings.feeTier,
        BigInt(settings.slippageBps),
      );

      sessions.delete(userId);

      await ctx.editMessageText(
        fmt.swapSuccessMessage(
          result.assetIn,
          result.assetOut,
          result.amountIn,
          result.amountOut,
          result.txId,
          result.botFee,
        ),
        {
          parse_mode: 'HTML',
          reply_markup: kb.swapResultKeyboard(),
        },
      ).catch(() => {});
    } catch (err: any) {
      await ctx.editMessageText(
        fmt.errorMessage('Swap failed', err.message),
        { parse_mode: 'HTML', reply_markup: kb.backKeyboard('menu:swap') },
      ).catch(() => {});
    }
  });

  /* ── Cancel swap (cleanup session on navigating away) ── */

  bot.callbackQuery('menu:home', async (ctx, next) => {
    // Clean up any active swap session when the user goes home
    const userId = ctx.from?.id;
    if (userId && sessions.has(userId)) {
      sessions.delete(userId);
    }
    return next();
  });

  /* ── Text input for custom amount ──────────────── */

  bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from!.id;
    const session = sessions.get(userId);
    if (!session || session.step !== 'awaiting_custom_amount') return next();

    const input = ctx.message!.text!.trim();
    const amount = parseFloat(input);

    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ Invalid amount. Enter a positive number:', {
        parse_mode: 'HTML',
        reply_markup: kb.cancelKeyboard(),
      });
      return;
    }

    const decimals = session.direction === 'sell' ? (session.tokenDecimals ?? 8) : 8;
    session.amountRaw = BigInt(Math.round(amount * 10 ** decimals));
    session.amountDisplay = amount.toString();
    session.step = 'preview';

    await showSwapPreview(ctx, session, false);
  });
}

/* ── Display helpers ──────────────────────────────── */

async function showSwapMenu(ctx: Context, edit = true) {
  const text =
    '🔄 <b>Swap</b>\n\n' +
    'Choose an action:';

  const keyboard = new InlineKeyboard()
    .text('🟢 Buy Token', 'swap:buy')
    .text('🔴 Sell Token', 'swap:sell')
    .row()
    .text('⬅️ Back', 'menu:home')
    .row();

  const msg = { parse_mode: 'HTML' as const, reply_markup: keyboard };
  if (edit && ctx.callbackQuery) {
    await ctx.editMessageText(text, msg).catch(() => {});
  } else {
    await ctx.reply(text, msg);
  }
}

async function showAmountSelection(ctx: Context, session: SwapSession) {
  const dirLabel = session.direction === 'buy' ? '🟢 BUY' : '🔴 SELL';
  const unit = session.direction === 'buy' ? 'DCC' : session.tokenName!;
  const text =
    `${dirLabel} <b>${session.tokenName}</b>\n\n` +
    `Select amount of ${unit} to ${session.direction}:`;

  const keyboard = new InlineKeyboard();

  // Preset amounts — DCC for buys, token for sells
  const presets = session.direction === 'buy'
    ? ['0.5', '1', '5', '10', '25', '50']
    : ['10', '50', '100', '500', '1000', '5000'];
  for (let i = 0; i < presets.length; i += 3) {
    const row = presets.slice(i, i + 3);
    for (const p of row) {
      keyboard.text(`${p} ${unit}`, `swap:amount:${p}`);
    }
    keyboard.row();
  }
  keyboard.text('✏️ Custom Amount', 'swap:amount:custom').row();
  keyboard.text('❌ Cancel', 'action:cancel');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    }).catch(() => {});
  } else {
    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  }
}

async function showSwapPreview(ctx: Context, session: SwapSession, edit = true) {
  const userId = ctx.from!.id;
  const settings = getSettings(userId);

  try {
    const assetIn = session.direction === 'buy' ? null : session.tokenAssetId!;
    const assetOut = session.direction === 'buy' ? session.tokenAssetId! : null;

    const quote = await trading.getQuote(
      session.amountRaw!,
      assetIn,
      assetOut,
      settings.feeTier,
      BigInt(settings.slippageBps),
    );

    const outDecimals = session.direction === 'buy' ? session.tokenDecimals! : 8;
    const inDecimals = session.direction === 'buy' ? 8 : session.tokenDecimals!;
    const amountOutStr = formatTokenAmount(quote.amountOut, outDecimals);
    const minReceivedStr = formatTokenAmount(quote.minAmountOut, outDecimals);
    const feeStr = formatTokenAmount(quote.feeAmount, inDecimals);
    const impactStr = (Number(quote.priceImpactBps) / 100).toFixed(2);
    const feePct = fmt.fmtPercent(settings.feeTier);
    const inName = session.direction === 'buy' ? 'DCC' : session.tokenName!;
    const outName = session.direction === 'buy' ? session.tokenName! : 'DCC';

    const text = fmt.swapPreviewMessage(
      inName,
      outName,
      session.amountDisplay!,
      amountOutStr,
      minReceivedStr,
      impactStr,
      feeStr,
      feePct,
    );

    const msg = { parse_mode: 'HTML' as const, reply_markup: kb.swapConfirmKeyboard() };
    if (edit && ctx.callbackQuery) {
      await ctx.editMessageText(text, msg).catch(() => {});
    } else {
      await ctx.reply(text, msg);
    }
  } catch (err: any) {
    const errText = fmt.errorMessage('Quote failed', err.message);
    const msg = { parse_mode: 'HTML' as const, reply_markup: kb.backKeyboard('menu:swap') };
    if (edit && ctx.callbackQuery) {
      await ctx.editMessageText(errText, msg).catch(() => {});
    } else {
      await ctx.reply(errText, msg);
    }
  }
}

/* ── Utilities ────────────────────────────────────── */

function extractTokens(pools: trading.PoolInfo[]): { assetId: string; name: string }[] {
  const seen = new Set<string>();
  const tokens: { assetId: string; name: string }[] = [];

  for (const pool of pools) {
    for (const asset of [
      { id: pool.token0, name: pool.token0Name },
      { id: pool.token1, name: pool.token1Name },
    ]) {
      if (asset.id && asset.id !== 'DCC' && asset.id !== '' && !seen.has(asset.id)) {
        seen.add(asset.id);
        tokens.push({ assetId: asset.id, name: asset.name || asset.id.slice(0, 8) });
      }
    }
  }
  return tokens;
}

function formatTokenAmount(raw: bigint, decimals: number): string {
  if (decimals === 0) return raw.toString();
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}
