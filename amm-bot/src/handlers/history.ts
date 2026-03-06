/**
 * Trade history handlers.
 */

import { Bot, Context } from 'grammy';
import { getTradeHistory, getTradeCount } from '../db';
import * as fmt from '../ui/format';
import * as kb from '../ui/keyboards';

export function registerHistoryHandlers(bot: Bot) {
  bot.callbackQuery('menu:history', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showHistory(ctx);
  });
}

async function showHistory(ctx: Context) {
  const userId = ctx.from!.id;
  const trades = getTradeHistory(userId, 10);

  const text = fmt.tradeHistoryMessage(trades);
  const keyboard = kb.historyKeyboard();

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  }).catch(() => {});
}
