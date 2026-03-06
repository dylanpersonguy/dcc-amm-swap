/**
 * Inline keyboard builders — Trojan-style button layouts for Telegram menus.
 * All callbacks use a structured pattern: "action:param1:param2"
 */

import { InlineKeyboard } from 'grammy';

// ── Main Menu (Trojan style) ───────────────────────────────────────

export function mainMenuKeyboard(hasWallet: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (hasWallet) {
    kb.text('💎 Buy DCC', 'menu:buy_dcc').row();
    kb.text('🟢 Buy', 'menu:swap_buy').text('🔴 Sell', 'menu:swap_sell').row();
    kb.text('📊 Positions', 'menu:positions').text('💧 Pools', 'menu:pools').row();
    kb.text('🤝 Refer & Earn', 'menu:referrals').text('📜 History', 'menu:history').row();
    kb.text('💼 Wallet', 'menu:wallet').text('⚙️ Settings', 'menu:settings').row();
    kb.text('❓ Help', 'action:help').text('🔄 Refresh', 'action:refresh').row();
  } else {
    kb.text('🔑 Create Wallet', 'wallet:create').row();
    kb.text('📥 Import Wallet', 'wallet:import_start').row();
    kb.text('� Buy DCC', 'menu:buy_dcc').row();
    kb.text('🤝 Refer & Earn', 'menu:referrals').text('💧 Pools', 'menu:pools').row();
    kb.text('❓ Help', 'action:help').row();
  }

  return kb;
}

// ── Token Trading Screen (Trojan-style, single message) ────────────

/**
 * Full trading keyboard shown when token address is detected.
 * Mirrors Trojan: Back/Refresh, wallet/settings, Buy amounts, slippage, BUY button.
 */
export function tokenTradingKeyboard(opts: {
  assetId: string;
  direction: 'buy' | 'sell';
  walletLabel: string;
  slippageBps: number;
  hasPool: boolean;
}): InlineKeyboard {
  // NOTE: Callback data MUST be ≤ 64 bytes. Asset IDs can be 44 chars,
  // so we use short prefixes: tm=mode, tr=refresh, ta=amount, te=exec,
  // ts=slippage, tsc=slipCustom, tcp=createPool.
  const a = opts.assetId;
  const kb = new InlineKeyboard();

  if (!opts.hasPool) {
    // No pool — offer creation
    kb.text('🏊 Create Pool', `tcp:${a}`).row();
    kb.text('💧 Add Liquidity', `tal:${a}`).row();
    kb.text('⬅️ Back', 'menu:home').text('🔄 Refresh', `tr:${a}`).row();
    return kb;
  }

  // Row 1: Back / Refresh
  kb.text('⬅️ Back', 'menu:home').text('🔄 Refresh', `tr:${a}`).row();

  // Row 2: Wallet / Settings
  kb.text(`💼 ${opts.walletLabel}`, 'menu:wallet').text('⚙️ Settings', 'menu:settings').row();

  // Row 3: Buy/Sell toggle
  const isBuy = opts.direction === 'buy';
  kb.text(isBuy ? '🟢 Buy ✓' : '🟢 Buy', `tm:b:${a}`)
    .text(!isBuy ? '🔴 Sell ✓' : '🔴 Sell', `tm:s:${a}`)
    .row();

  // Row 4-5: Preset DCC amounts
  kb.text('◈ 0.5', `ta:0.5:${a}`)
    .text('◈ 1', `ta:1:${a}`)
    .text('◈ 5', `ta:5:${a}`)
    .row();
  kb.text('◈ 10', `ta:10:${a}`)
    .text('◈ 25', `ta:25:${a}`)
    .text('✏️ Custom', `ta:x:${a}`)
    .row();

  // Row 6: Slippage
  const slipPct = (opts.slippageBps / 100).toFixed(1);
  kb.text(`🎯 ${slipPct}% Slip`, `ts:${a}`)
    .text('✏️ Slip', `tsc:${a}`)
    .row();

  // Row 7: Execute
  const d = isBuy ? 'b' : 's';
  const action = isBuy ? '🟢 BUY NOW' : '🔴 SELL NOW';
  kb.text(action, `te:${d}:${a}`).row();

  return kb;
}

// ── Swap Menu ──────────────────────────────────────────────────────

export function swapMenuKeyboard(
  buyPresets: number[],
  sellPresets: number[],
  tokenName: string
): InlineKeyboard {
  const kb = new InlineKeyboard();

  // Buy section (DCC → Token)
  kb.text(`🟢 Buy ${tokenName}`, 'swap:buy_header').row();
  for (const amount of buyPresets) {
    kb.text(`${amount} DCC`, `swap:buy:${amount}`);
  }
  kb.text('✏️ Custom', 'swap:buy:custom').row();

  kb.text('').row(); // spacer

  // Sell section (Token → DCC)
  kb.text(`🔴 Sell ${tokenName}`, 'swap:sell_header').row();
  for (const pct of sellPresets) {
    kb.text(`${pct}%`, `swap:sell:${pct}`);
  }
  kb.text('✏️ Custom', 'swap:sell:custom').row();

  kb.text('').row();

  // Navigation
  kb.text('🔄 Change Token', 'swap:change_token').text('⬅️ Back', 'menu:home').row();

  return kb;
}

