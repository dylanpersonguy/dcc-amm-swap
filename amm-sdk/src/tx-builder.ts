/**
 * Transaction builder — creates InvokeScript transaction params
 * ready for signing via Signer or direct broadcast.
 *
 * All amounts are in raw integer units. No decimal normalization on-chain.
 */

import { DCC_ASSET_ID } from '@dcc-amm/core';
import {
  AmmSdkConfig,
  InvokeScriptTx,
  SwapParams,
  AddLiquidityParams,
  RemoveLiquidityParams,
  CreatePoolParams,
} from './types';

const DEFAULT_INVOKE_FEE = 900000; // 0.009 DCC (smart account extra fee)

/**
 * Normalize asset ID for payment: DCC → null, otherwise string
 */
function paymentAssetId(assetId: string | null | undefined): string | null {
  if (!assetId || assetId === DCC_ASSET_ID) return null;
  return assetId;
}

export class TxBuilder {
  private readonly dAppAddress: string;
  private readonly chainId: string;

  constructor(config: AmmSdkConfig) {
    this.dAppAddress = config.dAppAddress;
    this.chainId = config.chainId;
  }

  /**
   * Build a createPool InvokeScript transaction.
   */
  buildCreatePool(params: CreatePoolParams): InvokeScriptTx {
    return {
      type: 16,
      dApp: this.dAppAddress,
      call: {
        function: 'createPool',
        args: [
          { type: 'integer', value: Number(params.feeBps) },
        ],
      },
      payment: [
        {
          assetId: paymentAssetId(params.assetA),
          amount: Number(params.amountA),
        },
        {
          assetId: paymentAssetId(params.assetB),
          amount: Number(params.amountB),
        },
      ],
      fee: DEFAULT_INVOKE_FEE,
      chainId: this.chainId,
    };
  }

  /**
   * Build an addLiquidity InvokeScript transaction.
   */
  buildAddLiquidity(params: AddLiquidityParams): InvokeScriptTx {
    return {
      type: 16,
      dApp: this.dAppAddress,
      call: {
        function: 'addLiquidity',
        args: [
          { type: 'string', value: params.poolKey },
          { type: 'integer', value: Number(params.minLpOut) },
          { type: 'integer', value: params.deadline },
        ],
      },
      payment: [
        {
          assetId: paymentAssetId(params.assetA),
          amount: Number(params.amountA),
        },
        {
          assetId: paymentAssetId(params.assetB),
          amount: Number(params.amountB),
        },
      ],
      fee: DEFAULT_INVOKE_FEE,
      chainId: this.chainId,
    };
  }

  /**
   * Build a removeLiquidity InvokeScript transaction.
   */
  buildRemoveLiquidity(params: RemoveLiquidityParams): InvokeScriptTx {
    return {
      type: 16,
      dApp: this.dAppAddress,
      call: {
        function: 'removeLiquidity',
        args: [
          { type: 'string', value: params.poolKey },
          { type: 'integer', value: Number(params.minAOut) },
          { type: 'integer', value: Number(params.minBOut) },
          { type: 'integer', value: params.deadline },
        ],
      },
      payment: [
        {
          assetId: params.lpAssetId,
          amount: Number(params.lpAmount),
        },
      ],
      fee: DEFAULT_INVOKE_FEE,
      chainId: this.chainId,
    };
  }

  /**
   * Build a swapExactIn InvokeScript transaction.
   */
  buildSwapExactIn(params: SwapParams): InvokeScriptTx {
    return {
      type: 16,
      dApp: this.dAppAddress,
      call: {
        function: 'swapExactIn',
        args: [
          { type: 'string', value: params.poolKey },
          { type: 'integer', value: Number(params.minAmountOut) },
          { type: 'integer', value: params.deadline },
        ],
      },
      payment: [
        {
          assetId: paymentAssetId(params.inputAssetId),
          amount: Number(params.amountIn),
        },
      ],
      fee: DEFAULT_INVOKE_FEE,
      chainId: this.chainId,
    };
  }
}
