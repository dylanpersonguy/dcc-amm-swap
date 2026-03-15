/**
 * TokenInfoPopup — shows token details when clicking a token name.
 * Displays: contract address, decimals, total supply, explorer link.
 */

import React, { useState, useEffect } from 'react';
import { config } from '../config';

interface TokenInfoPopupProps {
  assetId: string | null;
  name: string;
  decimals: number;
  isOpen: boolean;
  onClose: () => void;
}

export function TokenInfoPopup({ assetId, name, decimals, isOpen, onClose }: TokenInfoPopupProps) {
  const [info, setInfo] = useState<{
    description?: string;
    quantity?: string;
    issuer?: string;
    reissuable?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isOpen || !assetId) return;
    (async () => {
      try {
        const res = await fetch(`${config.nodeUrl}/assets/details/${assetId}`);
        if (res.ok) {
          const data = await res.json();
          setInfo({
            description: data.description,
            quantity: data.quantity?.toString(),
            issuer: data.issuer,
            reissuable: data.reissuable,
          });
        }
      } catch {
        // ignore
      }
    })();
  }, [isOpen, assetId]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card token-info-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{name}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="modal-body token-info-body">
          <div className="token-info-row">
            <span className="token-info-label">Type</span>
            <span className="token-info-value">{assetId ? 'Issued Token' : 'Native Token'}</span>
          </div>
          <div className="token-info-row">
            <span className="token-info-label">Decimals</span>
            <span className="token-info-value">{decimals}</span>
          </div>
          {assetId && (
            <div className="token-info-row">
              <span className="token-info-label">Asset ID</span>
              <div className="token-info-address">
                <span className="token-info-value mono">
                  {assetId.slice(0, 12)}...{assetId.slice(-8)}
                </span>
                <button className="token-info-copy" onClick={() => copyToClipboard(assetId)} title="Copy">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                </button>
              </div>
            </div>
          )}
          {info?.issuer && (
            <div className="token-info-row">
              <span className="token-info-label">Issuer</span>
              <span className="token-info-value mono">{info.issuer.slice(0, 10)}...{info.issuer.slice(-6)}</span>
            </div>
          )}
          {info?.quantity && (
            <div className="token-info-row">
              <span className="token-info-label">Total Supply</span>
              <span className="token-info-value">{Number(BigInt(info.quantity) / BigInt(10 ** decimals)).toLocaleString()}</span>
            </div>
          )}
          {info?.description && (
            <div className="token-info-row">
              <span className="token-info-label">Description</span>
              <span className="token-info-value">{info.description}</span>
            </div>
          )}
          {assetId && (
            <a
              className="token-info-explorer"
              href={`${config.explorerUrl}/assets/${assetId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on Explorer ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
