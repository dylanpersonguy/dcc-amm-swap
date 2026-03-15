/**
 * Transaction builder — creates InvokeScript transaction params
 * ready for signing via Signer or direct broadcast.
 *
 * v3: Matches Pool.ride v3 callable signatures exactly.
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
  LockLiquidityParams,
  ClaimLpTokensParams,
} from './types';

const DEFAULT_INVOKE_FEE = 900000;
const ISSUE_INVOKE_FEE = 100500000; // Required when tx issues a new asset (1.005 DCC)

function paymentAssetId(assetId: string | null | undefined): string | null {
  if (!assetId || assetId === DCC_ASSET_ID) return null;
  return assetId;
}

export class TxBuilder {
  private readonly dAppAddress: string;
  private readonly routerAddress: string;
  private readonly chainId: string;

  constructor(config: AmmSdkConfig) {
    this.dAppAddress = config.dAppAddress;
    this.routerAddress = config.routerAddress || config.dAppAddress;
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
      fee: ISSUE_INVOKE_FEE,
      chainId: this.chainId,
    };
  }

  /** removeLiquidity(assetA, assetB, feeBps, lpAmount, aMin, bMin, deadline) — send LP tokens as payment */
  buildRemoveLiquidity(params: RemoveLiquidityParamsV2): InvokeScriptTx {
    const payment: Array<{ assetId: string | null; amount: number }> = [];
    if (params.lpAssetId) {
      payment.push({ assetId: params.lpAssetId, amount: Number(params.lpAmount) });
    }
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
      payment,
      fee: DEFAULT_INVOKE_FEE,
      chainId: this.chainId,
    };
  }

  /** swapExactIn(assetIn, assetOut, feeBps, amountIn, minAmountOut, deadline) — targets Router */
  buildSwapExactIn(params: SwapExactInParamsV2): InvokeScriptTx {
    return {
      type: 16,
      dApp: this.routerAddress,
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

  /** lockLiquidity(assetA, assetB, feeBps) — send LP tokens as payment to permanently lock liquidity */
  buildLockLiquidity(params: LockLiquidityParams): InvokeScriptTx {
    return {
      type: 16,
      dApp: this.dAppAddress,
      call: {
        function: 'lockLiquidity',
        args: [
          { type: 'string', value: params.assetA },
          { type: 'string', value: params.assetB },
          { type: 'integer', value: params.feeBps },
        ],
      },
      payment: [
        { assetId: params.lpAssetId, amount: Number(params.lpAmount) },
      ],
      fee: DEFAULT_INVOKE_FEE,
      chainId: this.chainId,
    };
  }

  /** claimLpTokens(assetA, assetB, feeBps) — claim real LP tokens for legacy pool internal balance */
  buildClaimLpTokens(params: ClaimLpTokensParams): InvokeScriptTx {
    return {
      type: 16,
      dApp: this.dAppAddress,
      call: {
        function: 'claimLpTokens',
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
}
