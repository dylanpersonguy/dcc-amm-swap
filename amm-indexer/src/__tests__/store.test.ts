import { IndexerStore } from '../store';
import { SwapEvent, LiquidityEvent, PoolSnapshot } from '../types';

function makeSwap(overrides: Partial<SwapEvent> = {}): SwapEvent {
  return {
    txId: 'tx-default',
    poolKey: 'pool1',
    sender: 'addr1',
    inputAsset: 'DCC',
    outputAsset: 'TOKEN',
    amountIn: '1000',
    amountOut: '990',
    feeBps: 30,
    blockHeight: 1,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeLiquidityEvent(overrides: Partial<LiquidityEvent> = {}): LiquidityEvent {
  return {
    txId: 'tx-lp-default',
    poolKey: 'pool1',
    sender: 'addr1',
    type: 'add',
    amountA: '1000',
    amountB: '2000',
    lpAmount: '500',
    blockHeight: 1,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makePool(overrides: Partial<PoolSnapshot> = {}): PoolSnapshot {
  return {
    poolKey: 'pool1',
    assetA: 'DCC',
    assetB: 'TOKEN',
    reserveA: '1000000',
    reserveB: '2000000',
    lpSupply: '500',
    feeBps: 30,
    status: 'active',
    priceAtoB: 2,
    priceBtoA: 0.5,
    tvlA: '500000',
    tvlB: '500000',
    timestamp: Date.now(),
    blockHeight: 1,
    ...overrides,
  };
}

describe('IndexerStore — pool snapshots', () => {
  it('returns undefined for an unknown pool', () => {
    const store = new IndexerStore();
    expect(store.getPool('nope')).toBeUndefined();
  });

  it('stores and retrieves a pool by key', () => {
    const store = new IndexerStore();
    const pool = makePool();
    store.updatePool(pool);
    expect(store.getPool('pool1')).toEqual(pool);
  });

  it('overwrites the previous snapshot for the same poolKey', () => {
    const store = new IndexerStore();
    store.updatePool(makePool({ reserveA: '100' }));
    store.updatePool(makePool({ reserveA: '999' }));
    expect(store.getAllPools()).toHaveLength(1);
    expect(store.getPool('pool1')?.reserveA).toBe('999');
  });

  it('lists all pools across distinct keys', () => {
    const store = new IndexerStore();
    store.updatePool(makePool({ poolKey: 'poolA' }));
    store.updatePool(makePool({ poolKey: 'poolB' }));
    expect(store.getAllPools().map((p) => p.poolKey).sort()).toEqual(['poolA', 'poolB']);
  });

  it('tracks last indexed block height', () => {
    const store = new IndexerStore();
    expect(store.getLastBlockHeight()).toBe(0);
    store.setLastBlockHeight(4215678);
    expect(store.getLastBlockHeight()).toBe(4215678);
  });
});

describe('IndexerStore — swaps', () => {
  it('returns an empty array when no swaps recorded', () => {
    const store = new IndexerStore();
    expect(store.getSwaps()).toEqual([]);
  });

  it('returns swaps newest-first', () => {
    const store = new IndexerStore();
    store.addSwap(makeSwap({ txId: 'a' }));
    store.addSwap(makeSwap({ txId: 'b' }));
    store.addSwap(makeSwap({ txId: 'c' }));
    expect(store.getSwaps().map((s) => s.txId)).toEqual(['c', 'b', 'a']);
  });

  it('applies the default limit of 50', () => {
    const store = new IndexerStore();
    for (let i = 0; i < 60; i++) {
      store.addSwap(makeSwap({ txId: `tx-${i}` }));
    }
    expect(store.getSwaps()).toHaveLength(50);
    // Newest-first: the most recently added (tx-59) should be first.
    expect(store.getSwaps()[0].txId).toBe('tx-59');
    // And the limit should have dropped the oldest ones (tx-0..tx-9).
    expect(store.getSwaps().map((s) => s.txId)).not.toContain('tx-0');
  });

  it('honors a custom limit, returning the N most recent, newest-first', () => {
    const store = new IndexerStore();
    for (let i = 0; i < 10; i++) {
      store.addSwap(makeSwap({ txId: `tx-${i}` }));
    }
    expect(store.getSwaps(undefined, 3).map((s) => s.txId)).toEqual(['tx-9', 'tx-8', 'tx-7']);
  });

  it('filters by poolKey', () => {
    const store = new IndexerStore();
    store.addSwap(makeSwap({ txId: 'a', poolKey: 'poolA' }));
    store.addSwap(makeSwap({ txId: 'b', poolKey: 'poolB' }));
    store.addSwap(makeSwap({ txId: 'c', poolKey: 'poolA' }));
    expect(store.getSwaps('poolA').map((s) => s.txId)).toEqual(['c', 'a']);
    expect(store.getSwaps('poolB').map((s) => s.txId)).toEqual(['b']);
    expect(store.getSwaps('nonexistent-pool')).toEqual([]);
  });

  it('combines poolKey filtering with limit', () => {
    const store = new IndexerStore();
    for (let i = 0; i < 5; i++) {
      store.addSwap(makeSwap({ txId: `p-${i}`, poolKey: 'poolA' }));
    }
    store.addSwap(makeSwap({ txId: 'other', poolKey: 'poolB' }));
    expect(store.getSwaps('poolA', 2).map((s) => s.txId)).toEqual(['p-4', 'p-3']);
  });

  it('filters swaps by sender address via getSwapsByAddress', () => {
    const store = new IndexerStore();
    store.addSwap(makeSwap({ txId: 'a', sender: 'addrX' }));
    store.addSwap(makeSwap({ txId: 'b', sender: 'addrY' }));
    store.addSwap(makeSwap({ txId: 'c', sender: 'addrX' }));
    expect(store.getSwapsByAddress('addrX').map((s) => s.txId)).toEqual(['c', 'a']);
    expect(store.getSwapsByAddress('addrY').map((s) => s.txId)).toEqual(['b']);
    expect(store.getSwapsByAddress('unknown-addr')).toEqual([]);
  });

  it('honors limit in getSwapsByAddress', () => {
    const store = new IndexerStore();
    for (let i = 0; i < 5; i++) {
      store.addSwap(makeSwap({ txId: `a-${i}`, sender: 'addrX' }));
    }
    expect(store.getSwapsByAddress('addrX', 2).map((s) => s.txId)).toEqual(['a-4', 'a-3']);
  });
});

describe('IndexerStore — liquidity events', () => {
  it('returns an empty array when none recorded', () => {
    const store = new IndexerStore();
    expect(store.getLiquidityEvents()).toEqual([]);
  });

  it('returns liquidity events newest-first with default limit', () => {
    const store = new IndexerStore();
    store.addLiquidityEvent(makeLiquidityEvent({ txId: 'a' }));
    store.addLiquidityEvent(makeLiquidityEvent({ txId: 'b' }));
    expect(store.getLiquidityEvents().map((e) => e.txId)).toEqual(['b', 'a']);
  });

  it('filters liquidity events by poolKey', () => {
    const store = new IndexerStore();
    store.addLiquidityEvent(makeLiquidityEvent({ txId: 'a', poolKey: 'poolA', type: 'add' }));
    store.addLiquidityEvent(makeLiquidityEvent({ txId: 'b', poolKey: 'poolB', type: 'remove' }));
    expect(store.getLiquidityEvents('poolA').map((e) => e.txId)).toEqual(['a']);
  });

  it('honors limit for liquidity events', () => {
    const store = new IndexerStore();
    for (let i = 0; i < 5; i++) {
      store.addLiquidityEvent(makeLiquidityEvent({ txId: `e-${i}` }));
    }
    expect(store.getLiquidityEvents(undefined, 2).map((e) => e.txId)).toEqual(['e-4', 'e-3']);
  });
});

describe('IndexerStore — pool stats', () => {
  it('returns null for an unknown pool', () => {
    const store = new IndexerStore();
    expect(store.getPoolStats('nope')).toBeNull();
  });

  it('computes 24h/7d volume, fees, tvl, txCount, and apy, excluding stale swaps', () => {
    const store = new IndexerStore();
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    store.updatePool(
      makePool({ poolKey: 'p1', tvlA: '500000', tvlB: '500000' }) // tvl = 1,000,000
    );

    // Within the last 24h AND within 7d.
    store.addSwap(
      makeSwap({ txId: 'recent', poolKey: 'p1', amountIn: '100000', feeBps: 100, timestamp: now })
    );
    // Older than 24h but within 7d.
    store.addSwap(
      makeSwap({
        txId: 'mid',
        poolKey: 'p1',
        amountIn: '200000',
        feeBps: 100,
        timestamp: now - 2 * DAY,
      })
    );
    // Older than 7d — excluded from both windows.
    store.addSwap(
      makeSwap({
        txId: 'stale',
        poolKey: 'p1',
        amountIn: '300000',
        feeBps: 100,
        timestamp: now - 10 * DAY,
      })
    );
    // Swap on a different pool — must not leak into p1's stats.
    store.addSwap(
      makeSwap({ txId: 'other-pool', poolKey: 'p2', amountIn: '999999', feeBps: 100, timestamp: now })
    );

    const stats = store.getPoolStats('p1');
    expect(stats).not.toBeNull();
    expect(stats!.poolKey).toBe('p1');
    expect(stats!.volume24h).toBe('100000'); // only 'recent'
    expect(stats!.volume7d).toBe('300000'); // 'recent' + 'mid'
    expect(stats!.fees24h).toBe('1000'); // 100000 * 100/10000
    expect(stats!.fees7d).toBe('3000'); // (100000+200000) * 100/10000
    expect(stats!.tvl).toBe('1000000');
    expect(stats!.txCount24h).toBe(1);
    expect(stats!.apy).toBe(36.5); // (1000/1000000)*365*100, rounded to 2dp
  });

  it('returns zero volume/fees/apy for a pool with no swaps', () => {
    const store = new IndexerStore();
    store.updatePool(makePool({ poolKey: 'empty-pool', tvlA: '1000', tvlB: '1000' }));
    const stats = store.getPoolStats('empty-pool');
    expect(stats).toMatchObject({
      volume24h: '0',
      volume7d: '0',
      fees24h: '0',
      fees7d: '0',
      txCount24h: 0,
      apy: 0,
    });
  });

  it('returns apy 0 when tvl is zero (avoids division by zero)', () => {
    const store = new IndexerStore();
    store.updatePool(makePool({ poolKey: 'zero-tvl', tvlA: '0', tvlB: '0' }));
    store.addSwap(makeSwap({ poolKey: 'zero-tvl', amountIn: '100', feeBps: 100, timestamp: Date.now() }));
    const stats = store.getPoolStats('zero-tvl');
    expect(stats!.apy).toBe(0);
  });
});
