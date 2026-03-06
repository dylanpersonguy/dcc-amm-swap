/**
 * DCC Bridge API — OpenAPI 3.0 Swagger specification.
 */

import { config } from './config';

export function getSwaggerSpec() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'DCC Bridge API',
      version: '1.0.0',
      description:
        'Cross-chain bridge service for converting SOL, USDT, and USDC on Solana into DCC on DecentralChain. ' +
        'The bridge monitors Solana deposit addresses, confirms transactions, and automatically sends DCC payouts to the specified recipient.',
      contact: { name: 'DCC AMM Team' },
      license: { name: 'MIT' },
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Local development',
      },
    ],
    tags: [
      { name: 'Health', description: 'Service health and status' },
      { name: 'Deposits', description: 'Create and track cross-chain deposit orders' },
      { name: 'Fees', description: 'Bridge fee structure and quote calculator' },
      { name: 'History', description: 'Order history and lookup' },
      { name: 'Stats', description: 'Aggregate bridge statistics' },
      { name: 'Admin', description: 'Administrative endpoints (requires API key)' },
    ],
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Service health check',
          description: 'Returns the operational status of the bridge, including Solana RPC connectivity and DCC node availability.',
          operationId: 'getHealth',
          responses: {
            200: {
              description: 'Health status',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthResponse' },
                  example: {
                    status: 'ok',
                    solana: true,
                    dcc: true,
                    timestamp: '2026-03-06T12:00:00.000Z',
                  },
                },
              },
            },
          },
        },
      },

      '/deposit/limits': {
        get: {
          tags: ['Deposits'],
          summary: 'Get deposit limits',
          description:
            'Returns the minimum and maximum deposit amounts for each supported coin (SOL, USDT, USDC), ' +
            'denominated in both USD and native coin units. Limits are derived from the configured DCC price.',
          operationId: 'getDepositLimits',
          responses: {
            200: {
              description: 'Deposit limits per coin',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/DepositLimitsResponse' },
                },
              },
            },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      '/deposit': {
        post: {
          tags: ['Deposits'],
          summary: 'Create a native SOL deposit order',
          description:
            'Creates a new deposit order for native SOL. Returns a unique Solana deposit address that the user ' +
            'should send funds to. The bridge monitors this address and automatically sends DCC to the recipient ' +
            'once the deposit is confirmed. Orders expire after 30 minutes if no deposit is received.',
          operationId: 'createDeposit',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateDepositRequest' },
                example: {
                  coin: 'SOL',
                  amountUsd: 100,
                  dccAmount: 1960,
                  dccRecipient: '3Da7xwRRtXfkA46jaKTYb75Usd2ZNWdY6HX',
                  userId: '12345',
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Deposit order created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/DepositOrderResponse' },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      '/deposit/spl': {
        post: {
          tags: ['Deposits'],
          summary: 'Create an SPL token deposit order (USDT/USDC)',
          description:
            'Creates a new deposit order for SPL tokens (USDT or USDC on Solana). Works identically to the native ' +
            'SOL deposit endpoint but only accepts USDT and USDC as the coin type. The generated deposit address ' +
            'will accept the corresponding SPL token transfer.',
          operationId: 'createSplDeposit',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateDepositRequest' },
                example: {
                  coin: 'USDC',
                  amountUsd: 50,
                  dccAmount: 980,
                  dccRecipient: '3Da7xwRRtXfkA46jaKTYb75Usd2ZNWdY6HX',
                  userId: '12345',
                },
              },
            },
          },
          responses: {
            200: {
              description: 'SPL deposit order created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/DepositOrderResponse' },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      '/fees': {
        get: {
          tags: ['Fees'],
          summary: 'Get fee structure',
          description: 'Returns the current bridge fee percentage and DCC price used for conversions.',
          operationId: 'getFees',
          responses: {
            200: {
              description: 'Fee structure',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/FeesResponse' },
                  example: {
                    bridgeFeePct: 1.0,
                    dccPriceUsd: 0.05,
                    description: '1% bridge fee on deposits',
                  },
                },
              },
            },
          },
        },
      },

      '/fees/quote': {
        get: {
          tags: ['Fees'],
          summary: 'Get a fee quote for a deposit',
          description:
            'Calculates the exact fees, net DCC received, and exchange rate for a given deposit amount. ' +
            'Use this to show users a preview before they initiate a deposit.',
          operationId: 'getFeeQuote',
          parameters: [
            {
              name: 'coin',
              in: 'query',
              required: true,
              description: 'Source coin (SOL, USDT, or USDC)',
              schema: { type: 'string', enum: ['SOL', 'USDT', 'USDC'] },
            },
            {
              name: 'amountUsd',
              in: 'query',
              required: true,
              description: 'Deposit amount in USD',
              schema: { type: 'number', minimum: 0.01 },
            },
          ],
          responses: {
            200: {
              description: 'Fee quote',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/FeeQuoteResponse' },
                  example: {
                    coin: 'SOL',
                    amountUsd: 100,
                    networkFee: '0',
                    bridgeFee: '0.006849',
                    totalFee: '0.006849',
                    dccReceived: '1980',
                    rate: 20,
                  },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      '/history/{address}': {
        get: {
          tags: ['History'],
          summary: 'Get order history by DCC address',
          description:
            'Returns all deposit orders for a given DCC recipient address, sorted by creation date (newest first). ' +
            'Useful for displaying a user\'s bridge transaction history.',
          operationId: 'getHistory',
          parameters: [
            {
              name: 'address',
              in: 'path',
              required: true,
              description: 'DCC recipient address (e.g. 3Da7xwRRtXfkA46jaKTYb75Usd2ZNWdY6HX)',
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'List of orders',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/OrderSummary' },
                  },
                },
              },
            },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      '/{id}': {
        get: {
          tags: ['History'],
          summary: 'Get order by ID',
          description:
            'Retrieves a single deposit order by its UUID. Returns the current status, deposit details, ' +
            'and DCC transaction ID if the payout has been completed.',
          operationId: 'getOrder',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'Order UUID',
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            200: {
              description: 'Order details',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/OrderSummary' },
                },
              },
            },
            404: {
              description: 'Order not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                  example: { error: 'Order not found' },
                },
              },
            },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      '/stats': {
        get: {
          tags: ['Stats'],
          summary: 'Get aggregate bridge statistics',
          description: 'Returns aggregate statistics including total orders, completion counts, pending count, total DCC bridged, and total USD volume.',
          operationId: 'getStats',
          responses: {
            200: {
              description: 'Bridge statistics',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StatsResponse' },
                  example: {
                    totalOrders: 142,
                    completed: 130,
                    pending: 3,
                    totalDcc: '260000',
                    totalUsd: 13000,
                  },
                },
              },
            },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },

      '/admin/orders': {
        get: {
          tags: ['Admin'],
          summary: 'List all orders (admin)',
          description: 'Returns all deposit orders, newest first. Requires the `x-api-key` header.',
          operationId: 'adminListOrders',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            {
              name: 'limit',
              in: 'query',
              description: 'Maximum number of orders to return (default 100)',
              schema: { type: 'integer', default: 100, minimum: 1, maximum: 1000 },
            },
          ],
          responses: {
            200: {
              description: 'Order list',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      count: { type: 'integer' },
                      orders: { type: 'array', items: { $ref: '#/components/schemas/FullOrder' } },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },

      '/admin/pending': {
        get: {
          tags: ['Admin'],
          summary: 'List pending orders (admin)',
          description: 'Returns all orders with status `pending` or `confirming`. Requires the `x-api-key` header.',
          operationId: 'adminListPending',
          security: [{ ApiKeyAuth: [] }],
          responses: {
            200: {
              description: 'Pending order list',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      count: { type: 'integer' },
                      orders: { type: 'array', items: { $ref: '#/components/schemas/FullOrder' } },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },

      '/admin/retry/{id}': {
        post: {
          tags: ['Admin'],
          summary: 'Retry a failed order (admin)',
          description:
            'Re-attempts the DCC payout for a failed order. Only works on orders with status `failed`. ' +
            'The order status is set to `confirming` and the deposit processing pipeline is re-triggered.',
          operationId: 'adminRetryOrder',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'Order UUID to retry',
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            200: {
              description: 'Retry result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      order: { $ref: '#/components/schemas/FullOrder' },
                    },
                  },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: {
              description: 'Order not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            500: { $ref: '#/components/responses/ServerError' },
          },
        },
      },
    },

    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Admin API key set via ADMIN_API_KEY environment variable',
        },
      },

      responses: {
        BadRequest: {
          description: 'Invalid request parameters',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { error: 'Missing required fields: coin, amountUsd, dccAmount, dccRecipient, userId' },
            },
          },
        },
        Unauthorized: {
          description: 'Missing or invalid API key',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { error: 'Unauthorized' },
            },
          },
        },
        ServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
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
            status: {
              type: 'string',
              enum: ['ok', 'degraded'],
              description: 'Overall service status',
            },
            solana: { type: 'boolean', description: 'Solana RPC connectivity' },
            dcc: { type: 'boolean', description: 'DCC node connectivity' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },

        DepositLimitsResponse: {
          type: 'object',
          properties: {
            minUsd: { type: 'number', description: 'Minimum deposit in USD' },
            maxUsd: { type: 'number', description: 'Maximum deposit in USD' },
            coins: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  coin: { type: 'string', enum: ['SOL', 'USDT', 'USDC'] },
                  minAmount: { type: 'string', description: 'Minimum deposit in native coin units' },
                  maxAmount: { type: 'string', description: 'Maximum deposit in native coin units' },
                  decimals: { type: 'integer', description: 'Token decimal places' },
                  price: { type: 'number', description: 'Current USD price of the coin' },
                },
              },
            },
          },
        },

        CreateDepositRequest: {
          type: 'object',
          required: ['coin', 'amountUsd', 'dccAmount', 'dccRecipient', 'userId'],
          properties: {
            coin: {
              type: 'string',
              enum: ['SOL', 'USDT', 'USDC'],
              description: 'Source cryptocurrency',
            },
            amountUsd: {
              type: 'number',
              description: 'Deposit value in USD',
              minimum: 0.01,
            },
            dccAmount: {
              type: 'number',
              description: 'Expected DCC tokens to receive (after fees)',
            },
            dccRecipient: {
              type: 'string',
              description: 'DCC address to receive the payout',
              example: '3Da7xwRRtXfkA46jaKTYb75Usd2ZNWdY6HX',
            },
            userId: {
              type: 'string',
              description: 'User identifier (e.g. Telegram user ID)',
            },
          },
        },

        DepositOrderResponse: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Unique order ID' },
            depositAddress: { type: 'string', description: 'Solana address to send funds to' },
            depositAmount: { type: 'string', description: 'Expected deposit amount in native coin units' },
            coin: { type: 'string', enum: ['SOL', 'USDT', 'USDC'] },
            dccAmount: { type: 'string', description: 'DCC tokens to be sent on completion' },
            expiresAt: { type: 'string', format: 'date-time', description: 'Order expiration timestamp' },
            status: { type: 'string', enum: ['pending'], description: 'Initial order status' },
          },
        },

        OrderSummary: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            status: { $ref: '#/components/schemas/OrderStatus' },
            depositAddress: { type: 'string', description: 'Solana deposit address' },
            depositAmount: { type: 'string', description: 'Deposit amount in coin units' },
            coin: { type: 'string', enum: ['SOL', 'USDT', 'USDC'] },
            dccAmount: { type: 'string', description: 'DCC payout amount' },
            dccTxId: {
              type: 'string',
              nullable: true,
              description: 'DCC payout transaction ID (present when completed)',
            },
            confirmedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'Completion timestamp (present when completed)',
            },
            expiresAt: { type: 'string', format: 'date-time' },
          },
        },

        FullOrder: {
          type: 'object',
          description: 'Complete order record (admin view)',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'integer' },
            coin: { type: 'string', enum: ['SOL', 'USDT', 'USDC'] },
            depositAddress: { type: 'string' },
            depositAmount: { type: 'string' },
            dccAmount: { type: 'string' },
            dccRecipient: { type: 'string' },
            amountUsd: { type: 'number' },
            networkFee: { type: 'string' },
            bridgeFee: { type: 'string' },
            status: { $ref: '#/components/schemas/OrderStatus' },
            solTxId: { type: 'string', nullable: true },
            dccTxId: { type: 'string', nullable: true },
            expiresAt: { type: 'integer', description: 'Unix timestamp' },
            createdAt: { type: 'integer', description: 'Unix timestamp' },
            updatedAt: { type: 'integer', description: 'Unix timestamp' },
          },
        },

        FeesResponse: {
          type: 'object',
          properties: {
            bridgeFeePct: { type: 'number', description: 'Bridge fee percentage (e.g. 1.0 = 1%)' },
            dccPriceUsd: { type: 'number', description: 'DCC price in USD used for conversions' },
            description: { type: 'string' },
          },
        },

        FeeQuoteResponse: {
          type: 'object',
          properties: {
            coin: { type: 'string', enum: ['SOL', 'USDT', 'USDC'] },
            amountUsd: { type: 'number', description: 'Input deposit amount in USD' },
            networkFee: { type: 'string', description: 'Network fee in coin units (currently 0)' },
            bridgeFee: { type: 'string', description: 'Bridge fee in coin units' },
            totalFee: { type: 'string', description: 'Total fee in coin units' },
            dccReceived: { type: 'string', description: 'Net DCC tokens the user will receive' },
            rate: { type: 'number', description: 'USD to DCC exchange rate (e.g. 20 = 1 USD = 20 DCC)' },
          },
        },

        StatsResponse: {
          type: 'object',
          properties: {
            totalOrders: { type: 'integer', description: 'Total number of deposit orders created' },
            completed: { type: 'integer', description: 'Number of successfully completed payouts' },
            pending: { type: 'integer', description: 'Number of orders awaiting deposit or confirmation' },
            totalDcc: { type: 'string', description: 'Total DCC bridged (completed orders)' },
            totalUsd: { type: 'number', description: 'Total USD volume (completed orders)' },
          },
        },

        OrderStatus: {
          type: 'string',
          enum: ['pending', 'confirming', 'completed', 'expired', 'failed'],
          description:
            'Order lifecycle: pending → confirming → completed. ' +
            'Can also transition to expired (no deposit received) or failed (payout error).',
        },
      },
    },
  };
}
