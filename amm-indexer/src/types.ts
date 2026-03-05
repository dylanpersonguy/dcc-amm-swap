/**
 * Indexer types — data models for indexed AMM state.
 */

export interface PoolSnapshot {
  poolKey: string;
  assetA: string;
  assetB: string;
  reserveA: string; // stringified bigint for JSON compat
  reserveB: string;
  lpSupply: string;
  feeBps: number;
  status: string;
  priceAtoB: number;
  priceBtoA: number;
  tvlA: string;
  tvlB: string;
  timestamp: number;
  blockHeight: number;
}

export interface SwapEvent {
  txId: string;
  poolKey: string;
  sender: string;
  inputAsset: string;
  outputAsset: string;
  amountIn: string;
  amountOut: string;
  feeBps: number;
  blockHeight: number;
  timestamp: number;
}

export interface LiquidityEvent {
  txId: string;
  poolKey: string;
  sender: string;
  type: 'add' | 'remove' | 'create';
  amountA: string;
  amountB: string;
  lpAmount: string;
  blockHeight: number;
  timestamp: number;
}

export interface PoolStats {
  poolKey: string;
  volume24h: string;
  volume7d: string;
  fees24h: string;
  fees7d: string;
  tvl: string;
  txCount24h: number;
  apy: number;
}

export interface IndexerConfig {
  nodeUrl: string;
  dAppAddress: string;
  pollIntervalMs: number;
  dataDir: string;
}
