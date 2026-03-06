import React, { useState, useRef, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { config } from '../config';

export function Header() {
  const wallet = useWallet();
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
        <div className="logo-mark">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="url(#logo-grad)"/>
            <path d="M10 20L16 8l6 12H10z" fill="white" fillOpacity="0.9"/>
            <defs>
              <linearGradient id="logo-grad" x1="0" y1="0" x2="32" y2="32">
                <stop stopColor="#7c5cfc"/>
                <stop offset="0.5" stopColor="#6d9fff"/>
                <stop offset="1" stopColor="#5cefd6"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div className="logo-text">
          <h1>DCC Swap</h1>
          <span className="net-badge">Mainnet</span>
        </div>
      </div>

      <div className="header-right">
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
