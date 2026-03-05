/**
 * SDK type definitions for pool state, swap params, and transaction building.
 */

/** Raw pool state as read from the DecentralChain node */
export interface PoolState {
  poolKey: string;
  assetA: string;
  assetB: string;
  reserveA: bigint;
  reserveB: bigint;
  lpAssetId: string;
  lpSupply: bigint;
  feeBps: bigint;
  status: 'active' | 'paused';
  exists: boolean;
}

/** Summary for display */
export interface PoolInfo extends PoolState {
  priceAtoB: number;
  priceBtoA: number;
  tvlRaw: { a: bigint; b: bigint };
}

/** Quote result for a swap */
export interface SwapQuote {
  amountIn: bigint;
  amountOut: bigint;
  minAmountOut: bigint;
  priceImpactBps: bigint;
  feeAmount: bigint;
  route: string;
  poolKey: string;
}

/** Parameters for building a swap transaction */
export interface SwapParams {
  poolKey: string;
  inputAssetId: string | null;
  amountIn: bigint;
  minAmountOut: bigint;
  deadline: number;
}

/** Parameters for building an add-liquidity transaction */
export interface AddLiquidityParams {
  poolKey: string;
  assetA: string | null;
  assetB: string | null;
  amountA: bigint;
  amountB: bigint;
  minLpOut: bigint;
  deadline: number;
}

/** Parameters for building a remove-liquidity transaction */
export interface RemoveLiquidityParams {
  poolKey: string;
  lpAssetId: string;
  lpAmount: bigint;
  minAOut: bigint;
  minBOut: bigint;
  deadline: number;
}

/** Parameters for building a create-pool transaction */
export interface CreatePoolParams {
  assetA: string | null;
  assetB: string | null;
  amountA: bigint;
  amountB: bigint;
  feeBps: bigint;
}

/** SDK configuration */
export interface AmmSdkConfig {
  nodeUrl: string;
  dAppAddress: string;
  chainId: string;
}

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
