/**
 * App configuration — loaded from environment variables.
 */

export const config = {
  nodeUrl: import.meta.env.VITE_NODE_URL || 'https://mainnet-node.decentralchain.io',
  dAppAddress: import.meta.env.VITE_AMM_DAPP_ADDRESS || '3Dfh97WETii2jqHUZfw6AGsn3dLkAmvfiFm',
  routerAddress: import.meta.env.VITE_AMM_ROUTER_ADDRESS || '3DfCh3DHDRNpVC25N6vGxpMcFDrgAui6F5n',
  trackerAddress: import.meta.env.VITE_ELIGIBILITY_TRACKER_ADDRESS || '3DWDW21LtCn1BnDos6yZNrxtiGWL9zPEkHv',
  chainId: import.meta.env.VITE_CHAIN_ID || '?',
  explorerUrl: import.meta.env.VITE_EXPLORER_URL || 'https://explorer.decentralchain.io',
  indexerUrl: import.meta.env.VITE_INDEXER_URL || 'http://localhost:3001',

  defaults: {
    slippageBps: 50n,     // 0.5%
    deadlineMs: 120_000,  // 2 minutes
    feeBps: 35,           // 0.35% default pool fee
  },

  /** Pool IDs that have been officially verified */
  verifiedPools: new Set([
    'p:DCC:8MFwa1h8Y6SBc6B3BJwYfC4Fe13EFx5ifkAziXAZRVvc:35',
  ]),
};
