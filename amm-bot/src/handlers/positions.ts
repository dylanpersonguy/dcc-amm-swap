/**
 * Positions handler — Trojan-style /positions command.
 * Shows all token holdings with balances, like Trojan's position manager.
 */

import { Bot, Context } from 'grammy';
import { getActiveWallet, getBalance, getAllBalances } from '../services/wallet';
import * as trading from '../services/trading';
import { getTradeHistory } from '../db';
import * as fmt from '../ui/format';
import * as kb from '../ui/keyboards';

export function registerPositionsHandlers(bot: Bot) {
  // /positions command
  bot.command('positions', async (ctx) => {
    await showPositions(ctx, false);
  });

  // Menu callback
  bot.callbackQuery('menu:positions', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showPositions(ctx, true);
  });
}

async function showPositions(ctx: Context, edit: boolean) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const wallet = getActiveWallet(userId);
  if (!wallet) {
    const msg = {
      parse_mode: 'HTML' as const,
      reply_markup: kb.backKeyboard('menu:home'),
    };
    const text = '❌ Create a wallet first to view positions.';
    if (edit && ctx.callbackQuery) {
      await ctx.editMessageText(text, msg).catch(() => {});
    } else {
      await ctx.reply(text, msg);
    }
    return;
  }

  const dccBalance = await getBalance(wallet.address);
  const allBalances = await getAllBalances(wallet.address);

  // Filter out DCC (native) — we only want token positions
  const tokenBalances = allBalances.filter((b) => b.assetId !== null && b.name !== 'DCC');

  // Get trade history for buy/sell counts
  const trades = getTradeHistory(userId, 100);

  // Build position data
  const positions: Array<{
    name: string;
    assetId: string;
    balance: bigint;
    decimals: number;
    dccValue?: string;
    buys?: number;
    sells?: number;
  }> = [];

  // Get pools to compute DCC values
  const pools = await trading.getPools().catch(() => [] as trading.PoolInfo[]);

  for (const bal of tokenBalances) {
    const assetId = bal.assetId!;

    // Count buys/sells for this token
    const buys = trades.filter(
      (t) => t.type === 'buy' && (t.assetOut === assetId || t.assetIn === assetId),
    ).length;
    const sells = trades.filter(
      (t) => t.type === 'sell' && (t.assetOut === assetId || t.assetIn === assetId),
    ).length;

    // Find pool to get DCC value
    const pool = pools.find((p) => p.token0 === assetId || p.token1 === assetId);
    let dccValue: string | undefined;
    if (pool) {
      const tokenSide = pool.token0 === assetId ? 'token0' : 'token1';
      // If token is token0, we need DCC-per-token = price0to1 (token1/token0 where token1=DCC)
      // If token is token1, we need DCC-per-token = price1to0 (token0/token1 where token0=DCC)
      const price = tokenSide === 'token0' ? pool.price0to1 : pool.price1to0;
      const priceNum = parseFloat(price);
      if (priceNum > 0) {
        const tokenAmount = Number(bal.balance) / 10 ** bal.decimals;
        const dccVal = tokenAmount * priceNum;
        dccValue = dccVal.toFixed(dccVal >= 1 ? 4 : 8);
      }
    }

    positions.push({
      name: bal.name,
      assetId,
      balance: bal.balance,
      decimals: bal.decimals,
      dccValue,
      buys,
      sells,
    });
  }

  const text = fmt.positionsMessage(
    wallet.address,
    wallet.label,
    dccBalance,
    positions,
  );

  // Build keyboard with trade buttons for each position
  const positionsList = positions.map((p) => ({
    assetId: p.assetId,
    name: p.name,
  }));

  const keyboard = kb.positionsKeyboard(positionsList);

  const msg = { parse_mode: 'HTML' as const, reply_markup: keyboard };
  if (edit && ctx.callbackQuery) {
    await ctx.editMessageText(text, msg).catch(() => {});
  } else {
    await ctx.reply(text, msg);
  }
}
