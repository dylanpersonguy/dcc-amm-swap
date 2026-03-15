import React, { useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { WalletProvider } from './context/WalletContext';
import { SdkProvider } from './context/SdkContext';
import { ToastProvider, ToastContainer } from './context/ToastContext';
import { TxTrackerProvider, TransactionWidget } from './context/TransactionTracker';
import { Header } from './components/Header';
import { SwapPanel } from './components/SwapPanel';
import { LiquidityPanel } from './components/LiquidityPanel';
import { PoolExplorer } from './components/PoolExplorer';
import { PoolDetail } from './components/PoolDetail';
import { MyPools } from './components/MyPools';
import { ExplorePage } from './components/ExplorePage';
import { PortfolioPage } from './components/PortfolioPage';
import { ConnectModal } from './components/ConnectModal';
import { OfflineBanner } from './components/OfflineBanner';
import { config } from './config';

const NAV_ITEMS = [
  { path: '/swap', label: 'Swap', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 5h10l-3-3M14 11H4l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )},
  { path: '/liquidity', label: 'Liquidity', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )},
  { path: '/pools', label: 'Pools', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )},
  { path: '/my-pools', label: 'My Pools', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM2.5 14c0-2.5 2.5-4 5.5-4s5.5 1.5 5.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )},
  { path: '/explore', label: 'Explore', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M6.5 5.5l5 2.5-5 2.5v-5z" fill="currentColor"/>
    </svg>
  )},
  { path: '/portfolio', label: 'Portfolio', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 6h12" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="10" cy="9.5" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  )},
];

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <div className="route-transition" key={location.pathname.split('/')[1]}>
      <Routes location={location}>
        <Route path="/swap" element={<SwapPanel />} />
        <Route path="/swap/:inputToken/:outputToken" element={<SwapPanel />} />
        <Route path="/liquidity" element={<LiquidityPanel />} />
        <Route path="/pools" element={<PoolExplorer />} />
        <Route path="/pools/:poolId" element={<PoolDetail />} />
        <Route path="/my-pools" element={<MyPools />} />
        <Route path="/my-pools/:poolId" element={<MyPools />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="*" element={<Navigate to="/swap" replace />} />
      </Routes>
    </div>
  );
}

export function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <WalletProvider>
      <SdkProvider>
        <ToastProvider>
          <TxTrackerProvider>
            {/* Animated background orbs */}
            <div className="bg-orbs">
              <div className="orb orb-1" />
              <div className="orb orb-2" />
              <div className="orb orb-3" />
            </div>

            <div className="app">
              <OfflineBanner />
              <Header onMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)} />

              {/* Desktop tab bar */}
              <nav className="tab-bar">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </nav>

              {/* Mobile drawer */}
              {mobileMenuOpen && (
                <div className="mobile-menu-overlay" onClick={() => setMobileMenuOpen(false)}>
                  <nav className="mobile-menu-drawer" onClick={(e) => e.stopPropagation()}>
                    <div className="mobile-menu-header">
                      <span>Menu</span>
                      <button className="mobile-menu-close" onClick={() => setMobileMenuOpen(false)}>
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                    {NAV_ITEMS.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => `mobile-menu-item ${isActive ? 'active' : ''}`}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </NavLink>
                    ))}
                  </nav>
                </div>
              )}

              <main className="main-content">
                <AnimatedRoutes />
              </main>

              <footer className="footer">
                <div className="footer-left">
                  <span>DCC AMM v2 — Constant-product AMM on DecentralChain</span>
                  <a
                    className="footer-contract"
                    href={`${config.explorerUrl}/address/${config.dAppAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View contract on explorer"
                  >
                    Contract: {config.dAppAddress.slice(0, 8)}…{config.dAppAddress.slice(-4)} ↗
                  </a>
                </div>
                <span className="footer-status">
                  <span className="footer-status-dot" />
                  Operational
                </span>
              </footer>
            </div>

            <ConnectModal />
            <ToastContainer />
            <TransactionWidget />
          </TxTrackerProvider>
        </ToastProvider>
      </SdkProvider>
    </WalletProvider>
  );
}
