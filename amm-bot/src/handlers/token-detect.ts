/**
 * Token address detection handler — Trojan-style single-screen trading.
 *
 * When a user pastes a DCC asset ID (Base58, 32-44 chars) as a text message:
 *  - Validates the asset exists on-chain via the DCC node API
 *  - If a DCC liquidity pool exists → shows full trading screen
 *    (price, balance, Buy/Sell toggle, preset amounts, slippage, BUY button)
 *  - If no pool exists → shows token info with "Create Pool" button
 *
 * Callback data uses SHORT prefixes to stay under Telegram's 64-byte limit:
 *   tm:b|s:<assetId>   — toggle buy/sell mode
 *   tr:<assetId>        — refresh screen
 *   ta:<amt>:<assetId>  — preset amount (or ta:x: for custom)
 *   te:b|s:<assetId>    — execute swap
 *   ts:<assetId>        — cycle slippage
 *   tsc:<assetId>       — custom slippage
 *   tcp:<assetId>       — create pool
 *   tcfp:<assetId>      — confirm pool creation
 *   tal:<assetId>       — add liquidity redirect
 *   pt:<assetId>        — trade from positions
 */

import { Bot, Context, InlineKeyboard } from 'grammy';
import * as trading from '../services/trading';
import { getAssetInfo, getActiveWallet, getBalance } from '../services/wallet';
import { getSettings } from '../db';
import * as fmt from '../ui/format';
import * as kb from '../ui/keyboards';

// Base58 alphabet used by DCC / Waves: no 0, O, I, l
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Track per-user trading state for the single-screen flow
interface TokenTradeState {
  assetId: string;
  direction: 'buy' | 'sell';
  amount?: number;  // DCC amount selected
}
const tradeState = new Map<number, TokenTradeState>();

