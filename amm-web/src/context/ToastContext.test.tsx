import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  ToastProvider,
  ToastContainer,
  useToasts,
  translateError,
  type ToastType,
} from './ToastContext';

declare global {
  var __DCC_CONFIG__: { explorerUrl?: string } | undefined;
}

function TriggerToast({
  type,
  message,
  opts,
}: {
  type: ToastType;
  message: string;
  opts?: { txId?: string; duration?: number };
}) {
  const { addToast } = useToasts();
  return (
    <button onClick={() => addToast(type, message, opts)}>fire toast</button>
  );
}

function SoundState() {
  const { soundEnabled, toggleSound } = useToasts();
  return (
    <div>
      <span data-testid="sound-state">{soundEnabled ? 'on' : 'off'}</span>
      <button onClick={toggleSound}>toggle</button>
    </div>
  );
}

afterEach(() => {
  delete (window as any).__DCC_CONFIG__;
});

describe('ToastContainer explorer link', () => {
  it('uses the configured window.__DCC_CONFIG__.explorerUrl for the tx link (regression)', () => {
    (window as any).__DCC_CONFIG__ = { explorerUrl: 'https://custom-explorer.example.com' };

    render(
      <ToastProvider>
        <TriggerToast type="success" message="Swap complete" opts={{ txId: 'abc123' }} />
        <ToastContainer />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('fire toast'));

    const link = screen.getByText('View ↗').closest('a');
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute('href', 'https://custom-explorer.example.com/tx/abc123');
    // Guard against regressing back to the hardcoded default.
    expect(link?.getAttribute('href')).not.toContain('explorer.decentralchain.io');
  });

  it('falls back to the default explorer URL when no config is set', () => {
    render(
      <ToastProvider>
        <TriggerToast type="success" message="Swap complete" opts={{ txId: 'xyz789' }} />
        <ToastContainer />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('fire toast'));

    const link = screen.getByText('View ↗').closest('a');
    expect(link).toHaveAttribute('href', 'https://explorer.decentralchain.io/tx/xyz789');
  });

  it('renders no link when the toast has no txId', () => {
    render(
      <ToastProvider>
        <TriggerToast type="info" message="Just an info message" />
        <ToastContainer />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('fire toast'));

    expect(screen.queryByText('View ↗')).toBeNull();
  });
});

describe('translateError', () => {
  it('maps slippage errors', () => {
    expect(translateError('Slippage check failed: min out not met')).toBe(
      'Slippage tolerance exceeded — try increasing slippage or reducing amount'
    );
    expect(translateError('slippage too high')).toContain('Slippage tolerance exceeded');
  });

  it('maps deadline errors', () => {
    expect(translateError('Deadline passed for this tx')).toBe(
      'Transaction deadline expired — please try again'
    );
  });

  it('maps insufficient balance errors', () => {
    expect(translateError('insufficient funds')).toBe('Insufficient balance for this transaction');
    expect(translateError('not enough DCC')).toBe('Insufficient balance for this transaction');
  });

  it('maps paused pool errors', () => {
    expect(translateError('Pool is paused')).toBe('This pool is currently paused by the admin');
  });

  it('maps below-minimum-liquidity errors', () => {
    expect(translateError('amount below minimum')).toBe(
      'Amount is below minimum liquidity requirement'
    );
    expect(translateError('min liquidity not met')).toBe(
      'Amount is below minimum liquidity requirement'
    );
  });

  it('maps pool-not-found errors', () => {
    expect(translateError('Pool does not exist')).toBe('Pool not found — it may not exist yet');
    expect(translateError('pool XYZ not found')).toBe('Pool not found — it may not exist yet');
  });

  it('maps pool-already-exists errors', () => {
    expect(translateError('Pool already initialized')).toBe('This pool already exists');
    expect(translateError('pair already exists')).toBe('This pool already exists');
  });

  it('maps negative-amount errors', () => {
    expect(translateError('amount must be positive')).toBe('Amounts must be positive');
    expect(translateError('negative amount not allowed')).toBe('Amounts must be positive');
  });

  it('maps overflow errors', () => {
    expect(translateError('overflow detected')).toBe('Calculation overflow — try a smaller amount');
  });

  it('maps invalid-fee errors', () => {
    expect(translateError('fee invalid')).toBe('Invalid fee tier selected');
    expect(translateError('fee out of range')).toBe('Invalid fee tier selected');
  });

  it('maps not-authorized errors', () => {
    expect(translateError('Caller not authorized')).toBe('Not authorized to perform this action');
  });

  it('maps generic invoke-failed errors', () => {
    expect(translateError('invoke failed with error code 5')).toBe(
      'Smart contract invocation failed'
    );
  });

  it('returns the original message unchanged when nothing matches', () => {
    const msg = 'Some completely unrecognized error string';
    expect(translateError(msg)).toBe(msg);
  });
});

describe('addToast', () => {
  it('translates error messages but leaves other toast types untouched', () => {
    render(
      <ToastProvider>
        <TriggerToast type="error" message="Slippage check failed" />
        <TriggerToast type="success" message="Raw success message" />
        <ToastContainer />
      </ToastProvider>
    );

    fireEvent.click(screen.getAllByText('fire toast')[0]);
    fireEvent.click(screen.getAllByText('fire toast')[1]);

    expect(
      screen.getByText('Slippage tolerance exceeded — try increasing slippage or reducing amount')
    ).toBeTruthy();
    expect(screen.getByText('Raw success message')).toBeTruthy();
  });

  it('removes a toast when its close button is clicked', () => {
    render(
      <ToastProvider>
        <TriggerToast type="info" message="Dismiss me" />
        <ToastContainer />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('fire toast'));
    expect(screen.getByText('Dismiss me')).toBeTruthy();

    fireEvent.click(document.querySelector('.toast-close')!);
    expect(screen.queryByText('Dismiss me')).toBeNull();
  });

  it('toggles soundEnabled state', () => {
    render(
      <ToastProvider>
        <SoundState />
      </ToastProvider>
    );

    expect(screen.getByTestId('sound-state').textContent).toBe('on');
    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('sound-state').textContent).toBe('off');
  });
});

describe('toast auto-dismiss timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-dismisses a success toast after the default 5000ms', () => {
    render(
      <ToastProvider>
        <TriggerToast type="success" message="Temporary message" />
        <ToastContainer />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText('fire toast'));
    });
    expect(screen.getByText('Temporary message')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.getByText('Temporary message')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Temporary message')).toBeNull();
  });

  it('auto-dismisses an error toast after the default 8000ms, not 5000ms', () => {
    render(
      <ToastProvider>
        <TriggerToast type="error" message="totally unrecognized error" />
        <ToastContainer />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText('fire toast'));
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // Error toasts default to 8000ms, so it should still be visible at 5000ms.
    expect(screen.getByText('totally unrecognized error')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText('totally unrecognized error')).toBeNull();
  });

  it('respects a custom duration override', () => {
    render(
      <ToastProvider>
        <TriggerToast type="info" message="Custom duration" opts={{ duration: 1000 }} />
        <ToastContainer />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText('fire toast'));
    });

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(screen.getByText('Custom duration')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Custom duration')).toBeNull();
  });
});

describe('useToasts', () => {
  it('throws when used outside a ToastProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Bare() {
      useToasts();
      return null;
    }
    expect(() => render(<Bare />)).toThrow('useToasts must be inside ToastProvider');
    spy.mockRestore();
  });
});
