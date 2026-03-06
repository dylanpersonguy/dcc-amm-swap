/**
 * DCC AMM API — Full-featured HTTP server.
 *
 * Uses Node's built-in http module (no Express dependency).
 *
 * == Read-only (indexed data) ==
 *   GET  /health                             — health check
 *   GET  /pools                              — list all pools
 *   GET  /pools/:key                         — get pool by key
 *   GET  /pools/:key/stats                   — pool stats
 *   GET  /pools/:key/price                   — spot price
 *   GET  /swaps                              — recent swaps
 *   GET  /swaps/:address                     — swaps by address
 *
 * == Quoting ==
 *   GET  /quote/swap                         — swap quote
 *   GET  /quote/add-liquidity                — add-liquidity estimate
 *   GET  /quote/remove-liquidity             — remove-liquidity estimate
 *
 * == Transaction Building (returns unsigned txs) ==
 *   POST /tx/swap                            — build swap tx
 *   POST /tx/add-liquidity                   — build add-liquidity tx
 *   POST /tx/remove-liquidity                — build remove-liquidity tx
 *   POST /tx/create-pool                     — build create-pool tx
 *
 * == User Data ==
 *   GET  /user/:address/positions            — LP positions across all pools
 *   GET  /user/:address/balance/:assetId     — token balance
 *
 * == Token / Protocol ==
 *   GET  /token/:assetId                     — asset info (name, decimals)
 *   GET  /protocol/status                    — on-chain protocol status
 *
 * == Docs ==
 *   GET  /docs                               — Swagger UI
 *   GET  /docs.json                          — OpenAPI spec
 */

import * as http from 'http';
import { IndexerStore } from './store';
import { PoolPoller } from './poller';
import { IndexerConfig } from './types';
import { getSwaggerSpec } from './swagger';
import { AmmSdk } from '@dcc-amm/sdk';

// ── Helpers ─────────────────────────────────────────────────────────

function parseUrl(url: string): { path: string; query: Record<string, string> } {
  const [path, queryStr] = url.split('?');
  const query: Record<string, string> = {};
  if (queryStr) {
    for (const pair of queryStr.split('&')) {
      const [k, v] = pair.split('=');
      query[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
  }
  return { path, query };
}

/** BigInt-safe JSON replacer — converts bigint to string */
function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data, bigintReplacer));
}

function notFound(res: http.ServerResponse): void {
  json(res, { error: 'Not found' }, 404);
}

function badRequest(res: http.ServerResponse, message: string): void {
  json(res, { error: message }, 400);
}

