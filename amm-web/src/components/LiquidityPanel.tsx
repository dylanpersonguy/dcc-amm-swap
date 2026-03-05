/**
 * LiquidityPanel — Add/Remove liquidity interface.
 */

import React, { useState, useCallback } from 'react';
import { useWallet } from '../context/WalletContext';
import { useSdk } from '../context/SdkContext';
import { config } from '../config';

type LiquidityMode = 'add' | 'remove';

export function LiquidityPanel() {
  const wallet = useWallet();
  const sdk = useSdk();

  const [mode, setMode] = useState<LiquidityMode>('add');
  const [assetA, setAssetA] = useState<string | null>(null);
  const [assetB, setAssetB] = useState('');
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [lpAmount, setLpAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState('50');
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [txId, setTxId] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const handleAddLiquidity = useCallback(async () => {
    if (!wallet.isConnected || !assetB) return;

    setTxStatus('pending');
    setTxError(null);

    try {
      const rawA = BigInt(Math.floor(parseFloat(amountA) * 1e8));
      const rawB = BigInt(Math.floor(parseFloat(amountB) * 1e8));

      const { tx } = await sdk.buildAddLiquidity(
        assetA,
        assetB,
        rawA,
        rawB,
        BigInt(parseInt(slippageBps) || 50)
      );

      const id = await wallet.signAndBroadcast(tx);
      setTxId(id);
      setTxStatus('success');
    } catch (err) {
      setTxError(err instanceof Error ? err.message : 'Transaction failed');
      setTxStatus('error');
    }
  }, [wallet, sdk, assetA, assetB, amountA, amountB, slippageBps]);

  const handleRemoveLiquidity = useCallback(async () => {
    if (!wallet.isConnected || !assetB) return;

    setTxStatus('pending');
    setTxError(null);

    try {
      const poolKey = await sdk.getPoolKey(assetA, assetB);
      const rawLp = BigInt(Math.floor(parseFloat(lpAmount) * 1e8));

      const { tx } = await sdk.buildRemoveLiquidity(
        poolKey,
        rawLp,
        BigInt(parseInt(slippageBps) || 50)
      );

      const id = await wallet.signAndBroadcast(tx);
      setTxId(id);
      setTxStatus('success');
    } catch (err) {
      setTxError(err instanceof Error ? err.message : 'Transaction failed');
      setTxStatus('error');
    }
  }, [wallet, sdk, assetA, assetB, lpAmount, slippageBps]);

  return (
    <div className="card">
      {/* Mode toggle */}
      <div className="settings-row">
        <button
          className={`tab ${mode === 'add' ? 'active' : ''}`}
          onClick={() => setMode('add')}
          style={{ flex: 1 }}
        >
          Add
        </button>
        <button
          className={`tab ${mode === 'remove' ? 'active' : ''}`}
          onClick={() => setMode('remove')}
          style={{ flex: 1 }}
        >
          Remove
        </button>
      </div>

      <div className="settings-row">
        <label>Slippage:</label>
        <input
          type="text"
          value={slippageBps}
          onChange={(e) => setSlippageBps(e.target.value)}
        />
        <span>bps</span>
      </div>

      {mode === 'add' ? (
        <>
          <div className="token-input-group">
            <label>Token A</label>
            <div className="token-input-row">
              <input
                type="text"
                placeholder="0.0"
                value={amountA}
                onChange={(e) => setAmountA(e.target.value)}
              />
              <button className="token-selector">
                {assetA === null ? 'DCC' : 'Select'}
              </button>
            </div>
          </div>

          <div className="token-input-group">
            <label>Token B</label>
            <div className="token-input-row">
              <input
                type="text"
                placeholder="0.0"
                value={amountB}
                onChange={(e) => setAmountB(e.target.value)}
              />
              <button
                className="token-selector"
                onClick={() => {
                  const id = prompt('Enter token B asset ID:');
                  if (id !== null) setAssetB(id);
                }}
              >
                {assetB ? assetB.slice(0, 6) + '...' : 'Select'}
              </button>
            </div>
          </div>

          <button
            className="btn-primary"
            onClick={wallet.isConnected ? handleAddLiquidity : wallet.connect}
            disabled={wallet.isConnected ? (!amountA || !amountB || !assetB || txStatus === 'pending') : false}
          >
            {!wallet.isConnected
              ? 'Connect Wallet'
              : txStatus === 'pending'
              ? 'Adding...'
              : 'Add Liquidity'}
          </button>
        </>
      ) : (
        <>
          <div className="token-input-group">
            <label>LP Token Amount</label>
            <div className="token-input-row">
              <input
                type="text"
                placeholder="0.0"
                value={lpAmount}
                onChange={(e) => setLpAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="settings-row">
            <label>Pool:</label>
            <input
              type="text"
              placeholder="Token B ID"
              value={assetB}
              onChange={(e) => setAssetB(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <button
            className="btn-primary"
            onClick={wallet.isConnected ? handleRemoveLiquidity : wallet.connect}
            disabled={wallet.isConnected ? (!lpAmount || !assetB || txStatus === 'pending') : false}
          >
            {!wallet.isConnected
              ? 'Connect Wallet'
              : txStatus === 'pending'
              ? 'Removing...'
              : 'Remove Liquidity'}
          </button>
        </>
      )}

      {txStatus === 'success' && txId && (
        <div className="status-msg success">
          Transaction successful!{' '}
          <a
            className="tx-link"
            href={`${config.explorerUrl}/tx/${txId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View
          </a>
        </div>
      )}
      {txStatus === 'error' && txError && (
        <div className="status-msg error">{txError}</div>
      )}
    </div>
  );
}
