/**
 * Wallet handlers — create, import, export, switch, send, and delete.
 * Multi-step flows use a session map keyed by userId.
 */

import { Bot, Context } from 'grammy';
import {
  generateWallet,
  importWallet,
  getBalance,
  getAllBalances,
  getActiveWallet,
  getUserWallets,
  setActiveWallet,
  getWalletSeed,
} from '../services/wallet';
import { deleteWallet } from '../db';
import * as fmt from '../ui/format';
import * as kb from '../ui/keyboards';

// Session map for multi-step flows
interface WalletSession {
  step: 'awaiting_seed';
}
const sessions = new Map<number, WalletSession>();

export function getWalletSession(userId: number) {
  return sessions.get(userId);
}

export function registerWalletHandlers(bot: Bot) {
  /* ── Menu ──────────────────────────────────────── */

  bot.callbackQuery('menu:wallet', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showWalletMenu(ctx);
  });

  /* ── Create ────────────────────────────────────── */

  bot.callbackQuery('wallet:create', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from!.id;
    const wallet = generateWallet(userId);
    const wallets = getUserWallets(userId);
    const text =
      '✅ <b>Wallet Created!</b>\n\n' +
      `🏷️ <b>${wallet.label}</b>\n` +
      `📍 <code>${wallet.address}</code>\n\n` +
      '<i>⚠️ Export & save your seed phrase! It\'s the only backup.</i>';
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: kb.walletMenuKeyboard(wallets.length),
    }).catch(async () => {
      await ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: kb.walletMenuKeyboard(wallets.length),
      });
    });
  });

  /* ── Import — step 1 ──────────────────────────── */

  bot.callbackQuery(/^wallet:import/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from!.id;
    sessions.set(userId, { step: 'awaiting_seed' });
    await ctx.editMessageText(
      '🔒 <b>Import Wallet</b>\n\n' +
        'Send me your 15-word seed phrase.\n' +
        '<i>⚠️ The message will be deleted immediately for security.</i>',
      { parse_mode: 'HTML', reply_markup: kb.cancelKeyboard() },
    ).catch(() => {});
  });

  /* ── Export seed ───────────────────────────────── */

  bot.callbackQuery('wallet:export_seed', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      '⚠️ <b>Export Private Key</b>\n\n' +
        'Your seed phrase will be shown. <b>Never share it!</b>\n' +
        'Are you sure?',
      { parse_mode: 'HTML', reply_markup: kb.exportSeedConfirmKeyboard() },
    ).catch(() => {});
  });

  bot.callbackQuery('wallet:export_confirm', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from!.id;
    const active = getActiveWallet(userId);
    if (!active) {
      await ctx.editMessageText('❌ No active wallet.', {
        parse_mode: 'HTML',
        reply_markup: kb.walletMenuKeyboard(0),
      }).catch(() => {});
      return;
    }
    const seed = getWalletSeed(userId, active.id);
    if (!seed) {
      await ctx.editMessageText('❌ Could not decrypt wallet.', {
        parse_mode: 'HTML',
        reply_markup: kb.walletMenuKeyboard(1),
      }).catch(() => {});
      return;
    }
    // Send as a separate message so user can delete it
    await ctx.reply(
      `🔑 <b>Seed phrase for ${active.label}</b>\n\n` +
        `<code>${seed}</code>\n\n` +
        '<i>⚠️ Delete this message after saving. Never share your seed!</i>',
      { parse_mode: 'HTML' },
    );
  });

  /* ── Switch active wallet ──────────────────────── */

  bot.callbackQuery('wallet:switch', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from!.id;
    const wallets = getUserWallets(userId);
    if (wallets.length < 2) {
      await ctx.editMessageText('ℹ️ You only have one wallet.', {
        parse_mode: 'HTML',
        reply_markup: kb.walletMenuKeyboard(wallets.length),
      }).catch(() => {});
      return;
    }
    await ctx.editMessageText('👛 Select a wallet to activate:', {
      parse_mode: 'HTML',
      reply_markup: kb.walletSwitchKeyboard(wallets),
    }).catch(() => {});
  });

  bot.callbackQuery(/^wallet:activate:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: '✅ Switched!' });
    const walletId = parseInt(ctx.match![1], 10);
    const userId = ctx.from!.id;
    setActiveWallet(userId, walletId);
    await showWalletMenu(ctx);
  });

  /* ── Delete wallet ─────────────────────────────── */

  bot.callbackQuery('wallet:delete_confirm', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from!.id;
    const active = getActiveWallet(userId);
    if (!active) {
      await ctx.editMessageText('❌ No wallet to delete.', {
        parse_mode: 'HTML',
        reply_markup: kb.walletMenuKeyboard(0),
      }).catch(() => {});
      return;
    }
    await ctx.editMessageText(
      `⚠️ <b>Delete wallet "${active.label}"?</b>\n\n` +
        `<code>${active.address}</code>\n\n` +
        '<i>This cannot be undone. Make sure you export your seed first!</i>',
      { parse_mode: 'HTML', reply_markup: kb.deleteWalletConfirmKeyboard(active.id) },
    ).catch(() => {});
  });

  bot.callbackQuery(/^wallet:delete:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: '🗑 Deleted' });
    const walletId = parseInt(ctx.match![1], 10);
    const userId = ctx.from!.id;
    deleteWallet(userId, walletId);
    await showWalletMenu(ctx);
  });

  /* ── Balances ──────────────────────────────────── */

  bot.callbackQuery('wallet:balances', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showWalletMenu(ctx);
  });

  /* ── Copy address ──────────────────────────────── */

  bot.callbackQuery('wallet:copy_addr', async (ctx) => {
    const userId = ctx.from!.id;
    const active = getActiveWallet(userId);
    if (!active) {
      await ctx.answerCallbackQuery({ text: '❌ No wallet' });
      return;
    }
    await ctx.answerCallbackQuery();
    await ctx.reply(`📋 <code>${active.address}</code>`, { parse_mode: 'HTML' });
  });

  /* ── Send DCC ──────────────────────────────────── */

  bot.callbackQuery('wallet:send_start', async (ctx) => {
    await ctx.answerCallbackQuery({ text: '🚧 Coming soon!' });
  });

  /* ── Text messages for multi-step flows ────────── */

  bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from!.id;
    const session = sessions.get(userId);
    if (!session) return next();

    if (session.step === 'awaiting_seed') {
      // Immediately delete the seed message for security
      await ctx.deleteMessage().catch(() => {});
      sessions.delete(userId);

      const seedPhrase = ctx.message!.text!.trim();
      const words = seedPhrase.split(/\s+/);
      if (words.length < 12 || words.length > 20) {
        await ctx.reply(
          '❌ Invalid seed phrase. Expected 12-20 words.\nTry again from the wallet menu.',
          { parse_mode: 'HTML', reply_markup: kb.walletMenuKeyboard(getUserWallets(userId).length) },
        );
        return;
      }
      try {
        const wallet = importWallet(userId, seedPhrase);
        const wallets = getUserWallets(userId);
        await ctx.reply(
          '✅ <b>Wallet Imported!</b>\n\n' +
            `🏷️ <b>${wallet.label}</b>\n` +
            `📍 <code>${wallet.address}</code>`,
          { parse_mode: 'HTML', reply_markup: kb.walletMenuKeyboard(wallets.length) },
        );
      } catch (err: any) {
        await ctx.reply(`❌ ${err.message}`, {
          parse_mode: 'HTML',
          reply_markup: kb.walletMenuKeyboard(getUserWallets(userId).length),
        });
      }
      return;
    }

    return next();
  });
}

/* ── Helpers ──────────────────────────────────────── */

async function showWalletMenu(ctx: Context, edit = true) {
  const userId = ctx.from!.id;
  const active = getActiveWallet(userId);
  const allWallets = getUserWallets(userId);

  if (!active) {
    const text =
      '👛 <b>Wallet</b>\n\n' +
      'You don\'t have a wallet yet.\n' +
      'Create one or import an existing seed phrase.';
    const msg = {
      parse_mode: 'HTML' as const,
      reply_markup: kb.walletMenuKeyboard(0),
    };
    if (edit && ctx.callbackQuery) {
      await ctx.editMessageText(text, msg).catch(() => {});
    } else {
      await ctx.reply(text, msg);
    }
    return;
  }

  const balances = await getAllBalances(active.address);
  const text = fmt.walletDetailMessage(
    active.address,
    balances,
    active.isActive,
    active.label,
  );
  const msg = {
    parse_mode: 'HTML' as const,
    reply_markup: kb.walletMenuKeyboard(allWallets.length),
  };

  if (edit && ctx.callbackQuery) {
    await ctx.editMessageText(text, msg).catch(() => {});
  } else {
    await ctx.reply(text, msg);
  }
}
