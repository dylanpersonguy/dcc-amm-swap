/**
 * Node client — reads pool state from the DecentralChain node API.
 *
 * Uses the /addresses/data/{address} endpoint to read dApp state entries.
 * No external dependencies beyond fetch (Node 18+).
 */

import { AmmSdkConfig, DataEntry, PoolState } from './types';
import { DCC_ASSET_ID } from '@dcc-amm/core';

export class NodeClient {
  private readonly nodeUrl: string;
  private readonly dAppAddress: string;

  constructor(config: AmmSdkConfig) {
    this.nodeUrl = config.nodeUrl.replace(/\/$/, '');
    this.dAppAddress = config.dAppAddress;
  }

  /** Fetch a single data entry by key */
  async getDataEntry(key: string): Promise<DataEntry | null> {
    const url = `${this.nodeUrl}/addresses/data/${this.dAppAddress}/${encodeURIComponent(key)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return (await res.json()) as DataEntry;
    } catch {
      return null;
    }
  }

  /** Fetch multiple data entries by regex or prefix */
  async getDataEntries(matches?: string): Promise<DataEntry[]> {
    let url = `${this.nodeUrl}/addresses/data/${this.dAppAddress}`;
    if (matches) {
      url += `?matches=${encodeURIComponent(matches)}`;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Node API error: ${res.status}`);
    return (await res.json()) as DataEntry[];
  }

  /** Fetch integer value for a key */
  async getInteger(key: string): Promise<bigint | null> {
    const entry = await this.getDataEntry(key);
    if (!entry || entry.type !== 'integer') return null;
    return BigInt(entry.value as number);
  }

  /** Fetch string value for a key */
  async getString(key: string): Promise<string | null> {
    const entry = await this.getDataEntry(key);
    if (!entry || entry.type !== 'string') return null;
    return entry.value as string;
  }

  /** Fetch boolean value for a key */
  async getBoolean(key: string): Promise<boolean | null> {
    const entry = await this.getDataEntry(key);
    if (!entry || entry.type !== 'boolean') return null;
    return entry.value as boolean;
  }

  /** Read full pool state */
  async getPoolState(poolKey: string): Promise<PoolState | null> {
    const prefix = `pool_${poolKey}_`;
    const entries = await this.getDataEntries(`${prefix}.*`);

    if (entries.length === 0) return null;

    const map = new Map<string, DataEntry>();
    for (const e of entries) {
      const field = e.key.replace(prefix, '');
      map.set(field, e);
    }

    const exists = map.get('exists');
    if (!exists || exists.value !== true) return null;

    return {
      poolKey,
      assetA: (map.get('assetA')?.value as string) ?? DCC_ASSET_ID,
      assetB: (map.get('assetB')?.value as string) ?? '',
      reserveA: BigInt((map.get('reserveA')?.value as number) ?? 0),
      reserveB: BigInt((map.get('reserveB')?.value as number) ?? 0),
      lpAssetId: (map.get('lpAsset')?.value as string) ?? '',
      lpSupply: BigInt((map.get('lpSupply')?.value as number) ?? 0),
      feeBps: BigInt((map.get('feeBps')?.value as number) ?? 30),
      status: ((map.get('status')?.value as string) ?? 'active') as 'active' | 'paused',
      exists: true,
    };
  }

  /** Get total pool count */
  async getPoolCount(): Promise<number> {
    const val = await this.getInteger('global_poolCount');
    return val !== null ? Number(val) : 0;
  }

  /** List all pool keys */
  async listPoolKeys(): Promise<string[]> {
    const count = await this.getPoolCount();
    const keys: string[] = [];
    for (let i = 0; i < count; i++) {
      const key = await this.getString(`poolIndex_${i}`);
      if (key) keys.push(key);
    }
    return keys;
  }

  /** List all pools with full state */
  async listPools(): Promise<PoolState[]> {
    const keys = await this.listPoolKeys();
    const pools: PoolState[] = [];
    for (const key of keys) {
      const state = await this.getPoolState(key);
      if (state) pools.push(state);
    }
    return pools;
  }

  /** Check if protocol is paused */
  async isPaused(): Promise<boolean> {
    const val = await this.getBoolean('global_paused');
    return val === true;
  }

  /** Get current blockchain height */
  async getHeight(): Promise<number> {
    const res = await fetch(`${this.nodeUrl}/blocks/height`);
    if (!res.ok) throw new Error(`Node API error: ${res.status}`);
    const data = (await res.json()) as { height: number };
    return data.height;
  }

  /** Get asset info */
  async getAssetInfo(assetId: string): Promise<{
    name: string;
    decimals: number;
    description: string;
    quantity: number;
    scripted: boolean;
  } | null> {
    if (assetId === DCC_ASSET_ID || !assetId) {
      return {
        name: 'DCC',
        decimals: 8,
        description: 'DecentralChain native token',
        quantity: 0,
        scripted: false,
      };
    }
    try {
      const res = await fetch(`${this.nodeUrl}/assets/details/${assetId}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /** Get address balance for a specific asset */
  async getBalance(address: string, assetId: string | null): Promise<bigint> {
    if (!assetId || assetId === DCC_ASSET_ID) {
      const res = await fetch(`${this.nodeUrl}/addresses/balance/${address}`);
      if (!res.ok) return 0n;
      const data = (await res.json()) as { balance: number };
      return BigInt(data.balance);
    }
    const res = await fetch(
      `${this.nodeUrl}/assets/balance/${address}/${assetId}`
    );
    if (!res.ok) return 0n;
    const data = (await res.json()) as { balance: number };
    return BigInt(data.balance);
  }
}
