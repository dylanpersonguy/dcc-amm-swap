/**
 * Bot configuration — environment variables with sensible defaults.
 */

import path from 'path';
import { libs } from '@decentralchain/transactions';

const PKG_ROOT = path.resolve(__dirname, '..');

export const config = {
  /** Telegram Bot API token (from @BotFather) */
  botToken: process.env.BOT_TOKEN || '',

  /** DCC mainnet node */
  nodeUrl: process.env.NODE_URL || 'https://mainnet-node.decentralchain.io',

  /** AMM dApp address */
  dAppAddress: process.env.DAPP_ADDRESS || '3Da7xwRRtXfkA46jaKTYb75Usd2ZNWdY6HX',

  /** DCC chain ID */
  chainId: process.env.CHAIN_ID || '?',

  /** Explorer base URL */
  explorerUrl: process.env.EXPLORER_URL || 'https://explorer.decentralchain.io',

  /** SQLite database path */
  dbPath: process.env.DB_PATH
    ? path.resolve(PKG_ROOT, process.env.DB_PATH)
    : path.resolve(PKG_ROOT, 'data', 'bot.db'),

  /** Default slippage in bps (0.5%) */
  defaultSlippageBps: 50,

  /** Default fee tier in bps (0.35%) */
  defaultFeeBps: 35,

  /** Transaction deadline in ms (2 min) */
  deadlineMs: 120_000,

  /** Invoke fee for smart dApp calls */
  invokeFee: 900000,

  /** DCC decimals */
  dccDecimals: 8,

  /** Admin wallet seed (receives 1% trade fees, pays out referral claims) */
  adminSeed: process.env.ADMIN_SEED || '',

  /** Transfer fee (0.005 DCC = 500000 wavelets — smart account requires 400000 extra) */
  transferFee: 500000,

  /** Bot branding */
  botName: 'DCC Swap Bot',
  botEmoji: '⚡',
};

/** Admin address — derived from admin seed at startup */
export const adminAddress: string = config.adminSeed
  ? libs.crypto.address(config.adminSeed, config.chainId)
  : '';
