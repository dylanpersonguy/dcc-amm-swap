/**
 * LiquidityPanel — Add/Remove/Create liquidity interface with token modals.
 */

import React, { useState, useCallback } from 'react';
import { useWallet } from '../context/WalletContext';
import { useSdk } from '../context/SdkContext';
import { useTokens, getTokenColor } from '../hooks/useTokens';
import { TokenModal } from './TokenModal';
import { config } from '../config';

type LiquidityMode = 'add' | 'remove' | 'create';

export function LiquidityPanel() {
  const wallet = useWallet();
  const sdk = useSdk();
  const { tokens } = useTokens();

  const [mode, setMode] = useState<LiquidityMode>('add');
  const [assetA, setAssetA] = useState<string>('DCC');
  const [assetB, setAssetB] = useState('');
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [lpAmount, setLpAmount] = useState('');
  const [feeBps, setFeeBps] = useState('30');
  const [slippageBps, setSlippageBps] = useState('50');
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [txId, setTxId] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const [showTokenAModal, setShowTokenAModal] = useState(false);
  const [showTokenBModal, setShowTokenBModal] = useState(false);

  const getTokenName = (assetId: string): string => {
    if (assetId === 'DCC' || !assetId) return 'DCC';
    const t = tokens.find((tk) => tk.assetId === assetId);
    return t?.name || assetId.slice(0, 6) + '…';
  };

  const getDecimals = (assetId: string): number => {
    if (!assetId || assetId === 'DCC') return 8;
    const t = tokens.find((tk) => tk.assetId === assetId);
    return t?.decimals ?? 8;
  };

  const handleCreatePool = useCallback(async () => {
    if (!wallet.isConnected || !assetB) return;
    setTxStatus('pending');
    setTxError(null);
    try {
      const { tx } = sdk.buildCreatePool(
        assetA === 'DCC' ? null : assetA,
        assetB === 'DCC' ? null : assetB,
        parseInt(feeBps) || 30,
      );
      const id = await wallet.signAndBroadcast(tx);
      setTxId(id);
      setTxStatus('success');
    } catch (err) {
      setTxError(err instanceof Error ? err.message : 'Transaction failed');
      setTxStatus('error');
    }
  }, [wallet, sdk, assetA, assetB, feeBps]);

  const handleAddLiquidity = useCallback(async () => {
    if (!wallet.isConnected || !assetB) return;
    setTxStatus('pending');
    setTxError(null);
    try {
      const rawA = BigInt(Math.floor(parseFloat(amountA) * 10 ** getDecimals(assetA)));
      const rawB = BigInt(Math.floor(parseFloat(amountB) * 10 ** getDecimals(assetB)));
      const { tx } = await sdk.buildAddLiquidity(
        assetA === 'DCC' ? null : assetA,
        assetB === 'DCC' ? null : assetB,
        rawA,
        rawB,
        parseInt(feeBps) || 30,
        BigInt(parseInt(slippageBps) || 50)
      );
      const id = await wallet.signAndBroadcast(tx);
      setTxId(id);
      setTxStatus('success');
    } catch (err) {
      setTxError(err instanceof Error ? err.message : 'Transaction failed');
      setTxStatus('error');
    }
  }, [wallet, sdk, assetA, assetB, amountA, amountB, feeBps, slippageBps]);

  const handleRemoveLiquidity = useCallback(async () => {
    if (!wallet.isConnected || !assetB) return;
    setTxStatus('pending');
    setTxError(null);
    try {
      const rawLp = BigInt(Math.floor(parseFloat(lpAmount) * 1e8)); // LP tokens always 8 decimals
      const { tx } = await sdk.buildRemoveLiquidity(
        assetA === 'DCC' ? null : assetA,
        assetB === 'DCC' ? null : assetB,
        parseInt(feeBps) || 30,
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
  }, [wallet, sdk, assetA, assetB, lpAmount, feeBps, slippageBps]);

  const getAction = () => {
    if (mode === 'create') return handleCreatePool;
    if (mode === 'add') return handleAddLiquidity;
    return handleRemoveLiquidity;
  };

  const getButtonLabel = () => {
    if (!wallet.isConnected) return 'Connect Wallet';
    if (txStatus === 'pending') return mode === 'create' ? 'Creating…' : mode === 'add' ? 'Adding…' : 'Removing…';
    if (mode === 'create') return 'Create Pool';
    if (mode === 'add') return 'Add Liquidity';
    return 'Remove Liquidity';
  };

  const isDisabled = () => {
    if (!wallet.isConnected) return false;
    if (txStatus === 'pending') return true;
    if (!assetB) return true;
    if (mode === 'add' && (!amountA || !amountB)) return true;
    if (mode === 'remove' && !lpAmount) return true;
    return false;
  };

  const handleMainButton = () => {
    if (!wallet.isConnected) {
      wallet.openConnectModal();
    } else {
      getAction()();
    }
  };

  return (
    <>
      <div className="panel-card">
        <div className="panel-header">
          <h2>Liquidity</h2>
        </div>

        {/* Mode toggle */}
        <div className="mode-toggle">
          {(['create', 'add', 'remove'] as LiquidityMode[]).map((m) => (
            <button
              key={m}
              className={`mode-btn ${mode === m ? 'active' : ''}`}
              onClick={() => setMode(m)}
            >
              {m === 'create' ? 'Create' : m === 'add' ? 'Add' : 'Remove'}
            </button>
          ))}
        </div>

        {/* Settings */}
        <div className="liq-settings">
          <div className="setting-item compact">
            <label>Slippage</label>
            <div className="option-pills">
              {['10', '50', '100'].map((v) => (
                <button
                  key={v}
                  className={`pill sm ${slippageBps === v ? 'active' : ''}`}
                  onClick={() => setSlippageBps(v)}
                >
                  {(parseInt(v) / 100).toFixed(1)}%
                </button>
              ))}
            </div>
          </div>
          <div className="setting-item compact">
            <label>Fee Tier</label>
            <div className="option-pills">
              {['10', '30', '100'].map((v) => (
                <button
                  key={v}
                  className={`pill sm ${feeBps === v ? 'active' : ''}`}
                  onClick={() => setFeeBps(v)}
                >
                  {(parseInt(v) / 100).toFixed(1)}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Token A */}
        <div className="token-field">
          <div className="token-field-head">
            <span className="token-field-label">Token A</span>
          </div>
          <div className="token-field-body">
            {mode !== 'remove' && (
              <input
                type="text"
                className="amount-input"
                placeholder="0"
                value={amountA}
                onChange={(e) => setAmountA(e.target.value)}
              />
            )}
            <button className="token-pill" onClick={() => setShowTokenAModal(true)}>
              <span className="token-pill-dot" style={{ background: getTokenColor(assetA === 'DCC' ? null : assetA) }} />
              <span className="token-pill-name">{getTokenName(assetA)}</span>
              <svg className="token-pill-caret" width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Plus icon between tokens */}
        <div className="flip-wrap">
          <div className="plus-icon">+</div>
        </div>

        {/* Token B */}
        <div className="token-field">
          <div className="token-field-head">
            <span className="token-field-label">Token B</span>
          </div>
          <div className="token-field-body">
            {mode !== 'remove' && (
              <input
                type="text"
                className="amount-input"
                placeholder="0"
                value={amountB}
                onChange={(e) => setAmountB(e.target.value)}
              />
            )}
            <button className="token-pill" onClick={() => setShowTokenBModal(true)}>
              {assetB ? (
                <>
                  <span className="token-pill-dot" style={{ background: getTokenColor(assetB === 'DCC' ? null : assetB) }} />
                  <span className="token-pill-name">{getTokenName(assetB)}</span>
                </>
              ) : (
                <span className="token-pill-name placeholder">Select token</span>
              )}
              <svg className="token-pill-caret" width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* LP amount for remove */}
        {mode === 'remove' && (
          <div className="token-field" style={{ marginTop: 8 }}>
            <div className="token-field-head">
              <span className="token-field-label">LP Amount to Burn</span>
            </div>
            <div className="token-field-body">
              <input
                type="text"
                className="amount-input"
                placeholder="0"
                value={lpAmount}
                onChange={(e) => setLpAmount(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Action button */}
        <button
          className={`action-btn ${!wallet.isConnected ? 'connect' : ''}`}
          onClick={handleMainButton}
          disabled={isDisabled()}
        >
          {txStatus === 'pending' && <span className="spinner" />}
          {getButtonLabel()}
        </button>

        {/* Status */}
        {txStatus === 'success' && txId && (
          <div className="tx-toast success">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Transaction confirmed!</span>
            <a href={`${config.explorerUrl}/tx/${txId}`} target="_blank" rel="noopener noreferrer">
              View tx ↗
            </a>
          </div>
        )}
        {txStatus === 'error' && txError && (
          <div className="tx-toast error">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span>{txError}</span>
          </div>
        )}
      </div>

      <TokenModal
        isOpen={showTokenAModal}
        onClose={() => setShowTokenAModal(false)}
        onSelect={(id) => setAssetA(id)}
        tokens={tokens}
        excludeAssetId={assetB || undefined}
        title="Select Token A"
      />
      <TokenModal
        isOpen={showTokenBModal}
        onClose={() => setShowTokenBModal(false)}
        onSelect={(id) => setAssetB(id)}
        tokens={tokens}
        excludeAssetId={assetA}
        title="Select Token B"
      />
    </>
  );
}
