/**
 * SDK context — provides AmmSdk instance to all components.
 */

import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { AmmSdk } from '@dcc-amm/sdk';
import { config } from '../config';

const SdkContext = createContext<AmmSdk | null>(null);

export function useSdk(): AmmSdk {
  const ctx = useContext(SdkContext);
  if (!ctx) throw new Error('useSdk must be used within SdkProvider');
  return ctx;
}

export function SdkProvider({ children }: { children: ReactNode }) {
  const sdk = useMemo(
    () =>
      new AmmSdk({
        nodeUrl: config.nodeUrl,
        dAppAddress: config.dAppAddress,
        chainId: config.chainId,
      }),
    []
  );

  return <SdkContext.Provider value={sdk}>{children}</SdkContext.Provider>;
}
