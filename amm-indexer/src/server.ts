/**
 * Lightweight HTTP API for serving indexed AMM data.
 *
 * Uses Node's built-in http module (no Express dependency).
 * Endpoints:
 *   GET /pools           — list all pools
 *   GET /pools/:key      — get pool by key
 *   GET /pools/:key/stats — pool stats
 *   GET /swaps           — recent swaps (optional ?pool=KEY&limit=N)
 *   GET /swaps/:address  — swaps by address
 *   GET /health          — health check
 */

import * as http from 'http';
import { IndexerStore } from './store';
import { PoolPoller } from './poller';
import { IndexerConfig } from './types';

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

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function notFound(res: http.ServerResponse): void {
  json(res, { error: 'Not found' }, 404);
}

export function startServer(
  config: IndexerConfig,
  port: number = 3001
): { server: http.Server; store: IndexerStore; poller: PoolPoller } {
  const store = new IndexerStore();
  const poller = new PoolPoller(config, store);

  const server = http.createServer((req, res) => {
    const { path, query } = parseUrl(req.url || '/');
    const segments = path.split('/').filter(Boolean);

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    try {
      if (segments[0] === 'health') {
        json(res, {
          status: 'ok',
          lastBlockHeight: store.getLastBlockHeight(),
          poolCount: store.getAllPools().length,
        });
      } else if (segments[0] === 'pools' && !segments[1]) {
        json(res, store.getAllPools());
      } else if (segments[0] === 'pools' && segments[1] && segments[2] === 'stats') {
        const stats = store.getPoolStats(segments[1]);
        if (!stats) return notFound(res);
        json(res, stats);
      } else if (segments[0] === 'pools' && segments[1]) {
        const pool = store.getPool(segments[1]);
        if (!pool) return notFound(res);
        json(res, pool);
      } else if (segments[0] === 'swaps' && segments[1]) {
        const swaps = store.getSwapsByAddress(
          segments[1],
          parseInt(query.limit || '50')
        );
        json(res, swaps);
      } else if (segments[0] === 'swaps') {
        const swaps = store.getSwaps(
          query.pool || undefined,
          parseInt(query.limit || '50')
        );
        json(res, swaps);
      } else {
        notFound(res);
      }
    } catch (err) {
      console.error('[Server] Error:', err);
      json(res, { error: 'Internal server error' }, 500);
    }
  });

  server.listen(port, () => {
    console.log(`[Indexer] HTTP server listening on port ${port}`);
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