export function registerTokenDetectHandlers(bot: Bot) {

  /* ── Text: detect pasted asset ID ──────────────── */

  bot.on('message:text', async (ctx, next) => {
    const text = ctx.message!.text!.trim();

    // Quick check: must look like a Base58 asset ID
    if (!BASE58_REGEX.test(text)) return next();

    console.log(`🔍 Token detect: "${text}" matches Base58 pattern`);

    // Validate on-chain via the DCC node /assets/details/{assetId}
    let info: Awaited<ReturnType<typeof getAssetInfo>> = null;
    try {
      info = await getAssetInfo(text);
    } catch (err: any) {
      console.error(`❌ getAssetInfo error for ${text}:`, err.message);
    }

    if (!info) {
      console.log(`⚠️ "${text}" not recognized as a DCC asset`);
      await ctx.reply(
        `⚠️ <b>Asset not found</b>\n\n` +
          `<code>${text}</code>\n\n` +
          `<i>This doesn't appear to be a valid asset on DecentralChain.\n` +
          `Double-check the asset ID and try again.</i>`,
        { parse_mode: 'HTML' },
      );
      return; // Don't pass to next — we handled the Base58 string
    }

    console.log(`✅ Token detected: ${info.name} (${text.slice(0, 8)}...)`);

    const userId = ctx.from!.id;
    tradeState.set(userId, { assetId: text, direction: 'buy' });

    try {
      await showTokenTradingScreen(ctx, userId, text, 'buy', false);
    } catch (err: any) {
      console.error(`❌ showTokenTradingScreen error:`, err.message);
      await ctx.reply(
        fmt.errorMessage('Error', err.message),
        { parse_mode: 'HTML' },
      ).catch(() => {});
    }
  });

  /* ── Toggle Buy/Sell mode  (tm:b:<id> / tm:s:<id>) ── */

  bot.callbackQuery(/^tm:(b|s):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const direction = (ctx.match![1] === 'b' ? 'buy' : 'sell') as 'buy' | 'sell';
    const assetId = ctx.match![2];
    const userId = ctx.from!.id;

    tradeState.set(userId, { assetId, direction });
    await showTokenTradingScreen(ctx, userId, assetId, direction, true);
  });

  /* ── Refresh token screen  (tr:<id>) ───────────── */

  bot.callbackQuery(/^tr:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: '↻ Refreshed!' });
    const assetId = ctx.match![1];
    const userId = ctx.from!.id;
    const state = tradeState.get(userId);
    const direction = state?.direction || 'buy';

    await showTokenTradingScreen(ctx, userId, assetId, direction, true);
  });

  /* ── Preset amount → execute swap  (ta:<amt>:<id>) ── */

  bot.callbackQuery(/^ta:(.+):([1-9A-HJ-NP-Za-km-z]{32,44})$/, async (ctx) => {
    const rawAmount = ctx.match![1];
    const assetId = ctx.match![2];
    const userId = ctx.from!.id;

    if (rawAmount === 'x') {
      // Custom amount entry
      await ctx.answerCallbackQuery();
      const state = tradeState.get(userId);
      tradeState.set(userId, { assetId, direction: state?.direction || 'buy' });

      await ctx.editMessageText(
        '✏️ <b>Enter Amount</b>\n\nType the amount of DCC:',
        { parse_mode: 'HTML', reply_markup: kb.cancelKeyboard() },
      ).catch(() => {});
      return;
    }

    await ctx.answerCallbackQuery();
    const dccAmount = parseFloat(rawAmount);
    if (isNaN(dccAmount) || dccAmount <= 0) return;

    const state = tradeState.get(userId);
    const direction = state?.direction || 'buy';

    // Execute the swap directly (Trojan style — immediate execution)
    await executeTokenSwap(ctx, userId, assetId, direction, dccAmount);
  });

  /* ── Execute button  (te:b|s:<id>) ─────────────── */

  bot.callbackQuery(/^te:(b|s):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const direction = (ctx.match![1] === 'b' ? 'buy' : 'sell') as 'buy' | 'sell';
    const assetId = ctx.match![2];
    const userId = ctx.from!.id;

    // Default to 1 DCC if no amount was set
    const state = tradeState.get(userId);
    const amount = state?.amount || 1;

    await executeTokenSwap(ctx, userId, assetId, direction, amount);
  });

  /* ── Slippage quick toggle  (ts:<id>) ──────────── */

  bot.callbackQuery(/^ts:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const assetId = ctx.match![1];
    const userId = ctx.from!.id;
    const settings = getSettings(userId);

    // Cycle through presets: 50 → 100 → 200 → 500 → 1500 → 50
    const presets = [50, 100, 200, 500, 1500];
    const idx = presets.indexOf(settings.slippageBps);
    const next = presets[(idx + 1) % presets.length];

    const { updateSettings } = await import('../db');
    updateSettings(userId, { slippageBps: next });

    const state = tradeState.get(userId);
    await showTokenTradingScreen(ctx, userId, assetId, state?.direction || 'buy', true);
  });

  /* ── Custom slippage entry  (tsc:<id>) ─────────── */

  bot.callbackQuery(/^tsc:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      '⚙️ <b>Custom Slippage</b>\n\n' +
        'Enter slippage tolerance in percent (e.g. <code>15</code>):',
      { parse_mode: 'HTML', reply_markup: kb.cancelKeyboard() },
    ).catch(() => {});
  });

  /* ── Create pool  (tcp:<id>) ───────────────────── */

  bot.callbackQuery(/^tcp:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const assetId = ctx.match![1];
    const userId = ctx.from!.id;

    const wallet = getActiveWallet(userId);
    if (!wallet) {
      await ctx.editMessageText('❌ Create a wallet first!', {
        parse_mode: 'HTML',
        reply_markup: kb.backKeyboard('menu:wallet'),
      }).catch(() => {});
      return;
    }

    const info = await getAssetInfo(assetId);
    const tokenName = info?.name || assetId.slice(0, 8);

    await ctx.editMessageText(
      `🏊 <b>Create Pool</b>\n\n` +
        `Token: <b>${tokenName}</b>\n` +
        `Asset ID: <code>${assetId}</code>\n\n` +
        `This will create a DCC / ${tokenName} pool with 0.3% fee tier.\n\n` +
        `⚠️ After creating the pool, you'll need to add initial liquidity.\n\n` +
        `Continue?`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('✅ Create Pool', `tcfp:${assetId}`)
          .text('❌ Cancel', 'menu:home')
          .row(),
      },
    ).catch(() => {});
  });

  /* ── Confirm pool creation  (tcfp:<id>) ────────── */

  bot.callbackQuery(/^tcfp:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: '⏳ Creating pool...' });
    const assetId = ctx.match![1];
    const userId = ctx.from!.id;

    const wallet = getActiveWallet(userId);
    if (!wallet) return;

    await ctx.editMessageText(fmt.loadingMessage('Creating pool'), {
      parse_mode: 'HTML',
    }).catch(() => {});

    try {
      const { invokeScript, broadcast, waitForTx } = await import('@waves/waves-transactions');
      const { config } = await import('../config');
      const { getWalletSeed } = await import('../db');

      const seed = getWalletSeed(userId);
      if (!seed) throw new Error('Could not decrypt wallet seed.');

      const { tx } = await trading.sdk.buildCreatePool(null, assetId, 30);

      const chainId = config.chainId.charCodeAt(0);
      const signedTx = invokeScript(
        {
          dApp: (tx as any).dApp,
          call: (tx as any).call as any,
          payment: ((tx as any).payment || []).map((p: any) => ({
            assetId: p.assetId || null,
            amount: p.amount,
          })),
          fee: (tx as any).fee || config.invokeFee,
          chainId,
        },
        seed,
      );

      await broadcast(signedTx, config.nodeUrl);
      await waitForTx(signedTx.id!, { apiBase: config.nodeUrl, timeout: config.deadlineMs });

      const info = await getAssetInfo(assetId);
      const tokenName = info?.name || assetId.slice(0, 8);

      await ctx.editMessageText(
        `✅ <b>Pool Created!</b>\n\n` +
          `🏊 DCC / ${tokenName} (0.3% fee)\n` +
          `🔗 TX: <code>${signedTx.id}</code>\n\n` +
          `<i>The pool is empty. Add liquidity to start trading!</i>`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('💧 Add Liquidity', `tal:${assetId}`)
            .text('🏠 Home', 'menu:home')
            .row(),
        },
      ).catch(() => {});
    } catch (err: any) {
      await ctx.editMessageText(
        fmt.errorMessage('Pool creation failed', err.message),
        { parse_mode: 'HTML', reply_markup: kb.backKeyboard('menu:home') },
      ).catch(() => {});
    }
  });

  /* ── Add liquidity redirect  (tal:<id>) ────────── */

  bot.callbackQuery(/^tal:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const assetId = ctx.match![1];

    const info = await getAssetInfo(assetId);
    const tokenName = info?.name || assetId.slice(0, 8);

    await ctx.editMessageText(
      `💧 <b>Add Liquidity</b>\n\n` +
        `Pool: DCC / <b>${tokenName}</b>\n\n` +
        `To add liquidity, use the Pools menu.\n` +
        `Navigate: 🏊 Pools → select pool → Add Liquidity`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('🏊 Go to Pools', 'menu:pools')
          .text('🏠 Home', 'menu:home')
          .row(),
      },
    ).catch(() => {});
  });

  /* ── Position: trade (from positions menu)  (pt:<id>) ── */

  bot.callbackQuery(/^pt:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const assetId = ctx.match![1];
    const userId = ctx.from!.id;
    tradeState.set(userId, { assetId, direction: 'sell' });
    await showTokenTradingScreen(ctx, userId, assetId, 'sell', true);
  });
}

