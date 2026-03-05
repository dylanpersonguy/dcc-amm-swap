/**
 * SwapPanel — main swap interface.
 *
 * Features:
 * - Token selection (input/output)
 * - Amount input with real-time quote
 * - Price impact display
 * - Fee display
 * - Minimum received
 * - Slippage settings
 * - Swap execution via wallet
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { useSdk } from '../context/SdkContext';
import { config } from '../config';
import type { SwapQuote } from '@dcc-amm/sdk';

export function SwapPanel() {
  const wallet = useWallet();
  const sdk = useSdk();

  const [inputAsset, setInputAsset] = useState<string | null>(null); // DCC
  const [outputAsset, setOutputAsset] = useState<string>('');
  const [inputAmount, setInputAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState('50');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [txId, setTxId] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  // Debounced quote fetching
  useEffect(() => {
    if (!inputAmount || !outputAsset || parseFloat(inputAmount) <= 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setQuoteError(null);
        const rawAmount = BigInt(Math.floor(parseFloat(inputAmount) * 1e8));
        const q = await sdk.quoteSwap(
          rawAmount,
          inputAsset,
          outputAsset,
          BigInt(parseInt(slippageBps) || 50)
        );
        setQuote(q);
      } catch (err) {
        setQuote(null);
        setQuoteError(err instanceof Error ? err.message : 'Quote failed');
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [inputAmount, inputAsset, outputAsset, slippageBps, sdk]);

  const handleSwap = useCallback(async () => {
    if (!quote || !wallet.isConnected) return;

    setTxStatus('pending');
    setTxError(null);

    try {
      const { tx } = await sdk.buildSwap(
        quote.amountIn,
        inputAsset,
        outputAsset,
        BigInt(parseInt(slippageBps) || 50)
      );

      const id = await wallet.signAndBroadcast(tx);
      setTxId(id);
      setTxStatus('success');
    } catch (err) {
      setTxError(err instanceof Error ? err.message : 'Transaction failed');
      setTxStatus('error');
    }
  }, [quote, wallet, sdk, inputAsset, outputAsset, slippageBps]);

  const handleFlipTokens = () => {
    const tmpAsset = inputAsset;
    setInputAsset(outputAsset || null);
    setOutputAsset(tmpAsset ?? '');
    setInputAmount('');
    setQuote(null);
  };

  const formatBigInt = (val: bigint, decimals: number = 8): string => {
    const str = val.toString().padStart(decimals + 1, '0');
    const int = str.slice(0, str.length - decimals);
    const frac = str.slice(str.length - decimals).replace(/0+$/, '');
    return frac ? `${int}.${frac}` : int;
  };

  const getButtonText = (): string => {
    if (!wallet.isConnected) return 'Connect Wallet';
    if (!inputAmount) return 'Enter Amount';
    if (!outputAsset) return 'Select Output Token';
    if (quoteError) return quoteError;
    if (txStatus === 'pending') return 'Swapping...';
    return 'Swap';
  };

  const isButtonDisabled =
    !wallet.isConnected ||
    !inputAmount ||
    !outputAsset ||
    !quote ||
    !!quoteError ||
    txStatus === 'pending';

  return (
    <div className="card">
      {/* Settings */}
      <div className="settings-row">
        <label>Slippage:</label>
        <input
          type="text"
          value={slippageBps}
          onChange={(e) => setSlippageBps(e.target.value)}
          placeholder="50"
        />
        <span>bps ({(parseInt(slippageBps) / 100).toFixed(2)}%)</span>
      </div>

      {/* Input token */}
      <div className="token-input-group">
        <label>You pay</label>
        <div className="token-input-row">
          <input
            type="text"
            placeholder="0.0"
            value={inputAmount}
            onChange={(e) => setInputAmount(e.target.value)}
          />
          <button className="token-selector">
            {inputAsset === null ? 'DCC' : inputAsset.slice(0, 6) + '...'}
          </button>
        </div>
      </div>

      {/* Swap direction arrow */}
      <div className="swap-arrow">
        <button onClick={handleFlipTokens}>↕</button>
      </div>

      {/* Output token */}
      <div className="token-input-group">
        <label>You receive</label>
        <div className="token-input-row">
          <input
            type="text"
            placeholder="0.0"
            value={quote ? formatBigInt(quote.amountOut) : ''}
            readOnly
          />
          <button
            className="token-selector"
            onClick={() => {
              const id = prompt('Enter output token asset ID:');
              if (id !== null) setOutputAsset(id);
            }}
          >
            {outputAsset ? outputAsset.slice(0, 6) + '...' : 'Select'}
          </button>
        </div>
      </div>

      {/* Quote details */}
      {quote && (
        <div className="info-rows">
          <div className="info-row">
            <span className="label">Price Impact</span>
            <span className="value">
              {(Number(quote.priceImpactBps) / 100).toFixed(2)}%
            </span>
          </div>
          <div className="info-row">
            <span className="label">Fee</span>
            <span className="value">{formatBigInt(quote.feeAmount)}</span>
          </div>
          <div className="info-row">
            <span className="label">Min. Received</span>
            <span className="value">{formatBigInt(quote.minAmountOut)}</span>
          </div>
          <div className="info-row">
            <span className="label">Route</span>
            <span className="value">{quote.route}</span>
          </div>
        </div>
      )}

      {/* Swap button */}
      <button
        className={`btn-primary ${quoteError ? 'error' : ''}`}
        onClick={wallet.isConnected ? handleSwap : wallet.connect}
        disabled={wallet.isConnected ? isButtonDisabled : false}
      >
        {getButtonText()}
      </button>

      {/* Transaction status */}
      {txStatus === 'success' && txId && (
        <div className="status-msg success">
          Swap successful!{' '}
          <a
            className="tx-link"
            href={`${config.explorerUrl}/tx/${txId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on explorer
          </a>
        </div>
      )}
      {txStatus === 'error' && txError && (
        <div className="status-msg error">{txError}</div>
      )}
    </div>
  );
}
