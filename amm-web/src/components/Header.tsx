import React, { useState, useRef, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { useToasts } from '../context/ToastContext';
import { config } from '../config';

interface HeaderProps {
  onMenuToggle?: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const wallet = useWallet();
  const { soundEnabled, toggleSound } = useToasts();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayAddress = wallet.address
    ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
    : '';

  const isDappAccount = wallet.address === config.dAppAddress;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  const copyAddress = () => {
    if (wallet.address) {
      navigator.clipboard.writeText(wallet.address);
      setShowMenu(false);
    }
  };

  return (
    <header className="header">
      <div className="logo-group">
        {/* Mobile hamburger */}
        <button className="hamburger-btn" onClick={onMenuToggle} aria-label="Open menu">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <div className="logo-mark">
          <img src="/logo.png" alt="DCC Swap" width="28" height="28" style={{ borderRadius: 8 }} />
        </div>
        <div className="logo-text">
          <h1>DCC Swap</h1>
          <span className="net-badge">Mainnet</span>
        </div>
      </div>

      <div className="header-right">
        {/* Sound toggle */}
        <button
          className={`icon-btn sound-toggle ${soundEnabled ? 'active' : ''}`}
          onClick={toggleSound}
          title={soundEnabled ? 'Sound on' : 'Sound off'}
          aria-label="Toggle sound"
        >
          {soundEnabled ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L4 6H2v4h2l4 4V2zM11 5a3.5 3.5 0 010 6M13 3a6.5 6.5 0 010 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L4 6H2v4h2l4 4V2zM12 5l-4 6M8 5l4 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
        {wallet.isConnected ? (
          <div className="wallet-connected-group" ref={menuRef}>
            <button
              className="wallet-chip"
              onClick={() => setShowMenu(!showMenu)}
            >
              <span className={`wallet-dot ${isDappAccount ? 'warning' : ''}`} />
              <span>{isDappAccount ? '⚠ dApp' : displayAddress}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{marginLeft: 2}}>
                <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {showMenu && (
              <div className="wallet-menu">
                <div className="wallet-menu-addr">{wallet.address}</div>
                <button onClick={copyAddress}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                  Copy Address
                </button>
                <button onClick={() => { wallet.disconnect(); setShowMenu(false); }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M6 2H4a2 2 0 00-2 2v8a2 2 0 002 2h2M10 12l4-4-4-4M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Disconnect
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            className="connect-btn"
            onClick={() => wallet.openConnectModal()}
            disabled={wallet.isConnecting}
          >
            {wallet.isConnecting ? (
              <><span className="spinner" /> Connecting...</>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="7" width="12" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Connect Wallet
              </>
            )}
          </button>
        )}
      </div>
    </header>
  );
}
