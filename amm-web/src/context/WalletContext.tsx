/**
 * Wallet context — manages connection to DecentralChain via Signer + Cubensis Connect.
 *
 * Provides wallet state and sign/broadcast capabilities to all components.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface WalletState {
  address: string | null;
  publicKey: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

interface WalletContextValue extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
  signAndBroadcast: (tx: unknown) => Promise<string>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    address: null,
    publicKey: null,
    isConnected: false,
    isConnecting: false,
    error: null,
  });

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));

    try {
      // In production, this would use:
      // import { Signer } from '@decentralchain/signer';
      // import { ProviderCubensisConnect } from '@cubensis-connect/provider';
      //
      // const signer = new Signer({ NODE_URL: config.nodeUrl });
      // signer.setProvider(new ProviderCubensisConnect());
      // const user = await signer.login();
      //
      // For now, simulate a wallet connection:
      const mockAddress = '3P' + 'x'.repeat(33);
      const mockPubKey = 'pubkey_mock';

      // Store signer instance globally for tx signing
      (window as any).__dccSigner = null; // Would be real signer

      setState({
        address: mockAddress,
        publicKey: mockPubKey,
        isConnected: true,
        isConnecting: false,
        error: null,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        isConnecting: false,
        error: err instanceof Error ? err.message : 'Connection failed',
      }));
    }
  }, []);

  const disconnect = useCallback(() => {
    (window as any).__dccSigner = null;
    setState({
      address: null,
      publicKey: null,
      isConnected: false,
      isConnecting: false,
      error: null,
    });
  }, []);

  const signAndBroadcast = useCallback(
    async (tx: unknown): Promise<string> => {
      if (!state.isConnected) {
        throw new Error('Wallet not connected');
      }

      // In production:
      // const signer = (window as any).__dccSigner as Signer;
      // const [result] = await signer.invoke(tx).broadcast();
      // return result.id;

      // Mock: return a fake tx ID
      console.log('[Wallet] Sign and broadcast:', tx);
      return 'mock_tx_' + Date.now().toString(36);
    },
    [state.isConnected]
  );

  return (
    <WalletContext.Provider
      value={{ ...state, connect, disconnect, signAndBroadcast }}
    >
      {children}
    </WalletContext.Provider>
  );
}
