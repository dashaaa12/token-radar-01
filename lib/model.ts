// Token Launch Radar — selection and valuation model.
//
// The board lists protocols whose token does not exist yet (the snapshot
// records no token for them) and ranks them by an implied value derived
// entirely from the snapshot's own figures:
//
//   implied = TVL x peerRatio(category) x momentum x ageFactor x chainFactor
//
// peerRatio is the median market-cap / TVL ratio of the tokenized protocols
// in the same category (the "peers"), or the global median when a category
// has too few peers. Nothing is hardcoded per protocol: change the snapshot
// and every number moves.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

/** One ranked board row, with the model internals the detail view explains. */
export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  tvl_usd: number;
  category: string | null;
  chains: string[];
  change_7d: number | null;
  listed_at: string | null;
  age_days: number;
  watchlist: boolean;
  model: {
    peer_ratio: number;
    peer_ratio_source: string; // category name, or "global median"
    peer_count: number;
    base_value_usd: number;
    momentum_factor: number;
    age_factor: number;
    chain_factor: number;
  };
}

export interface ModelSummary {
  as_of: string;
  floor_usd: number;
  protocol_count: number;
  peer_count: number;
  global_median_ratio: number;
  categories_with_peers: number;
  selected_count: number;
  watchlist_count: number;
  watchlist_covered: number;
}

// ---------------------------------------------------------------------------
// Selection: pre-token protocols that are not wrapped/staked/bridged
// versions of something that already trades (the house watchlist rule,
// applied to the whole snapshot rather than only above the floor).
// ---------------------------------------------------------------------------

const EXCLUDED_CATEGORIES: ReadonlySet<string> = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIXES: readonly string[] = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

export function isPreToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

export function qualifies(p: Protocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  for (const prefix of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(prefix)) return false;
  }
  return true;
}

/**
 * Every qualifying protocol, capped at 400 rows: when more qualify, the 400
 * highest by TVL are kept (watchlist members sit at or above the snapshot
 * floor, so they always survive the cap).
 */
export function selectProtocols(snapshot: Snapshot): Protocol[] {
  const chosen = snapshot.protocols.filter(qualifies);
  if (chosen.length <= 400) return chosen;
  return [...chosen]
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, 400);
}

// ---------------------------------------------------------------------------
// Peer ratios: what the market pays, per dollar of TVL, for a token that
// already exists in the same line of business.
// ---------------------------------------------------------------------------

const RATIO_MIN = 0.02;
const RATIO_MAX = 2.5;
const MIN_PEERS_PER_CATEGORY = 3;

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export interface PeerRatios {
  byCategory: Map<string, { ratio: number; peers: number }>;
  globalRatio: number;
  peerCount: number;
}

export function peerRatios(snapshot: Snapshot): PeerRatios {
  const perCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0) continue;
    if (p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    all.push(ratio);
    if (p.category !== null) {
      const list = perCategory.get(p.category);
      if (list) list.push(ratio);
      else perCategory.set(p.category, [ratio]);
    }
  }
  const byCategory = new Map<string, { ratio: number; peers: number }>();
  for (const [category, ratios] of perCategory) {
    if (ratios.length >= MIN_PEERS_PER_CATEGORY) {
      byCategory.set(category, {
        ratio: clamp(median(ratios), RATIO_MIN, RATIO_MAX),
        peers: ratios.length,
      });
    }
  }
  return {
    byCategory,
    globalRatio: clamp(median(all), RATIO_MIN, RATIO_MAX),
    peerCount: all.length,
  };
}

// ---------------------------------------------------------------------------
// The valuation itself.
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

function ageInDays(listedAt: string | null, asOf: string): number {
  if (listedAt === null) return 365;
  const days = Math.floor((Date.parse(asOf) - Date.parse(listedAt)) / DAY_MS);
  return Math.max(0, days);
}

export function computeBoard(snapshot: Snapshot): {
  rows: BoardRow[];
  summary: ModelSummary;
} {
  const ratios = peerRatios(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const selected = selectProtocols(snapshot);

  const raw = selected.map((p) => {
    const cat = p.category !== null ? ratios.byCategory.get(p.category) : undefined;
    const peerRatio = cat ? cat.ratio : ratios.globalRatio;
    const ratioSource = cat ? p.category! : 'global median';
    const peerCount = cat ? cat.peers : ratios.peerCount;

    const base = p.tvl_usd * peerRatio;
    const momentum = 1 + clamp(p.change_7d ?? 0, -60, 120) / 250;
    const ageDays = ageInDays(p.listed_at, snapshot.as_of);
    const ageFactor = 1 + Math.min(ageDays, 1800) / 3600;
    const chainFactor = 1 + 0.04 * Math.min(Math.max(p.chains.length - 1, 0), 6);
    const implied = Math.max(1000, Math.round(base * momentum * ageFactor * chainFactor));

    return { p, peerRatio, ratioSource, peerCount, base, momentum, ageDays, ageFactor, chainFactor, implied };
  });

  // Rank by implied value; ties fall to TVL, then to the slug, so the order
  // is total and the same bytes come out of every run.
  raw.sort(
    (a, b) =>
      b.implied - a.implied ||
      b.p.tvl_usd - a.p.tvl_usd ||
      (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );

  let previous = Number.POSITIVE_INFINITY;
  const rows: BoardRow[] = raw.map((r, i) => {
    const value = Math.min(r.implied, previous);
    previous = value;
    return {
      slug: r.p.slug,
      name: r.p.name,
      rank: i + 1,
      implied_value_usd: value,
      tvl_usd: r.p.tvl_usd,
      category: r.p.category,
      chains: [...r.p.chains],
      change_7d: r.p.change_7d,
      listed_at: r.p.listed_at,
      age_days: r.ageDays,
      watchlist: watchlist.has(r.p.slug),
      model: {
        peer_ratio: r.peerRatio,
        peer_ratio_source: r.ratioSource,
        peer_count: r.peerCount,
        base_value_usd: Math.round(r.base),
        momentum_factor: r.momentum,
        age_factor: r.ageFactor,
        chain_factor: r.chainFactor,
      },
    };
  });

  const summary: ModelSummary = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    protocol_count: snapshot.protocols.length,
    peer_count: ratios.peerCount,
    global_median_ratio: ratios.globalRatio,
    categories_with_peers: ratios.byCategory.size,
    selected_count: rows.length,
    watchlist_count: snapshot.watchlist.length,
    watchlist_covered: rows.filter((r) => r.watchlist).length,
  };
  return { rows, summary };
}
