/**
 * DCC AMM SDK — Main entry point.
 *
 * Combines node client, quote engine, and transaction builder into
 * a unified, ergonomic API for interacting with the AMM protocol.
 */

import { NodeClient } from './node-client';
import { TxBuilder } from './tx-builder';
import {
  computeSwapQuote,
  computeProportionalQuote,
  getSpotPrice,
  estimateInitialLp,
  estimateAddLiquidity,
  estimateRemoveLiquidity,
} from './quote-engine';
import { toRawAmount, fromRawAmount, formatAmount } from './amounts';
import {
  AmmSdkConfig,
  PoolState,
  SwapQuote,
  InvokeScriptTx,
} from './types';
import {
  getPoolKey,
  getMinAmountOut,
  DCC_ASSET_ID,
} from '@dcc-amm/core';

export class AmmSdk {
  public readonly node: NodeClient;
  public readonly tx: TxBuilder;
  public readonly config: AmmSdkConfig;

  constructor(config: AmmSdkConfig) {
    this.config = config;
    this.node = new NodeClient(config);
    this.tx = new TxBuilder(config);
  }

  // ─── Pool Discovery ──────────────────────────────────────────────

  /** Get pool state by pool key */
  async getPool(poolKey: string): Promise<PoolState | null> {
    return this.node.getPoolState(poolKey);
  }

  /** Get pool state by token pair (auto-derives pool key) */
  async getPoolByPair(
    assetA: string | null,
    assetB: string | null
  ): Promise<PoolState | null> {
    const poolKey = getPoolKey(assetA, assetB);
    return this.node.getPoolState(poolKey);
  }

  /** List all pools */
  async listPools(): Promise<PoolState[]> {
    return this.node.listPools();
  }

  /** Get pool count */
  async getPoolCount(): Promise<number> {
    return this.node.getPoolCount();
  }

  // ─── Quoting ─────────────────────────────────────────────────────

  /** Compute a swap quote */
  async quoteSwap(
    amountIn: bigint,
    inputAssetId: string | null,
    outputAssetId: string | null,
    slippageBps: bigint = 50n
  ): Promise<SwapQuote> {
    const poolKey = getPoolKey(inputAssetId, outputAssetId);
    const pool = await this.node.getPoolState(poolKey);
    if (!pool) throw new Error(`No pool found for ${inputAssetId}/${outputAssetId}`);
    if (pool.status !== 'active') throw new Error('Pool is not active');

    return computeSwapQuote(amountIn, inputAssetId, pool, slippageBps);
  }

  /** Get spot price for a pool */
  async getSpotPrice(poolKey: string) {
    const pool = await this.node.getPoolState(poolKey);
    if (!pool) throw new Error(`Pool not found: ${poolKey}`);
    return getSpotPrice(pool);
  }

  // ─── Transaction Building ────────────────────────────────────────

  /** Build a swap transaction */
  async buildSwap(
    amountIn: bigint,
    inputAssetId: string | null,
    outputAssetId: string | null,
    slippageBps: bigint = 50n,
    deadlineBlocks: number = 20
  ): Promise<{ tx: InvokeScriptTx; quote: SwapQuote }> {
    const quote = await this.quoteSwap(
      amountIn,
      inputAssetId,
      outputAssetId,
      slippageBps
    );

    const height = await this.node.getHeight();
    const deadline = height + deadlineBlocks;

    const tx = this.tx.buildSwapExactIn({
      poolKey: quote.poolKey,
      inputAssetId: inputAssetId ?? DCC_ASSET_ID,
      amountIn,
      minAmountOut: quote.minAmountOut,
      deadline,
    });

    return { tx, quote };
  }

  /** Build an add-liquidity transaction */
  async buildAddLiquidity(
    assetA: string | null,
    assetB: string | null,
    amountA: bigint,
    amountB: bigint,
    slippageBps: bigint = 50n,
    deadlineBlocks: number = 20
  ) {
    const poolKey = getPoolKey(assetA, assetB);
    const pool = await this.node.getPoolState(poolKey);
    if (!pool) throw new Error(`Pool not found: ${poolKey}`);

    const estimate = estimateAddLiquidity(amountA, amountB, pool);
    const minLpOut = getMinAmountOut(estimate.lpMinted, slippageBps);

    const height = await this.node.getHeight();
    const deadline = height + deadlineBlocks;

    const tx = this.tx.buildAddLiquidity({
      poolKey,
      assetA,
      assetB,
      amountA,
      amountB,
      minLpOut,
      deadline,
    });

    return { tx, estimate };
  }

  /** Build a remove-liquidity transaction */
  async buildRemoveLiquidity(
    poolKey: string,
    lpAmount: bigint,
    slippageBps: bigint = 50n,
    deadlineBlocks: number = 20
  ) {
    const pool = await this.node.getPoolState(poolKey);
    if (!pool) throw new Error(`Pool not found: ${poolKey}`);

    const estimate = estimateRemoveLiquidity(lpAmount, pool);
    const minAOut = getMinAmountOut(estimate.amountA, slippageBps);
    const minBOut = getMinAmountOut(estimate.amountB, slippageBps);

    const height = await this.node.getHeight();
    const deadline = height + deadlineBlocks;

    const tx = this.tx.buildRemoveLiquidity({
      poolKey,
      lpAssetId: pool.lpAssetId,
      lpAmount,
      minAOut,
      minBOut,
      deadline,
    });

    return { tx, estimate };
  }

  /** Build a create-pool transaction */
  buildCreatePool(
    assetA: string | null,
    assetB: string | null,
    amountA: bigint,
    amountB: bigint,
    feeBps: bigint = 30n
  ) {
    const estimate = estimateInitialLp(amountA, amountB);

    const tx = this.tx.buildCreatePool({
      assetA,
      assetB,
      amountA,
      amountB,
      feeBps,
    });

    return { tx, estimate };
  }

  // ─── Utilities ───────────────────────────────────────────────────

  /** Get balance of an asset for an address */
  async getBalance(address: string, assetId: string | null): Promise<bigint> {
    return this.node.getBalance(address, assetId);
  }

  /** Check if protocol is paused */
  async isPaused(): Promise<boolean> {
    return this.node.isPaused();
  }

  /** Get current block height */
  async getHeight(): Promise<number> {
    return this.node.getHeight();
  }

  // ─── Amount Helpers ──────────────────────────────────────────────

  toRawAmount = toRawAmount;
  fromRawAmount = fromRawAmount;
  formatAmount = formatAmount;
}
