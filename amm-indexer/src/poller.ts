/**
 * Pool poller — periodically reads pool state from the node and updates the store.
 * Also scans recent Router transactions for swapExactIn calls, since pool state
 * alone carries no history of individual swaps.
 */

import { NodeClient } from '@dcc-amm/sdk';
import { IndexerStore } from './store';
import { PoolSnapshot, SwapEvent, IndexerConfig } from './types';

const SWAP_SCAN_LIMIT = 100;

export class PoolPoller {
  private readonly client: NodeClient;
  private readonly store: IndexerStore;
  private readonly config: IndexerConfig;
  private readonly seenSwapTxIds = new Set<string>();
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

      await this.pollSwaps();
    } catch (err) {
      console.error('[PoolPoller] Poll error:', err);
    }
  }

  /**
   * Pool state alone has no record of individual swaps, so scan the Router's
   * recent transactions directly. stateChanges.invokes[0] (the nested call to
   * Core.applySwap) carries the authoritative pool id and the resulting real
   * transfer, so we read from there rather than re-deriving from swapExactIn's
   * own input args.
   */
  private async pollSwaps(): Promise<void> {
    if (!this.config.routerAddress) return;
    try {
      const res = await fetch(
        `${this.config.nodeUrl}/transactions/address/${this.config.routerAddress}/limit/${SWAP_SCAN_LIMIT}`
      );
      if (!res.ok) return;
      const pages = (await res.json()) as any[][];
      const txs = pages[0] ?? [];

      for (const tx of txs) {
        if (
          tx.type !== 16 ||
          tx.call?.function !== 'swapExactIn' ||
          tx.applicationStatus !== 'succeeded' ||
          this.seenSwapTxIds.has(tx.id)
        ) {
          continue;
        }

        const applySwapCall = tx.stateChanges?.invokes?.[0]?.call;
        const transfer = tx.stateChanges?.invokes?.[0]?.stateChanges?.transfers?.[0];
        if (!applySwapCall || !transfer) {
          // Doesn't match the expected shape (e.g. a pre-upgrade tx) — skip rather than guess.
          this.seenSwapTxIds.add(tx.id);
          continue;
        }

        const poolKey = applySwapCall.args?.[0]?.value;
        const [assetIn, assetOut, , amountIn] = tx.call.args.map((a: any) => a.value);

        const event: SwapEvent = {
          txId: tx.id,
          poolKey,
          sender: tx.sender,
          inputAsset: assetIn,
          outputAsset: assetOut,
          amountIn: String(amountIn),
          amountOut: String(transfer.amount),
          feeBps: Number(tx.call.args[2].value),
          blockHeight: tx.height,
          timestamp: tx.timestamp,
        };
        this.store.addSwap(event);
        this.seenSwapTxIds.add(tx.id);
      }
    } catch (err) {
      console.error('[PoolPoller] Swap scan error:', err);
    }
  }
}
