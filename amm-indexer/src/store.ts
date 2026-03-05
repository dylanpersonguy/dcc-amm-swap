/**
 * In-memory store for indexed AMM data.
 *
 * For v1, this is a simple in-memory store. A production indexer
 * would use SQLite or Postgres for persistence.
 */

import { PoolSnapshot, SwapEvent, LiquidityEvent, PoolStats } from './types';

export class IndexerStore {
  private pools: Map<string, PoolSnapshot> = new Map();
  private swaps: SwapEvent[] = [];
  private liquidityEvents: LiquidityEvent[] = [];
  private lastBlockHeight: number = 0;

  // ─── Pool Snapshots ──────────────────────────────────────────────

  updatePool(snapshot: PoolSnapshot): void {
    this.pools.set(snapshot.poolKey, snapshot);
  }

  getPool(poolKey: string): PoolSnapshot | undefined {
    return this.pools.get(poolKey);
  }

  getAllPools(): PoolSnapshot[] {
    return Array.from(this.pools.values());
  }

  // ─── Swap Events ─────────────────────────────────────────────────

  addSwap(event: SwapEvent): void {
    this.swaps.push(event);
  }

  getSwaps(poolKey?: string, limit: number = 50): SwapEvent[] {
    let filtered = poolKey
      ? this.swaps.filter((s) => s.poolKey === poolKey)
      : this.swaps;
    return filtered.slice(-limit).reverse();
  }

  getSwapsByAddress(address: string, limit: number = 50): SwapEvent[] {
    return this.swaps
      .filter((s) => s.sender === address)
      .slice(-limit)
      .reverse();
  }

  // ─── Liquidity Events ────────────────────────────────────────────

  addLiquidityEvent(event: LiquidityEvent): void {
    this.liquidityEvents.push(event);
  }

  getLiquidityEvents(poolKey?: string, limit: number = 50): LiquidityEvent[] {
    let filtered = poolKey
      ? this.liquidityEvents.filter((e) => e.poolKey === poolKey)
      : this.liquidityEvents;
    return filtered.slice(-limit).reverse();
  }

  // ─── Stats ───────────────────────────────────────────────────────

  getPoolStats(poolKey: string): PoolStats | null {
    const pool = this.pools.get(poolKey);
    if (!pool) return null;

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const swaps24h = this.swaps.filter(
      (s) => s.poolKey === poolKey && s.timestamp >= oneDayAgo
    );
    const swaps7d = this.swaps.filter(
      (s) => s.poolKey === poolKey && s.timestamp >= sevenDaysAgo
    );

    const volume24h = swaps24h.reduce(
      (sum, s) => sum + BigInt(s.amountIn),
      0n
    );
    const volume7d = swaps7d.reduce(
      (sum, s) => sum + BigInt(s.amountIn),
      0n
    );

    const fees24h = swaps24h.reduce((sum, s) => {
      const fee = (BigInt(s.amountIn) * BigInt(s.feeBps)) / 10000n;
      return sum + fee;
    }, 0n);
    const fees7d = swaps7d.reduce((sum, s) => {
      const fee = (BigInt(s.amountIn) * BigInt(s.feeBps)) / 10000n;
      return sum + fee;
    }, 0n);

    // Simple APY estimate: (fees24h / tvl) * 365
    const tvl = BigInt(pool.tvlA) + BigInt(pool.tvlB);
    const apy =
      tvl > 0n
        ? (Number(fees24h) / Number(tvl)) * 365 * 100
        : 0;

    return {
      poolKey,
      volume24h: volume24h.toString(),
      volume7d: volume7d.toString(),
      fees24h: fees24h.toString(),
      fees7d: fees7d.toString(),
      tvl: tvl.toString(),
      txCount24h: swaps24h.length,
      apy: Math.round(apy * 100) / 100,
    };
  }

  // ─── Block Height ────────────────────────────────────────────────

  getLastBlockHeight(): number {
    return this.lastBlockHeight;
  }

  setLastBlockHeight(height: number): void {
    this.lastBlockHeight = height;
  }
}
