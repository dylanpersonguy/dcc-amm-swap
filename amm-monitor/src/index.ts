/**
 * DCC AMM stack monitor — periodic health + balance checks.
 *
 * IMPORTANT: sendAlert() currently only logs. Nothing here pages anyone yet
 * — wire sendAlert() to a real destination (Slack/Discord webhook, email,
 * PagerDuty, etc.) before treating this as actual production alerting.
 */

const CHECK_INTERVAL_MS = parseInt(process.env.CHECK_INTERVAL_MS || '60000', 10);
const DCC_NODE_URL = process.env.DCC_NODE_URL || 'https://mainnet-node.decentralchain.io';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

const SERVICES: Array<{ name: string; url: string }> = [
  { name: 'amm-web', url: process.env.WEB_URL || 'https://amm-web-production.up.railway.app/' },
  { name: 'amm-indexer', url: process.env.INDEXER_URL || 'https://amm-indexer-production.up.railway.app/health' },
  { name: 'amm-bridge', url: process.env.BRIDGE_URL || 'https://amm-bridge-production-ff5d.up.railway.app/health' },
];

// DCC wallet shared by amm-bot (fees/referrals) and amm-bridge (payouts).
const DCC_ADMIN_ADDRESS = process.env.DCC_ADMIN_ADDRESS || '3DhYC7p9vDghdcpYeHXPRb43GDDp3TjjXCJ';
const DCC_ADMIN_MIN_BALANCE = parseFloat(process.env.DCC_ADMIN_MIN_BALANCE || '10'); // DCC

// Bridge's Solana sweep destination — needs real SOL to pay sweep tx fees.
const SOLANA_TREASURY_ADDRESS = process.env.SOLANA_TREASURY_ADDRESS || '';
const SOLANA_TREASURY_MIN_BALANCE = parseFloat(process.env.SOLANA_TREASURY_MIN_BALANCE || '0.01'); // SOL

interface AlertFn {
  (severity: 'warning' | 'critical', message: string): void;
}

// ── Alerting — replace this with a real destination before relying on it ──
const sendAlert: AlertFn = (severity, message) => {
  const prefix = severity === 'critical' ? '🔴 CRITICAL' : '🟡 WARNING';
  console.error(`${prefix}: ${message}`);
  // TODO: POST to a Slack/Discord webhook, email, PagerDuty, etc. here.
};

// ── Checks ──────────────────────────────────────────────────────────────

async function checkServiceHealth(): Promise<void> {
  for (const svc of SERVICES) {
    try {
      const res = await fetch(svc.url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        sendAlert('critical', `${svc.name} returned HTTP ${res.status} at ${svc.url}`);
      }
    } catch (err: any) {
      sendAlert('critical', `${svc.name} unreachable at ${svc.url}: ${err.message}`);
    }
  }
}

async function checkDccAdminBalance(): Promise<void> {
  try {
    const res = await fetch(`${DCC_NODE_URL}/addresses/balance/${DCC_ADMIN_ADDRESS}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      sendAlert('warning', `Could not read DCC admin wallet balance (HTTP ${res.status})`);
      return;
    }
    const data = (await res.json()) as { balance: number };
    const dcc = data.balance / 1e8;
    if (dcc < DCC_ADMIN_MIN_BALANCE) {
      sendAlert(
        'critical',
        `DCC admin wallet (${DCC_ADMIN_ADDRESS}) balance is ${dcc.toFixed(4)} DCC, below the ${DCC_ADMIN_MIN_BALANCE} threshold — bridge payouts and bot fee/referral operations will fail once this hits zero.`,
      );
    }
  } catch (err: any) {
    sendAlert('warning', `DCC admin balance check failed: ${err.message}`);
  }
}

async function checkSolanaTreasuryBalance(): Promise<void> {
  if (!SOLANA_TREASURY_ADDRESS) {
    sendAlert('warning', 'SOLANA_TREASURY_ADDRESS not configured — skipping treasury balance check.');
    return;
  }
  try {
    const res = await fetch(SOLANA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [SOLANA_TREASURY_ADDRESS],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as { result?: { value: number }; error?: unknown };
    if (data.error || data.result === undefined) {
      sendAlert('warning', `Could not read Solana treasury balance: ${JSON.stringify(data.error)}`);
      return;
    }
    const sol = data.result.value / 1e9;
    if (sol < SOLANA_TREASURY_MIN_BALANCE) {
      sendAlert(
        'warning',
        `Solana treasury (${SOLANA_TREASURY_ADDRESS}) balance is ${sol.toFixed(4)} SOL, below the ${SOLANA_TREASURY_MIN_BALANCE} threshold — bridge fund sweeps will start failing once this hits zero (deposit funds stay safe at their per-order address, just unswept).`,
      );
    }
  } catch (err: any) {
    sendAlert('warning', `Solana treasury balance check failed: ${err.message}`);
  }
}

async function runChecks(): Promise<void> {
  console.log(`[monitor] Running checks at ${new Date().toISOString()}`);
  await Promise.all([checkServiceHealth(), checkDccAdminBalance(), checkSolanaTreasuryBalance()]);
}

async function main(): Promise<void> {
  console.log('DCC AMM stack monitor starting...');
  console.log(`  Check interval: ${CHECK_INTERVAL_MS / 1000}s`);
  console.log(`  Services: ${SERVICES.map((s) => s.name).join(', ')}`);
  console.log(`  DCC admin wallet: ${DCC_ADMIN_ADDRESS} (min ${DCC_ADMIN_MIN_BALANCE} DCC)`);
  console.log(
    SOLANA_TREASURY_ADDRESS
      ? `  Solana treasury: ${SOLANA_TREASURY_ADDRESS} (min ${SOLANA_TREASURY_MIN_BALANCE} SOL)`
      : '  Solana treasury: NOT CONFIGURED (set SOLANA_TREASURY_ADDRESS)',
  );
  console.log('  ⚠️  sendAlert() only logs right now — no real alert destination is wired up.');

  await runChecks();
  setInterval(runChecks, CHECK_INTERVAL_MS);
}

main().catch((err) => {
  console.error('Monitor failed to start:', err);
  process.exit(1);
});