function html(res: http.ServerResponse, body: string, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

/** Parse JSON request body with 64KB size limit */
function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX_BODY = 64 * 1024;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/** Normalize asset ID — treat "DCC" as null (native token) */
function normalizeAsset(id: string | undefined): string | null {
  if (!id || id === 'DCC' || id === 'dcc') return null;
  return id;
}

function swaggerHtml(port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>DCC AMM API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/>
  <style>body{margin:0;background:#fafafa} .swagger-ui .topbar{display:none}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>SwaggerUIBundle({url:'/docs.json',dom_id:'#swagger-ui',deepLinking:true,presets:[SwaggerUIBundle.presets.apis,SwaggerUIBundle.SwaggerUIStandalonePreset],layout:'BaseLayout'})</script>
</body>
</html>`;
}

export function startServer(
  config: IndexerConfig,
  port: number = 3001
): { server: http.Server; store: IndexerStore; poller: PoolPoller } {
  const store = new IndexerStore();
  const poller = new PoolPoller(config, store);

  // SDK instance for quoting, tx building, and on-chain reads
  const sdk = new AmmSdk({
    nodeUrl: config.nodeUrl,
    dAppAddress: config.dAppAddress,
    chainId: 'D',
  });

  const server = http.createServer(async (req, res) => {
    const { path, query } = parseUrl(req.url || '/');
    const segments = path.split('/').filter(Boolean);

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return;
    }

    try {
      // ── Docs ───────────────────────────────────────────────────
      if (segments[0] === 'docs' && !segments[1]) {
        return html(res, swaggerHtml(port));
      }
      if (path === '/docs.json') {
        return json(res, getSwaggerSpec(port));
      }

      // ── Health ─────────────────────────────────────────────────
      if (segments[0] === 'health') {
        return json(res, {
          status: 'ok',
          lastBlockHeight: store.getLastBlockHeight(),
          poolCount: store.getAllPools().length,
        });
      }

      // ── Protocol Status (live on-chain) ────────────────────────
      if (segments[0] === 'protocol' && segments[1] === 'status') {
        const [paused, height, poolCount] = await Promise.all([
          sdk.isPaused(),
          sdk.getHeight(),
          sdk.getPoolCount(),
        ]);
        return json(res, { paused, height, poolCount, dApp: config.dAppAddress });
      }

      // ── Pools (indexed) ────────────────────────────────────────
      if (segments[0] === 'pools' && !segments[1]) {
        return json(res, store.getAllPools());
      }
      if (segments[0] === 'pools' && segments[1] && segments[2] === 'stats') {
        const stats = store.getPoolStats(segments[1]);
        if (!stats) return notFound(res);
        return json(res, stats);
      }
      if (segments[0] === 'pools' && segments[1] && segments[2] === 'price') {
        const pool = store.getPool(segments[1]);
        if (!pool) return notFound(res);
        return json(res, {
          poolKey: pool.poolKey,
          priceAtoB: pool.priceAtoB,
          priceBtoA: pool.priceBtoA,
        });
      }
      if (segments[0] === 'pools' && segments[1]) {
        const pool = store.getPool(segments[1]);
        if (!pool) return notFound(res);
        return json(res, pool);
      }

      // ── Swaps (indexed) ────────────────────────────────────────
      if (segments[0] === 'swaps' && segments[1]) {
        return json(res, store.getSwapsByAddress(segments[1], parseInt(query.limit || '50')));
      }
      if (segments[0] === 'swaps') {
        return json(res, store.getSwaps(query.pool || undefined, parseInt(query.limit || '50')));
      }

      // ── Quote Endpoints (GET — live on-chain) ──────────────────
      if (segments[0] === 'quote' && segments[1] === 'swap') {
        const { assetIn, assetOut, amountIn, feeBps, slippageBps } = query;
        if (!assetIn || !assetOut || !amountIn) {
          return badRequest(res, 'Required query params: assetIn, assetOut, amountIn');
        }
        const quote = await sdk.quoteSwap(
          BigInt(amountIn),
          normalizeAsset(assetIn),
          normalizeAsset(assetOut),
          parseInt(feeBps || '30'),
          BigInt(slippageBps || '50')
        );
        return json(res, quote);
      }

      if (segments[0] === 'quote' && segments[1] === 'add-liquidity') {
        const { assetA, assetB, amountA, amountB, feeBps } = query;
        if (!assetA || !assetB || !amountA || !amountB) {
          return badRequest(res, 'Required query params: assetA, assetB, amountA, amountB');
        }
        const result = await sdk.buildAddLiquidity(
          normalizeAsset(assetA),
          normalizeAsset(assetB),
          BigInt(amountA),
          BigInt(amountB),
          parseInt(feeBps || '30')
        );
        return json(res, { estimate: result.estimate });
      }

      if (segments[0] === 'quote' && segments[1] === 'remove-liquidity') {
        const { assetA, assetB, feeBps, lpAmount } = query;
        if (!assetA || !assetB || !lpAmount) {
          return badRequest(res, 'Required query params: assetA, assetB, lpAmount');
        }
        const result = await sdk.buildRemoveLiquidity(
          normalizeAsset(assetA),
          normalizeAsset(assetB),
          parseInt(feeBps || '30'),
          BigInt(lpAmount)
        );
        return json(res, { estimate: result.estimate });
      }

      // ── Transaction Building (POST — returns unsigned tx) ──────
      if (req.method === 'POST' && segments[0] === 'tx') {
        let body: Record<string, any>;
        try {
          body = await parseBody(req);
        } catch (err: any) {
          return badRequest(res, err.message);
        }

        if (segments[1] === 'swap') {
          const { assetIn, assetOut, amountIn, feeBps, slippageBps, deadline } = body;
          if (!assetIn || !assetOut || !amountIn) {
            return badRequest(res, 'Required fields: assetIn, assetOut, amountIn');
          }
          const result = await sdk.buildSwap(
            BigInt(amountIn),
            normalizeAsset(assetIn),
            normalizeAsset(assetOut),
            parseInt(feeBps || '30'),
            BigInt(slippageBps || '50'),
            deadline ? parseInt(deadline) : 0
          );
          return json(res, result);
        }

        if (segments[1] === 'add-liquidity') {
          const { assetA, assetB, amountA, amountB, feeBps, slippageBps, deadline } = body;
          if (!assetA || !assetB || !amountA || !amountB) {
            return badRequest(res, 'Required fields: assetA, assetB, amountA, amountB');
          }
          const result = await sdk.buildAddLiquidity(
            normalizeAsset(assetA),
            normalizeAsset(assetB),
            BigInt(amountA),
            BigInt(amountB),
            parseInt(feeBps || '30'),
            BigInt(slippageBps || '50'),
            deadline ? parseInt(deadline) : 0
          );
          return json(res, result);
        }

        if (segments[1] === 'remove-liquidity') {
          const { assetA, assetB, feeBps, lpAmount, slippageBps, deadline } = body;
          if (!assetA || !assetB || !lpAmount) {
            return badRequest(res, 'Required fields: assetA, assetB, lpAmount');
          }
          const result = await sdk.buildRemoveLiquidity(
            normalizeAsset(assetA),
            normalizeAsset(assetB),
            parseInt(feeBps || '30'),
            BigInt(lpAmount),
            BigInt(slippageBps || '50'),
            deadline ? parseInt(deadline) : 0
          );
          return json(res, result);
        }

        if (segments[1] === 'create-pool') {
          const { assetA, assetB, feeBps } = body;
          if (!assetA || !assetB) {
            return badRequest(res, 'Required fields: assetA, assetB');
          }
          const result = sdk.buildCreatePool(
            normalizeAsset(assetA),
            normalizeAsset(assetB),
            parseInt(feeBps || '30')
          );
          return json(res, result);
        }

        return notFound(res);
      }

      // ── User Data ──────────────────────────────────────────────
      if (segments[0] === 'user' && segments[1] && segments[2] === 'positions') {
        const address = segments[1];
        const pools = await sdk.listPools();
        const positions = [];
        for (const pool of pools) {
          const lpBalance = await sdk.getLpBalance(pool.poolId, address);
          if (lpBalance > 0n) {
            const sharePercent = pool.lpSupply > 0n
              ? Number((lpBalance * 10000n) / pool.lpSupply) / 100
              : 0;
            positions.push({
              poolId: pool.poolId,
              token0: pool.token0,
              token1: pool.token1,
              lpBalance,
              lpSupply: pool.lpSupply,
              poolSharePct: sharePercent,
              reserve0: pool.reserve0,
              reserve1: pool.reserve1,
              userReserve0: pool.lpSupply > 0n ? (pool.reserve0 * lpBalance) / pool.lpSupply : 0n,
              userReserve1: pool.lpSupply > 0n ? (pool.reserve1 * lpBalance) / pool.lpSupply : 0n,
              feeBps: pool.feeBps,
              lpAssetId: pool.lpAssetId,
            });
          }
        }
        return json(res, positions);
      }

      if (segments[0] === 'user' && segments[1] && segments[2] === 'balance' && segments[3]) {
        const address = segments[1];
        const assetId = normalizeAsset(segments[3]);
        const balance = await sdk.getBalance(address, assetId);
        return json(res, { address, assetId: segments[3], balance });
      }

      // ── Token Info ─────────────────────────────────────────────
      if (segments[0] === 'token' && segments[1]) {
        const info = await sdk.node.getAssetInfo(segments[1]);
        if (!info) return notFound(res);
        return json(res, { assetId: segments[1], ...info });
      }

      // ── 404 ────────────────────────────────────────────────────
      notFound(res);
    } catch (err: any) {
      console.error('[Server] Error:', err);
      if (err.message?.includes('No pool found') || err.message?.includes('Pool not found')) {
        return json(res, { error: err.message }, 404);
      }
      if (err.message?.includes('no liquidity')) {
        return json(res, { error: err.message }, 400);
      }
      json(res, { error: err.message || 'Internal server error' }, 500);
    }
  });

  server.listen(port, () => {
    console.log(`[Indexer] HTTP server listening on port ${port}`);
    console.log(`[Indexer] 📖 API Docs: http://localhost:${port}/docs`);
  });

  poller.start();

  return { server, store, poller };
}

// Run if executed directly
if (require.main === module) {
  const config: IndexerConfig = {
    nodeUrl: process.env.NODE_URL || 'https://nodes.decentralchain.io',
    dAppAddress: process.env.DAPP_ADDRESS || '',
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL || '10000'),
    dataDir: process.env.DATA_DIR || './data',
  };

  if (!config.dAppAddress) {
    console.error('DAPP_ADDRESS environment variable is required');
    process.exit(1);
  }

  startServer(config, parseInt(process.env.PORT || '3001'));
}
