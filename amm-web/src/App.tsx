import React, { useState } from 'react';
import { WalletProvider } from './context/WalletContext';
import { SdkProvider } from './context/SdkContext';
import { Header } from './components/Header';
import { SwapPanel } from './components/SwapPanel';
import { LiquidityPanel } from './components/LiquidityPanel';
import { PoolExplorer } from './components/PoolExplorer';

type Tab = 'swap' | 'liquidity' | 'pools';

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('swap');

  return (
    <WalletProvider>
      <SdkProvider>
        <div className="app">
          <Header />
          <nav className="tab-bar">
            <button
              className={`tab ${activeTab === 'swap' ? 'active' : ''}`}
              onClick={() => setActiveTab('swap')}
            >
              Swap
            </button>
            <button
              className={`tab ${activeTab === 'liquidity' ? 'active' : ''}`}
              onClick={() => setActiveTab('liquidity')}
            >
              Liquidity
            </button>
            <button
              className={`tab ${activeTab === 'pools' ? 'active' : ''}`}
              onClick={() => setActiveTab('pools')}
            >
              Pools
            </button>
          </nav>
          <main className="main-content">
            {activeTab === 'swap' && <SwapPanel />}
            {activeTab === 'liquidity' && <LiquidityPanel />}
            {activeTab === 'pools' && <PoolExplorer />}
          </main>
        </div>
      </SdkProvider>
    </WalletProvider>
  );
}
