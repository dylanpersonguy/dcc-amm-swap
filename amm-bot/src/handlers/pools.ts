/**
 * Pool browsing handlers — list pools, show pool details.
 */

import { Bot, Context } from 'grammy';
import * as trading from '../services/trading';
import * as fmt from '../ui/format';
import * as kb from '../ui/keyboards';

export function registerPoolHandlers(bot: Bot) {
  /* ── Pool list ─────────────────────────────────── */

  bot.callbackQuery('menu:pools', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showPoolList(ctx);
  });

  bot.callbackQuery('pools:refresh', async (ctx) => {
    await ctx.answerCallbackQuery({ text: '🔄 Refreshed!' });
    await showPoolList(ctx);
  });

  /* ── Pool detail ───────────────────────────────── */

  bot.callbackQuery(/^pool:view:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const poolId = ctx.match![1];

    try {
      const pools = await trading.getPools();
      const pool = pools.find((p) => p.poolId === poolId);

      if (!pool) {
        await ctx.editMessageText('❌ Pool not found.', {
          parse_mode: 'HTML',
          reply_markup: kb.backKeyboard('menu:pools'),
        }).catch(() => {});
        return;
      }

      const text = fmt.poolCardMessage(pool);
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: kb.poolDetailKeyboard(
          pool.token0,
          pool.token1,
          pool.token0Name,
          pool.token1Name,
        ),
      }).catch(() => {});
    } catch (err: any) {
      await ctx.editMessageText(fmt.errorMessage('Pool error', err.message), {
        parse_mode: 'HTML',
        reply_markup: kb.backKeyboard('menu:pools'),
      }).catch(() => {});
    }
  });
}

async function showPoolList(ctx: Context) {
  try {
    const pools = await trading.getPools();

    if (pools.length === 0) {
      await ctx.editMessageText(
        '🏊 <b>Pools</b>\n\nNo liquidity pools found yet.',
        { parse_mode: 'HTML', reply_markup: kb.backKeyboard('menu:home') },
      ).catch(() => {});
      return;
    }

    const text =
      '🏊 <b>Liquidity Pools</b>\n\n' +
      `<i>${pools.length} active pool${pools.length > 1 ? 's' : ''}</i>\n\n` +
      'Select a pool for details:';

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: kb.poolListKeyboard(pools),
    }).catch(() => {});
  } catch (err: any) {
    await ctx.editMessageText(fmt.errorMessage('Failed to load pools', err.message), {
      parse_mode: 'HTML',
      reply_markup: kb.backKeyboard('menu:home'),
    }).catch(() => {});
  }
}
