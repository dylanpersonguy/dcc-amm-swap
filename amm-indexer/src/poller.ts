/**
 * Pool poller — periodically reads pool state from the node and updates the store.
 */

import { NodeClient } from '@dcc-amm/sdk';
import { IndexerStore } from './store';
import { PoolSnapshot, IndexerConfig } from './types';

export class PoolPoller {
  private readonly client: NodeClient;
  private readonly store: IndexerStore;
  private readonly config: IndexerConfig;
  private timer: NodeJS.Timeout | null = null;

  constructor(config: IndexerConfig, store: IndexerStore) {
    this.config = config;
    this.store = store;
    this.client = new NodeClient({
      nodeUrl: config.nodeUrl,
      dAppAddress: config.dAppAddress,
      chainId: '',
    });
  }

  /** Start polling */
  start(): void {
    console.log(
      `[PoolPoller] Starting with interval ${this.config.pollIntervalMs}ms`
    );
    this.poll(); // immediate first poll
    this.timer = setInterval(() => this.poll(), this.config.pollIntervalMs);
  }

  /** Stop polling */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[PoolPoller] Stopped');
  }

  /** Execute a single poll */
  private async poll(): Promise<void> {
    try {
      const pools = await this.client.listPools();
      const height = await this.client.getHeight();
      const now = Date.now();
      let updated = 0;

      for (const pool of pools) {
        try {
          const reserveA = pool.reserve0 ?? 0n;
          const reserveB = pool.reserve1 ?? 0n;
          const lpSupply = pool.lpSupply ?? 0n;
          const feeBps = pool.feeBps ?? 35n;

          const priceAtoB =
            reserveA > 0n ? Number(reserveB) / Number(reserveA) : 0;
          const priceBtoA =
            reserveB > 0n ? Number(reserveA) / Number(reserveB) : 0;

          const snapshot: PoolSnapshot = {
            poolKey: pool.poolId,
            assetA: pool.token0,
            assetB: pool.token1,
            reserveA: reserveA.toString(),
            reserveB: reserveB.toString(),
            lpSupply: lpSupply.toString(),
            feeBps: Number(feeBps),
            status: pool.exists ? 'active' : 'inactive',
            priceAtoB,
            priceBtoA,
            tvlA: reserveA.toString(),
            tvlB: reserveB.toString(),
            timestamp: now,
            blockHeight: height,
          };

          this.store.updatePool(snapshot);
          updated++;
        } catch (poolErr) {
          console.warn(
            `[PoolPoller] Skipping pool ${pool.poolId}:`,
            poolErr
          );
        }
      }

      this.store.setLastBlockHeight(height);
      console.log(
        `[PoolPoller] Updated ${updated}/${pools.length} pools at height ${height}`
      );
    } catch (err) {
      console.error('[PoolPoller] Poll error:', err);
    }
  }
}
