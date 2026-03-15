/**
 * ToastContext — global toast notification system.
 * Supports success, error, warning, and info toasts with auto-dismiss.
 * Includes optional sound/haptic feedback on success.
 */

import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  txId?: string;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, opts?: { txId?: string; duration?: number }) => void;
  removeToast: (id: string) => void;
  soundEnabled: boolean;
  toggleSound: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToasts() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToasts must be inside ToastProvider');
  return ctx;
}

/** Translate RIDE error codes to human-readable messages */
function translateError(msg: string): string {
  const mappings: [RegExp, string][] = [
    [/slippage|Slippage check failed/i, 'Slippage tolerance exceeded — try increasing slippage or reducing amount'],
    [/deadline|Deadline passed/i, 'Transaction deadline expired — please try again'],
    [/insufficient|not enough/i, 'Insufficient balance for this transaction'],
    [/paused|Pool is paused/i, 'This pool is currently paused by the admin'],
    [/min.*liquidity|below minimum/i, 'Amount is below minimum liquidity requirement'],
    [/pool.*not.*found|Pool does not exist/i, 'Pool not found — it may not exist yet'],
    [/already.*exists|Pool already initialized/i, 'This pool already exists'],
    [/negative|must be positive/i, 'Amounts must be positive'],
    [/overflow/i, 'Calculation overflow — try a smaller amount'],
    [/fee.*invalid|fee.*out.*range/i, 'Invalid fee tier selected'],
    [/not.*authorized/i, 'Not authorized to perform this action'],
    [/invoke.*failed/i, 'Smart contract invocation failed'],
  ];
  for (const [pattern, friendly] of mappings) {
    if (pattern.test(msg)) return friendly;
  }
  return msg;
}

// Simple beep for success feedback
function playSuccessSound() {
  try {
    const ac = new AudioContext();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.3);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.3);
  } catch {
    // ignore audio errors
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const idCounter = useRef(0);

  const addToast = useCallback(
    (type: ToastType, message: string, opts?: { txId?: string; duration?: number }) => {
      const id = `toast-${++idCounter.current}`;
      const displayMsg = type === 'error' ? translateError(message) : message;
      const duration = opts?.duration ?? (type === 'error' ? 8000 : 5000);

      setToasts((prev) => [...prev, { id, type, message: displayMsg, txId: opts?.txId, duration }]);

      if (type === 'success' && soundEnabled) {
        playSuccessSound();
        // Haptic feedback on mobile
        if (navigator.vibrate) navigator.vibrate(50);
      }

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    },
    [soundEnabled]
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toggleSound = useCallback(() => setSoundEnabled((s) => !s), []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, soundEnabled, toggleSound }}>
      {children}
    </ToastContext.Provider>
  );
}

/** Rendered toast container — place at root level */
export function ToastContainer() {
  const { toasts, removeToast } = useToasts();
  const config = (window as any).__DCC_CONFIG__ || {};
  const explorerUrl = config.explorerUrl || 'https://explorer.decentralchain.io';

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <div className="toast-icon">
            {toast.type === 'success' && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            {toast.type === 'error' && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            )}
            {toast.type === 'warning' && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L15 14H1L8 1z" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 6v3M8 11.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            )}
            {toast.type === 'info' && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 5v.5M8 7v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            )}
          </div>
          <span className="toast-message">{toast.message}</span>
          {toast.txId && (
            <a
              className="toast-link"
              href={`https://explorer.decentralchain.io/tx/${toast.txId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View ↗
            </a>
          )}
          <button className="toast-close" onClick={() => removeToast(toast.id)}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
