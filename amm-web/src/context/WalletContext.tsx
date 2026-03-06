/**
 * Wallet context — manages connection via built-in seed signer.
 *
 * Uses @waves/waves-transactions for address derivation, signing, and broadcasting.
 * Modal-based connect flow (no browser prompt()).
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { invokeScript, broadcast, waitForTx, libs } from '@waves/waves-transactions';
import { config } from '../config';

interface WalletState {
  address: string | null;
  publicKey: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  seed: string | null;
  connectModalOpen: boolean;
}

interface WalletContextValue extends Omit<WalletState, 'seed'> {
  openConnectModal: () => void;
  closeConnectModal: () => void;
  connectWithSeed: (seed: string) => Promise<void>;
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
    seed: null,
    connectModalOpen: false,
  });

  const openConnectModal = useCallback(() => {
    setState((s) => ({ ...s, connectModalOpen: true, error: null }));
  }, []);

  const closeConnectModal = useCallback(() => {
    setState((s) => ({ ...s, connectModalOpen: false, error: null, isConnecting: false }));
  }, []);

  const connectWithSeed = useCallback(async (seedInput: string) => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));

    try {
      const seed = seedInput.trim();
      if (!seed) {
        setState((s) => ({ ...s, isConnecting: false, error: 'No seed provided' }));
        return;
      }

      const chainId = config.chainId;
      const address = libs.crypto.address(seed, chainId);
      const publicKey = libs.crypto.publicKey(seed);

      setState({
        address,
        publicKey,
        isConnected: true,
        isConnecting: false,
        error: null,
        seed,
        connectModalOpen: false,
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
    setState({
      address: null,
      publicKey: null,
      isConnected: false,
      isConnecting: false,
      error: null,
      seed: null,
      connectModalOpen: false,
    });
  }, []);

  const signAndBroadcast = useCallback(
    async (tx: unknown): Promise<string> => {
      if (!state.isConnected || !state.seed) {
        throw new Error('Wallet not connected');
      }

      // Guard: dApp cannot invoke itself
      if (state.address === config.dAppAddress) {
        throw new Error(
          'Cannot transact from the dApp account — the dApp cannot invoke itself. ' +
          'Please connect with a different wallet seed.'
        );
      }

      const txParams = tx as any;
      const chainId = config.chainId.charCodeAt(0);

      const signedTx = invokeScript(
        {
          dApp: txParams.dApp,
          call: txParams.call,
          payment: (txParams.payment || []).map((p: any) => ({
            assetId: p.assetId || null,
            amount: p.amount,
          })),
          fee: txParams.fee || 500000,
          chainId,
        },
        state.seed
      );

      console.log('[Wallet] Broadcasting tx:', signedTx.id);
      console.log('[Wallet] TX details:', JSON.stringify(signedTx, null, 2));

      try {
        await broadcast(signedTx, config.nodeUrl);
      } catch (broadcastErr: any) {
        const msg = broadcastErr?.message || broadcastErr?.data?.message || JSON.stringify(broadcastErr);
        console.error('[Wallet] Broadcast failed:', msg);
        throw new Error(msg);
      }
      console.log('[Wallet] Broadcast OK, waiting for confirmation...');

      await waitForTx(signedTx.id!, {
        apiBase: config.nodeUrl,
        timeout: 120000,
      });
      console.log('[Wallet] Transaction confirmed:', signedTx.id);

      return signedTx.id!;
    },
    [state.isConnected, state.seed]
  );

  const { seed: _seed, ...publicState } = state;

  return (
    <WalletContext.Provider
      value={{
        ...publicState,
        openConnectModal,
        closeConnectModal,
        connectWithSeed,
        disconnect,
        signAndBroadcast,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
