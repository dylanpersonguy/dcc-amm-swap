/**
 * Claim handler — lets referrers withdraw earned commissions.
 *
 * Commissions accrue in referral_rewards as unclaimed rows.
 * /claim  – shows claimable balance + "Claim" button
 * claim:execute – sends DCC from admin wallet to user, marks rewards as claimed
 */

import { Bot, Context } from 'grammy';
import {
  getClaimableDcc,
  getClaimedDcc,
  markDccRewardsClaimed,
  getActiveWallet,
} from '../db';
import { sendClaimPayout } from '../services/trading';
import { fromRawAmount } from '@dcc-amm/sdk';
import * as kb from '../ui/keyboards';
import * as fmt from '../ui/format';

// ── Register handlers ──────────────────────────────────────────────

export function registerClaimHandlers(bot: Bot) {
  // /claim command
  bot.command('claim', async (ctx) => {
    await showClaimScreen(ctx);
  });

  // Menu callback
  bot.callbackQuery('menu:claim', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showClaimScreen(ctx, true);
  });

  // Execute claim
  bot.callbackQuery('claim:execute', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    await ctx.answerCallbackQuery();

    const wallet = getActiveWallet(userId);
    if (!wallet) {
      await ctx.editMessageText(
        '⚠️ <b>No wallet found.</b>\n\nCreate a wallet first to receive your payout.',
        { parse_mode: 'HTML', reply_markup: kb.backKeyboard('menu:referrals') },
      ).catch(() => {});
      return;
    }

    const claimable = getClaimableDcc(userId);
    if (claimable <= 0n) {
      await ctx.editMessageText(
        '📭 <b>Nothing to claim.</b>\n\nRefer friends and earn commissions when they trade!',
        { parse_mode: 'HTML', reply_markup: kb.backKeyboard('menu:referrals') },
      ).catch(() => {});
      return;
    }

    // Show processing message
    await ctx.editMessageText(
      '⏳ <b>Processing your claim...</b>\n\n' +
        `Sending <b>${fromRawAmount(claimable, 8)} DCC</b> to your wallet...`,
      { parse_mode: 'HTML' },
    ).catch(() => {});

    try {
      const txId = await sendClaimPayout(wallet.address, claimable);
      const count = markDccRewardsClaimed(userId);

      await ctx.editMessageText(
        '✅ <b>Claim Successful!</b>\n\n' +
          `💰 <b>${fromRawAmount(claimable, 8)} DCC</b> sent to your wallet\n` +
          `📋 ${count} reward(s) claimed\n\n` +
          `🔗 <a href="https://explorer.decentralchain.io/tx/${txId}">View Transaction</a>\n\n` +
          '<i>Keep referring to earn more!</i>',
        { parse_mode: 'HTML', reply_markup: kb.claimResultKeyboard() },
      ).catch(() => {});
    } catch (err: any) {
      console.error('Claim payout failed:', err);
      await ctx.editMessageText(
        '❌ <b>Claim Failed</b>\n\n' +
          `${err.message || 'Unknown error'}\n\n` +
          '<i>Your rewards are safe. Please try again later.</i>',
        { parse_mode: 'HTML', reply_markup: kb.backKeyboard('menu:claim') },
      ).catch(() => {});
    }
  });

  // Refresh
  bot.callbackQuery('claim:refresh', async (ctx) => {
    await ctx.answerCallbackQuery({ text: '↻ Refreshed!' });
    await showClaimScreen(ctx, true);
  });
}

// ── Show claim screen ──────────────────────────────────────────────

async function showClaimScreen(ctx: Context, edit = false) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const wallet = getActiveWallet(userId);
  const claimable = getClaimableDcc(userId);
  const claimed = getClaimedDcc(userId);
  const total = claimable + claimed;

  const claimableFmt = fromRawAmount(claimable, 8);
  const claimedFmt = fromRawAmount(claimed, 8);
  const totalFmt = fromRawAmount(total, 8);

  const lines: string[] = [];
  lines.push('💸 <b>Claim Rewards</b>');
  lines.push(fmt.divider());
  lines.push('');

  if (claimable > 0n) {
    lines.push('🟢 <b>You have rewards ready to claim!</b>');
    lines.push('');
    lines.push(`  💰 Claimable:  <b>${claimableFmt} DCC</b>`);
    lines.push(`  ✅ Claimed:    ${claimedFmt} DCC`);
    lines.push(`  📊 Lifetime:   ${totalFmt} DCC`);
    lines.push('');
    if (!wallet) {
      lines.push('⚠️ <i>Create a wallet first to claim your rewards.</i>');
    } else {
      lines.push(`📍 Payout to: <code>${wallet.address}</code>`);
      lines.push('');
      lines.push('<i>Tap "💸 Claim Now" to receive your DCC!</i>');
    }
  } else {
    lines.push('📭 <b>No rewards to claim right now.</b>');
    lines.push('');
    lines.push(`  ✅ Claimed:  ${claimedFmt} DCC`);
    lines.push(`  📊 Lifetime: ${totalFmt} DCC`);
    lines.push('');
    lines.push('<i>Share your referral link to start earning!</i>');
  }

  const text = lines.join('\n');
  const keyboard = kb.claimKeyboard(claimable > 0n && !!wallet);

  if (edit && ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(() => {});
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}
