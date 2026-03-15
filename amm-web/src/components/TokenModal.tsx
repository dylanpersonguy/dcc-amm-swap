/**
 * TokenModal — searchable token selector populated from on-chain pools.
 * Replaces browser prompt() with a proper selection UI.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { TokenInfo } from '../hooks/useTokens';
import { getTokenColor, getTokenLogo } from '../hooks/useTokens';
import { TokenInfoPopup } from './TokenInfoPopup';

interface TokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (assetId: string) => void;
  tokens: TokenInfo[];
  excludeAssetId?: string | null;
  title?: string;
}

export function TokenModal({
  isOpen,
  onClose,
  onSelect,
  tokens,
  excludeAssetId,
  title = 'Select Token',
}: TokenModalProps) {
  const [search, setSearch] = useState('');
  const [customId, setCustomId] = useState('');
  const [infoAssetId, setInfoAssetId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setCustomId('');
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tokens.filter((t) => {
      if (excludeAssetId !== undefined) {
        const thisId = t.assetId === null ? 'DCC' : t.assetId;
        const excId = excludeAssetId === null ? 'DCC' : (excludeAssetId || '');
        if (thisId === excId) return false;
      }
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        (t.assetId || 'DCC').toLowerCase().includes(q)
      );
    });
  }, [tokens, search, excludeAssetId]);

  if (!isOpen) return null;

  const handleSelect = (token: TokenInfo) => {
    onSelect(token.assetId === null ? 'DCC' : token.assetId);
    onClose();
  };

  const handleCustom = () => {
    if (customId.trim()) {
      onSelect(customId.trim());
      onClose();
    }
  };

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card token-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="token-search-wrap">
            <svg className="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              ref={inputRef}
              className="token-search"
              type="text"
              placeholder="Search by name or paste address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Quick select for common tokens */}
          <div className="token-quick-list">
            {tokens.slice(0, 4).map((token) => {
              const thisId = token.assetId === null ? 'DCC' : token.assetId;
              const excId = excludeAssetId === null ? 'DCC' : (excludeAssetId || '');
              if (thisId === excId) return null;
              return (
                <button
                  key={thisId}
                  className="token-quick-btn"
                  onClick={() => handleSelect(token)}
                >
                  {(() => {
                    const logo = getTokenLogo(token.name, token.assetId);
                    return logo
                      ? <img src={logo} alt={token.name} className="token-dot-logo" />
                      : <span className="token-dot" style={{ background: getTokenColor(token.assetId) }} />;
                  })()}
                  {token.name}
                </button>
              );
            })}
          </div>

          <div className="token-list-divider" />

          <div className="token-list">
            {filtered.map((token) => (
              <button
                key={token.assetId || 'DCC'}
                className="token-list-item"
                onClick={() => handleSelect(token)}
              >
                {(() => {
                  const logo = getTokenLogo(token.name, token.assetId);
                  return logo
                    ? <img src={logo} alt={token.name} className="token-dot-lg-logo" />
                    : (
                      <span
                        className="token-dot-lg"
                        style={{ background: getTokenColor(token.assetId) }}
                      >
                        {token.name.charAt(0).toUpperCase()}
                      </span>
                    );
                })()}
                <div className="token-list-info">
                  <span className="token-list-name">{token.name}</span>
                  <span className="token-list-id">
                    {token.assetId
                      ? `${token.assetId.slice(0, 10)}...${token.assetId.slice(-6)}`
                      : 'Native token'}
                  </span>
                </div>
                <span className="token-list-decimals">{token.decimals}d</span>
                <button
                  className="token-info-btn"
                  onClick={(e) => { e.stopPropagation(); setInfoAssetId(token.assetId); }}
                  title="Token info"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M8 7v4M8 5.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                </button>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="token-list-empty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span>No tokens found</span>
              </div>
            )}
          </div>

          <div className="token-list-divider" />

          <div className="token-custom">
            <span className="token-custom-label">Custom token</span>
            <div className="token-custom-row">
              <input
                type="text"
                placeholder="Paste asset ID..."
                value={customId}
                onChange={(e) => setCustomId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCustom()}
              />
              <button
                className="btn-accent btn-sm"
                onClick={handleCustom}
                disabled={!customId.trim()}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    {infoAssetId !== null && (() => {
      const infoToken = tokens.find((t) => t.assetId === infoAssetId);
      return (
        <TokenInfoPopup
          assetId={infoAssetId}
          name={infoToken?.name ?? 'Unknown'}
          decimals={infoToken?.decimals ?? 8}
          isOpen={true}
          onClose={() => setInfoAssetId(null)}
        />
      );
    })()}
  </>
  );
}
