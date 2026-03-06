/**
 * SDK type definitions for pool state, swap params, and transaction building.
 *
 * v2: Pool ID format is "p:<token0>:<token1>:<feeBps>".
 *     LP is state-tracked (no lpAssetId).
 */

// ── v2 Pool State ───────────────────────────────────────────────────

/** v2 pool state — matches Pool.ride v2 state schema */
export interface PoolStateV2 {
  /** Pool ID: "p:<token0>:<token1>:<feeBps>" */
  poolId: string;
  /** Canonical first token */
  token0: string;
  /** Canonical second token */
  token1: string;
  /** Reserve of token0 */
  reserve0: bigint;
  /** Reserve of token1 */
  reserve1: bigint;
  /** Total LP supply (state-tracked, not an on-chain asset) */
  lpSupply: bigint;
  /** Fee in basis points (1-1000) */
  feeBps: bigint;
  /** Last k = reserve0 x reserve1 */
  lastK: bigint;
  /** Pool creation timestamp */
  createdAt: number;
  /** Whether pool exists */
  exists: boolean;
  /** Analytics */
  swapCount: number;
  volume0: bigint;
  volume1: bigint;
  fees0: bigint;
  fees1: bigint;
}

// ── v2 Quote Result ─────────────────────────────────────────────────

/** Quote result for a v2 swap */
export interface SwapQuoteV2 {
  poolId: string;
  assetIn: string;
  assetOut: string;
  feeBps: number;
  amountIn: bigint;
  amountOut: bigint;
  minAmountOut: bigint;
  priceImpactBps: bigint;
  feeAmount: bigint;
  route: string;
}

// ── v2 Parameter Types ──────────────────────────────────────────────

/** v2 createPool: no payments, just metadata */
export interface CreatePoolParamsV2 {
  assetA: string;
  assetB: string;
  feeBps: number;
}

/** v2 addLiquidity: both tokens + slippage */
export interface AddLiquidityParamsV2 {
  assetA: string;
  assetB: string;
  feeBps: number;
  amountADesired: bigint;
  amountBDesired: bigint;
  amountAMin: bigint;
  amountBMin: bigint;
  deadline: number;
}

/** v2 removeLiquidity: state-based LP burn */
export interface RemoveLiquidityParamsV2 {
  assetA: string;
  assetB: string;
  feeBps: number;
  lpAmount: bigint;
  amountAMin: bigint;
  amountBMin: bigint;
  deadline: number;
}

/** v2 swapExactIn */
export interface SwapExactInParamsV2 {
  assetIn: string;
  assetOut: string;
  feeBps: number;
  amountIn: bigint;
  minAmountOut: bigint;
  deadline: number;
}

// ── SDK Configuration ───────────────────────────────────────────────

/** SDK configuration */
export interface AmmSdkConfig {
  nodeUrl: string;
  dAppAddress: string;
  chainId: string;
}

// ── Node API Types ──────────────────────────────────────────────────

/** DecentralChain data entry (from node API) */
export interface DataEntry {
  key: string;
  type: 'integer' | 'string' | 'boolean' | 'binary';
  value: number | string | boolean;
}

/** InvokeScript transaction structure */
export interface InvokeScriptTx {
  type: 16;
  dApp: string;
  call: {
    function: string;
    args: Array<{ type: string; value: string | number | boolean }>;
  };
  payment: Array<{
    assetId: string | null;
    amount: number;
  }>;
  fee: number;
  chainId: string;
}
