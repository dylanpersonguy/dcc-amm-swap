import React, { useState } from 'react';
import { WalletProvider } from './context/WalletContext';
import { SdkProvider } from './context/SdkContext';
import { Header } from './components/Header';
import { SwapPanel } from './components/SwapPanel';
import { LiquidityPanel } from './components/LiquidityPanel';
import { PoolExplorer } from './components/PoolExplorer';
import { ConnectModal } from './components/ConnectModal';

type Tab = 'swap' | 'liquidity' | 'pools';

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('swap');

  return (
    <WalletProvider>
      <SdkProvider>
        {/* Animated background orbs */}
        <div className="bg-orbs">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
          <div className="orb orb-3" />
        </div>

        <div className="app">
          <Header />

          <nav className="tab-bar">
            {(['swap', 'liquidity', 'pools'] as Tab[]).map((tab) => (
              <button
                key={tab}
                className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'swap' && (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M2 5h10l-3-3M14 11H4l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                {tab === 'liquidity' && (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                )}
                {tab === 'pools' && (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                    <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                    <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                    <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                )}
                <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
              </button>
            ))}
          </nav>

          <main className="main-content">
            {activeTab === 'swap' && <SwapPanel />}
            {activeTab === 'liquidity' && <LiquidityPanel />}
            {activeTab === 'pools' && <PoolExplorer />}
          </main>

          <footer className="footer">
            <span>DCC AMM v2 — Constant-product AMM on DecentralChain</span>
            <span className="footer-status">
              <span className="footer-status-dot" />
              Operational
            </span>
          </footer>
        </div>

        <ConnectModal />
      </SdkProvider>
    </WalletProvider>
  );
}
