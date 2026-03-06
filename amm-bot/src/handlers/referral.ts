/**
 * Referral program handlers — Trojan-style referral system.
 *
 * Each user gets a unique invite link: https://t.me/{botUsername}?start=r-{userId}
 * Tracks direct referrals (layer 1) and indirect referrals (layer 2).
 * Shows referral stats, volume from referred users, and referral tiers.
 */

import { Bot, Context } from 'grammy';
import {
  getReferralStats,
  getActiveWallet,
  getReferrer,
} from '../db';
import * as fmt from '../ui/format';
import * as kb from '../ui/keyboards';

// ── Bot username cache ─────────────────────────────────────────────

let cachedBotUsername = '';

function getBotUsername(bot: Bot): string {
  if (cachedBotUsername) return cachedBotUsername;
  cachedBotUsername = bot.botInfo?.username || 'DccSwapBot';
  return cachedBotUsername;
}

// ── Export referral link builder ───────────────────────────────────

export function buildReferralLink(botUsername: string, userId: number): string {
  return `https://t.me/${botUsername}?start=r-${userId}`;
}

// ── Register handlers ──────────────────────────────────────────────

export function registerReferralHandlers(bot: Bot) {
  // /referral command
  bot.command('referral', async (ctx) => {
    await showReferralScreen(ctx, bot);
  });

  // Menu callback
  bot.callbackQuery('menu:referrals', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showReferralScreen(ctx, bot, true);
  });

  // Copy referral link
  bot.callbackQuery('referral:copy_link', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const link = buildReferralLink(getBotUsername(bot), userId);
    await ctx.answerCallbackQuery({ text: '📋 Link copied! Share it with friends.' });
    // Send as a separate message so user can tap to copy
    await ctx.reply(
      `🔗 <b>Your Referral Link</b>\n\n<code>${link}</code>\n\n<i>Tap to copy, then share!</i>`,
      { parse_mode: 'HTML' },
    );
  });

  // Refresh referral stats
  bot.callbackQuery('referral:refresh', async (ctx) => {
    await ctx.answerCallbackQuery({ text: '↻ Refreshed!' });
    await showReferralScreen(ctx, bot, true);
  });

  // Commission info popup
  bot.callbackQuery('referral:info', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `💎 <b>Commission Structure</b>\n` +
        `${fmt.divider()}\n\n` +
        `🔥 <b>LIMITED TIME PROMO — 80% Payout!</b>\n\n` +
        `Every trade on DCC Swap has a <b>1% platform fee</b>.\n` +
        `When your referrals trade, you earn up to <b>10 layers deep</b>:\n\n` +
        `🥇 L1  — <b>25%</b> of fee (=0.25% of trade)\n` +
        `🥈 L2  — <b>15%</b> of fee (=0.15% of trade)\n` +
        `🥉 L3  — <b>10%</b> of fee (=0.10% of trade)\n` +
        `4️⃣ L4  — <b>8%</b> of fee  (=0.08% of trade)\n` +
        `5️⃣ L5  — <b>6%</b> of fee  (=0.06% of trade)\n` +
        `6️⃣ L6  — <b>5%</b> of fee  (=0.05% of trade)\n` +
        `7️⃣ L7  — <b>4%</b> of fee  (=0.04% of trade)\n` +
        `8️⃣ L8  — <b>3%</b> of fee  (=0.03% of trade)\n` +
        `9️⃣ L9  — <b>2%</b> of fee  (=0.02% of trade)\n` +
        `🔟 L10 — <b>2%</b> of fee  (=0.02% of trade)\n\n` +
        `────────────────────\n` +
        `✨ <b>Total: 80%</b> of all fees go to referrers!\n\n` +
        `📌 <b>Example:</b>\n` +
        `A direct referral swaps <b>100 DCC</b>:\n` +
        `  • Platform fee = 1 DCC\n` +
        `  • You earn = 0.25 DCC\n\n` +
        `<i>Commissions are tracked automatically!</i>`,
      { parse_mode: 'HTML', reply_markup: kb.backKeyboard('menu:referrals') },
    ).catch(() => {});
  });
}

// ── Show referral screen ───────────────────────────────────────────

async function showReferralScreen(ctx: Context, bot: Bot, edit = false) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const botUsername = getBotUsername(bot);
  const referralLink = buildReferralLink(botUsername, userId);
  const stats = getReferralStats(userId);
  const referrer = getReferrer(userId);
  const wallet = getActiveWallet(userId);

  const text = fmt.referralMessage({
    userId,
    referralLink,
    directReferrals: stats.directReferrals,
    indirectReferrals: stats.indirectReferrals,
    totalReferred: stats.totalReferred,
    totalVolumeDcc: stats.totalVolumeDcc,
    earnedByLayer: stats.earnedByLayer,
    earnedTotal: stats.earnedTotal,
    claimableTotal: stats.claimableTotal,
    claimedTotal: stats.claimedTotal,
    tradeCountReferred: stats.tradeCountReferred,
    referredBy: referrer,
    hasWallet: !!wallet,
  });

  const keyboard = kb.referralKeyboard();

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