/**
 * Token selection keyboard.
 */
export function tokenSelectKeyboard(
  tokens: Array<{ assetId: string; name: string }>,
  action: 'swap_select' | 'liq_select'
): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const icon = t.name === 'DCC' ? '🔵' : '🟡';
    kb.text(`${icon} ${t.name}`, `${action}:${t.assetId}`);
    if (i % 2 === 1 || i === tokens.length - 1) kb.row();
  }

  kb.text('⬅️ Back', 'menu:home').row();

  return kb;
}

/**
 * Swap confirmation keyboard.
 */
export function swapConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Confirm Swap', 'swap:confirm')
    .text('❌ Cancel', 'swap:cancel')
    .row();
}

/**
 * Post-swap keyboard.
 */
export function swapResultKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔄 Swap Again', 'menu:swap')
    .text('💼 Wallet', 'menu:wallet')
    .row()
    .text('📊 Positions', 'menu:positions')
    .text('🏠 Home', 'menu:home')
    .row();
}

// ── Wallet Menu ────────────────────────────────────────────────────

export function walletMenuKeyboard(walletCount: number): InlineKeyboard {
  const kb = new InlineKeyboard();

  kb.text('💰 Balances', 'wallet:balances').text('📋 Copy Address', 'wallet:copy_addr').row();
  kb.text('🔑 Export Seed', 'wallet:export_seed').text('📤 Send / Withdraw', 'wallet:send_start').row();

  if (walletCount > 1) {
    kb.text('🔀 Switch Wallet', 'wallet:switch').row();
  }

  kb.text('➕ New Wallet', 'wallet:create').text('📥 Import Wallet', 'wallet:import_start').row();
  kb.text('🗑️ Delete Wallet', 'wallet:delete_confirm').row();
  kb.text('⬅️ Back to Home', 'menu:home').row();

  return kb;
}

export function walletSwitchKeyboard(
  wallets: Array<{ id: number; label: string; address: string; isActive: boolean }>
): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const w of wallets) {
    const marker = w.isActive ? ' ✅' : '';
    kb.text(
      `${w.label} (${w.address.slice(0, 6)}...)${marker}`,
      `wallet:activate:${w.id}`
    ).row();
  }

  kb.text('⬅️ Back', 'menu:wallet').row();
  return kb;
}

export function exportSeedConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('⚠️ Yes, Show Seed', 'wallet:export_confirm')
    .text('❌ Cancel', 'menu:wallet')
    .row();
}

export function deleteWalletConfirmKeyboard(walletId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text('🗑️ Yes, Delete', `wallet:delete:${walletId}`)
    .text('❌ Cancel', 'menu:wallet')
    .row();
}

// ── Pool Menu ──────────────────────────────────────────────────────

export function poolListKeyboard(
  pools: Array<{ poolId: string; token0Name: string; token1Name: string }>
): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const pool of pools) {
    kb.text(
      `💧 ${pool.token0Name} / ${pool.token1Name}`,
      `pool:view:${pool.poolId}`
    ).row();
  }

  kb.text('🔄 Refresh', 'menu:pools').text('⬅️ Back', 'menu:home').row();
  return kb;
}

export function poolDetailKeyboard(
  token0: string,
  token1: string,
  token0Name: string,
  token1Name: string
): InlineKeyboard {
  return new InlineKeyboard()
    .text(`🟢 Buy ${token1Name}`, `swap:start:DCC:${token1}`)
    .text(`🔴 Sell ${token1Name}`, `swap:start:${token1}:DCC`)
    .row()
    .text('⬅️ Back', 'menu:pools')
    .text('🏠 Home', 'menu:home')
    .row();
}

// ── Positions Menu ─────────────────────────────────────────────────

export function positionsKeyboard(
  positions: Array<{ assetId: string; name: string }>
): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const pos of positions) {
    kb.text(`📈 ${pos.name}`, `pt:${pos.assetId}`).row();
  }

  kb.text('🔄 Refresh', 'menu:positions').text('⬅️ Back', 'menu:home').row();
  return kb;
}

// ── Referral Menu ──────────────────────────────────────────────────

export function referralKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();

  kb.text('� Copy Referral Link', 'referral:copy_link').row();
  kb.text('💰 Commission Info', 'referral:info').text('💸 Claim Rewards', 'menu:claim').row();
  kb.text('🔄 Refresh', 'referral:refresh').text('⬅️ Back', 'menu:home').row();

  return kb;
}

