/**
 * Home & navigation handlers — Trojan-style /start and menu routing.
 */

import { Bot, Context } from 'grammy';
import { getActiveWallet, getBalance } from '../services/wallet';
import { getTradeCount, getDirectReferralCount, recordReferral } from '../db';
import * as trading from '../services/trading';
import * as fmt from '../ui/format';
import * as kb from '../ui/keyboards';

export function registerHomeHandlers(bot: Bot) {
  // /start command — supports deep-link referrals: /start r-{userId}
  bot.command('start', async (ctx) => {
    const userId = ctx.from?.id;
    if (userId) {
      // Parse referral deep-link: /start r-123456789
      const payload = ctx.match?.toString().trim();
      if (payload && payload.startsWith('r-')) {
        const referrerIdStr = payload.slice(2);
        const referrerId = parseInt(referrerIdStr, 10);
        if (!isNaN(referrerId) && referrerId > 0) {
          const recorded = recordReferral(referrerId, userId);
          if (recorded) {
            console.log(`🤝 Referral recorded: ${referrerId} → ${userId}`);
          }
        }
      }
    }

    await showHome(ctx);
  });

  // Home menu callback
  bot.callbackQuery('menu:home', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showHome(ctx, true);
  });

  // Refresh
  bot.callbackQuery('action:refresh', async (ctx) => {
    await ctx.answerCallbackQuery({ text: '↻ Refreshed!' });
    await showHome(ctx, true);
  });

  // Help inline
  bot.callbackQuery('action:help', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `❓ <b>DCC Swap — Help Center</b>\n` +
        `${fmt.divider()}\n\n` +
        '🚀 <b>Getting Started</b>\n' +
        '  1️⃣ Create or import a wallet\n' +
        '  2️⃣ Fund it with DCC\n' +
        '  3️⃣ Paste any token address to trade!\n\n' +
        '📝 <b>Commands</b>\n' +
        '  /start — Main menu\n' +
        '  /positions — View your token portfolio\n' +
        '  /referral — Earn up to 80% commission on referrals\n' +
        '  /help — This help page\n\n' +
        '💡 <b>Pro Tips</b>\n' +
        '  • Paste any Base58 asset ID to instantly trade\n' +
        '  • Use preset amounts for 1-click swaps\n' +
        '  • Share your referral link to earn DCC\n' +
        '  • Adjust slippage in ⚙️ Settings\n\n' +
        '🔐 <b>Security</b>\n' +
        '<i>All keys encrypted locally. Never shared.\n' +
        'Export your seed phrase as backup!</i>',
      { parse_mode: 'HTML', reply_markup: kb.backKeyboard('menu:home') },
    ).catch(() => {});
  });

  // Buy from main menu → show swap flow
  bot.callbackQuery('menu:swap_buy', async (ctx) => {
    await ctx.answerCallbackQuery();
    const text =
      '🟢 <b>BUY</b> — Select Token\n' +
      fmt.thinDivider() + '\n\n' +
      '📋 Paste a <b>token address</b> in the chat to start trading.\n\n' +
      '<i>Or browse Pools to find tokens to trade.</i>\n\n' +
      '💡 <b>Tip:</b> Ask the token creator for their asset ID!';
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: kb.backKeyboard('menu:home'),
    }).catch(() => {});
  });

  // Sell from main menu
  bot.callbackQuery('menu:swap_sell', async (ctx) => {
    await ctx.answerCallbackQuery();
    const text =
      '🔴 <b>SELL</b> — Select Token\n' +
      fmt.thinDivider() + '\n\n' +
      '📋 Paste a <b>token address</b> in the chat to sell.\n\n' +
      '📊 Or use <b>/positions</b> to sell from your holdings.\n\n' +
      '💡 <b>Tip:</b> Tap a token in Positions to sell it!';
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: kb.backKeyboard('menu:home'),
    }).catch(() => {});
  });

  // Header/no-op callbacks
  bot.callbackQuery(/^(swap:buy_header|swap:sell_header|settings:header)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
  });
}

async function showHome(ctx: Context, edit = false) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const wallet = getActiveWallet(userId);
  let balance = 0n;
  let trades = 0;
  let poolCount = 0;
  let referralCount = 0;

  if (wallet) {
    balance = await getBalance(wallet.address);
    trades = getTradeCount(userId);
  }

  // Gather extra stats (non-blocking)
  try {
    const pools = await trading.getPools();
    poolCount = pools.length;
  } catch {}
  try {
    referralCount = getDirectReferralCount(userId);
  } catch {}

  const displayName = ctx.from?.first_name || 'Trader';

  const text = fmt.homeMessage({
    address: wallet?.address || null,
    dccBalance: balance,
    tradeCount: trades,
    walletLabel: wallet?.label || 'W1',
    displayName,
    poolCount,
    referralCount,
  });
  const keyboard = kb.mainMenuKeyboard(!!wallet);

  if (edit && ctx.callbackQuery) {
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
