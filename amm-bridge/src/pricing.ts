/**
 * DCC/USD pricing — the authoritative source for how much DCC a deposit is worth.
 *
 * DCC has no external market (not listed on CoinGecko or elsewhere), so the only
 * real price signal is the AMM's own pool reserves once one exists. Until then,
 * we fall back to the static configured price.
 */
import { config } from './config';

let cache: { price: number; ts: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getDccPriceUsd(): Promise<number> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.price;

  if (config.priceReferenceAssetId) {
    try {
      const res = await fetch(`${config.indexerUrl}/pools`);
      if (res.ok) {
        const pools = (await res.json()) as Array<{
          assetA: string;
          assetB: string;
          priceAtoB: number;
          priceBtoA: number;
        }>;
        const pool = pools.find(
          (p) =>
            (p.assetA === 'DCC' && p.assetB === config.priceReferenceAssetId) ||
            (p.assetB === 'DCC' && p.assetA === config.priceReferenceAssetId),
        );
        if (pool) {
          const price = pool.assetA === 'DCC' ? pool.priceAtoB : pool.priceBtoA;
          if (price && price > 0) {
            cache = { price, ts: Date.now() };
            return price;
          }
        }
      }
    } catch {
      // Indexer unreachable or malformed response — fall through to static fallback.
    }
  }

  return config.dccPriceUsd;
}
