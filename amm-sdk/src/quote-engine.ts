/**
 * Quote engine — computes swap quotes, price impact, and slippage.
 *
 * Uses amm-core pure math functions to guarantee parity with on-chain logic.
 */

import {
  getAmountOut,
  getInitialLiquidity,
  getAddLiquidity,
  getRemoveLiquidity,
  getMinAmountOut,
  getPoolKey,
  quote as rawQuote,
  DCC_ASSET_ID,
} from '@dcc-amm/core';

import { PoolState, SwapQuote } from './types';

/**
 * Compute a swap quote for an exact-input swap.
 *
 * @param amountIn - Input amount in raw units
 * @param inputAssetId - Asset being sold
 * @param pool - Current pool state
 * @param slippageBps - Slippage tolerance in basis points
 * @returns Full quote including minAmountOut
 */
export function computeSwapQuote(
  amountIn: bigint,
  inputAssetId: string | null,
  pool: PoolState,
  slippageBps: bigint = 50n
): SwapQuote {
  const normalizedInput = inputAssetId || DCC_ASSET_ID;

  let reserveIn: bigint;
  let reserveOut: bigint;

  if (normalizedInput === pool.assetA) {
    reserveIn = pool.reserveA;
    reserveOut = pool.reserveB;
  } else if (normalizedInput === pool.assetB) {
    reserveIn = pool.reserveB;
    reserveOut = pool.reserveA;
  } else {
    throw new Error(`Asset ${normalizedInput} not in pool ${pool.poolKey}`);
  }

  const result = getAmountOut(amountIn, reserveIn, reserveOut, pool.feeBps);
  const minOut = getMinAmountOut(result.amountOut, slippageBps);

  return {
    amountIn,
    amountOut: result.amountOut,
    minAmountOut: minOut,
    priceImpactBps: result.priceImpactBps,
    feeAmount: result.feeAmount,
    route: `${normalizedInput} → ${normalizedInput === pool.assetA ? pool.assetB : pool.assetA}`,
    poolKey: pool.poolKey,
  };
}

/**
 * Compute a proportional quote for display: how much of B equals amountA at current ratio.
 */
export function computeProportionalQuote(
  amountA: bigint,
  pool: PoolState
): bigint {
  return rawQuote(amountA, pool.reserveA, pool.reserveB);
}

/**
 * Compute spot price (A in terms of B).
 * Returns as a floating-point number for display only.
 */
export function getSpotPrice(pool: PoolState): {
  priceAtoB: number;
  priceBtoA: number;
} {
  if (pool.reserveA === 0n || pool.reserveB === 0n) {
    return { priceAtoB: 0, priceBtoA: 0 };
  }
  const priceAtoB = Number(pool.reserveB) / Number(pool.reserveA);
  const priceBtoA = Number(pool.reserveA) / Number(pool.reserveB);
  return { priceAtoB, priceBtoA };
}

/**
 * Estimate LP tokens for initial pool creation.
 */
export function estimateInitialLp(amountA: bigint, amountB: bigint) {
  return getInitialLiquidity(amountA, amountB);
}

/**
 * Estimate LP tokens for adding liquidity.
 */
export function estimateAddLiquidity(
  amountA: bigint,
  amountB: bigint,
  pool: PoolState
) {
  return getAddLiquidity(
    amountA,
    amountB,
    pool.reserveA,
    pool.reserveB,
    pool.lpSupply
  );
}

/**
 * Estimate token amounts returned for removing liquidity.
 */
export function estimateRemoveLiquidity(lpBurn: bigint, pool: PoolState) {
  return getRemoveLiquidity(
    lpBurn,
    pool.reserveA,
    pool.reserveB,
    pool.lpSupply
  );
}

/**
 * Compute the pool key for a token pair.
 */
export { getPoolKey } from '@dcc-amm/core';
