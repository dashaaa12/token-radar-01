// Farm plans: one concrete, costed plan per board row.
//
// Every plan is assembled from a category playbook (what you actually do
// inside a DEX, a lending market, a CDP and so on) parameterised by the
// protocol's own snapshot data: its chains set the gas budget through a
// small chain cost table, its TVL sets the position-size tier and the
// weekly cadence, and a hash of the slug picks among phrasings so two
// rows never read as copy-paste. The framing is honest throughout: the
// snapshot records no token for these protocols, so every plan treats a
// future token as unproven upside and sizes positions accordingly.

export interface FarmInput {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
}

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

function hashSlug(slug: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick<T>(variants: readonly T[], seed: number): T {
  return variants[seed % variants.length]!;
}

const L2_CHAINS: ReadonlySet<string> = new Set([
  'Arbitrum',
  'Base',
  'Optimism',
  'Unichain',
  'Linea',
  'Mantle',
  'Scroll',
  'zkSync Era',
  'Blast',
  'Mode',
  'Taiko',
  'Starknet',
  'World Chain',
  'Ink',
  'Soneium',
  'Zora',
  'Fraxtal',
]);

/** What one transaction costs on a chain, as the plan quotes it. */
export function chainCost(chain: string): string {
  if (chain === 'Ethereum') return '$5-25 per transaction in gas';
  if (chain === 'Solana') return 'under $0.10 per transaction in fees';
  if (chain === 'Binance') return '$0.10-0.50 per transaction in gas';
  if (L2_CHAINS.has(chain)) return '$0.10-1 per transaction in gas';
  return '$0.50-3 per transaction in gas';
}

interface Tier {
  size: string;
  sessions: number;
  minutes: number;
}

function tierFor(tvl: number): Tier {
  if (tvl < 10_000_000) return { size: '$250-1,000', sessions: 2, minutes: 20 };
  if (tvl < 50_000_000) return { size: '$1,000-5,000', sessions: 3, minutes: 25 };
  if (tvl < 250_000_000) return { size: '$5,000-25,000', sessions: 3, minutes: 30 };
  return { size: '$25,000-100,000', sessions: 4, minutes: 30 };
}

interface Ctx {
  name: string;
  category: string;
  asOf: string;
  mainChain: string;
  secondChain: string;
  cost: string;
  cost2: string;
  size: string;
  sessions: number;
  minutes: number;
}

function fill(template: string, ctx: Ctx): string {
  return template
    .replaceAll('{name}', ctx.name)
    .replaceAll('{category}', ctx.category)
    .replaceAll('{asOf}', ctx.asOf)
    .replaceAll('{mainChain}', ctx.mainChain)
    .replaceAll('{secondChain}', ctx.secondChain)
    .replaceAll('{cost}', ctx.cost)
    .replaceAll('{cost2}', ctx.cost2)
    .replaceAll('{size}', ctx.size)
    .replaceAll('{sessions}', String(ctx.sessions))
    .replaceAll('{minutes}', String(ctx.minutes));
}

// ---------------------------------------------------------------------------
// Shared steps: set up honestly, track weekly, review and exit on a rule.
// ---------------------------------------------------------------------------

const SETUP_STEPS: readonly string[] = [
  'Create a fresh wallet dedicated to {name} and fund it on {mainChain} with gas money plus a {size} working balance. As of the {asOf} snapshot {name} records no token, so treat any future points or airdrop as unproven upside, never a promise. Setup takes about 20 minutes and getting funded costs {cost}.',
  'Open a separate wallet for {name} so its activity is cleanly attributable, then move a {size} working balance plus gas funds to {mainChain}. The {asOf} snapshot records no token for {name}: nothing here is a confirmed airdrop, so size it as speculation. Allow about 20 minutes and {cost} to get funded.',
];

const TRACK_STEPS: readonly string[] = [
  'Track the position every week in a simple log: date, action, amount, and any points or leaderboard balance {name} shows. Ten minutes a week is enough and it costs $0, and the log is your evidence of consistent, non-sybil activity if eligibility is ever snapshotted.',
  'Keep a spreadsheet of every {name} interaction (date, chain, amount, points shown) and review it for 10 minutes each week at $0 cost. Steady weekly activity spread over months is the pattern points programs usually reward, not one large day.',
];

const EXIT_STEPS: readonly string[] = [
  'Review the whole position monthly, about 15 minutes: if {name} announces a token, a snapshot or a claim window, act inside it; if its TVL halves or the team goes silent for a quarter, withdraw the {size} and move on. Keep exit gas ({cost}) sitting in the wallet at all times.',
  'Set a monthly 15-minute review: hold while TVL and product development stay steady, and exit the {size} position if either collapses or a token announcement opens a natural selling window. Keep spare gas in the wallet ({cost}) so the exit never depends on one illiquid day.',
];

// ---------------------------------------------------------------------------
// Category playbooks: the two middle steps, the actual work in the product.
// ---------------------------------------------------------------------------

interface Playbook {
  open: readonly string[];
  grow: readonly string[];
}

const PLAYBOOKS: Record<string, Playbook> = {
  dexs: {
    open: [
      'Route your regular swaps through {name} on {mainChain} instead of a rival exchange: {sessions} sessions a week, about {minutes} minutes each, trading inside a {size} working balance. Each swap costs {cost}, so batch small trades instead of dribbling them.',
      'Make {name} your default swap venue on {mainChain} for a {size} working balance, {sessions} times a week for about {minutes} minutes. Vary pairs and sizes like a real user; each swap costs {cost}.',
    ],
    grow: [
      'Add a two-sided liquidity position of about {size} to a top {name} pool and rebalance it weekly in roughly {minutes} minutes. Pool fees accrue to the providing wallet, and each adjustment costs {cost}.',
      'Provide {size} of liquidity to a flagship {name} pool on {secondChain} as well, so volume and LP history exist on two fronts. Check ranges weekly ({minutes} minutes); adjustments cost {cost2} there.',
    ],
  },
  lending: {
    open: [
      'Supply about {size} of a major stablecoin or ETH to {name} on {mainChain} and leave it supplied. Supplying costs {cost} and about {minutes} minutes to set up; after that the position mostly runs itself.',
      'Deposit {size} into {name} on {mainChain} as supplied collateral and keep it there across months, not days. Setup is one transaction at {cost} plus {minutes} minutes of reading the market parameters first.',
    ],
    grow: [
      'Borrow a modest 30-40% against the supplied collateral on {name} and re-supply the borrowed asset to build a genuine two-sided history. Keep the health factor above 2.0 and spend {minutes} minutes a week monitoring it; adjustments cost {cost}.',
      'Open a second, smaller supply position on {secondChain} through {name} (about half the {size} tier) so the account is active on two markets. Review both weekly in {minutes} minutes; cross-chain moves cost {cost2}.',
    ],
  },
  derivatives: {
    open: [
      'Trade small perpetual positions on {name} ({mainChain}) with about {size} of margin: {sessions} sessions a week of roughly {minutes} minutes, liquid pairs only. Each open and close costs {cost} plus the venue fee shown up front.',
      'Use {name} on {mainChain} for your leveraged trading with a {size} margin budget, {sessions} sessions a week, {minutes} minutes at a time. Keep leverage under 3x so a single wick cannot end the experiment; fees run {cost} per trade.',
    ],
    grow: [
      'Show two-sided flow on {name}: hedge one leg on a second market or with spot so the account is not a one-way bet. Review funding and open interest weekly ({minutes} minutes) and keep total margin near {size}.',
      'Add a second instrument on {name} (a different pair or expiry) at half size so activity spans the product, and journal every trade. The weekly review takes {minutes} minutes and costs $0 beyond trading fees of {cost}.',
    ],
  },
  yield: {
    open: [
      'Deposit about {size} into a flagship {name} vault on {mainChain}. The deposit costs {cost} and {minutes} minutes of reading the vault strategy first; vault shares are what any future points program would most plausibly count.',
      'Put {size} to work in a core {name} vault on {mainChain} and leave it compounding. One deposit at {cost}, {minutes} minutes of due diligence, then the yield does the visible work.',
    ],
    grow: [
      'Rotate a second tranche through another {name} vault, or the same vault on {secondChain}, each month so activity is spread over time rather than dumped in one day. Budget {cost2} per move and {minutes} minutes per rotation.',
      'Ladder deposits into {name}: add a smaller tranche every two weeks until the position reaches the {size} tier. Laddering costs {cost} per deposit and builds the long, boring history that eligibility snapshots tend to favour.',
    ],
  },
  cdp: {
    open: [
      'Open a collateral position on {name} ({mainChain}) with about {size} of collateral and mint its stablecoin at under 40% of the liquidation limit. Setup costs {cost} and about {minutes} minutes, most of it reading the liquidation terms.',
      'Back a {name} vault on {mainChain} with roughly {size} of collateral, minting conservatively so the collateral ratio stays above 250%. The open costs {cost}; allow {minutes} minutes to check oracle and liquidation settings first.',
    ],
    grow: [
      'Put the minted stablecoin into a low-risk pool and repay/re-mint monthly so the position shows a full lifecycle, not just an open. Spend {minutes} minutes a week checking the collateral ratio; each adjustment costs {cost}.',
      'Run a second, smaller vault on {name} with a different collateral type (still inside the {size} tier overall) and compare stability fees monthly in {minutes} minutes. Diversity of collateral is the usage pattern CDPs most want to see.',
    ],
  },
  launchpad: {
    open: [
      'Register with {name} on {mainChain} and complete any KYC or allowlist steps it runs (about {minutes} minutes, usually $0 in fees). Then join one sale with about {size} rather than chasing every launch.',
      'Get allowlist-ready on {name}: account, wallet link and any staking prerequisite done in about {minutes} minutes at $0. Participate in launches selectively with a {size} budget so the history shows judgement, not spam.',
    ],
    grow: [
      'Hold what you buy through {name} for at least a full quarter, and stake or lock it where the platform supports that. Check the launch calendar weekly ({minutes} minutes) so participation reads as continuous, not one-off.',
      'Track every {name} launch you join in your log (date, amount near the {size} tier, outcome) and review monthly in {minutes} minutes. A documented, selective record is what separates a farmer from a bot in any later review.',
    ],
  },
  crosschain: {
    open: [
      'Bridge about {size} through {name} from {mainChain} to {secondChain} and back on a weekly rhythm: {sessions} trips a week, {minutes} minutes each. Every crossing costs {cost} plus the bridge fee quoted before you confirm.',
      'Make {name} your default route between {mainChain} and {secondChain} with a {size} working balance, {sessions} crossings a week at {minutes} minutes each. Route fees run {cost} per hop on the origin side.',
    ],
    grow: [
      'Keep a working balance near {size} on the far chain and actually use it in one local app, so the route shows real usage rather than empty hops. Review routes monthly ({minutes} minutes) and drop any chain whose round trip passes $10 in fees.',
      'Add a third chain to the {name} rotation once the first route is routine, moving smaller amounts (half the {size} tier). Each new route costs {cost} to test with a $10 probe transfer first.',
    ],
  },
  curator: {
    open: [
      'Deposit about {size} into a flagship vault curated through {name} on {mainChain}. The deposit costs {cost}; spend {minutes} minutes first reading the vault strategy and the curator track record behind it.',
      'Allocate {size} to a core {name} vault on {mainChain} after {minutes} minutes of due diligence on its curator, its caps and its withdrawal terms. One deposit at {cost}, then let the curator work.',
    ],
    grow: [
      'Split a second tranche across two more {name} vaults with different risk profiles, still inside the {size} tier overall, and compare published yield and drawdowns monthly ({minutes} minutes). Curated vaults are where points, if any ever exist, would attach.',
      'Follow the curator: when {name} opens a vault on {secondChain}, seed it early with a smaller position (deposits there cost {cost2}). Early depositors in new vaults are the cohort curators most visibly reward.',
    ],
  },
  basis: {
    open: [
      'Run a small delta-neutral book through {name} on {mainChain}: about {size} split between the long and short legs, set up in roughly {minutes} minutes at {cost} in fees, then left to accrue funding.',
      'Open a {size} basis position via {name} on {mainChain}, half spot-long and half perp-short, in about {minutes} minutes. Entry fees run {cost}; the trade only works if you actually leave it on.',
    ],
    grow: [
      'Rebalance the {name} book weekly ({minutes} minutes a session) to keep the two legs matched as prices move, and log the funding collected. Unwind any leg whose funding stays negative for two straight weeks.',
      'Scale the book in steps: add a quarter of the {size} tier every two weeks while funding stays positive, so the position grows with proof rather than hope. Each add costs {cost} and {minutes} minutes.',
    ],
  },
  rwa: {
    open: [
      'Onboard with {name} on {mainChain}: complete its KYC and eligibility checks (about {minutes} minutes, $0 unless it charges a verification fee) and make a first allocation of about {size} into one listed real-world asset.',
      'Do the paperwork first: {name} onboarding and accreditation checks take about {minutes} minutes and $0, then allocate {size} to a single flagship asset rather than spreading thin on day one.',
    ],
    grow: [
      'Add a second allocation in a different {name} asset class (for example treasuries versus private credit) once the first settles, still inside the {size} tier. Review statements monthly ({minutes} minutes) so the account shows a holding pattern, not a flip.',
      'Reinvest the first yield payment from {name} back into the same asset and log it; a reinvestment record costs $0 beyond gas of {cost} and is exactly the behaviour RWA platforms design their rewards around.',
    ],
  },
  generic: {
    open: [
      'Use {name} the way it is built to be used, on {mainChain}, with a working balance of about {size}: {sessions} sessions a week of roughly {minutes} minutes doing its core action (its category is {category}). Each action costs about {cost}.',
      'Start with the flagship product of {name} on {mainChain} and a {size} working balance, {sessions} sessions a week, {minutes} minutes each. Real, repeated usage of the core product at {cost} an action is the whole strategy.',
    ],
    grow: [
      'Extend the same routine to {secondChain} so the history spans more than one network, varying amounts and timing week to week. Budget {cost2} per session on the extra chain and {minutes} minutes to reconcile both.',
      'Add one adjacent feature of {name} (a second market, pool or product line) at half size after the first month, so the account deepens instead of repeating a single click. The extra activity costs about {cost} a session.',
    ],
  },
};

const CATEGORY_TO_PLAYBOOK: Record<string, string> = {
  Dexs: 'dexs',
  Lending: 'lending',
  'Uncollateralized Lending': 'lending',
  Derivatives: 'derivatives',
  'Interest Rate Derivatives': 'derivatives',
  Options: 'derivatives',
  'Options Vault': 'derivatives',
  Yield: 'yield',
  'Yield Aggregator': 'yield',
  Farm: 'yield',
  'Leveraged Farming': 'yield',
  CDP: 'cdp',
  'CDP Manager': 'cdp',
  'Dual-Token Stablecoin': 'cdp',
  'Algo-Stables': 'cdp',
  'Stablecoin Issuer': 'cdp',
  'Stablecoin Wrapper': 'cdp',
  Launchpad: 'launchpad',
  'Cross Chain Bridge': 'crosschain',
  Chain: 'crosschain',
  'Risk Curators': 'curator',
  'Onchain Capital Allocator': 'curator',
  'Liquidity Manager': 'curator',
  'Collateral Management': 'curator',
  'Collateral Markets': 'curator',
  'Basis Trading': 'basis',
  RWA: 'rwa',
};

// ---------------------------------------------------------------------------

/** The 5-step farm plan for one protocol, as of the snapshot date. */
export function farmSteps(p: FarmInput, asOf: string): string[] {
  const tier = tierFor(p.tvl_usd);
  const mainChain = p.chains[0] ?? 'Ethereum';
  const secondChain = p.chains[1] ?? mainChain;
  const ctx: Ctx = {
    name: p.name,
    category: p.category ?? 'uncategorised',
    asOf,
    mainChain,
    secondChain,
    cost: chainCost(mainChain),
    cost2: chainCost(secondChain),
    size: tier.size,
    sessions: tier.sessions,
    minutes: tier.minutes,
  };
  const seed = hashSlug(p.slug);
  const key = (p.category !== null && CATEGORY_TO_PLAYBOOK[p.category]) || 'generic';
  const book = PLAYBOOKS[key] ?? PLAYBOOKS.generic!;
  const steps = [
    fill(pick(SETUP_STEPS, seed), ctx),
    fill(pick(book.open, seed >>> 3), ctx),
    fill(pick(book.grow, seed >>> 5), ctx),
    fill(pick(TRACK_STEPS, seed >>> 7), ctx),
    fill(pick(EXIT_STEPS, seed >>> 9), ctx),
  ];
  return steps.map((s) => s.trim());
}
