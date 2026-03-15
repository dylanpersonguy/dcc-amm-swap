/**
 * ConnectModal — elegant seed-phrase input modal.
 * Replaces browser prompt() with a proper React modal.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useWallet } from '../context/WalletContext';
import { libs } from '@decentralchain/transactions';
import { config } from '../config';

export function ConnectModal() {
  const wallet = useWallet();
  const [seed, setSeed] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Preview the derived address in real-time
  const previewAddress = useMemo(() => {
    const trimmed = seed.trim();
    if (!trimmed || trimmed.split(/\s+/).length < 2) return null;
    try {
      return libs.crypto.address(trimmed, config.chainId);
    } catch {
      return null;
    }
  }, [seed]);

  const isDappAddress = previewAddress === config.dAppAddress;

  useEffect(() => {
    if (wallet.connectModalOpen) {
      setSeed('');
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [wallet.connectModalOpen]);

  if (!wallet.connectModalOpen) return null;

  const handleConnect = async () => {
    if (!seed.trim()) return;
    await wallet.connectWithSeed(seed.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleConnect();
    }
  };

  return (
    <div className="modal-overlay" onClick={wallet.closeConnectModal}>
      <div className="modal-card connect-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="10" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <h2>Connect Wallet</h2>
              <p className="modal-subtitle">Enter your seed phrase to sign transactions</p>
            </div>
          </div>
          <button className="modal-close" onClick={wallet.closeConnectModal}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="seed-input-wrap">
            <textarea
              ref={inputRef}
              className="seed-input"
              placeholder="Enter your seed phrase..."
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
            />
            <div className="seed-word-count">
              {seed.trim() ? seed.trim().split(/\s+/).length : 0} words
            </div>
          </div>

          {previewAddress && (
            <div className={`address-preview ${isDappAddress ? 'warning' : ''}`}>
              <span className="address-preview-label">
                {isDappAddress ? '⚠ dApp account — cannot swap from this address' : 'Address'}
              </span>
              <span className="address-preview-value">{previewAddress}</span>
            </div>
          )}

          {wallet.error && (
            <div className="modal-error">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 5v3M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {wallet.error}
            </div>
          )}

          <div className="modal-warning">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L15 14H1L8 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M8 6v3M8 11.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span>Your seed phrase is stored in memory only and never leaves this browser.</span>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-ghost" onClick={wallet.closeConnectModal}>
            Cancel
          </button>
          <button
            className="btn-accent"
            onClick={handleConnect}
            disabled={!seed.trim() || wallet.isConnecting}
          >
            {wallet.isConnecting ? (
              <><span className="spinner" /> Connecting...</>
            ) : (
              'Connect'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
