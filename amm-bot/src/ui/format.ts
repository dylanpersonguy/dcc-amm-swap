/**
 * Formatting utilities for beautiful Telegram messages.
 * Uses HTML parse mode for rich text. Trojan-style layout.
 */

import { fromRawAmount, formatAmount } from '@dcc-amm/sdk';
import { config } from '../config';

// ── Number formatting ──────────────────────────────────────────────

export function fmtDcc(raw: bigint): string {
  return fromRawAmount(raw, 8);
}

export function fmtToken(raw: bigint, decimals: number): string {
  return fromRawAmount(raw, decimals);
}

export function fmtUsd(num: number): string {
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtPercent(bps: number): string {
  return (bps / 100).toFixed(2) + '%';
}

export function fmtCompact(raw: bigint, decimals: number): string {
  const num = Number(raw) / 10 ** decimals;
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(2) + 'K';
  return num.toFixed(decimals > 4 ? 4 : decimals || 2);
}

export function shortAddr(addr: string): string {
  return addr.slice(0, 6) + '···' + addr.slice(-4);
}

export function shortAsset(assetId: string | null): string {
  if (!assetId || assetId === 'DCC') return 'DCC';
  return assetId.slice(0, 6) + '···';
}

// ── Link builders ──────────────────────────────────────────────────

export function txLink(txId: string): string {
  return `<a href="${config.explorerUrl}/tx/${txId}">View TX ↗</a>`;
}

export function addrLink(address: string): string {
  return `<a href="${config.explorerUrl}/address/${address}">${shortAddr(address)}</a>`;
}

// ── Message templates ──────────────────────────────────────────────

export function divider(): string {
  return '━━━━━━━━━━━━━━━━━━━━━━━━━━';
}

export function thinDivider(): string {
  return '──────────────────────────';
}

export function sparkDivider(): string {
  return '✨────────────────────────✨';
}

/**
 * Trojan-style home screen — premium, informative, and fun.
 */
export function homeMessage(opts: {
  address: string | null;
  dccBalance: bigint;
  tradeCount: number;
  walletLabel?: string;
  displayName?: string;
  poolCount?: number;
  referralCount?: number;
}): string {
  const lines: string[] = [];
  const walletLabel = opts.walletLabel || 'W1';
  const name = opts.displayName || 'Trader';

  // Time-based greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? '🌅 Good morning' : hour < 18 ? '☀️ Good afternoon' : '🌙 Good evening';

  lines.push(`⚡ <b>DCC Swap</b>`);
  lines.push(`<i>The Lightning-Fast DEX on DecentralChain</i>`);
  lines.push(divider());
  lines.push('');
  lines.push(`${greeting}, <b>${name}</b>! 👋`);

  if (opts.address) {
    lines.push('');
    lines.push(`💼 <b>Wallet</b> — ${walletLabel}`);
    lines.push(`<code>${opts.address}</code>`);
    lines.push('');

    // Balance box
    const bal = fmtDcc(opts.dccBalance);
    lines.push(`💰 <b>${bal} DCC</b>`);
    lines.push('');

    // Quick stats row
    lines.push(thinDivider());
    lines.push('');
    const statsLine: string[] = [];
    statsLine.push(`📊 <b>${opts.tradeCount}</b> trades`);
    if (opts.poolCount !== undefined && opts.poolCount > 0) {
      statsLine.push(`💧 <b>${opts.poolCount}</b> pools`);
    }
    if (opts.referralCount !== undefined && opts.referralCount > 0) {
      statsLine.push(`👥 <b>${opts.referralCount}</b> referrals`);
    }
    lines.push(statsLine.join('  ·  '));
    lines.push('');

    // Tip box
    lines.push(thinDivider());
    lines.push('');
    lines.push('💡 <b>Quick Actions:</b>');
    lines.push('  � Buy DCC with SOL/USDT/USDC (Solana)');
    lines.push('  📋 Paste a token address → instant trade');
    lines.push('  🟢 Buy / 🔴 Sell → from the menu below');
    lines.push('  🤝 Refer friends → earn 80% commission');
  } else {
    lines.push('');
    lines.push('🚀 <b>Welcome to DCC Swap!</b>');
    lines.push('');
    lines.push('The fastest way to trade tokens on DecentralChain.');
    lines.push('Instant swaps, low fees, and referral rewards.');
    lines.push('');
    lines.push(thinDivider());
    lines.push('');
    lines.push('🔑 Create a wallet to get started:');
    lines.push('  • Generate a brand new wallet');
    lines.push('  • Or import your existing seed phrase');
    lines.push('');
    lines.push('💡 <i>Your keys, your crypto. Always.</i>');
  }

  return lines.join('\n');
}

/**
 * Build wallet detail message.
 */
export function walletDetailMessage(
  address: string,
  balances: Array<{ name: string; balance: bigint; decimals: number }>,
  isActive: boolean,
  label: string
): string {
  const lines: string[] = [];

  lines.push(`💼 <b>${label}</b>${isActive ? ' ✅' : ''}`);
  lines.push(divider());
  lines.push('');
  lines.push(`📍 <code>${address}</code>`);
  lines.push('');
  lines.push('💰 <b>Token Balances</b>');
  lines.push('');

  if (balances.length === 0) {
    lines.push('  <i>📦 No tokens found</i>');
  } else {
    for (const b of balances) {
      const amount = fromRawAmount(b.balance, b.decimals);
      const icon = b.name === 'DCC' ? '🔵' : '🟡';
      lines.push(`  ${icon} <b>${amount}</b> ${b.name}`);
    }
  }

  return lines.join('\n');
}

/**
 * Trojan-style token trading screen — shown when user pastes a token address.
 */
export function tokenTradingMessage(opts: {
  tokenName: string;
  tokenTicker: string;
  assetId: string;
  decimals: number;
  dccBalance: bigint;
  walletLabel: string;
  hasPool: boolean;
  poolData?: {
    dccReserve: bigint;
    tokenReserve: bigint;
    tokenDecimals: number;
    feeBps: number;
    pricePerToken: string;   // DCC cost per 1 token
    tokensPerDcc: string;    // tokens you get per 1 DCC
    swapCount: number;
  };
  slippageBps: number;
}): string {
  const lines: string[] = [];

  if (opts.hasPool && opts.poolData) {
    lines.push(`🪙 <b>$${opts.tokenTicker}</b> — ${opts.tokenName}`);
    lines.push(`<code>${opts.assetId}</code>`);
    lines.push(thinDivider());
    lines.push('');
    lines.push(`💼 <b>${opts.walletLabel}</b> · 💰 <b>${fmtDcc(opts.dccBalance)} DCC</b>`);
    lines.push('');
    lines.push(`💹 Price: <b>${opts.poolData.pricePerToken} DCC</b> per ${opts.tokenTicker}`);
    lines.push(`💧 Liquidity: <b>${fmtCompact(opts.poolData.dccReserve, 8)} DCC</b>`);
    lines.push(`🔄 1 DCC = <b>${opts.poolData.tokensPerDcc}</b> ${opts.tokenTicker}`);
    lines.push('');
    lines.push(`🎯 Slippage: <b>${fmtPercent(opts.slippageBps)}</b> · Pool Fee: <b>${fmtPercent(opts.poolData.feeBps)}</b>`);
    lines.push(`📊 Swaps: <b>${opts.poolData.swapCount}</b> · Bot Fee: <b>1%</b>`);
  } else {
    lines.push(`🪙 <b>${opts.tokenName}</b> ($${opts.tokenTicker})`);
    lines.push(`<code>${opts.assetId}</code>`);
    lines.push(`🔢 Decimals: <b>${opts.decimals}</b>`);
    lines.push('');
    lines.push(`💰 Balance: <b>${fmtDcc(opts.dccBalance)} DCC</b> — ${opts.walletLabel}`);
    lines.push('');
    lines.push('⚠️ <b>No Liquidity Pool</b>');
    lines.push('<i>This token has no pool yet. Create one to enable trading.</i>');
  }

  return lines.join('\n');
}

/**
 * Swap confirmation message.
 */
export function swapPreviewMessage(
  assetInName: string,
  assetOutName: string,
  amountIn: string,
  amountOut: string,
  minReceived: string,
  priceImpact: string,
  fee: string,
  feePct: string
): string {
  const lines: string[] = [];

  lines.push('🔄 <b>Swap Preview</b>');
  lines.push(divider());
  lines.push('');
  lines.push(`  📤 <b>You Pay</b>`);
  lines.push(`     <b>${amountIn} ${assetInName}</b>`);
  lines.push('');
  lines.push(`          ⬇️`);
  lines.push('');
  lines.push(`  📥 <b>You Receive</b>`);
  lines.push(`     <b>~${amountOut} ${assetOutName}</b>`);
  lines.push('');
  lines.push(thinDivider());
  lines.push('');
  lines.push(`  📊 Price Impact:   <b>${priceImpact}%</b>`);
  lines.push(`  💸 Pool Fee:       <b>${fee} (${feePct})</b>`);
  lines.push(`  🛡️ Min Received:   <b>${minReceived}</b>`);
  lines.push(`  🧢 Bot Fee:        <b>1%</b>`);

  return lines.join('\n');
}

/**
 * Swap success message.
 */
export function swapSuccessMessage(
  assetInName: string,
  assetOutName: string,
  amountIn: string,
  amountOut: string,
  txId: string,
  botFee?: string,
): string {
  const lines: string[] = [];

  lines.push('✅ <b>Swap Successful!</b>');
  lines.push(sparkDivider());
  lines.push('');
  lines.push(`  📤 Sent:     <b>${amountIn} ${assetInName}</b>`);
  lines.push(`  📥 Received: <b>${amountOut} ${assetOutName}</b>`);
  if (botFee) {
    lines.push(`  🧢 Bot Fee:  <b>${botFee} ${assetInName}</b> (1%)`);
  }
  lines.push('');
  lines.push(`  🔗 ${txLink(txId)}`);

  return lines.join('\n');
}

/**
 * Pool card message.
 */
export function poolCardMessage(pool: {
  token0Name: string;
  token1Name: string;
  reserve0: bigint;
  reserve1: bigint;
  token0Decimals: number;
  token1Decimals: number;
  feeBps: number;
  swapCount: number;
  price0to1: string;
  price1to0: string;
}): string {
  const lines: string[] = [];

  lines.push(`💧 <b>${pool.token0Name} / ${pool.token1Name}</b>  ·  ${fmtPercent(pool.feeBps)} fee`);
  lines.push(divider());
  lines.push('');
  lines.push(`  📦 <b>Reserves</b>`);
  lines.push(`  ├ 🔵 ${fmtCompact(pool.reserve0, pool.token0Decimals)} ${pool.token0Name}`);
  lines.push(`  └ 🟡 ${fmtCompact(pool.reserve1, pool.token1Decimals)} ${pool.token1Name}`);
  lines.push('');
  lines.push(`  💱 <b>Price</b>`);
  lines.push(`  ├ 1 ${pool.token0Name} = <b>${pool.price0to1}</b> ${pool.token1Name}`);
  lines.push(`  └ 1 ${pool.token1Name} = <b>${pool.price1to0}</b> ${pool.token0Name}`);
  lines.push('');
  lines.push(`  📊 Total Swaps: <b>${pool.swapCount}</b>`);

  return lines.join('\n');
}

/**
 * Trojan-style positions message.
 */
export function positionsMessage(
  walletAddress: string,
  walletLabel: string,
  dccBalance: bigint,
  positions: Array<{
    name: string;
    assetId: string;
    balance: bigint;
    decimals: number;
    dccValue?: string;
    buys?: number;
    sells?: number;
  }>
): string {
  const lines: string[] = [];

  lines.push(`📊 <b>Positions</b>  ·  ${walletLabel}`);
  lines.push(divider());
  lines.push('');
  lines.push(`💼 <code>${walletAddress}</code>`);
  lines.push(`💰 Balance: <b>${fmtDcc(dccBalance)} DCC</b>`);
  lines.push('');

  if (positions.length === 0) {
    lines.push(thinDivider());
    lines.push('');
    lines.push('📦 <i>No token positions found.</i>');
    lines.push('<i>Buy tokens to see them here!</i>');
    return lines.join('\n');
  }

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const bal = fromRawAmount(pos.balance, pos.decimals);
    lines.push(thinDivider());
    lines.push('');
    lines.push(`🪙 <b>${pos.name}</b>  —  <b>${pos.dccValue || '?'} DCC</b>`);
    lines.push(`   <code>${pos.assetId}</code>`);
    lines.push(`   📦 Balance: <b>${bal}</b>`);
    if (pos.buys !== undefined) {
      lines.push(`   🟢 Buys: <b>${pos.buys}</b>  ·  🔴 Sells: <b>${pos.sells || 0}</b>`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Settings message.
 */
export function settingsMessage(
  slippageBps: number,
  feeTier: number,
  autoConfirm: boolean,
  buyPresets: number[],
  sellPresets: number[]
): string {
  const lines: string[] = [];

  lines.push('⚙️ <b>Settings</b>');
  lines.push(divider());
  lines.push('');
  lines.push(`  🎯 Slippage Tolerance:  <b>${fmtPercent(slippageBps)}</b>`);
  lines.push(`  💎 Pool Fee Tier:       <b>${fmtPercent(feeTier)}</b>`);
  lines.push(`  ⚡ Auto-Confirm:        <b>${autoConfirm ? 'ON ✅' : 'OFF ⬜'}</b>`);
  lines.push('');
  lines.push(thinDivider());
  lines.push('');
  lines.push(`  🛍️ Buy Presets:   ${buyPresets.map((v) => `<b>[${v} DCC]</b>`).join(' ')}`);
  lines.push(`  💰 Sell Presets:  ${sellPresets.map((v) => `<b>[${v}%]</b>`).join(' ')}`);

  return lines.join('\n');
}

/**
 * Trade history message.
 */
export function tradeHistoryMessage(
  trades: Array<{
    type: string;
    assetIn: string;
    assetOut: string;
    amountIn: string;
    amountOut: string;
    txId: string;
    timestamp: number;
  }>
): string {
  const lines: string[] = [];

  lines.push('📜 <b>Trade History</b>');
  lines.push(divider());

  if (trades.length === 0) {
    lines.push('');
    lines.push('  📦 <i>No trades yet. Start trading!</i>');
    return lines.join('\n');
  }

  for (const t of trades) {
    const icon = t.type === 'buy' ? '🟢' : '🔴';
    const date = new Date(t.timestamp * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    lines.push('');
    lines.push(`  ${icon} <b>${t.type.toUpperCase()}</b> · ${date}`);
    lines.push(`     ${t.amountIn} → ${t.amountOut}`);
    lines.push(`     🔗 ${txLink(t.txId)}`);
  }

  return lines.join('\n');
}

/**
 * Error message.
 */
export function errorMessage(title: string, detail: string): string {
  return `❌ <b>${title}</b>\n\n<i>${detail}</i>`;
}

/**
 * Loading message.
 */
export function loadingMessage(action: string): string {
  return `⏳ <i>${action}...</i>`;
}

/**
 * Trojan-style referral screen — rich multi-level info.
 */
export function referralMessage(opts: {
  userId: number;
  referralLink: string;
  directReferrals: number;
  indirectReferrals: number;
  totalReferred: number;
  totalVolumeDcc: string;
  earnedByLayer: string[];     // 10 entries, index 0 = Layer 1
  earnedTotal: string;
  claimableTotal: string;
  claimedTotal: string;
  tradeCountReferred: number;
  referredBy: number | null;
  hasWallet: boolean;
}): string {
  const lines: string[] = [];

  lines.push('🤝 <b>Referral Program</b>');
  lines.push(divider());
  lines.push('');

  // Promo banner
  lines.push('🔥 <b>LIMITED TIME — 80% Commission Payout!</b>');
  lines.push('<i>Earn up to 10 levels deep. Invite friends now!</i>');
  lines.push('');

  // Referral link
  lines.push('🔗 <b>Your Invite Link:</b>');
  lines.push(`<code>${opts.referralLink}</code>`);
  lines.push('<i>Tap to copy, then share everywhere!</i>');
  lines.push('');

  lines.push(sparkDivider());
  lines.push('');

  // Commission tiers
  lines.push('💎 <b>Commission Tiers</b>  (% of 1% trade fee)');
  lines.push('');
  const tiers = [
    { layer: 1,  pct: 25, emoji: '🥇' },
    { layer: 2,  pct: 15, emoji: '🥈' },
    { layer: 3,  pct: 10, emoji: '🥉' },
    { layer: 4,  pct:  8, emoji: '4️⃣' },
    { layer: 5,  pct:  6, emoji: '5️⃣' },
    { layer: 6,  pct:  5, emoji: '6️⃣' },
    { layer: 7,  pct:  4, emoji: '7️⃣' },
    { layer: 8,  pct:  3, emoji: '8️⃣' },
    { layer: 9,  pct:  2, emoji: '9️⃣' },
    { layer: 10, pct:  2, emoji: '🔟' },
  ];
  for (const t of tiers) {
    const effPct = (t.pct / 100).toFixed(2);
    lines.push(`  ${t.emoji} Layer ${t.layer.toString().padStart(2)}  —  <b>${t.pct}%</b>  (=${effPct}% of trade)`);
  }
  lines.push(`  ${''.padStart(0)}────────────────────`);
  lines.push('  ✨ <b>Total: 80%</b> paid out to referrers!');
  lines.push('');

  lines.push(sparkDivider());
  lines.push('');

  // Stats
  lines.push('📊 <b>Your Stats</b>');
  lines.push('');
  lines.push(`  👥 Users Referred:  <b>${opts.totalReferred}</b>`);
  lines.push(`  ├ 🥇 Direct (L1):   <b>${opts.directReferrals}</b>`);
  lines.push(`  └ 🥈 Indirect (L2+): <b>${opts.indirectReferrals}</b>`);
  lines.push('');
  lines.push(`  🔄 Referral Trades: <b>${opts.tradeCountReferred}</b>`);

  const volumeDcc = fmtDcc(BigInt(opts.totalVolumeDcc || '0'));
  lines.push(`  📈 Total Volume:    <b>${volumeDcc} DCC</b>`);
  lines.push('');

  lines.push(sparkDivider());
  lines.push('');

  // Earnings breakdown
  lines.push('💰 <b>Commission Earned</b>');
  lines.push('');
  let hasAnyEarnings = false;
  for (let i = 0; i < 10; i++) {
    const raw = BigInt(opts.earnedByLayer[i] || '0');
    if (raw > 0n) {
      hasAnyEarnings = true;
      const t = tiers[i];
      lines.push(`  ${t.emoji} Layer ${(i + 1).toString().padStart(2)}: <b>${fmtDcc(raw)} DCC</b>`);
    }
  }
  if (!hasAnyEarnings) {
    lines.push('  <i>No earnings yet — share your link!</i>');
  }
  const earnedAll = fmtDcc(BigInt(opts.earnedTotal || '0'));
  const claimableRaw = BigInt(opts.claimableTotal || '0');
  const claimedRaw = BigInt(opts.claimedTotal || '0');
  lines.push(`  ${thinDivider()}`);
  lines.push(`  💎 <b>Total:     ${earnedAll} DCC</b>`);
  if (claimableRaw > 0n) {
    lines.push(`  🟢 <b>Claimable: ${fmtDcc(claimableRaw)} DCC</b>`);
  }
  if (claimedRaw > 0n) {
    lines.push(`  ✅ Claimed:    ${fmtDcc(claimedRaw)} DCC`);
  }
  lines.push('');

  if (opts.referredBy) {
    lines.push(`🔗 <i>Referred by user #${opts.referredBy}</i>`);
    lines.push('');
  }

  if (!opts.hasWallet) {
    lines.push('⚠️ <i>Create a wallet to start earning referral rewards!</i>');
  }

  return lines.join('\n');
}

/* ── Helpers ────────────────────────────────────────────────────── */

function computeConversion(poolData: {
  dccReserve: bigint;
  tokenReserve: bigint;
  tokenDecimals: number;
}): string {
  if (poolData.dccReserve === 0n) return '0';
  const dccFloat = Number(poolData.dccReserve) / 1e8;
  const tokenFloat = Number(poolData.tokenReserve) / 10 ** poolData.tokenDecimals;
  if (dccFloat === 0) return '0';
  const rate = tokenFloat / dccFloat;
  if (rate >= 1_000_000) return fmtCompact(BigInt(Math.round(rate * 10 ** poolData.tokenDecimals)), poolData.tokenDecimals);
  return rate.toFixed(rate >= 1 ? 2 : 6);
}
