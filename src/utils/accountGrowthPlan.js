// ─────────────────────────────────────────────────────────────────────────────
// Account-growth plan — CLIENT-SIDE ADVISORY ONLY.
//
// Mirrors backtest-engine/research/4strategy-portfolio/account-growth-plan.json
// (AGGRESSIVE preset). This is a *recommendation* surfaced in the UI next to the
// manual strategy toggles. It does NOT enable/disable anything and never touches
// any service — what's toggled is what runs. The plan just tells you what SHOULD
// be on at the current account size so you can match the toggles by hand.
//
// Derived from real-account survival modeling: grow a small account without
// blowing it up. lstb is the only safe small-account vehicle; level-fade is the
// death trap held out until $25k (it gives back big winners and re-shorts trends).
// ─────────────────────────────────────────────────────────────────────────────

// Balance-tier contract ladder (pick highest tier whose min <= balance).
export const CONTRACT_LADDER = [
  { min: 0,      contract: 'MNQ', qty: 1 },
  { min: 2000,   contract: 'MNQ', qty: 1 },
  { min: 3500,   contract: 'MNQ', qty: 2 },
  { min: 6000,   contract: 'MNQ', qty: 3 },
  { min: 9000,   contract: 'MNQ', qty: 5 },
  { min: 14000,  contract: 'MNQ', qty: 8 },
  { min: 25000,  contract: 'NQ',  qty: 1 },
  { min: 45000,  contract: 'NQ',  qty: 2 },
  { min: 70000,  contract: 'NQ',  qty: 3 },
  { min: 100000, contract: 'NQ',  qty: 4 },
  { min: 140000, contract: 'NQ',  qty: 5 },
  { min: 200000, contract: 'NQ',  qty: 7 },
  { min: 300000, contract: 'NQ',  qty: 10 },
];

// Per-strategy activation, keyed by the strategy constant the engine reports.
// on = enable when balance reaches this; off = disable if balance falls below
// (hysteresis, so you're not flip-flopping at the boundary).
export const STRATEGY_PLAN = {
  LS_FLIP_TRIGGER_BAR: { alias: 'lstb',       on: 0,     off: 0,     note: 'Always on — only safe small-account vehicle (12-pt stop).' },
  GEX_FLIP_IVPCT:      { alias: 'gex-flip',   on: 4000,  off: 3200,  note: 'Add at $4k.' },
  GEX_LT_3M_CROSSOVER: { alias: 'lt-3m',      on: 4000,  off: 3200,  note: 'Add at $4k.' },
  GEX_LEVEL_FADE:      { alias: 'level-fade', on: 25000, off: 20000, note: 'Hold until $25k — gives back big winners, re-shorts trends. Death trap when small.' },
};

export function sizeFor(balance) {
  let pick = CONTRACT_LADDER[0];
  for (const t of CONTRACT_LADDER) if (balance >= t.min) pick = t;
  return pick; // { contract, qty }
}

// Recommendation for one strategy at a balance, given its CURRENT enabled state
// (so the hysteresis band can say "keep as-is" instead of forcing a flip).
//   returns 'on' | 'off' | 'hold' | null   (null = no plan opinion for this strategy)
export function recommendationFor(constant, balance, currentlyEnabled) {
  const p = STRATEGY_PLAN[constant];
  if (!p) return null;
  if (balance >= p.on) return 'on';
  if (balance < p.off) return 'off';
  return currentlyEnabled ? 'on' : 'off'; // inside hysteresis band → keep current
}

export function nextThresholdLabel(constant) {
  const p = STRATEGY_PLAN[constant];
  if (!p || p.on <= 0) return null;
  return `$${p.on.toLocaleString()}`;
}

// Full snapshot for a balance: size + per-strategy recommendation.
export function planFor(balance, strategies = []) {
  const enabledByConstant = Object.fromEntries(strategies.map(s => [s.constant, s.enabled]));
  const recs = {};
  for (const constant of Object.keys(STRATEGY_PLAN)) {
    recs[constant] = recommendationFor(constant, balance, enabledByConstant[constant]);
  }
  return { size: sizeFor(balance), recs };
}
