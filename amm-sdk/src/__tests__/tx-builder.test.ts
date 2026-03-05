import { TxBuilder } from '../tx-builder';
import { AmmSdkConfig } from '../types';

const config: AmmSdkConfig = {
  nodeUrl: 'https://nodes.decentralchain.io',
  dAppAddress: '3PAmmDAppAddress',
  chainId: 'D',
};

describe('TxBuilder', () => {
  const builder = new TxBuilder(config);

  describe('buildSwapExactIn', () => {
    it('builds correct invoke structure', () => {
      const tx = builder.buildSwapExactIn({
        poolKey: 'DCC_3PToken',
        inputAssetId: null,
        amountIn: 100000000n,
        minAmountOut: 95000000n,
        deadline: 1000000,
      });

      expect(tx.type).toBe(16);
      expect(tx.dApp).toBe('3PAmmDAppAddress');
      expect(tx.call.function).toBe('swapExactIn');
      expect(tx.call.args).toHaveLength(3);
      expect(tx.call.args[0]).toEqual({ type: 'string', value: 'DCC_3PToken' });
      expect(tx.call.args[1]).toEqual({ type: 'integer', value: 95000000 });
      expect(tx.call.args[2]).toEqual({ type: 'integer', value: 1000000 });
      expect(tx.payment).toHaveLength(1);
      expect(tx.payment[0].assetId).toBeNull(); // DCC
      expect(tx.payment[0].amount).toBe(100000000);
    });
  });

  describe('buildCreatePool', () => {
    it('builds correct structure with two payments', () => {
      const tx = builder.buildCreatePool({
        assetA: null,
        assetB: '3PTokenB',
        amountA: 1000000n,
        amountB: 2000000n,
        feeBps: 30n,
      });

      expect(tx.call.function).toBe('createPool');
      expect(tx.call.args[0]).toEqual({ type: 'integer', value: 30 });
      expect(tx.payment).toHaveLength(2);
    });
  });

  describe('buildAddLiquidity', () => {
    it('builds correct structure', () => {
      const tx = builder.buildAddLiquidity({
        poolKey: 'DCC_3PToken',
        assetA: null,
        assetB: '3PToken',
        amountA: 500000n,
        amountB: 1000000n,
        minLpOut: 700000n,
        deadline: 1000000,
      });

      expect(tx.call.function).toBe('addLiquidity');
      expect(tx.call.args).toHaveLength(3);
      expect(tx.payment).toHaveLength(2);
    });
  });

  describe('buildRemoveLiquidity', () => {
    it('builds correct structure with LP payment', () => {
      const tx = builder.buildRemoveLiquidity({
        poolKey: 'DCC_3PToken',
        lpAssetId: '3PLpToken',
        lpAmount: 100000n,
        minAOut: 45000n,
        minBOut: 90000n,
        deadline: 1000000,
      });

      expect(tx.call.function).toBe('removeLiquidity');
      expect(tx.call.args).toHaveLength(4);
      expect(tx.payment).toHaveLength(1);
      expect(tx.payment[0].assetId).toBe('3PLpToken');
    });
  });
});
