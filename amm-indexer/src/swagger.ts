/**
 * DCC AMM API — OpenAPI 3.0 specification.
 *
 * Documents the full AMM API: pool data, swap history, quoting,
 * transaction building, user positions, token info, and protocol status.
 */

export function getSwaggerSpec(port: number) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'DCC AMM API',
      version: '3.0.0',
      description:
        'Full-featured REST API for the DCC AMM (Automated Market Maker) on DecentralChain.\n\n' +
        '### Capabilities\n' +
        '- **Read**: Pool data, swap history, TVL, volume & fee analytics\n' +
        '- **Quote**: Get swap quotes, add/remove liquidity estimates with price impact\n' +
        '- **Build**: Generate unsigned InvokeScript transactions for swaps, liquidity, and pool creation\n' +
        '- **User**: LP positions, pool shares, token balances\n' +
        '- **Token**: Asset metadata (name, decimals, supply)\n\n' +
        '### Transaction Flow\n' +
        '1. Call a **Quote** endpoint to preview the trade\n' +
        '2. Call a **Transaction** endpoint to get an unsigned `InvokeScriptTx`\n' +
        '3. Sign the transaction client-side (Signer / Keeper / seed)\n' +
        '4. Broadcast the signed transaction to the DecentralChain node\n\n' +
        '### Key Concepts\n' +
        '- **Pool**: Liquidity pool with two assets, governed by x·y=k constant-product invariant\n' +
        '- **Pool Key**: Canonical identifier `<token0>_<token1>` (lexicographically sorted)\n' +
        '- **Pool ID**: On-chain identifier `p:<token0>:<token1>:<feeBps>`\n' +
        '- **LP Tokens**: Fungible tokens representing a proportional share of pool reserves\n' +
        '- **Fee Tiers**: Configurable fee in basis points (1 bps = 0.01%)\n' +
        '- **DCC**: Native token — use `"DCC"` as the asset identifier in API calls\n\n' +
        '### On-Chain Contract\n' +
        'dApp: `3Da7xwRRtXfkA46jaKTYb75Usd2ZNWdY6HX` · Chain ID: `D` (mainnet)',
      contact: { name: 'DCC AMM Team' },
      license: { name: 'MIT' },
    },
    servers: [
      {
        url: `http://localhost:${port}`,
        description: 'Local development',
      },
    ],
    tags: [
      { name: 'Health', description: 'Service health and indexer status' },
      { name: 'Pools', description: 'Liquidity pool data — reserves, prices, TVL, fee tiers' },
      { name: 'Swaps', description: 'Swap transaction history and trade data' },
      { name: 'Stats', description: 'Pool analytics — volume, fees, APY, 24h/7d metrics' },
      { name: 'Quoting', description: 'Live swap quotes and liquidity estimates (reads on-chain state)' },
      { name: 'Transactions', description: 'Build unsigned InvokeScript transactions for signing client-side' },
      { name: 'User', description: 'User positions, balances, and portfolio data' },
      { name: 'Token', description: 'Token / asset metadata' },
      { name: 'Protocol', description: 'On-chain protocol status' },
    ],
    paths: {
      // ── Health ───────────────────────────────────────────────
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Indexer health check',
          description:
            'Returns operational status including last indexed block height and pool count.',
          operationId: 'getHealth',
          responses: {
            200: {
              description: 'Health status',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthResponse' },
                  example: { status: 'ok', lastBlockHeight: 4215678, poolCount: 12 },
                },
              },
            },
          },
        },
      },

      // ── Protocol Status ─────────────────────────────────────
      '/protocol/status': {
        get: {
          tags: ['Protocol'],
          summary: 'On-chain protocol status',
          description:
            'Reads live on-chain state: whether the protocol is paused, current block height, and total pool count.',
          operationId: 'getProtocolStatus',
          responses: {
            200: {
              description: 'Protocol status',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ProtocolStatus' },
                  example: {
                    paused: false,
                    height: 4215700,
                    poolCount: 12,
                    dApp: '3Da7xwRRtXfkA46jaKTYb75Usd2ZNWdY6HX',
                  },
                },
              },
            },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      // ── Pools ───────────────────────────────────────────────
      '/pools': {
        get: {
          tags: ['Pools'],
          summary: 'List all liquidity pools',
          description:
            'Returns a snapshot of every active liquidity pool including reserves, LP supply, fee tier, spot prices, and TVL.',
          operationId: 'listPools',
          responses: {
            200: {
              description: 'Array of pool snapshots',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/PoolSnapshot' } },
                },
              },
            },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      '/pools/{poolKey}': {
        get: {
          tags: ['Pools'],
          summary: 'Get a single pool',
          description: 'Returns the latest indexed snapshot for a pool by its canonical key.',
          operationId: 'getPool',
          parameters: [
            {
              name: 'poolKey',
              in: 'path',
              required: true,
              description: 'Canonical pool key (`<token0>_<token1>`)',
              schema: { type: 'string' },
              example: 'DCC_3P7xABCdefghijk',
            },
          ],
          responses: {
            200: { description: 'Pool snapshot', content: { 'application/json': { schema: { $ref: '#/components/schemas/PoolSnapshot' } } } },
            404: { $ref: '#/components/responses/NotFound' },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      '/pools/{poolKey}/stats': {
        get: {
          tags: ['Stats'],
          summary: 'Pool stats & analytics',
          description:
            'Computed analytics: 24h/7d volume, fees, TVL, tx count, and estimated APY.',
          operationId: 'getPoolStats',
          parameters: [
            { name: 'poolKey', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Pool statistics', content: { 'application/json': { schema: { $ref: '#/components/schemas/PoolStats' } } } },
            404: { $ref: '#/components/responses/NotFound' },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      '/pools/{poolKey}/price': {
        get: {
          tags: ['Pools'],
          summary: 'Pool spot price',
          description: 'Returns the current spot price in both directions from the indexed snapshot.',
          operationId: 'getPoolPrice',
          parameters: [
            { name: 'poolKey', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: {
              description: 'Spot price',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PoolPrice' },
                  example: { poolKey: 'DCC_3P7x...', priceAtoB: 0.0005, priceBtoA: 2000.0 },
                },
              },
            },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },

      // ── Swaps ───────────────────────────────────────────────
      '/swaps': {
        get: {
          tags: ['Swaps'],
          summary: 'List recent swaps',
          description: 'Recent swap transactions across all pools, optionally filtered by pool key.',
          operationId: 'listSwaps',
          parameters: [
            { name: 'pool', in: 'query', description: 'Filter by pool key', schema: { type: 'string' } },
            { name: 'limit', in: 'query', description: 'Max results (default 50)', schema: { type: 'integer', default: 50, minimum: 1, maximum: 500 } },
          ],
          responses: {
            200: { description: 'Swap events', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/SwapEvent' } } } } },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      '/swaps/{address}': {
        get: {
          tags: ['Swaps'],
          summary: 'Swaps by wallet address',
          description: 'Trade history for a specific DecentralChain wallet address.',
          operationId: 'getSwapsByAddress',
          parameters: [
            { name: 'address', in: 'path', required: true, schema: { type: 'string' }, example: '3Da7xwRRtXfkA46jaKTYb75Usd2ZNWdY6HX' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, minimum: 1, maximum: 500 } },
          ],
          responses: {
            200: { description: 'Swap events', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/SwapEvent' } } } } },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      // ── Quoting ─────────────────────────────────────────────
      '/quote/swap': {
        get: {
          tags: ['Quoting'],
          summary: 'Get swap quote',
          description:
            'Computes a swap quote by reading live on-chain pool state. Returns expected output amount, ' +
            'minimum output (after slippage), price impact, and fees. Use `"DCC"` for the native token.',
          operationId: 'quoteSwap',
          parameters: [
            { name: 'assetIn', in: 'query', required: true, description: 'Input asset ID (or `DCC`)', schema: { type: 'string' }, example: 'DCC' },
            { name: 'assetOut', in: 'query', required: true, description: 'Output asset ID (or `DCC`)', schema: { type: 'string' }, example: '3P7xABCdefghijk' },
            { name: 'amountIn', in: 'query', required: true, description: 'Amount to swap (raw integer units)', schema: { type: 'string' }, example: '100000000' },
            { name: 'feeBps', in: 'query', description: 'Fee tier in basis points (default 30)', schema: { type: 'integer', default: 30 } },
            { name: 'slippageBps', in: 'query', description: 'Slippage tolerance in bps (default 50 = 0.5%)', schema: { type: 'integer', default: 50 } },
          ],
          responses: {
            200: { description: 'Swap quote', content: { 'application/json': { schema: { $ref: '#/components/schemas/SwapQuote' } } } },
            400: { $ref: '#/components/responses/BadRequest' },
            404: { description: 'Pool not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      '/quote/add-liquidity': {
        get: {
          tags: ['Quoting'],
          summary: 'Estimate add-liquidity',
          description:
            'Estimates LP tokens minted and actual amounts deposited for an add-liquidity operation. ' +
            'Accounts for proportional deposit requirements when the pool already has liquidity.',
          operationId: 'quoteAddLiquidity',
          parameters: [
            { name: 'assetA', in: 'query', required: true, description: 'First asset ID (or `DCC`)', schema: { type: 'string' } },
            { name: 'assetB', in: 'query', required: true, description: 'Second asset ID', schema: { type: 'string' } },
            { name: 'amountA', in: 'query', required: true, description: 'Desired amount of assetA (raw units)', schema: { type: 'string' } },
            { name: 'amountB', in: 'query', required: true, description: 'Desired amount of assetB (raw units)', schema: { type: 'string' } },
            { name: 'feeBps', in: 'query', description: 'Fee tier (default 30)', schema: { type: 'integer', default: 30 } },
          ],
          responses: {
            200: { description: 'Liquidity estimate', content: { 'application/json': { schema: { $ref: '#/components/schemas/AddLiquidityEstimate' } } } },
            400: { $ref: '#/components/responses/BadRequest' },
            404: { description: 'Pool not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      '/quote/remove-liquidity': {
        get: {
          tags: ['Quoting'],
          summary: 'Estimate remove-liquidity',
          description:
            'Estimates the token amounts returned when removing liquidity by burning LP tokens.',
          operationId: 'quoteRemoveLiquidity',
          parameters: [
            { name: 'assetA', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'assetB', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'lpAmount', in: 'query', required: true, description: 'LP tokens to burn (raw units)', schema: { type: 'string' } },
            { name: 'feeBps', in: 'query', description: 'Fee tier (default 30)', schema: { type: 'integer', default: 30 } },
          ],
          responses: {
            200: { description: 'Remove-liquidity estimate', content: { 'application/json': { schema: { $ref: '#/components/schemas/RemoveLiquidityEstimate' } } } },
            400: { $ref: '#/components/responses/BadRequest' },
            404: { description: 'Pool not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      // ── Transaction Building ────────────────────────────────
      '/tx/swap': {
        post: {
          tags: ['Transactions'],
          summary: 'Build swap transaction',
          description:
            'Returns an unsigned `InvokeScriptTx` for a swap, along with the computed quote. ' +
            'Sign this transaction client-side and broadcast to the DecentralChain node.',
          operationId: 'buildSwapTx',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SwapRequest' },
                example: {
                  assetIn: 'DCC',
                  assetOut: '3P7xABCdefghijk',
                  amountIn: '100000000',
                  feeBps: 30,
                  slippageBps: 50,
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Unsigned transaction + quote',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SwapTxResponse' },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            404: { description: 'Pool not found' },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      '/tx/add-liquidity': {
        post: {
          tags: ['Transactions'],
          summary: 'Build add-liquidity transaction',
          description:
            'Returns an unsigned `InvokeScriptTx` for adding liquidity, plus the computed estimate ' +
            '(LP tokens to mint, actual deposit amounts).',
          operationId: 'buildAddLiquidityTx',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AddLiquidityRequest' },
                example: {
                  assetA: 'DCC',
                  assetB: '3P7xABCdefghijk',
                  amountA: '500000000',
                  amountB: '250000',
                  feeBps: 30,
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Unsigned transaction + estimate',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/AddLiquidityTxResponse' } } },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            404: { description: 'Pool not found' },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      '/tx/remove-liquidity': {
        post: {
          tags: ['Transactions'],
          summary: 'Build remove-liquidity transaction',
          description:
            'Returns an unsigned `InvokeScriptTx` for removing liquidity, plus the removal estimate.',
          operationId: 'buildRemoveLiquidityTx',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RemoveLiquidityRequest' },
                example: {
                  assetA: 'DCC',
                  assetB: '3P7xABCdefghijk',
                  lpAmount: '1000000',
                  feeBps: 30,
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Unsigned transaction + estimate',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/RemoveLiquidityTxResponse' } } },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            404: { description: 'Pool not found' },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      '/tx/create-pool': {
        post: {
          tags: ['Transactions'],
          summary: 'Build create-pool transaction',
          description:
            'Returns an unsigned `InvokeScriptTx` for creating a new liquidity pool with the given asset pair and fee tier.',
          operationId: 'buildCreatePoolTx',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreatePoolRequest' },
                example: { assetA: 'DCC', assetB: '3P7xABCdefghijk', feeBps: 30 },
              },
            },
          },
          responses: {
            200: {
              description: 'Unsigned transaction',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/CreatePoolTxResponse' } } },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      // ── User Data ───────────────────────────────────────────
      '/user/{address}/positions': {
        get: {
          tags: ['User'],
          summary: 'User LP positions',
          description:
            'Scans all pools and returns the user\'s LP positions including pool share percentage, ' +
            'proportional reserve amounts, and LP token info.',
          operationId: 'getUserPositions',
          parameters: [
            { name: 'address', in: 'path', required: true, description: 'DecentralChain wallet address', schema: { type: 'string' } },
          ],
          responses: {
            200: {
              description: 'Array of LP positions',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/LpPosition' } },
                },
              },
            },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      '/user/{address}/balance/{assetId}': {
        get: {
          tags: ['User'],
          summary: 'Token balance',
          description: 'Returns the on-chain balance of a specific token for the given address. Use `DCC` for native token.',
          operationId: 'getUserBalance',
          parameters: [
            { name: 'address', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'assetId', in: 'path', required: true, description: 'Asset ID or `DCC`', schema: { type: 'string' } },
          ],
          responses: {
            200: {
              description: 'Balance',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/BalanceResponse' },
                  example: { address: '3Da7x...', assetId: 'DCC', balance: '500000000' },
                },
              },
            },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      // ── Token Info ──────────────────────────────────────────
      '/token/{assetId}': {
        get: {
          tags: ['Token'],
          summary: 'Token info',
          description: 'Returns on-chain asset metadata: name, decimals, description, total supply. Use `DCC` for native token.',
          operationId: 'getTokenInfo',
          parameters: [
            { name: 'assetId', in: 'path', required: true, schema: { type: 'string' }, example: 'DCC' },
          ],
          responses: {
            200: {
              description: 'Token info',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TokenInfo' },
                  example: { assetId: 'DCC', name: 'DCC', decimals: 8, description: 'DecentralChain native token', quantity: 0, scripted: false },
                },
              },
            },
            404: { $ref: '#/components/responses/NotFound' },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },
    },

    // ── Components ─────────────────────────────────────────────
    components: {
      responses: {
        ServerError: {
          description: 'Internal server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { error: 'Internal server error' } } },
        },
        NotFound: {
          description: 'Resource not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { error: 'Not found' } } },
        },
        BadRequest: {
          description: 'Invalid request parameters',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { error: 'Required: assetIn, assetOut, amountIn' } } },
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string', description: 'Human-readable error message' },
          },
        },

        HealthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok'] },
            lastBlockHeight: { type: 'integer', description: 'Last indexed block height' },
            poolCount: { type: 'integer', description: 'Number of tracked pools' },
          },
        },

        ProtocolStatus: {
          type: 'object',
          properties: {
            paused: { type: 'boolean', description: 'Whether the protocol is paused' },
            height: { type: 'integer', description: 'Current blockchain height' },
            poolCount: { type: 'integer', description: 'Total number of pools on-chain' },
            dApp: { type: 'string', description: 'dApp contract address' },
          },
        },

        PoolSnapshot: {
          type: 'object',
          description: 'Point-in-time snapshot of a liquidity pool.',
          properties: {
            poolKey: { type: 'string', example: 'DCC_3P7xABCdefghijk' },
            assetA: { type: 'string' },
            assetB: { type: 'string' },
            reserveA: { type: 'string', description: 'Reserve of assetA (stringified bigint)', example: '250000000000' },
            reserveB: { type: 'string', example: '125000000' },
            lpSupply: { type: 'string', example: '5590169943' },
            feeBps: { type: 'integer', minimum: 1, maximum: 1000, example: 30 },
            status: { type: 'string', enum: ['active', 'paused'] },
            priceAtoB: { type: 'number', description: '1 unit assetA = X units assetB', example: 0.0005 },
            priceBtoA: { type: 'number', example: 2000.0 },
            tvlA: { type: 'string' },
            tvlB: { type: 'string' },
            timestamp: { type: 'integer' },
            blockHeight: { type: 'integer' },
          },
        },

        PoolPrice: {
          type: 'object',
          properties: {
            poolKey: { type: 'string' },
            priceAtoB: { type: 'number' },
            priceBtoA: { type: 'number' },
          },
        },

        PoolStats: {
          type: 'object',
          properties: {
            poolKey: { type: 'string' },
            volume24h: { type: 'string', example: '15000000000' },
            volume7d: { type: 'string', example: '89000000000' },
            fees24h: { type: 'string', example: '45000000' },
            fees7d: { type: 'string', example: '267000000' },
            tvl: { type: 'string', example: '500000000000' },
            txCount24h: { type: 'integer', example: 342 },
            apy: { type: 'number', description: 'Annualized yield estimate', example: 3.29 },
          },
        },

        SwapEvent: {
          type: 'object',
          properties: {
            txId: { type: 'string', example: '7kPFrHDiGw8rXs4yFnCJTqW6fCtN8EQ5Kp...' },
            poolKey: { type: 'string' },
            sender: { type: 'string', example: '3Da7xwRRtXfkA46jaKTYb75Usd2ZNWdY6HX' },
            inputAsset: { type: 'string' },
            outputAsset: { type: 'string' },
            amountIn: { type: 'string', example: '100000000' },
            amountOut: { type: 'string', example: '49850000' },
            feeBps: { type: 'integer', example: 30 },
            blockHeight: { type: 'integer' },
            timestamp: { type: 'integer' },
          },
        },

        // ── Quote Schemas ──────────────────────────────────────
        SwapQuote: {
          type: 'object',
          description: 'Computed swap quote with price impact and slippage protection.',
          properties: {
            poolId: { type: 'string', description: 'On-chain pool ID' },
            assetIn: { type: 'string' },
            assetOut: { type: 'string' },
            feeBps: { type: 'integer' },
            amountIn: { type: 'string', description: 'Input amount (raw units)' },
            amountOut: { type: 'string', description: 'Expected output amount (raw units)' },
            minAmountOut: { type: 'string', description: 'Minimum output after slippage' },
            priceImpactBps: { type: 'string', description: 'Price impact in basis points' },
            feeAmount: { type: 'string', description: 'Fee deducted (raw units)' },
            route: { type: 'string', description: 'Routing path' },
          },
        },

        AddLiquidityEstimate: {
          type: 'object',
          properties: {
            estimate: {
              type: 'object',
              properties: {
                lpMinted: { type: 'string', description: 'LP tokens to be minted' },
                actualAmountA: { type: 'string', description: 'Actual assetA deposited' },
                actualAmountB: { type: 'string', description: 'Actual assetB deposited' },
                refundA: { type: 'string', description: 'AssetA refunded (excess)' },
                refundB: { type: 'string', description: 'AssetB refunded (excess)' },
              },
            },
          },
        },

        RemoveLiquidityEstimate: {
          type: 'object',
          properties: {
            estimate: {
              type: 'object',
              properties: {
                amountA: { type: 'string', description: 'AssetA returned' },
                amountB: { type: 'string', description: 'AssetB returned' },
              },
            },
          },
        },

        // ── Transaction Request/Response Schemas ───────────────
        SwapRequest: {
          type: 'object',
          required: ['assetIn', 'assetOut', 'amountIn'],
          properties: {
            assetIn: { type: 'string', description: 'Input asset ID (or `DCC`)' },
            assetOut: { type: 'string', description: 'Output asset ID (or `DCC`)' },
            amountIn: { type: 'string', description: 'Amount to swap (raw integer units as string)' },
            feeBps: { type: 'integer', description: 'Fee tier (default 30)', default: 30 },
            slippageBps: { type: 'integer', description: 'Slippage tolerance bps (default 50)', default: 50 },
            deadline: { type: 'integer', description: 'Tx deadline timestamp (ms). Default: now + 2min' },
          },
        },

        AddLiquidityRequest: {
          type: 'object',
          required: ['assetA', 'assetB', 'amountA', 'amountB'],
          properties: {
            assetA: { type: 'string' },
            assetB: { type: 'string' },
            amountA: { type: 'string', description: 'Desired assetA deposit (raw units)' },
            amountB: { type: 'string', description: 'Desired assetB deposit (raw units)' },
            feeBps: { type: 'integer', default: 30 },
            slippageBps: { type: 'integer', default: 50 },
            deadline: { type: 'integer' },
          },
        },

        RemoveLiquidityRequest: {
          type: 'object',
          required: ['assetA', 'assetB', 'lpAmount'],
          properties: {
            assetA: { type: 'string' },
            assetB: { type: 'string' },
            lpAmount: { type: 'string', description: 'LP tokens to burn (raw units)' },
            feeBps: { type: 'integer', default: 30 },
            slippageBps: { type: 'integer', default: 50 },
            deadline: { type: 'integer' },
          },
        },

        CreatePoolRequest: {
          type: 'object',
          required: ['assetA', 'assetB'],
          properties: {
            assetA: { type: 'string', description: 'First asset (or `DCC`)' },
            assetB: { type: 'string', description: 'Second asset' },
            feeBps: { type: 'integer', description: 'Fee tier (default 30)', default: 30 },
          },
        },

        InvokeScriptTx: {
          type: 'object',
          description: 'Unsigned InvokeScript transaction for DecentralChain. Sign client-side before broadcast.',
          properties: {
            type: { type: 'integer', enum: [16], description: 'Transaction type (16 = InvokeScript)' },
            dApp: { type: 'string', description: 'Target dApp address' },
            call: {
              type: 'object',
              properties: {
                function: { type: 'string', description: 'Callable function name' },
                args: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: ['string', 'integer', 'boolean'] },
                      value: { description: 'Argument value' },
                    },
                  },
                },
              },
            },
            payment: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  assetId: { type: 'string', nullable: true, description: 'null for DCC native token' },
                  amount: { type: 'integer' },
                },
              },
            },
            fee: { type: 'integer', description: 'Transaction fee (default 900000)' },
            chainId: { type: 'string', description: 'Chain ID (D for mainnet)' },
          },
        },

        SwapTxResponse: {
          type: 'object',
          properties: {
            tx: { $ref: '#/components/schemas/InvokeScriptTx' },
            quote: { $ref: '#/components/schemas/SwapQuote' },
          },
        },

        AddLiquidityTxResponse: {
          type: 'object',
          properties: {
            tx: { $ref: '#/components/schemas/InvokeScriptTx' },
            estimate: { type: 'object', description: 'LP tokens minted and actual deposit amounts' },
          },
        },

        RemoveLiquidityTxResponse: {
          type: 'object',
          properties: {
            tx: { $ref: '#/components/schemas/InvokeScriptTx' },
            estimate: { type: 'object', description: 'Token amounts returned' },
          },
        },

        CreatePoolTxResponse: {
          type: 'object',
          properties: {
            tx: { $ref: '#/components/schemas/InvokeScriptTx' },
          },
        },

        // ── User Schemas ───────────────────────────────────────
        LpPosition: {
          type: 'object',
          description: 'User\'s liquidity position in a pool.',
          properties: {
            poolId: { type: 'string', description: 'On-chain pool ID' },
            token0: { type: 'string' },
            token1: { type: 'string' },
            lpBalance: { type: 'string', description: 'User LP token balance (raw units)' },
            lpSupply: { type: 'string', description: 'Total LP supply' },
            poolSharePct: { type: 'number', description: 'User share of pool (percent)', example: 12.5 },
            reserve0: { type: 'string', description: 'Total pool reserve of token0' },
            reserve1: { type: 'string', description: 'Total pool reserve of token1' },
            userReserve0: { type: 'string', description: 'User proportional share of token0' },
            userReserve1: { type: 'string', description: 'User proportional share of token1' },
            feeBps: { type: 'string' },
            lpAssetId: { type: 'string', description: 'LP token asset ID' },
          },
        },

        BalanceResponse: {
          type: 'object',
          properties: {
            address: { type: 'string' },
            assetId: { type: 'string' },
            balance: { type: 'string', description: 'Token balance (raw units)' },
          },
        },

        TokenInfo: {
          type: 'object',
          properties: {
            assetId: { type: 'string' },
            name: { type: 'string' },
            decimals: { type: 'integer' },
            description: { type: 'string' },
            quantity: { type: 'integer', description: 'Total supply' },
            scripted: { type: 'boolean' },
          },
        },
      },
    },
  };
}