/* ── Core: show Trojan-style trading screen ─────────────────────── */

async function showTokenTradingScreen(
  ctx: Context,
  userId: number,
  assetId: string,
  direction: 'buy' | 'sell',
  edit: boolean,
) {
  const info = await getAssetInfo(assetId);
  if (!info) {
    const errMsg = fmt.errorMessage(
      'Invalid Token',
      'Could not find this asset on the DecentralChain network.',
    );
    if (edit && ctx.callbackQuery) {
      await ctx.editMessageText(errMsg, { parse_mode: 'HTML', reply_markup: kb.backKeyboard('menu:home') }).catch(() => {});
    } else {
      await ctx.reply(errMsg, { parse_mode: 'HTML', reply_markup: kb.backKeyboard('menu:home') });
    }
    return;
  }

  const wallet = getActiveWallet(userId);
  const dccBalance = wallet ? await getBalance(wallet.address) : 0n;
  const walletLabel = wallet?.label || 'No Wallet';
  const settings = getSettings(userId);

  // Find pool
  const pools = await trading.getPools().catch(() => [] as trading.PoolInfo[]);
  const pool = pools.find((p) => p.token0 === assetId || p.token1 === assetId);

  let poolData: Parameters<typeof fmt.tokenTradingMessage>[0]['poolData'];
  const hasPool = !!pool;

  if (pool) {
    const tokenSide = pool.token0 === assetId ? 'token0' : 'token1';
    const dccSide = tokenSide === 'token0' ? 'token1' : 'token0';
    // price0to1 = token1 per 1 token0,  price1to0 = token0 per 1 token1
    // If token is token0 and DCC is token1:
    //   pricePerToken (DCC/token) = price0to1 (how many DCC per 1 token)
    //   tokensPerDcc  (token/DCC) = price1to0 (how many tokens per 1 DCC)
    poolData = {
      dccReserve: dccSide === 'token0' ? pool.reserve0 : pool.reserve1,
      tokenReserve: tokenSide === 'token0' ? pool.reserve0 : pool.reserve1,
      tokenDecimals: tokenSide === 'token0' ? pool.token0Decimals : pool.token1Decimals,
      feeBps: pool.feeBps,
      pricePerToken: tokenSide === 'token0' ? pool.price0to1 : pool.price1to0,
      tokensPerDcc: tokenSide === 'token0' ? pool.price1to0 : pool.price0to1,
      swapCount: pool.swapCount,
    };
  }

  const ticker = info.name.split(/\s+/)[0].toUpperCase();

  const text = fmt.tokenTradingMessage({
    tokenName: info.name,
    tokenTicker: ticker,
    assetId,
    decimals: info.decimals,
    dccBalance,
    walletLabel,
    hasPool,
    poolData,
    slippageBps: settings.slippageBps,
  });

  const keyboard = kb.tokenTradingKeyboard({
    assetId,
    direction,
    walletLabel,
    slippageBps: settings.slippageBps,
    hasPool,
  });

  const msg = { parse_mode: 'HTML' as const, reply_markup: keyboard };
  if (edit && ctx.callbackQuery) {
    await ctx.editMessageText(text, msg).catch(() => {});
  } else {
    await ctx.reply(text, msg);
  }
}

