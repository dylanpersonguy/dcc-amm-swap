/**
 * Transaction builder — creates InvokeScript transaction params
 * ready for signing via Signer or direct broadcast.
 *
 * v2: Matches Pool.ride v2 callable signatures exactly.
 * All amounts are in raw integer units.
 */

import { DCC_ASSET_ID } from '@dcc-amm/core';
import {
  AmmSdkConfig,
  InvokeScriptTx,
  CreatePoolParamsV2,
  AddLiquidityParamsV2,
  RemoveLiquidityParamsV2,
  SwapExactInParamsV2,
} from './types';

const DEFAULT_INVOKE_FEE = 900000;

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

  /** createPool(assetA, assetB, feeBps) — no payments */
  buildCreatePool(params: CreatePoolParamsV2): InvokeScriptTx {
    return {
      type: 16,
      dApp: this.dAppAddress,
      call: {
        function: 'createPool',
        args: [
          { type: 'string', value: params.assetA },
          { type: 'string', value: params.assetB },
          { type: 'integer', value: params.feeBps },
        ],
      },
      payment: [],
      fee: DEFAULT_INVOKE_FEE,
      chainId: this.chainId,
    };
  }

  /** addLiquidity(assetA, assetB, feeBps, aDesired, bDesired, aMin, bMin, deadline) */
  buildAddLiquidity(params: AddLiquidityParamsV2): InvokeScriptTx {
    return {
      type: 16,
      dApp: this.dAppAddress,
      call: {
        function: 'addLiquidity',
        args: [
          { type: 'string', value: params.assetA },
          { type: 'string', value: params.assetB },
          { type: 'integer', value: params.feeBps },
          { type: 'integer', value: Number(params.amountADesired) },
          { type: 'integer', value: Number(params.amountBDesired) },
          { type: 'integer', value: Number(params.amountAMin) },
          { type: 'integer', value: Number(params.amountBMin) },
          { type: 'integer', value: params.deadline },
        ],
      },
      payment: [
        { assetId: paymentAssetId(params.assetA), amount: Number(params.amountADesired) },
        { assetId: paymentAssetId(params.assetB), amount: Number(params.amountBDesired) },
      ],
      fee: DEFAULT_INVOKE_FEE,
      chainId: this.chainId,
    };
  }

  /** removeLiquidity(assetA, assetB, feeBps, lpAmount, aMin, bMin, deadline) — no payments */
  buildRemoveLiquidity(params: RemoveLiquidityParamsV2): InvokeScriptTx {
    return {
      type: 16,
      dApp: this.dAppAddress,
      call: {
        function: 'removeLiquidity',
        args: [
          { type: 'string', value: params.assetA },
          { type: 'string', value: params.assetB },
          { type: 'integer', value: params.feeBps },
          { type: 'integer', value: Number(params.lpAmount) },
          { type: 'integer', value: Number(params.amountAMin) },
          { type: 'integer', value: Number(params.amountBMin) },
          { type: 'integer', value: params.deadline },
        ],
      },
      payment: [],
      fee: DEFAULT_INVOKE_FEE,
      chainId: this.chainId,
    };
  }

  /** swapExactIn(assetIn, assetOut, feeBps, amountIn, minAmountOut, deadline) */
  buildSwapExactIn(params: SwapExactInParamsV2): InvokeScriptTx {
    return {
      type: 16,
      dApp: this.dAppAddress,
      call: {
        function: 'swapExactIn',
        args: [
          { type: 'string', value: params.assetIn },
          { type: 'string', value: params.assetOut },
          { type: 'integer', value: params.feeBps },
          { type: 'integer', value: Number(params.amountIn) },
          { type: 'integer', value: Number(params.minAmountOut) },
          { type: 'integer', value: params.deadline },
        ],
      },
      payment: [
        { assetId: paymentAssetId(params.assetIn), amount: Number(params.amountIn) },
      ],
      fee: DEFAULT_INVOKE_FEE,
      chainId: this.chainId,
    };
  }
}
