/**
 * Tests for PoolPoller.pollSwaps() — the nested tx-history extraction logic
 * added this session. `pollSwaps` is a private method, but TypeScript's
 * `private` is compile-time only; tests reach it via `(poller as any)` to
 * exercise it in isolation without also having to stub out `poll()`'s pool
 *-state reads (which go through the real `NodeClient`/on-chain reads this
 * suite must never touch). Fixtures below mirror the DecentralChain node's
 * GET /transactions/address/{address}/limit/{n} response shape: a
 * page-of-pages array whose first element is the tx list, where each
 * InvokeScriptTransaction (type 16) carries a nested
 * stateChanges.invokes[0] for the Router's inner call into Core.applySwap.
 */
import { PoolPoller } from '../poller';
import { IndexerStore } from '../store';
import { IndexerConfig } from '../types';

function makeConfig(overrides: Partial<IndexerConfig> = {}): IndexerConfig {
  return {
    nodeUrl: 'http://fake-node.test',
    dAppAddress: '3PDappAddress',
    routerAddress: '3PRouterAddress',
    pollIntervalMs: 999_999_999, // never fires again during a test
    dataDir: './data',
    ...overrides,
  };
}

/** A realistic swapExactIn tx as returned by the node's tx-history endpoint. */
function makeSwapTx(overrides: Record<string, any> = {}): any {
  return {
    id: 'txDefault',
    type: 16,
    sender: '3PSenderAddress',
    height: 4215700,
    timestamp: 1700000000000,
    applicationStatus: 'succeeded',
    call: {
      function: 'swapExactIn',
      args: [
        { type: 'string', value: 'DCC' }, // assetIn
        { type: 'string', value: '3PTokenB' }, // assetOut
        { type: 'integer', value: 30 }, // feeBps
        { type: 'integer', value: 100000000 }, // amountIn (requested)
        { type: 'integer', value: 95000000 }, // minAmountOut
        { type: 'integer', value: 1700000120000 }, // deadline
      ],
    },
    stateChanges: {
      invokes: [
        {
          call: {
            function: 'applySwap',
            args: [{ type: 'string', value: 'p:DCC:3PTokenB:30' }],
          },
          stateChanges: {
            transfers: [
              { address: '3PSenderAddress', asset: '3PTokenB', amount: 98123456 },
            ],
          },
        },
      ],
    },
    ...overrides,
  };
}

function mockFetchOnce(pages: any[][]) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => pages,
  });
}

