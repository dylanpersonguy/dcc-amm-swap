/**
 * Bridge configuration — environment variables.
 */

import path from 'path';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),

  // Solana
  solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  solanaAdminSeed: process.env.SOLANA_ADMIN_SEED || '',

  // DCC
  dccNodeUrl: process.env.DCC_NODE_URL || 'https://mainnet-node.decentralchain.io',
  dccChainId: process.env.DCC_CHAIN_ID || '?',
  dccAdminSeed: process.env.DCC_ADMIN_SEED || '',

  // Pricing
  dccPriceUsd: parseFloat(process.env.DCC_PRICE_USD || '0.05'),

  // Fees
  bridgeFeePct: parseFloat(process.env.BRIDGE_FEE_PCT || '1.0'),

  // Admin
  adminApiKey: process.env.ADMIN_API_KEY || '',

  // Database
  dbPath: process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.resolve(__dirname, '..', 'data', 'bridge.db'),

  // Deposit expiry (30 minutes)
  depositExpiryMs: 30 * 60 * 1000,

  // DCC transfer fee (500000 = smart account minimum: 100000 base + 400000 extra)
  dccTransferFee: 500000,
};
