/**
 * Settings handlers — slippage, priority fee, auto-confirm.
 */

import { Bot, Context } from 'grammy';
import { getSettings, updateSettings } from '../db';
import * as fmt from '../ui/format';
import * as kb from '../ui/keyboards';

interface SettingsSession {
  step: 'awaiting_slippage' | 'awaiting_fee';
}

const sessions = new Map<number, SettingsSession>();

export function getSettingsSession(userId: number) {
  return sessions.get(userId);
}

export function clearSettingsSession(userId: number) {
  sessions.delete(userId);
}

export function registerSettingsHandlers(bot: Bot) {
  /* ── Main settings menu ────────────────────────── */

  bot.callbackQuery('menu:settings', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showSettings(ctx);
  });

  /* ── Slippage presets ──────────────────────────── */

  bot.callbackQuery(/^settings:slippage:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: '✅ Updated!' });
    const userId = ctx.from!.id;
    const bps = parseInt(ctx.match![1], 10);
    updateSettings(userId, { slippageBps: bps });
    await showSettings(ctx);
  });

  bot.callbackQuery('settings:slippage:custom', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from!.id;
    sessions.set(userId, { step: 'awaiting_slippage' });
    await ctx.editMessageText(
      '⚙️ <b>Custom Slippage</b>\n\n' +
        'Enter slippage tolerance in percent (e.g. <code>2.5</code>):',
      { parse_mode: 'HTML', reply_markup: kb.cancelKeyboard() },
    );
  });

  /* ── Fee tier presets ──────────────────────────── */

  bot.callbackQuery(/^settings:fee:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: '✅ Updated!' });
    const userId = ctx.from!.id;
    const fee = parseInt(ctx.match![1], 10);
    updateSettings(userId, { feeTier: fee });
    await showSettings(ctx);
  });

  /* ── Auto-confirm toggle ───────────────────────── */

  bot.callbackQuery('settings:toggle_auto', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from!.id;
    const current = getSettings(userId);
    updateSettings(userId, { autoConfirm: !current.autoConfirm });
    await showSettings(ctx);
  });

  /* ── Cleanup session on navigating away ────────── */

  bot.callbackQuery('menu:home', async (ctx, next) => {
    const userId = ctx.from?.id;
    if (userId && sessions.has(userId)) {
      sessions.delete(userId);
    }
    return next();
  });

  /* ── Text input for custom slippage ────────────── */

  bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from!.id;
    const session = sessions.get(userId);
    if (!session) return next();

    if (session.step === 'awaiting_slippage') {
      sessions.delete(userId);
      const pct = parseFloat(ctx.message!.text!.trim());
      if (isNaN(pct) || pct < 0.01 || pct > 50) {
        await ctx.reply('❌ Invalid. Enter a value between 0.01 and 50.', {
          parse_mode: 'HTML',
        });
        return;
      }
      const bps = Math.round(pct * 100);
      updateSettings(userId, { slippageBps: bps });
      await ctx.reply(`✅ Slippage set to ${pct}%`, { parse_mode: 'HTML' });
      await showSettings(ctx, false);
      return;
    }

    return next();
  });
}

async function showSettings(ctx: Context, edit = true) {
  const userId = ctx.from!.id;
  const s = getSettings(userId);
  const buyPresets = JSON.parse(s.buyPresets) as number[];
  const sellPresets = JSON.parse(s.sellPresets) as number[];
  const text = fmt.settingsMessage(s.slippageBps, s.feeTier, s.autoConfirm, buyPresets, sellPresets);
  const msg = { parse_mode: 'HTML' as const, reply_markup: kb.settingsKeyboard(s.slippageBps, s.autoConfirm) };

  if (edit && ctx.callbackQuery) {
    await ctx.editMessageText(text, msg).catch(() => {});
  } else {
    await ctx.reply(text, msg);
  }
}
