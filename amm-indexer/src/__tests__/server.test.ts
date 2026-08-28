/**
 * Integration tests for the raw-http route dispatch/validation layer in
 * server.ts. `@dcc-amm/sdk` (both `AmmSdk`, used by route handlers, and
 * `NodeClient`, used internally by `PoolPoller`) is fully mocked so this
 * suite never performs a real on-chain read or network call. The server is
 * exercised through real HTTP requests against an ephemeral localhost port
 * (Node's own `http` client — not `fetch`, so behavior doesn't depend on
 * whether the Jest environment happens to expose a global fetch).
 *
 * Focus: bad input -> the correct 400 (or 404) with the right error message;
 * good input -> the underlying AmmSdk method is called with the exact,
 * correctly-parsed arguments the route promises in its JSDoc.
 */
import * as http from 'http';
import type { AddressInfo } from 'net';
import { startServer } from '../server';
import { IndexerStore } from '../store';
import { PoolPoller } from '../poller';
import { IndexerConfig } from '../types';
import { AmmSdk } from '@dcc-amm/sdk';

jest.mock('@dcc-amm/sdk', () => {
  const AmmSdkMock = jest.fn().mockImplementation(() => ({
    node: { getAssetInfo: jest.fn() },
    quoteSwap: jest.fn(),
    buildSwap: jest.fn(),
    buildAddLiquidity: jest.fn(),
    buildRemoveLiquidity: jest.fn(),
    buildCreatePool: jest.fn(),
    listPools: jest.fn().mockResolvedValue([]),
    getBalance: jest.fn(),
    getLpBalance: jest.fn(),
    isPaused: jest.fn().mockResolvedValue(false),
    getHeight: jest.fn().mockResolvedValue(0),
    getPoolCount: jest.fn().mockResolvedValue(0),
  }));
  // PoolPoller also imports NodeClient from this module — mock it too so
  // starting the server's poller never triggers a real fetch to a node.
  const NodeClientMock = jest.fn().mockImplementation(() => ({
    listPools: jest.fn().mockResolvedValue([]),
    getHeight: jest.fn().mockResolvedValue(0),
  }));
  return { AmmSdk: AmmSdkMock, NodeClient: NodeClientMock };
});

function qs(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

interface RawResponse {
  status: number;
  body: any;
  headers: http.IncomingHttpHeaders;
}

// startServer's route handler closes over the literal port argument it was
// given (used verbatim in getSwaggerSpec's `servers[0].url`), rather than
// the OS-assigned port from an ephemeral (0) listen — so this suite binds
// to a fixed, hopefully-free port instead of relying on OS assignment.
const TEST_PORT = 34599;
let port: number;

/** Send a request using Node's own http client — not fetch — so this
 * suite doesn't depend on the Jest environment happening to expose one. */
function req(
  method: string,
  path: string,
  opts: { body?: unknown; rawBody?: string } = {}
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const data = opts.rawBody !== undefined ? opts.rawBody : opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
    const request = http.request(
      {
        hostname: 'localhost',
        port,
        path,
        method,
        headers: data !== undefined
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
          : undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed: any = text;
          try {
            parsed = text ? JSON.parse(text) : undefined;
          } catch {
            // Non-JSON body (e.g. the /docs HTML page) — return as raw text.
          }
          resolve({ status: res.statusCode || 0, body: parsed, headers: res.headers });
        });
      }
    );
    request.on('error', reject);
    if (data !== undefined) request.write(data);
    request.end();
  });
}

