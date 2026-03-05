/**
 * App configuration — loaded from environment variables.
 */

export const config = {
  nodeUrl: import.meta.env.VITE_NODE_URL || 'https://nodes.decentralchain.io',
  dAppAddress: import.meta.env.VITE_AMM_DAPP_ADDRESS || '',
  chainId: import.meta.env.VITE_CHAIN_ID || 'D',
  explorerUrl: import.meta.env.VITE_EXPLORER_URL || 'https://explorer.decentralchain.io',
  indexerUrl: import.meta.env.VITE_INDEXER_URL || 'http://localhost:3001',

  defaults: {
    slippageBps: 50n,     // 0.5%
    deadlineBlocks: 20,   // ~80-100 seconds
    feeBps: 30n,          // 0.3% default pool fee
  },
};
