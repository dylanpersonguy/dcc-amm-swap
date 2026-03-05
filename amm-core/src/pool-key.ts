/**
 * Pool key derivation and canonical token ordering.
 *
 * The pool key uniquely identifies a pair of assets.
 * It is derived from the canonical (sorted) ordering of the two asset IDs.
 * This ensures that pool(A, B) === pool(B, A) and prevents duplicate pools.
 */

import { DCC_ASSET_ID } from './constants';

/**
 * Normalize an asset ID.
 * - null / undefined / empty string / "DCC" all represent the native DCC token.
 *
 * @param assetId - Raw asset ID (possibly null for native token)
 * @returns Normalized string: "DCC" for native token, or the base58 asset ID
 */
export function normalizeAssetId(assetId: string | null | undefined): string {
  if (!assetId || assetId === '' || assetId === DCC_ASSET_ID) {
    return DCC_ASSET_ID;
  }
  return assetId;
}

/**
 * Sort two asset IDs into canonical order.
 *
 * Rules:
 * 1. Normalize both asset IDs.
 * 2. DCC (native token) always comes first.
 * 3. For non-DCC pairs, compare lexicographically.
 *
 * This matches the RIDE contract's canonicalOrder function exactly.
 *
 * @returns Tuple [canonicalA, canonicalB] where DCC is always first if present
 */
export function canonicalSort(
  assetA: string | null | undefined,
  assetB: string | null | undefined
): [string, string] {
  const a = normalizeAssetId(assetA);
  const b = normalizeAssetId(assetB);

  if (a === b) {
    throw new Error('canonicalSort: assets must be different');
  }

  // DCC always sorts first (matches RIDE canonicalOrder)
  if (a === DCC_ASSET_ID) return [a, b];
  if (b === DCC_ASSET_ID) return [b, a];

  // For non-DCC pairs, lexicographic order
  return a < b ? [a, b] : [b, a];
}

/**
 * Derive the deterministic pool key for a pair of assets.
 *
 * poolKey = canonicalA + "_" + canonicalB
 *
 * This is used as the namespace prefix for all pool state keys.
 *
 * @param assetA - First asset ID
 * @param assetB - Second asset ID
 * @returns Pool key string (e.g., "DCC_3P...")
 */
export function getPoolKey(
  assetA: string | null | undefined,
  assetB: string | null | undefined
): string {
  const [a, b] = canonicalSort(assetA, assetB);
  return `${a}_${b}`;
}

/**
 * Given a pool key, determine the direction of a swap.
 *
 * @param poolKey - The pool key
 * @param inputAssetId - The asset being sold
 * @returns { isAToB: true } if selling assetA for assetB, else { isAToB: false }
 */
export function getSwapDirection(
  poolKey: string,
  inputAssetId: string | null | undefined
): { isAToB: boolean; assetA: string; assetB: string } {
  const parts = poolKey.split('_');
  if (parts.length !== 2) {
    throw new Error('getSwapDirection: invalid pool key');
  }
  const [assetA, assetB] = parts;
  const normalizedInput = normalizeAssetId(inputAssetId);

  if (normalizedInput === assetA) {
    return { isAToB: true, assetA, assetB };
  } else if (normalizedInput === assetB) {
    return { isAToB: false, assetA, assetB };
  } else {
    throw new Error('getSwapDirection: input asset not in pool');
  }
}

/**
 * Build a state key for a pool data entry.
 */
export function poolStateKey(poolKey: string, field: string): string {
  return `pool_${poolKey}_${field}`;
}