describe('server routes', () => {
  let server: http.Server;
  let poller: PoolPoller;
  let store: IndexerStore;
  let sdkInstance: {
    node: { getAssetInfo: jest.Mock };
    quoteSwap: jest.Mock;
    buildSwap: jest.Mock;
    buildAddLiquidity: jest.Mock;
    buildRemoveLiquidity: jest.Mock;
    buildCreatePool: jest.Mock;
    listPools: jest.Mock;
    getBalance: jest.Mock;
    getLpBalance: jest.Mock;
    isPaused: jest.Mock;
    getHeight: jest.Mock;
    getPoolCount: jest.Mock;
  };

  const config: IndexerConfig = {
    nodeUrl: 'http://fake-node.test',
    dAppAddress: '3PDappAddress',
    // Empty routerAddress makes PoolPoller.pollSwaps() a no-op (it bails
    // before touching the network), so the poller started by startServer()
    // never performs any real I/O during this suite.
    routerAddress: '',
    pollIntervalMs: 999_999_999,
    dataDir: './data',
  };

  beforeAll(async () => {
    const result = startServer(config, TEST_PORT);
    server = result.server;
    poller = result.poller;
    store = result.store;
    await new Promise<void>((resolve) => server.once('listening', resolve));
    port = (server.address() as AddressInfo).port;
    expect(port).toBe(TEST_PORT);
    sdkInstance = (AmmSdk as unknown as jest.Mock).mock.results[0].value;
  });

  afterAll(async () => {
    poller.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Health / misc ──────────────────────────────────────────────

  it('GET /health returns indexer status', async () => {
    const res = await req('GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', lastBlockHeight: 0, poolCount: 0 });
  });

  it('GET on an unknown route returns 404', async () => {
    const res = await req('GET', '/totally/not/a/route');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('OPTIONS preflight returns 204 with CORS headers', async () => {
    const res = await req('OPTIONS', '/quote/swap');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  it('GET /docs returns the Swagger UI HTML page', async () => {
    const res = await req('GET', '/docs');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(String(res.body)).toContain('swagger-ui');
  });

  it('GET /docs.json returns the OpenAPI spec addressed at this server\'s port', async () => {
    const res = await req('GET', '/docs.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.servers[0].url).toBe(`http://localhost:${port}`);
  });

  // ── Pools / swaps (indexed store) ─────────────────────────────

  it('GET /pools returns an empty array when nothing indexed yet', async () => {
    const res = await req('GET', '/pools');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('GET /pools/:key 404s for an unknown pool', async () => {
    const res = await req('GET', '/pools/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('GET /pools/:key returns the pool once indexed', async () => {
    store.updatePool({
      poolKey: 'DCC_TOKEN',
      assetA: 'DCC',
      assetB: 'TOKEN',
      reserveA: '1000',
      reserveB: '2000',
      lpSupply: '100',
      feeBps: 30,
      status: 'active',
      priceAtoB: 2,
      priceBtoA: 0.5,
      tvlA: '1000',
      tvlB: '2000',
      timestamp: Date.now(),
      blockHeight: 1,
    });
    const res = await req('GET', '/pools/DCC_TOKEN');
    expect(res.status).toBe(200);
    expect(res.body.poolKey).toBe('DCC_TOKEN');

    const priceRes = await req('GET', '/pools/DCC_TOKEN/price');
    expect(priceRes.status).toBe(200);
    expect(priceRes.body).toEqual({ poolKey: 'DCC_TOKEN', priceAtoB: 2, priceBtoA: 0.5 });

    const statsRes = await req('GET', '/pools/DCC_TOKEN/stats');
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.poolKey).toBe('DCC_TOKEN');
  });

  it('GET /pools/:key resolves a real-shaped poolKey ("p:DCC:<assetId>:35") the way the frontend actually requests it — via encodeURIComponent', async () => {
    const realPoolKey = 'p:DCC:J66Yxxphpx469mzvFSbMQUc3A3EijdSLcRtJEAoAUKjK:35';
    store.updatePool({
      poolKey: realPoolKey,
      assetA: 'DCC',
      assetB: 'J66Yxxphpx469mzvFSbMQUc3A3EijdSLcRtJEAoAUKjK',
      reserveA: '649985169',
      reserveB: '38493310397',
      lpSupply: '4999730190',
      feeBps: 35,
      status: 'active',
      priceAtoB: 59.22,
      priceBtoA: 0.0169,
      tvlA: '649985169',
      tvlB: '38493310397',
      timestamp: Date.now(),
      blockHeight: 1,
    });

    // amm-web's usePoolStats.ts does exactly this: encodeURIComponent(poolKey).
    // The colons in a real poolKey become %3A — a naive path.split('/') without
    // per-segment decoding would look up the still-encoded string and 404.
    const res = await req('GET', `/pools/${encodeURIComponent(realPoolKey)}`);
    expect(res.status).toBe(200);
    expect(res.body.poolKey).toBe(realPoolKey);

    const statsRes = await req('GET', `/pools/${encodeURIComponent(realPoolKey)}/stats`);
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.poolKey).toBe(realPoolKey);

    const priceRes = await req('GET', `/pools/${encodeURIComponent(realPoolKey)}/price`);
    expect(priceRes.status).toBe(200);
    expect(priceRes.body.poolKey).toBe(realPoolKey);
  });

  it('GET /swaps returns [] with nothing indexed', async () => {
    const res = await req('GET', '/swaps');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // ── /quote/swap ────────────────────────────────────────────────

  describe('GET /quote/swap', () => {
    it('400s when required params are missing', async () => {
      const res = await req('GET', '/quote/swap?' + qs({ assetIn: 'DCC' }));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Required query params: assetIn, assetOut, amountIn' });
      expect(sdkInstance.quoteSwap).not.toHaveBeenCalled();
    });

    it('400s on a non-numeric amountIn', async () => {
      const res = await req(
        'GET',
        '/quote/swap?' + qs({ assetIn: 'DCC', assetOut: 'TOKEN', amountIn: 'abc' })
      );
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'amountIn must be a positive integer' });
    });

    it('400s on a negative amountIn', async () => {
      const res = await req(
        'GET',
        '/quote/swap?' + qs({ assetIn: 'DCC', assetOut: 'TOKEN', amountIn: '-5' })
      );
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'amountIn must be a positive integer' });
    });

    it('400s on a zero amountIn', async () => {
      const res = await req(
        'GET',
        '/quote/swap?' + qs({ assetIn: 'DCC', assetOut: 'TOKEN', amountIn: '0' })
      );
      expect(res.status).toBe(400);
    });

    it('400s on feeBps below the valid range', async () => {
      const res = await req(
        'GET',
        '/quote/swap?' + qs({ assetIn: 'DCC', assetOut: 'TOKEN', amountIn: '100', feeBps: '0' })
      );
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'feeBps must be an integer between 1 and 1000' });
    });

    it('400s on feeBps above the valid range', async () => {
      const res = await req(
        'GET',
        '/quote/swap?' + qs({ assetIn: 'DCC', assetOut: 'TOKEN', amountIn: '100', feeBps: '1001' })
      );
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'feeBps must be an integer between 1 and 1000' });
    });

    it('calls sdk.quoteSwap with correctly-parsed args and default fee/slippage, normalizing DCC to null', async () => {
      sdkInstance.quoteSwap.mockResolvedValueOnce({ amountOut: '99000000' });
      const res = await req(
        'GET',
        '/quote/swap?' + qs({ assetIn: 'DCC', assetOut: 'TOKEN123', amountIn: '100000000' })
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ amountOut: '99000000' });
      expect(sdkInstance.quoteSwap).toHaveBeenCalledWith(
        100000000n,
        null, // normalizeAsset('DCC')
        'TOKEN123',
        35, // default feeBps
        50n // default slippageBps
      );
    });

    it('passes through explicit feeBps and slippageBps', async () => {
      sdkInstance.quoteSwap.mockResolvedValueOnce({ amountOut: '1' });
      await req(
        'GET',
        '/quote/swap?' +
          qs({ assetIn: 'TOKEN_A', assetOut: 'dcc', amountIn: '5000', feeBps: '100', slippageBps: '25' })
      );
      expect(sdkInstance.quoteSwap).toHaveBeenCalledWith(
        5000n,
        'TOKEN_A',
        null, // normalizeAsset('dcc') — lowercase also treated as native
        100,
        25n
      );
    });

    it('maps a "No pool found" SDK error to 404', async () => {
      sdkInstance.quoteSwap.mockRejectedValueOnce(new Error('No pool found: p:DCC:X:35'));
      const res = await req(
        'GET',
        '/quote/swap?' + qs({ assetIn: 'DCC', assetOut: 'X', amountIn: '100' })
      );
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'No pool found: p:DCC:X:35' });
    });

    it('maps a "no liquidity" SDK error to 400', async () => {
      sdkInstance.quoteSwap.mockRejectedValueOnce(new Error('Pool has no liquidity'));
      const res = await req(
        'GET',
        '/quote/swap?' + qs({ assetIn: 'DCC', assetOut: 'X', amountIn: '100' })
      );
      expect(res.status).toBe(400);
    });

    it('maps an unrecognized SDK error to 500', async () => {
      sdkInstance.quoteSwap.mockRejectedValueOnce(new Error('boom'));
      const res = await req(
        'GET',
        '/quote/swap?' + qs({ assetIn: 'DCC', assetOut: 'X', amountIn: '100' })
      );
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'boom' });
    });
  });

  // ── /quote/add-liquidity ───────────────────────────────────────

  describe('GET /quote/add-liquidity', () => {
    it('400s when required params are missing', async () => {
      const res = await req('GET', '/quote/add-liquidity?' + qs({ assetA: 'DCC' }));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Required query params: assetA, assetB, amountA, amountB' });
    });

    it('400s when amountA/amountB are not positive integers', async () => {
      const res = await req(
        'GET',
        '/quote/add-liquidity?' +
          qs({ assetA: 'DCC', assetB: 'TOKEN', amountA: '1.5', amountB: '100' })
      );
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'amountA and amountB must be positive integers' });
    });

    it('400s on out-of-range feeBps', async () => {
      const res = await req(
        'GET',
        '/quote/add-liquidity?' +
          qs({ assetA: 'DCC', assetB: 'TOKEN', amountA: '100', amountB: '200', feeBps: '5000' })
      );
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'feeBps must be an integer between 1 and 1000' });
    });

    it('calls sdk.buildAddLiquidity with parsed args and returns { estimate }', async () => {
      sdkInstance.buildAddLiquidity.mockResolvedValueOnce({
        tx: { type: 16 },
        estimate: { lpMinted: '500' },
      });
      const res = await req(
        'GET',
        '/quote/add-liquidity?' +
          qs({ assetA: 'DCC', assetB: 'TOKEN', amountA: '500000000', amountB: '250000', feeBps: '30' })
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ estimate: { lpMinted: '500' } });
      expect(sdkInstance.buildAddLiquidity).toHaveBeenCalledWith(
        null,
        'TOKEN',
        500000000n,
        250000n,
        30
      );
    });
  });

  // ── /quote/remove-liquidity ────────────────────────────────────

  describe('GET /quote/remove-liquidity', () => {
    it('400s when required params are missing', async () => {
      const res = await req('GET', '/quote/remove-liquidity?' + qs({ assetA: 'DCC' }));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Required query params: assetA, assetB, lpAmount' });
    });

    it('400s on a non-positive lpAmount', async () => {
      const res = await req(
        'GET',
        '/quote/remove-liquidity?' + qs({ assetA: 'DCC', assetB: 'TOKEN', lpAmount: '0' })
      );
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'lpAmount must be a positive integer' });
    });

    it('calls sdk.buildRemoveLiquidity with parsed args and returns { estimate }', async () => {
      sdkInstance.buildRemoveLiquidity.mockResolvedValueOnce({
        tx: { type: 16 },
        estimate: { amountA: '10', amountB: '20' },
      });
      const res = await req(
        'GET',
        '/quote/remove-liquidity?' +
          qs({ assetA: 'DCC', assetB: 'TOKEN', lpAmount: '1000000', feeBps: '30' })
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ estimate: { amountA: '10', amountB: '20' } });
      expect(sdkInstance.buildRemoveLiquidity).toHaveBeenCalledWith(null, 'TOKEN', 30, 1000000n);
    });
  });

  // ── POST /tx/swap ──────────────────────────────────────────────

  describe('POST /tx/swap', () => {
    it('400s on malformed JSON body', async () => {
      const res = await req('POST', '/tx/swap', { rawBody: '{not valid json' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid JSON body' });
    });

    it('400s when required fields are missing', async () => {
      const res = await req('POST', '/tx/swap', { body: { assetIn: 'DCC' } });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Required fields: assetIn, assetOut, amountIn' });
    });

    it('400s on a non-positive amountIn', async () => {
      const res = await req('POST', '/tx/swap', {
        body: { assetIn: 'DCC', assetOut: 'TOKEN', amountIn: '-1' },
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'amountIn must be a positive integer' });
    });

    it('400s on out-of-range feeBps', async () => {
      const res = await req('POST', '/tx/swap', {
        body: { assetIn: 'DCC', assetOut: 'TOKEN', amountIn: '100', feeBps: 1001 },
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'feeBps must be an integer between 1 and 1000' });
    });

    it('calls sdk.buildSwap with parsed args, default slippage, and deadline 0 when omitted', async () => {
      sdkInstance.buildSwap.mockResolvedValueOnce({ tx: { type: 16 }, quote: {} });
      const res = await req('POST', '/tx/swap', {
        body: { assetIn: 'DCC', assetOut: 'TOKEN', amountIn: '100000000', feeBps: 30 },
      });
      expect(res.status).toBe(200);
      expect(sdkInstance.buildSwap).toHaveBeenCalledWith(100000000n, null, 'TOKEN', 30, 50n, 0);
    });

    it('passes an explicit deadline through as a parsed integer', async () => {
      sdkInstance.buildSwap.mockResolvedValueOnce({ tx: { type: 16 }, quote: {} });
      await req('POST', '/tx/swap', {
        body: {
          assetIn: 'DCC',
          assetOut: 'TOKEN',
          amountIn: '100',
          slippageBps: '10',
          deadline: 1700000200000,
        },
      });
      expect(sdkInstance.buildSwap).toHaveBeenCalledWith(100n, null, 'TOKEN', 35, 10n, 1700000200000);
    });
  });

  // ── POST /tx/add-liquidity ─────────────────────────────────────

  describe('POST /tx/add-liquidity', () => {
    it('400s when required fields are missing', async () => {
      const res = await req('POST', '/tx/add-liquidity', { body: { assetA: 'DCC' } });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Required fields: assetA, assetB, amountA, amountB' });
    });

    it('400s when amounts are not positive integers', async () => {
      const res = await req('POST', '/tx/add-liquidity', {
        body: { assetA: 'DCC', assetB: 'TOKEN', amountA: 'x', amountB: '1' },
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'amountA and amountB must be positive integers' });
    });

    it('calls sdk.buildAddLiquidity with parsed args', async () => {
      sdkInstance.buildAddLiquidity.mockResolvedValueOnce({ tx: {}, estimate: {} });
      await req('POST', '/tx/add-liquidity', {
        body: { assetA: 'DCC', assetB: 'TOKEN', amountA: '500', amountB: '1000', feeBps: 40, slippageBps: 100 },
      });
      expect(sdkInstance.buildAddLiquidity).toHaveBeenCalledWith(
        null,
        'TOKEN',
        500n,
        1000n,
        40,
        100n,
        0
      );
    });
  });

  // ── POST /tx/remove-liquidity ──────────────────────────────────

  describe('POST /tx/remove-liquidity', () => {
    it('400s when required fields are missing', async () => {
      const res = await req('POST', '/tx/remove-liquidity', { body: { assetA: 'DCC' } });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Required fields: assetA, assetB, lpAmount' });
    });

    it('400s on an invalid lpAmount', async () => {
      const res = await req('POST', '/tx/remove-liquidity', {
        body: { assetA: 'DCC', assetB: 'TOKEN', lpAmount: '0' },
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'lpAmount must be a positive integer' });
    });

    it('calls sdk.buildRemoveLiquidity with parsed args', async () => {
      sdkInstance.buildRemoveLiquidity.mockResolvedValueOnce({ tx: {}, estimate: {} });
      await req('POST', '/tx/remove-liquidity', {
        body: { assetA: 'DCC', assetB: 'TOKEN', lpAmount: '250', feeBps: 30 },
      });
      expect(sdkInstance.buildRemoveLiquidity).toHaveBeenCalledWith(null, 'TOKEN', 30, 250n, 50n, 0);
    });
  });

  // ── POST /tx/create-pool ───────────────────────────────────────

  describe('POST /tx/create-pool', () => {
    it('400s when required fields are missing', async () => {
      const res = await req('POST', '/tx/create-pool', { body: { assetA: 'DCC' } });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Required fields: assetA, assetB' });
    });

    it('400s on out-of-range feeBps', async () => {
      const res = await req('POST', '/tx/create-pool', {
        body: { assetA: 'DCC', assetB: 'TOKEN', feeBps: -1 },
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'feeBps must be an integer between 1 and 1000' });
    });

    it('calls the synchronous sdk.buildCreatePool with parsed args', async () => {
      sdkInstance.buildCreatePool.mockReturnValueOnce({ tx: { type: 16, call: { function: 'createPool' } } });
      const res = await req('POST', '/tx/create-pool', {
        body: { assetA: 'DCC', assetB: 'TOKEN', feeBps: 50 },
      });
      expect(res.status).toBe(200);
      expect(sdkInstance.buildCreatePool).toHaveBeenCalledWith(null, 'TOKEN', 50);
    });
  });

  it('POST /tx/:unknown-subroute 404s', async () => {
    const res = await req('POST', '/tx/not-a-real-action', { body: {} });
    expect(res.status).toBe(404);
  });

  // ── Protocol status / user data / token info ──────────────────

  it('GET /protocol/status aggregates isPaused/getHeight/getPoolCount', async () => {
    sdkInstance.isPaused.mockResolvedValueOnce(true);
    sdkInstance.getHeight.mockResolvedValueOnce(4215700);
    sdkInstance.getPoolCount.mockResolvedValueOnce(7);
    const res = await req('GET', '/protocol/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ paused: true, height: 4215700, poolCount: 7, dApp: '3PDappAddress' });
  });

  it('GET /user/:address/balance/:assetId normalizes DCC and returns the balance', async () => {
    sdkInstance.getBalance.mockResolvedValueOnce(123456789n);
    const res = await req('GET', '/user/3PSomeAddress/balance/DCC');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ address: '3PSomeAddress', assetId: 'DCC', balance: '123456789' });
    expect(sdkInstance.getBalance).toHaveBeenCalledWith('3PSomeAddress', null);
  });

  it('GET /user/:address/balance/:assetId passes through a real asset id unchanged', async () => {
    sdkInstance.getBalance.mockResolvedValueOnce(0n);
    await req('GET', '/user/3PSomeAddress/balance/3PTokenXYZ');
    expect(sdkInstance.getBalance).toHaveBeenCalledWith('3PSomeAddress', '3PTokenXYZ');
  });

  it('GET /token/:assetId 404s when the asset is unknown', async () => {
    sdkInstance.node.getAssetInfo.mockResolvedValueOnce(null);
    const res = await req('GET', '/token/nonexistent-asset');
    expect(res.status).toBe(404);
  });

  it('GET /token/:assetId returns asset metadata', async () => {
    sdkInstance.node.getAssetInfo.mockResolvedValueOnce({
      name: 'DCC',
      decimals: 8,
      description: 'DecentralChain native token',
      quantity: 0,
      scripted: false,
    });
    const res = await req('GET', '/token/DCC');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      assetId: 'DCC',
      name: 'DCC',
      decimals: 8,
      description: 'DecentralChain native token',
      quantity: 0,
      scripted: false,
    });
  });
});