// ── Settings Menu ──────────────────────────────────────────────────

export function settingsKeyboard(
  slippageBps: number,
  autoConfirm: boolean
): InlineKeyboard {
  const kb = new InlineKeyboard();

  // Slippage row
  kb.text('� Slippage Tolerance', 'settings:header').row();
  for (const bps of [10, 50, 100, 200]) {
    const marker = slippageBps === bps ? ' ✅' : '';
    kb.text(`${bps / 100}%${marker}`, `settings:slippage:${bps}`);
  }
  kb.row();

  // Fee tier
  kb.text('💎 Pool Fee Tier', 'settings:header').row();
  for (const bps of [10, 30, 100]) {
    kb.text(`${bps / 100}%`, `settings:fee:${bps}`);
  }
  kb.row();

  // Auto confirm
  kb.text(
    `⚡ Auto-Confirm: ${autoConfirm ? 'ON ✅' : 'OFF ⬜'}`,
    'settings:toggle_auto'
  ).row();

  kb.text('⬅️ Back to Home', 'menu:home').row();

  return kb;
}

// ── History Menu ───────────────────────────────────────────────────

export function historyKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔄 Refresh', 'menu:history')
    .text('⬅️ Back to Home', 'menu:home')
    .row();
}

// ── Generic ────────────────────────────────────────────────────────

export function backKeyboard(target = 'menu:home'): InlineKeyboard {
  return new InlineKeyboard().text('⬅️ Back', target).row();
}

export function cancelKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('❌ Cancel', 'menu:home').row();
}

// ── Claim Rewards ──────────────────────────────────────────

export function claimKeyboard(canClaim: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (canClaim) {
    kb.text('💸 Claim Now', 'claim:execute').row();
  }
  kb.text('🔄 Refresh', 'claim:refresh').text('⬅️ Back', 'menu:referrals').row();
  return kb;
}

export function claimResultKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🤝 Referrals', 'menu:referrals')
    .text('🏠 Home', 'menu:home')
    .row();
}

// ── Buy DCC (Cross-chain Bridge) ───────────────────────────────────

export function buyDccCoinKeyboard(hasPending: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();

  kb.text('◎  SOL', 'bdcc:coin:SOL').row();
  kb.text('💵  USDT (Solana)', 'bdcc:coin:USDT').row();
  kb.text('🔵  USDC (Solana)', 'bdcc:coin:USDC').row();

  if (hasPending) {
    kb.text('📜 My Orders', 'bdcc:orders').row();
  }

  kb.text('⬅️ Back', 'menu:home').row();
  return kb;
}

export function buyDccAmountKeyboard(coin: string): InlineKeyboard {
  const kb = new InlineKeyboard();

  // Row 1: small amounts
  kb.text('100 DCC', `bdcc:amt:${coin}:100`)
    .text('500 DCC', `bdcc:amt:${coin}:500`)
    .text('1K DCC', `bdcc:amt:${coin}:1000`)
    .row();

  // Row 2: medium amounts
  kb.text('5K DCC', `bdcc:amt:${coin}:5000`)
    .text('10K DCC', `bdcc:amt:${coin}:10000`)
    .text('50K DCC', `bdcc:amt:${coin}:50000`)
    .row();

  // Row 3: custom
  kb.text('✏️ Custom Amount', `bdcc:custom:${coin}`).row();

  // Nav
  kb.text('⬅️ Back', 'menu:buy_dcc').text('🏠 Home', 'menu:home').row();
  return kb;
}

export function buyDccDepositKeyboard(bridgeId: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text('🔄 Check Status', `bdcc:status:${bridgeId}`).row();
  kb.text('📜 My Orders', 'bdcc:orders').text('🏠 Home', 'menu:home').row();
  return kb;
}

export function buyDccStatusKeyboard(bridgeId: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text('🔄 Refresh Status', `bdcc:status:${bridgeId}`).row();
  kb.text('⬅️ Back', 'menu:buy_dcc').text('🏠 Home', 'menu:home').row();
  return kb;
}

export function buyDccOrdersKeyboard(
  orders: Array<{ bridgeId: string; status: string }>
): InlineKeyboard {
  const kb = new InlineKeyboard();

  // Show "check" button for pending/confirming orders
  for (const o of orders) {
    if (o.status === 'pending' || o.status === 'confirming') {
      const short = o.bridgeId.slice(0, 8);
      kb.text(`🔄 ${short}...`, `bdcc:status:${o.bridgeId}`).row();
    }
  }

  kb.text('💳 New Purchase', 'menu:buy_dcc').text('🏠 Home', 'menu:home').row();
  return kb;
}
