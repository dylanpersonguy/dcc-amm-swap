/**
 * SwapPanel — main swap interface with proper token selection modals.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { useSdk } from '../context/SdkContext';
import { useTokens } from '../hooks/useTokens';
import { getTokenColor } from '../hooks/useTokens';
import { TokenModal } from './TokenModal';
import { config } from '../config';
import type { SwapQuoteV2 } from '@dcc-amm/sdk';

export function SwapPanel() {
  const wallet = useWallet();
  const sdk = useSdk();
  const { tokens } = useTokens();

  const [inputAsset, setInputAsset] = useState<string>('DCC');
  const [outputAsset, setOutputAsset] = useState<string>('');
  const [inputAmount, setInputAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState('50');
  const [feeBps, setFeeBps] = useState('30');
  const [quote, setQuote] = useState<SwapQuoteV2 | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [txId, setTxId] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const [showInputModal, setShowInputModal] = useState(false);
  const [showOutputModal, setShowOutputModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const getTokenName = (assetId: string): string => {
    if (assetId === 'DCC' || !assetId) return 'DCC';
    const t = tokens.find((tk) => tk.assetId === assetId);
    return t?.name || assetId.slice(0, 6) + '…';
  };

  /** Look up decimals for a given assetId (defaults to 8 for DCC / unknown) */
  const getDecimals = (assetId: string): number => {
    if (!assetId || assetId === 'DCC') return 8;
    const t = tokens.find((tk) => tk.assetId === assetId);
    return t?.decimals ?? 8;
  };

  // Debounced quote
  useEffect(() => {
    if (!inputAmount || !outputAsset || parseFloat(inputAmount) <= 0) {
      setQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      return;
    }

    setQuoteLoading(true);
    const timer = setTimeout(async () => {
      try {
        setQuoteError(null);
        const inDecimals = getDecimals(inputAsset);
        const rawAmount = BigInt(Math.floor(parseFloat(inputAmount) * 10 ** inDecimals));
        const q = await sdk.quoteSwap(
          rawAmount,
          inputAsset === 'DCC' ? null : inputAsset,
          outputAsset === 'DCC' ? null : outputAsset,
          parseInt(feeBps) || 30,
          BigInt(parseInt(slippageBps) || 50)
        );
        setQuote(q);
        setQuoteLoading(false);
      } catch (err) {
        setQuote(null);
        setQuoteError(err instanceof Error ? err.message : 'Quote failed');
        setQuoteLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [inputAmount, inputAsset, outputAsset, slippageBps, feeBps, sdk]);

  const handleSwap = useCallback(async () => {
    if (!quote || !wallet.isConnected) return;

    setTxStatus('pending');
    setTxError(null);

    try {
      const { tx } = await sdk.buildSwap(
        quote.amountIn,
        inputAsset === 'DCC' ? null : inputAsset,
        outputAsset === 'DCC' ? null : outputAsset,
        parseInt(feeBps) || 30,
        BigInt(parseInt(slippageBps) || 50)
      );

      const id = await wallet.signAndBroadcast(tx);
      setTxId(id);
      setTxStatus('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      console.error('[SwapPanel] Swap error:', msg);
      setTxError(msg);
      setTxStatus('error');
    }
  }, [quote, wallet, sdk, inputAsset, outputAsset, slippageBps, feeBps]);

  const handleFlipTokens = () => {
    setInputAsset(outputAsset || 'DCC');
    setOutputAsset(inputAsset);
    setInputAmount('');
    setQuote(null);
  };

  const formatBigInt = (val: bigint, decimals = 8): string => {
    const str = val.toString().padStart(decimals + 1, '0');
    const int = str.slice(0, str.length - decimals);
    const frac = str.slice(str.length - decimals).replace(/0+$/, '');
    return frac ? `${int}.${frac}` : int;
  };

  const getButtonText = (): string => {
    if (!wallet.isConnected) return 'Connect Wallet';
    if (!inputAmount) return 'Enter an amount';
    if (!outputAsset) return 'Select a token';
    if (quoteLoading) return 'Fetching quote...';
    if (quoteError) return 'No route found';
    if (txStatus === 'pending') return 'Swapping...';
    return 'Swap';
  };

  const isSwapDisabled =
    !wallet.isConnected ||
    !inputAmount ||
    !outputAsset ||
    !quote ||
    !!quoteError ||
    quoteLoading ||
    txStatus === 'pending';

  const handleButtonClick = () => {
    if (!wallet.isConnected) {
      wallet.openConnectModal();
    } else {
      handleSwap();
    }
  };

  return (
    <>
      <div className="panel-card">
        {/* Card header */}
        <div className="panel-header">
          <h2>Swap</h2>
          <button
            className={`icon-btn ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M10 1.5v2M10 16.5v2M18.5 10h-2M3.5 10h-2M16 4L14.5 5.5M5.5 14.5L4 16M16 16l-1.5-1.5M5.5 5.5L4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Settings drawer */}
        {showSettings && (
          <div className="settings-drawer">
            <div className="setting-item">
              <label>Slippage Tolerance</label>
              <div className="option-pills">
                {['10', '50', '100'].map((v) => (
                  <button
                    key={v}
                    className={`pill ${slippageBps === v ? 'active' : ''}`}
                    onClick={() => setSlippageBps(v)}
                  >
                    {(parseInt(v) / 100).toFixed(1)}%
                  </button>
                ))}
                <div className="pill-input">
                  <input
                    type="text"
                    value={slippageBps}
                    onChange={(e) => setSlippageBps(e.target.value)}
                  />
                  <span>bps</span>
                </div>
              </div>
            </div>
            <div className="setting-item">
              <label>Fee Tier</label>
              <div className="option-pills">
                {['10', '30', '100'].map((v) => (
                  <button
                    key={v}
                    className={`pill ${feeBps === v ? 'active' : ''}`}
                    onClick={() => setFeeBps(v)}
                  >
                    {(parseInt(v) / 100).toFixed(1)}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Input token */}
        <div className="token-field">
          <div className="token-field-head">
            <span className="token-field-label">You pay</span>
          </div>
          <div className="token-field-body">
            <input
              type="text"
              className="amount-input"
              placeholder="0"
              value={inputAmount}
              onChange={(e) => setInputAmount(e.target.value)}
            />
            <button className="token-pill" onClick={() => setShowInputModal(true)}>
              <span className="token-pill-dot" style={{ background: getTokenColor(inputAsset === 'DCC' ? null : inputAsset) }} />
              <span className="token-pill-name">{getTokenName(inputAsset)}</span>
              <svg className="token-pill-caret" width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Flip arrow */}
        <div className="flip-wrap">
          <button className="flip-btn" onClick={handleFlipTokens}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 6l4-4 4 4M4 10l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* Output token */}
        <div className="token-field">
          <div className="token-field-head">
            <span className="token-field-label">You receive</span>
          </div>
          <div className="token-field-body">
            <input
              type="text"
              className="amount-input"
              placeholder="0"
              value={quote ? formatBigInt(quote.amountOut, getDecimals(outputAsset)) : ''}
              readOnly
            />
            <button className="token-pill" onClick={() => setShowOutputModal(true)}>
              {outputAsset ? (
                <>
                  <span className="token-pill-dot" style={{ background: getTokenColor(outputAsset === 'DCC' ? null : outputAsset) }} />
                  <span className="token-pill-name">{getTokenName(outputAsset)}</span>
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

        {/* Quote details */}
        {quote && (
          <div className="quote-info">
            <div className="quote-row">
              <span className="quote-label">Price Impact</span>
              <span className={`quote-value ${Number(quote.priceImpactBps) > 300 ? 'warning' : ''}`}>
                {(Number(quote.priceImpactBps) / 100).toFixed(2)}%
              </span>
            </div>
            <div className="quote-row">
              <span className="quote-label">Swap Fee</span>
              <span className="quote-value">
                {formatBigInt(quote.feeAmount, getDecimals(inputAsset))} ({parseInt(feeBps) / 100}%)
              </span>
            </div>
            <div className="quote-row">
              <span className="quote-label">Minimum Received</span>
              <span className="quote-value">{formatBigInt(quote.minAmountOut, getDecimals(outputAsset))}</span>
            </div>
          </div>
        )}

        {/* Action button */}
        <button
          className={`action-btn ${!wallet.isConnected ? 'connect' : ''} ${quoteError && inputAmount && outputAsset ? 'error-state' : ''}`}
          onClick={handleButtonClick}
          disabled={wallet.isConnected ? isSwapDisabled : false}
        >
          {txStatus === 'pending' && <span className="spinner" />}
          {getButtonText()}
        </button>

        {/* Tx status */}
        {txStatus === 'success' && txId && (
          <div className="tx-toast success">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Swap confirmed!</span>
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
        isOpen={showInputModal}
        onClose={() => setShowInputModal(false)}
        onSelect={(id) => { setInputAsset(id); setQuote(null); }}
        tokens={tokens}
        excludeAssetId={outputAsset || undefined}
        title="Select input token"
      />
      <TokenModal
        isOpen={showOutputModal}
        onClose={() => setShowOutputModal(false)}
        onSelect={(id) => { setOutputAsset(id); setQuote(null); }}
        tokens={tokens}
        excludeAssetId={inputAsset}
        title="Select output token"
      />
    </>
  );
}
