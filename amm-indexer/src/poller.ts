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

      for (const pool of pools) {
        const reserveA = pool.reserveA;
        const reserveB = pool.reserveB;

        const priceAtoB =
          reserveA > 0n ? Number(reserveB) / Number(reserveA) : 0;
        const priceBtoA =
          reserveB > 0n ? Number(reserveA) / Number(reserveB) : 0;

        const snapshot: PoolSnapshot = {
          poolKey: pool.poolKey,
          assetA: pool.assetA,
          assetB: pool.assetB,
          reserveA: reserveA.toString(),
          reserveB: reserveB.toString(),
          lpSupply: pool.lpSupply.toString(),
          feeBps: Number(pool.feeBps),
          status: pool.status,
          priceAtoB,
          priceBtoA,
          tvlA: reserveA.toString(),
          tvlB: reserveB.toString(),
          timestamp: now,
          blockHeight: height,
        };

        this.store.updatePool(snapshot);
      }

      this.store.setLastBlockHeight(height);
      console.log(
        `[PoolPoller] Updated ${pools.length} pools at height ${height}`
      );
    } catch (err) {
      console.error('[PoolPoller] Poll error:', err);
    }
  }
}
