import { TxBuilder } from '../tx-builder';
import { AmmSdkConfig } from '../types';

const config: AmmSdkConfig = {
  nodeUrl: 'https://nodes.decentralchain.io',
  dAppAddress: '3PAmmDAppAddress',
  chainId: 'D',
};

describe('TxBuilder v2', () => {
  const builder = new TxBuilder(config);

  describe('buildSwapExactIn', () => {
    it('builds correct v2 invoke structure', () => {
      const tx = builder.buildSwapExactIn({
        assetIn: 'DCC',
        assetOut: '3PTokenB',
        feeBps: 30,
        amountIn: 100000000n,
        minAmountOut: 95000000n,
        deadline: 1700000000000,
      });

      expect(tx.type).toBe(16);
      expect(tx.dApp).toBe('3PAmmDAppAddress');
      expect(tx.call.function).toBe('swapExactIn');
      expect(tx.call.args).toHaveLength(6);
      expect(tx.call.args[0]).toEqual({ type: 'string', value: 'DCC' });
      expect(tx.call.args[1]).toEqual({ type: 'string', value: '3PTokenB' });
      expect(tx.call.args[2]).toEqual({ type: 'integer', value: 30 });
      expect(tx.call.args[3]).toEqual({ type: 'integer', value: 100000000 });
      expect(tx.call.args[4]).toEqual({ type: 'integer', value: 95000000 });
      expect(tx.call.args[5]).toEqual({ type: 'integer', value: 1700000000000 });
      expect(tx.payment).toHaveLength(1);
      expect(tx.payment[0].assetId).toBeNull(); // DCC = null
      expect(tx.payment[0].amount).toBe(100000000);
    });
  });

  describe('buildCreatePool', () => {
    it('builds v2 createPool with no payments', () => {
      const tx = builder.buildCreatePool({
        assetA: 'DCC',
        assetB: '3PTokenB',
        feeBps: 30,
      });

      expect(tx.call.function).toBe('createPool');
      expect(tx.call.args).toHaveLength(3);
      expect(tx.call.args[0]).toEqual({ type: 'string', value: 'DCC' });
      expect(tx.call.args[1]).toEqual({ type: 'string', value: '3PTokenB' });
      expect(tx.call.args[2]).toEqual({ type: 'integer', value: 30 });
      expect(tx.payment).toHaveLength(0);
    });
  });

  describe('buildAddLiquidity', () => {
    it('builds v2 addLiquidity with 8 args + 2 payments', () => {
      const tx = builder.buildAddLiquidity({
        assetA: 'DCC',
        assetB: '3PToken',
        feeBps: 30,
        amountADesired: 500000n,
        amountBDesired: 1000000n,
        amountAMin: 475000n,
        amountBMin: 950000n,
        deadline: 1700000000000,
      });

      expect(tx.call.function).toBe('addLiquidity');
      expect(tx.call.args).toHaveLength(8);
      expect(tx.call.args[0]).toEqual({ type: 'string', value: 'DCC' });
      expect(tx.call.args[1]).toEqual({ type: 'string', value: '3PToken' });
      expect(tx.call.args[2]).toEqual({ type: 'integer', value: 30 });
      expect(tx.call.args[3]).toEqual({ type: 'integer', value: 500000 });
      expect(tx.call.args[4]).toEqual({ type: 'integer', value: 1000000 });
      expect(tx.payment).toHaveLength(2);
    });
  });

  describe('buildRemoveLiquidity', () => {
    it('builds v2 removeLiquidity with no payments (state LP)', () => {
      const tx = builder.buildRemoveLiquidity({
        assetA: 'DCC',
        assetB: '3PToken',
        feeBps: 30,
        lpAmount: 100000n,
        amountAMin: 45000n,
        amountBMin: 90000n,
        deadline: 1700000000000,
      });

      expect(tx.call.function).toBe('removeLiquidity');
      expect(tx.call.args).toHaveLength(7);
      expect(tx.payment).toHaveLength(0); // v2: no LP payment
    });
  });
});
