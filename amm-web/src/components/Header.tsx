import React from 'react';
import { useWallet } from '../context/WalletContext';

export function Header() {
  const { address, isConnected, isConnecting, connect, disconnect } = useWallet();

  const displayAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : '';

  return (
    <header className="header">
      <h1>DCC AMM Swap</h1>
      {isConnected ? (
        <button className="wallet-btn connected" onClick={disconnect}>
          {displayAddress}
        </button>
      ) : (
        <button
          className="wallet-btn"
          onClick={connect}
          disabled={isConnecting}
        >
          {isConnecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
      )}
    </header>
  );
}
