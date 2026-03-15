/**
 * SwapPanel — main swap interface with token balances, Max button,
 * insufficient balance warning, price chart, recent swaps, refresh quote,
 * quote staleness indicator, and optimistic updates.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { useSdk } from '../context/SdkContext';
import { useTokens } from '../hooks/useTokens';
import { getTokenColor } from '../hooks/useTokens';
import { getTokenLogo } from '../hooks/useTokens';
import { useBalances } from '../hooks/useBalances';
import { useSwapHistory, SwapHistoryEntry } from '../hooks/useSwapHistory';
import { useToasts } from '../context/ToastContext';
import { useTxTracker } from '../context/TransactionTracker';
import { TokenModal } from './TokenModal';
import { PriceChart } from './PriceChart';
import { config } from '../config';
import type { SwapQuoteV2 } from '@dcc-amm/sdk';

export function SwapPanel() {
  const wallet = useWallet();
  const sdk = useSdk();
  const navigate = useNavigate();
  const params = useParams<{ inputToken?: string; outputToken?: string }>();
  const { tokens } = useTokens();
  const { getBalance, formatBalance, refresh: refreshBalances } = useBalances();
  const { history, addEntry } = useSwapHistory();
  const { addToast } = useToasts();
  const { trackTransaction, confirmTransaction, failTransaction } = useTxTracker();

  const [inputAsset, setInputAsset] = useState<string>(params.inputToken || 'DCC');
  const [outputAsset, setOutputAsset] = useState<string>(params.outputToken || '');
  const [inputAmount, setInputAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState('50');
  const [feeBps, setFeeBps] = useState('35');
  const [quote, setQuote] = useState<SwapQuoteV2 | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteTimestamp, setQuoteTimestamp] = useState<number | null>(null);
  const [quoteStaleness, setQuoteStaleness] = useState('');
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [txId, setTxId] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const [showInputModal, setShowInputModal] = useState(false);
  const [showOutputModal, setShowOutputModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Sync URL params
  useEffect(() => {
    if (params.inputToken && params.inputToken !== inputAsset) setInputAsset(params.inputToken);
    if (params.outputToken && params.outputToken !== outputAsset) setOutputAsset(params.outputToken);
  }, [params.inputToken, params.outputToken]);

  // Update URL when tokens change
  useEffect(() => {
    if (inputAsset && outputAsset) {
      navigate(`/swap/${inputAsset}/${outputAsset}`, { replace: true });
    }
  }, [inputAsset, outputAsset, navigate]);

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

  // Check insufficient balance
  const inputDecimals = getDecimals(inputAsset);
  const inputBalance = getBalance(inputAsset);
  const parsedInputAmount = inputAmount ? BigInt(Math.floor(parseFloat(inputAmount) * 10 ** inputDecimals)) : 0n;
  const insufficientBalance = wallet.isConnected && inputAmount && parsedInputAmount > inputBalance;

  // Quote staleness timer
  useEffect(() => {
    if (!quoteTimestamp) { setQuoteStaleness(''); return; }
    const update = () => {
      const age = Math.floor((Date.now() - quoteTimestamp) / 1000);
      setQuoteStaleness(age < 5 ? 'just now' : `${age}s ago`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [quoteTimestamp]);

  // Fetch quote function (extracted for manual refresh)
  const fetchQuoteRef = useRef<() => void>(() => {});
  const fetchQuote = useCallback(async () => {
    if (!inputAmount || !outputAsset || parseFloat(inputAmount) <= 0) {
      setQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      return;
    }
    setQuoteLoading(true);
    try {
      setQuoteError(null);
      const inDecimals = getDecimals(inputAsset);
      const rawAmount = BigInt(Math.floor(parseFloat(inputAmount) * 10 ** inDecimals));
      const q = await sdk.quoteSwap(
        rawAmount,
        inputAsset === 'DCC' ? null : inputAsset,
        outputAsset === 'DCC' ? null : outputAsset,
        parseInt(feeBps) || 35,
        BigInt(parseInt(slippageBps) || 50)
      );
      setQuote(q);
      setQuoteTimestamp(Date.now());
      setQuoteLoading(false);
    } catch (err) {
      setQuote(null);
      setQuoteError(err instanceof Error ? err.message : 'Quote failed');
      setQuoteLoading(false);
    }
  }, [inputAmount, inputAsset, outputAsset, slippageBps, feeBps, sdk]);

  fetchQuoteRef.current = fetchQuote;

  // Debounced quote
  useEffect(() => {
    if (!inputAmount || !outputAsset || parseFloat(inputAmount) <= 0) {
      setQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      return;
    }
    setQuoteLoading(true);
    const timer = setTimeout(() => fetchQuoteRef.current(), 400);
    return () => clearTimeout(timer);
  }, [inputAmount, inputAsset, outputAsset, slippageBps, feeBps, sdk]);

  const handleSwap = useCallback(async () => {
    if (!quote || !wallet.isConnected) return;

    setTxStatus('pending');
    setTxError(null);
    const trackId = trackTransaction('swap', `Swap ${inputAmount} ${getTokenName(inputAsset)} → ${getTokenName(outputAsset)}`);

    try {
      const { tx } = await sdk.buildSwap(
        quote.amountIn,
        inputAsset === 'DCC' ? null : inputAsset,
        outputAsset === 'DCC' ? null : outputAsset,
        parseInt(feeBps) || 35,
        BigInt(parseInt(slippageBps) || 50)
      );

      const id = await wallet.signAndBroadcast(tx);
      setTxId(id);
      setTxStatus('success');
      confirmTransaction(trackId, id);
      addToast('success', 'Swap confirmed!', { txId: id });

      // Record in swap history
      addEntry({
        inputAsset,
        outputAsset,
        inputAmount,
        outputAmount: formatBigInt(quote.amountOut, getDecimals(outputAsset)),
        txId: id,
      });

      // Optimistic balance refresh
      setTimeout(() => refreshBalances(), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      console.error('[SwapPanel] Swap error:', msg);
      setTxError(msg);
      setTxStatus('error');
      failTransaction(trackId);
      addToast('error', msg);
    }
  }, [quote, wallet, sdk, inputAsset, outputAsset, slippageBps, feeBps, inputAmount, trackTransaction, confirmTransaction, failTransaction, addToast, addEntry, refreshBalances]);

  const handleFlipTokens = () => {
    setInputAsset(outputAsset || 'DCC');
    setOutputAsset(inputAsset);
    setInputAmount('');
    setQuote(null);
  };

  const handleMaxInput = () => {
    const decimals = getDecimals(inputAsset);
    const balance = getBalance(inputAsset);
    // Reserve 0.01 DCC for gas when using native token
    const reserved = (!inputAsset || inputAsset === 'DCC') ? BigInt(1_000_000) : 0n;
    const maxAmount = balance > reserved ? balance - reserved : 0n;
    const str = maxAmount.toString().padStart(decimals + 1, '0');
    const int = str.slice(0, str.length - decimals);
    const frac = str.slice(str.length - decimals).replace(/0+$/, '');
    setInputAmount(frac ? `${int}.${frac}` : int);
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
    if (insufficientBalance) return 'Insufficient balance';
    if (quoteLoading) return 'Fetching quote...';
    if (quoteError) return 'No route found';
    if (txStatus === 'pending') return 'Swapping...';
    return 'Swap';
  };

  // Price impact tiers
  const getPriceImpactClass = (bps: number): string => {
    if (bps > 1000) return 'impact-extreme';
    if (bps > 500) return 'impact-high';
    if (bps > 300) return 'impact-warning';
    if (bps > 100) return 'impact-moderate';
    return '';
  };

  const isSwapDisabled =
    !wallet.isConnected ||
    !inputAmount ||
    !outputAsset ||
    !quote ||
    !!quoteError ||
    quoteLoading ||
    txStatus === 'pending' ||
    !!insufficientBalance;

  const handleButtonClick = () => {
    if (!wallet.isConnected) {
      wallet.openConnectModal();
    } else {
      handleSwap();
    }
  };

  // Find a pool ID for the price chart
  const poolId = (inputAsset && outputAsset)
    ? `p:${inputAsset === 'DCC' ? 'DCC' : inputAsset}:${outputAsset === 'DCC' ? 'DCC' : outputAsset}:${feeBps}`
    : null;

  return (
    <>
      <div className="panel-card">
        {/* Card header */}
        <div className="panel-header">
          <h2>Swap</h2>
          <div className="panel-header-actions">
            {quote && (
              <button
                className="icon-btn refresh-btn"
                onClick={() => fetchQuoteRef.current()}
                title="Refresh quote"
                aria-label="Refresh quote"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={quoteLoading ? 'spin' : ''}>
                  <path d="M13.5 8A5.5 5.5 0 113 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M3 2v3.5h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            <button
              className={`icon-btn ${showSettings ? 'active' : ''}`}
              onClick={() => setShowSettings(!showSettings)}
              title="Settings"
              aria-label="Swap settings"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M10 1.5v2M10 16.5v2M18.5 10h-2M3.5 10h-2M16 4L14.5 5.5M5.5 14.5L4 16M16 16l-1.5-1.5M5.5 5.5L4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
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
                {['10', '35', '100'].map((v) => (
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

        {/* Price chart sparkline */}
        {poolId && inputAsset && outputAsset && (
          <PriceChart
            poolId={poolId}
            token0Name={getTokenName(inputAsset)}
            token1Name={getTokenName(outputAsset)}
          />
        )}

        {/* Input token */}
        <div className={`token-field ${insufficientBalance ? 'insufficient' : ''}`}>
          <div className="token-field-head">
            <span className="token-field-label">You pay</span>
            {wallet.isConnected && (
              <div className="token-field-balance">
                <span>Balance: {formatBalance(inputAsset, inputDecimals)}</span>
                <button className="max-btn" onClick={handleMaxInput}>MAX</button>
              </div>
            )}
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
              {(() => {
                const logo = getTokenLogo(getTokenName(inputAsset), inputAsset === 'DCC' ? null : inputAsset);
                return logo
                  ? <img src={logo} alt={getTokenName(inputAsset)} className="token-pill-logo" />
                  : <span className="token-pill-dot" style={{ background: getTokenColor(inputAsset === 'DCC' ? null : inputAsset) }} />;
              })()}
              <span className="token-pill-name">{getTokenName(inputAsset)}</span>
              <svg className="token-pill-caret" width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          {insufficientBalance && (
            <div className="token-field-warning">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L15 14H1L8 1z" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 6v3M8 11.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Insufficient {getTokenName(inputAsset)} balance
            </div>
          )}
        </div>

        {/* Flip arrow */}
        <div className="flip-wrap">
          <button className="flip-btn" onClick={handleFlipTokens} aria-label="Flip tokens">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 6l4-4 4 4M4 10l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* Output token */}
        <div className="token-field">
          <div className="token-field-head">
            <span className="token-field-label">You receive</span>
            {wallet.isConnected && outputAsset && (
              <span className="token-field-balance">
                Balance: {formatBalance(outputAsset, getDecimals(outputAsset))}
              </span>
            )}
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
                  {(() => {
                    const logo = getTokenLogo(getTokenName(outputAsset), outputAsset === 'DCC' ? null : outputAsset);
                    return logo
                      ? <img src={logo} alt={getTokenName(outputAsset)} className="token-pill-logo" />
                      : <span className="token-pill-dot" style={{ background: getTokenColor(outputAsset === 'DCC' ? null : outputAsset) }} />;
                  })()}
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
              <span className={`quote-value ${getPriceImpactClass(Number(quote.priceImpactBps))}`}>
                {(Number(quote.priceImpactBps) / 100).toFixed(2)}%
                {Number(quote.priceImpactBps) > 1000 && ' ⚠️'}
              </span>
            </div>
            <div className="quote-row">
              <span className="quote-label">Swap Fee</span>
              <span className="quote-value">
                {formatBigInt(quote.feeAmount, getDecimals(inputAsset))} ({quote.feeBps / 100}%)
              </span>
            </div>
            <div className="quote-row">
              <span className="quote-label">Minimum Received</span>
              <span className="quote-value">{formatBigInt(quote.minAmountOut, getDecimals(outputAsset))}</span>
            </div>
            {quoteStaleness && (
              <div className="quote-row quote-staleness">
                <span className="quote-label">Quote updated</span>
                <span className="quote-value">{quoteStaleness}</span>
              </div>
            )}
          </div>
        )}

        {/* High price impact warning */}
        {quote && Number(quote.priceImpactBps) > 500 && (
          <div className="price-impact-alert">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L15 14H1L8 1z" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 6v3M8 11.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span>High price impact! You may receive significantly less than expected.</span>
          </div>
        )}

        {/* Action button */}
        <button
          className={`action-btn ${!wallet.isConnected ? 'connect' : ''} ${quoteError && inputAmount && outputAsset ? 'error-state' : ''} ${insufficientBalance ? 'error-state' : ''}`}
          onClick={handleButtonClick}
          disabled={wallet.isConnected ? isSwapDisabled : false}
        >
          {txStatus === 'pending' && <span className="spinner" />}
          {getButtonText()}
        </button>
      </div>

      {/* Recent Swaps History */}
      {history.length > 0 && (
        <div className="recent-swaps">
          <button className="recent-swaps-toggle" onClick={() => setShowHistory(!showHistory)}>
            <span>Recent Swaps ({history.length})</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transform: showHistory ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {showHistory && (
            <div className="recent-swaps-list">
              {history.map((entry) => (
                <div key={entry.id} className="recent-swap-item">
                  <div className="recent-swap-pair">
                    <span>{entry.inputAmount} {getTokenName(entry.inputAsset)}</span>
                    <span className="recent-swap-arrow">→</span>
                    <span>{entry.outputAmount} {getTokenName(entry.outputAsset)}</span>
                  </div>
                  <div className="recent-swap-meta">
                    <span className="recent-swap-time">{new Date(entry.timestamp).toLocaleString()}</span>
                    <a
                      href={`${config.explorerUrl}/tx/${entry.txId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="recent-swap-link"
                    >↗</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