describe('PoolPoller.pollSwaps', () => {
  let store: IndexerStore;
  let poller: PoolPoller;

  beforeEach(() => {
    store = new IndexerStore();
    poller = new PoolPoller(makeConfig(), store);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('extracts poolKey from the nested invoke call and amountOut from the real transfer (not the requested minAmountOut)', async () => {
    mockFetchOnce([[makeSwapTx({ id: 'tx1' })]]);

    await (poller as any).pollSwaps();

    const swaps = store.getSwaps();
    expect(swaps).toHaveLength(1);
    expect(swaps[0]).toEqual({
      txId: 'tx1',
      poolKey: 'p:DCC:3PTokenB:30',
      sender: '3PSenderAddress',
      inputAsset: 'DCC',
      outputAsset: '3PTokenB',
      amountIn: '100000000',
      amountOut: '98123456', // real transfer amount, distinct from minAmountOut (95000000)
      feeBps: 30,
      blockHeight: 4215700,
      timestamp: 1700000000000,
    });
  });

  it('requests the tx-history endpoint for the configured router address', async () => {
    mockFetchOnce([[]]);
    await (poller as any).pollSwaps();
    expect(global.fetch).toHaveBeenCalledWith(
      'http://fake-node.test/transactions/address/3PRouterAddress/limit/100'
    );
  });

  it('dedupes: a tx already seen on a prior poll is skipped on the next poll', async () => {
    mockFetchOnce([[makeSwapTx({ id: 'tx1' })]]);
    await (poller as any).pollSwaps();
    expect(store.getSwaps()).toHaveLength(1);

    // Second poll returns the same tx again (still within the scan window).
    mockFetchOnce([[makeSwapTx({ id: 'tx1' })]]);
    await (poller as any).pollSwaps();

    expect(store.getSwaps()).toHaveLength(1); // not double-added
  });

  it('processes a genuinely new tx on a later poll alongside an already-seen one', async () => {
    mockFetchOnce([[makeSwapTx({ id: 'tx1' })]]);
    await (poller as any).pollSwaps();

    mockFetchOnce([[makeSwapTx({ id: 'tx1' }), makeSwapTx({ id: 'tx2' })]]);
    await (poller as any).pollSwaps();

    const ids = store.getSwaps().map((s) => s.txId);
    expect(ids.sort()).toEqual(['tx1', 'tx2']);
  });

  it('ignores non-InvokeScript transactions (wrong type)', async () => {
    mockFetchOnce([[makeSwapTx({ id: 'tx-wrong-type', type: 4 })]]);
    await (poller as any).pollSwaps();
    expect(store.getSwaps()).toHaveLength(0);
  });

  it('ignores invokes for a different function than swapExactIn', async () => {
    mockFetchOnce([
      [makeSwapTx({ id: 'tx-add-liq', call: { function: 'addLiquidity', args: [] } })],
    ]);
    await (poller as any).pollSwaps();
    expect(store.getSwaps()).toHaveLength(0);
  });

  it('ignores transactions that did not succeed', async () => {
    mockFetchOnce([
      [makeSwapTx({ id: 'tx-failed', applicationStatus: 'script_execution_failed' })],
    ]);
    await (poller as any).pollSwaps();
    expect(store.getSwaps()).toHaveLength(0);
  });

  it('skips (without throwing) a succeeded swapExactIn tx missing the expected nested invoke shape', async () => {
    const malformed = makeSwapTx({ id: 'tx-malformed', stateChanges: {} });
    mockFetchOnce([[malformed]]);

    await expect((poller as any).pollSwaps()).resolves.toBeUndefined();
    expect(store.getSwaps()).toHaveLength(0);
  });

  it('skips a tx whose invoke call exists but has no transfer recorded', async () => {
    const malformed = makeSwapTx({
      id: 'tx-no-transfer',
      stateChanges: {
        invokes: [
          {
            call: { function: 'applySwap', args: [{ type: 'string', value: 'p:DCC:3PTokenB:30' }] },
            stateChanges: { transfers: [] },
          },
        ],
      },
    });
    mockFetchOnce([[malformed]]);
    await (poller as any).pollSwaps();
    expect(store.getSwaps()).toHaveLength(0);
  });

  it('processes multiple distinct swap txs in one poll', async () => {
    mockFetchOnce([
      [
        makeSwapTx({ id: 'tx-a', height: 100 }),
        makeSwapTx({ id: 'tx-b', height: 101 }),
        makeSwapTx({ id: 'tx-c', height: 102 }),
      ],
    ]);
    await (poller as any).pollSwaps();
    expect(store.getSwaps().map((s) => s.txId).sort()).toEqual(['tx-a', 'tx-b', 'tx-c']);
  });

  it('does nothing and never calls fetch when routerAddress is not configured', async () => {
    const p = new PoolPoller(makeConfig({ routerAddress: '' }), store);
    await (p as any).pollSwaps();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(store.getSwaps()).toHaveLength(0);
  });

  it('does nothing when the node responds with a non-OK status', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
    await (poller as any).pollSwaps();
    expect(store.getSwaps()).toHaveLength(0);
  });

  it('handles an empty tx-history response page gracefully', async () => {
    mockFetchOnce([[]]);
    await (poller as any).pollSwaps();
    expect(store.getSwaps()).toHaveLength(0);
  });

  it('handles a completely empty pages array (no first page at all)', async () => {
    mockFetchOnce([]);
    await (poller as any).pollSwaps();
    expect(store.getSwaps()).toHaveLength(0);
  });

  it('swallows a network/fetch failure without throwing', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect((poller as any).pollSwaps()).resolves.toBeUndefined();
    expect(store.getSwaps()).toHaveLength(0);
  });
});
