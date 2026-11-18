// Token Launch Radar — entry point.
//
//   node main.ts [--input <snapshot.json>]
//
// Reads the frozen snapshot (default /input/snapshot.json), ranks every
// pre-token protocol by the implied value the model in lib/model.ts
// derives, gives each row the farm plan from lib/farm.ts, and writes to
// the output directory (env MAKEFUN_OUTPUT_DIR, default /output):
//
//   board.json            the ranked board
//   dashboard/            the static radar page plus its generated data
//   screenshots/          the captured views of the page
//   dossier.json          buildDossier's dossier of dashboard+screenshots
//
// The run is deterministic: the same snapshot bytes produce byte-identical
// board.json and dossier.json.

import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeBoard, type Snapshot } from './lib/model.ts';
import { farmSteps } from './lib/farm.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const root = dirname(fileURLToPath(import.meta.url));

function inputPathFromArgs(): string {
  const args = process.argv.slice(2);
  const at = args.indexOf('--input');
  if (at >= 0 && args[at + 1]) return args[at + 1]!;
  return '/input/snapshot.json';
}

const inputPath = inputPathFromArgs();
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const snapshot = JSON.parse(readFileSync(inputPath, 'utf8')) as Snapshot;
const { rows, summary } = computeBoard(snapshot);

/**
 * The board's contract, checked before a single byte is written: if the
 * model or the farm plans ever break it, the run fails loudly here rather
 * than handing in a board the gate refuses.
 */
function validateBoard(boardRows: { slug: string; rank: number; implied_value_usd: number; farm_steps: string[] }[]): void {
  const fail = (msg: string): never => {
    throw new Error(`token-radar: board invariant broken: ${msg}`);
  };
  if (boardRows.length < 100 || boardRows.length > 4000) fail(`${boardRows.length} rows, outside 100-4000`);
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  let previous = Number.POSITIVE_INFINITY;
  let distinct = false;
  boardRows.forEach((r, i) => {
    if (!known.has(r.slug)) fail(`row ${i + 1}: slug ${r.slug} is not in the snapshot`);
    if (seen.has(r.slug)) fail(`duplicate slug ${r.slug}`);
    seen.add(r.slug);
    if (r.rank !== i + 1) fail(`row ${i + 1}: rank is ${r.rank}`);
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0) fail(`row ${i + 1}: bad implied value`);
    if (r.implied_value_usd > previous) fail(`row ${i + 1}: implied values increase`);
    if (i > 0 && r.implied_value_usd !== boardRows[0]!.implied_value_usd) distinct = true;
    previous = r.implied_value_usd;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) fail(`row ${i + 1}: ${r.farm_steps.length} farm steps`);
    for (const s of r.farm_steps) {
      const n = s.trim().length;
      if (n < 20 || n > 600) fail(`row ${i + 1}: a farm step is ${n} chars`);
    }
  });
  if (!distinct) fail('every implied value is the same');
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) fail(`watchlist slug ${slug} is missing from the board`);
  }
}

const modelLine =
  `Implied value = TVL x peer market-cap/TVL ratio (category median across ` +
  `${summary.peer_count} tokenized peers; global median ${summary.global_median_ratio.toFixed(3)}), ` +
  `adjusted for 7-day TVL momentum, protocol age and chain breadth.`;

// --- board.json -------------------------------------------------------------
const boardRows = rows.map((r) => ({
  slug: r.slug,
  name: r.name,
  rank: r.rank,
  implied_value_usd: r.implied_value_usd,
  farm_steps: farmSteps(r, snapshot.as_of),
  tvl_usd: r.tvl_usd,
  category: r.category,
  chains: r.chains,
  change_7d: r.change_7d,
}));
validateBoard(boardRows);

const board = {
  as_of: summary.as_of,
  floor_usd: summary.floor_usd,
  model: modelLine,
  watchlist_covered: summary.watchlist_covered,
  watchlist_total: summary.watchlist_count,
  rows: boardRows,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), JSON.stringify(board));

// --- dashboard ---------------------------------------------------------------
const dashOut = join(outDir, 'dashboard');
mkdirSync(dashOut, { recursive: true });
for (const name of readdirSync(join(root, 'dashboard')).sort()) {
  copyFileSync(join(root, 'dashboard', name), join(dashOut, name));
}
const pageData = {
  meta: {
    as_of: summary.as_of,
    floor_usd: summary.floor_usd,
    protocol_count: summary.protocol_count,
    board_count: summary.selected_count,
    watchlist_count: summary.watchlist_count,
    watchlist_covered: summary.watchlist_covered,
    peer_count: summary.peer_count,
    global_median_ratio: summary.global_median_ratio,
    model_summary: modelLine,
  },
  rows: rows.map((r) => ({ ...r, farm_steps: farmSteps(r, snapshot.as_of) })),
};
writeFileSync(join(dashOut, 'zz-data.js'), `window.RADAR_DATA = ${JSON.stringify(pageData)};\n`);

// --- screenshots ---------------------------------------------------------------
const shotsOut = join(outDir, 'screenshots');
mkdirSync(shotsOut, { recursive: true });
for (const name of readdirSync(join(root, 'screenshots')).sort()) {
  if (name.startsWith('.')) continue;
  copyFileSync(join(root, 'screenshots', name), join(shotsOut, name));
}

// --- dossier -------------------------------------------------------------------
const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
writeFileSync(join(outDir, 'dossier.json'), dossier);

const boardBytes = Buffer.byteLength(JSON.stringify(board), 'utf8');
console.log(
  `token-radar: ${rows.length} rows, watchlist ${summary.watchlist_covered}/${summary.watchlist_count}, ` +
    `top: ${rows[0]!.name} at $${rows[0]!.implied_value_usd.toLocaleString('en-US')}\n` +
    `token-radar: board.json ${boardBytes} bytes, dossier.json ${dossier.length} bytes -> ${outDir}`,
);