/* ── Execute swap from trading screen ──────────────────────────── */

async function executeTokenSwap(
  ctx: Context,
  userId: number,
  assetId: string,
  direction: 'buy' | 'sell',
  dccAmount: number,
) {
  const wallet = getActiveWallet(userId);
  if (!wallet) {
    await ctx.editMessageText('❌ Create a wallet first!', {
      parse_mode: 'HTML',
      reply_markup: kb.backKeyboard('menu:wallet'),
    }).catch(async () => {
      await ctx.reply('❌ Create a wallet first!', {
        parse_mode: 'HTML',
        reply_markup: kb.backKeyboard('menu:wallet'),
      });
    });
    return;
  }

  // Show loading
  await ctx.editMessageText(
    fmt.loadingMessage(`Executing ${direction} swap for ${dccAmount} DCC`),
    { parse_mode: 'HTML' },
  ).catch(async () => {
    await ctx.reply(
      fmt.loadingMessage(`Executing ${direction} swap for ${dccAmount} DCC`),
      { parse_mode: 'HTML' },
    );
  });

  try {
    const settings = getSettings(userId);
    const amountRaw = BigInt(Math.round(dccAmount * 1e8));

    const assetIn = direction === 'buy' ? null : assetId;
    const assetOut = direction === 'buy' ? assetId : null;

    const result = await trading.executeSwap(
      userId,
      amountRaw,
      assetIn,
      assetOut,
      settings.feeTier,
      BigInt(settings.slippageBps),
    );

    const successText = fmt.swapSuccessMessage(
      result.assetIn,
      result.assetOut,
      result.amountIn,
      result.amountOut,
      result.txId,
      result.botFee,
    );

    await ctx.editMessageText(successText, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .text('↻ Trade Again', `tr:${assetId}`)
        .text('🏠 Home', 'menu:home')
        .row(),
    }).catch(async () => {
      await ctx.reply(successText, {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('↻ Trade Again', `tr:${assetId}`)
          .text('🏠 Home', 'menu:home')
          .row(),
      });
    });
  } catch (err: any) {
    await ctx.editMessageText(
      fmt.errorMessage('Swap failed', err.message),
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('← Back', `tr:${assetId}`)
          .text('🏠 Home', 'menu:home')
          .row(),
      },
    ).catch(async () => {
      await ctx.reply(
        fmt.errorMessage('Swap failed', err.message),
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('← Back', `tr:${assetId}`)
            .text('🏠 Home', 'menu:home')
            .row(),
        },
      );
    });
  }
}
