/**
 * DCC Swap Bot — Main entry point.
 *
 * A Trojan-style Telegram trading bot for DecentralChain AMM.
 * Features: wallet management, token swapping, pool browsing,
 * trade history, and configurable settings — all via inline menus.
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env from the amm-bot package directory (works regardless of CWD)
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { Bot, GrammyError, HttpError } from 'grammy';
import { config } from './config';
import { initDb } from './db';

import { registerHomeHandlers } from './handlers/home';
import { registerWalletHandlers } from './handlers/wallet';
import { registerSwapHandlers } from './handlers/swap';
import { registerPoolHandlers } from './handlers/pools';
import { registerPositionsHandlers } from './handlers/positions';
import { registerReferralHandlers } from './handlers/referral';
import { registerClaimHandlers } from './handlers/claim';
import { registerSettingsHandlers } from './handlers/settings';
import { registerHistoryHandlers } from './handlers/history';
import { registerBuyDccHandlers } from './handlers/buy-dcc';
import { registerTokenDetectHandlers } from './handlers/token-detect';

// ── Validate config ────────────────────────────────────────────────

if (!config.botToken) {
  console.error('❌ BOT_TOKEN environment variable is required.');
  console.error('   Get one from @BotFather on Telegram.');
  process.exit(1);
}

// ── Initialize database ────────────────────────────────────────────

console.log('📦 Initializing database...');
initDb();
console.log('✅ Database ready');

// ── Create bot instance ────────────────────────────────────────────

const bot = new Bot(config.botToken);

// ── Register handlers (ORDER MATTERS — more specific first) ────────

// 1. Home/start — base navigation
registerHomeHandlers(bot);

// 2. Wallet — create, import, export, switch, delete
registerWalletHandlers(bot);

// 3. Swap — token selection, amounts, preview, execute
registerSwapHandlers(bot);

// 4. Pools — browse, detail view
registerPoolHandlers(bot);

// 5. Positions — token holdings (/positions command)
registerPositionsHandlers(bot);

// 6. Referral — referral program & affiliate links
registerReferralHandlers(bot);

// 6b. Claim — withdraw referral commissions
registerClaimHandlers(bot);

// 6c. Buy DCC — cross-chain bridge (SOL/USDT/USDC → DCC)
registerBuyDccHandlers(bot);

// 7. Settings — slippage, fee, auto-confirm
registerSettingsHandlers(bot);

// 8. History — trade history
registerHistoryHandlers(bot);

// 9. Token detection — paste asset ID to start trading (MUST be after session-based text handlers)
registerTokenDetectHandlers(bot);

// ── Help command ───────────────────────────────────────────────────

bot.command('help', async (ctx) => {
  await ctx.reply(
    `⚡ <b>${config.botName} — Help</b>\n` +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      '📝 <b>Commands:</b>\n' +
      '  /start — Main menu\n' +
      '  /positions — View token holdings\n' +
      '  /referral — Earn commissions\n' +
      '  /claim — Withdraw referral earnings\n' +
      '  /help — Show this message\n\n' +
      '🚀 <b>Quick Start:</b>\n' +
      '1️⃣ Create or import a wallet\n' +
      '2️⃣ Tap � Buy DCC to purchase with SOL/USDT/USDC\n' +
      '3️⃣ Paste any token address to trade instantly\n' +
      '4️⃣ Or use 🟢 Buy / 🔴 Sell from the menu\n\n' +
      '🔐 <i>All operations are signed locally.\n' +
      'Your seed phrase is encrypted and never shared.</i>',
    { parse_mode: 'HTML' },
  );
});

// ── Catch-all for unhandled callback queries ──────────────────────

bot.on('callback_query:data', async (ctx) => {
  console.log(`⚠️ Unhandled callback: ${ctx.callbackQuery.data}`);
  await ctx.answerCallbackQuery({ text: '🔄 Try again from the menu' });
});

// ── Error handling ─────────────────────────────────────────────────

bot.catch((err) => {
  const ctx = err.ctx;
  const e = err.error;

  console.error(`Error handling update ${ctx.update.update_id}:`);

  if (e instanceof GrammyError) {
    console.error('Grammy error:', e.description);
  } else if (e instanceof HttpError) {
    console.error('HTTP error:', e);
  } else {
    console.error('Unknown error:', e);
  }
});

// ── Start bot ──────────────────────────────────────────────────────

console.log(`\n${config.botEmoji} ${config.botName} starting...`);
console.log(`   Node:  ${config.nodeUrl}`);
console.log(`   dApp:  ${config.dAppAddress}`);
console.log(`   Chain: ${config.chainId}\n`);

bot.start({
  onStart: (botInfo) => {
    console.log(`✅ Bot @${botInfo.username} is now running!`);
    console.log(`   Send /start to @${botInfo.username} on Telegram\n`);
  },
});

// ── Graceful shutdown ──────────────────────────────────────────────

process.once('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  bot.stop();
});
process.once('SIGTERM', () => {
  console.log('\n🛑 Shutting down...');
  bot.stop();
});
