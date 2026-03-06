/**
 * App configuration — loaded from environment variables.
 */

export const config = {
  nodeUrl: import.meta.env.VITE_NODE_URL || 'https://mainnet-node.decentralchain.io',
  dAppAddress: import.meta.env.VITE_AMM_DAPP_ADDRESS || '3Da7xwRRtXfkA46jaKTYb75Usd2ZNWdY6HX',
  chainId: import.meta.env.VITE_CHAIN_ID || '?',
  explorerUrl: import.meta.env.VITE_EXPLORER_URL || 'https://explorer.decentralchain.io',

  defaults: {
    slippageBps: 50n,     // 0.5%
    deadlineMs: 120_000,  // 2 minutes
    feeBps: 30,           // 0.3% default pool fee
  },
};
