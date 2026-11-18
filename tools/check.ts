// check.ts — the gate's rules, checked locally against a built output.
//
//   node tools/check.ts <snapshot.json> [outDir]
//
// Verifies the board contract, the watchlist coverage, the dashboard
// source limits (size, no network addresses), the screenshots (whole PNG,
// dimensions, bytes) and that dossier.json is byte for byte what
// buildDossier writes from the output's dashboard/ and screenshots/.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from '../vendor/makefun-board.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = process.argv[2];
const outDir = process.argv[3] ?? join(root, 'out');
if (!snapshotPath) throw new Error('usage: node tools/check.ts <snapshot.json> [outDir]');

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const known = new Set(snapshot.protocols.map((p: { slug: string }) => p.slug));

// --- board.json ---------------------------------------------------------------
const boardPath = join(outDir, 'board.json');
const boardBytes = statSync(boardPath).size;
const board = JSON.parse(readFileSync(boardPath, 'utf8'));
const rows: {
  slug: string; name: string; rank: number; implied_value_usd: number; farm_steps: string[];
}[] = board.rows;

check('board.json size <= 8 MiB', boardBytes <= 8 * 1024 * 1024, `${boardBytes} bytes`);
check('row count in 100..4000', rows.length >= 100 && rows.length <= 4000, `${rows.length} rows`);

const slugs = rows.map((r) => r.slug);
check('slugs unique', new Set(slugs).size === slugs.length);
check('slugs all in snapshot', slugs.every((s) => known.has(s)));
const rowSet = new Set(slugs);
check(
  'watchlist covered',
  snapshot.watchlist.every((s: string) => rowSet.has(s)),
  `${snapshot.watchlist.filter((s: string) => rowSet.has(s)).length}/${snapshot.watchlist.length}`,
);
check('names non-empty', rows.every((r) => typeof r.name === 'string' && r.name.length > 0));
check('ranks exactly 1..N', rows.every((r, i) => r.rank === i + 1));
check(
  'implied values positive whole <= 1e14',
  rows.every((r) => Number.isInteger(r.implied_value_usd) && r.implied_value_usd > 0 && r.implied_value_usd <= 1e14),
);
check(
  'implied values non-increasing',
  rows.every((r, i) => i === 0 || r.implied_value_usd <= rows[i - 1]!.implied_value_usd),
);
check('implied values not all equal', new Set(rows.map((r) => r.implied_value_usd)).size > 1);
check(
  'farm steps 3..12 per row, 20..600 chars trimmed',
  rows.every(
    (r) =>
      r.farm_steps.length >= 3 &&
      r.farm_steps.length <= 12 &&
      r.farm_steps.every((s) => s.trim().length >= 20 && s.trim().length <= 600),
  ),
);

// --- dashboard source -----------------------------------------------------------
const dashFiles = ['index.html', 'app.css', 'app.js'];
let dashTotal = 0;
let dashClean = true;
for (const f of dashFiles) {
  const text = readFileSync(join(root, 'dashboard', f), 'utf8');
  dashTotal += Buffer.byteLength(text, 'utf8');
  if (/https?:\/\//.test(text)) dashClean = false;
}
check('dashboard source (3 files) under 60 KB', dashTotal < 60 * 1024, `${dashTotal} bytes`);
check('no http(s) addresses in dashboard source', dashClean);
const zz = readFileSync(join(outDir, 'dashboard', 'zz-data.js'), 'utf8');
check('no http(s) addresses in generated zz-data.js', !/https?:\/\//.test(zz), `${zz.length} bytes`);

// --- screenshots ------------------------------------------------------------------
const shotNames = readdirSync(join(root, 'screenshots')).filter((n) => !n.startsWith('.')).sort();
check('3-4 screenshots', shotNames.length >= 3 && shotNames.length <= 4, shotNames.join(', '));
for (const name of shotNames) {
  const buf = readFileSync(join(root, 'screenshots', name));
  const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  let dims = 'n/a';
  let dimsOk = false;
  if (isPng) {
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    dims = `${w}x${h}`;
    dimsOk = Math.max(w, h) <= 1440 && Math.min(w, h) >= 800;
  }
  check(
    `screenshot ${name}: whole PNG/JPEG, <=512 KiB, long <=1440, short >=800`,
    (isPng || isJpeg) && buf.length <= 512 * 1024 && (isJpeg || dimsOk),
    `${buf.length} bytes, ${dims}`,
  );
}

// --- dossier ----------------------------------------------------------------------
const expected = buildDossier(outDir, { text_max_bytes: 65536 });
const actual = readFileSync(join(outDir, 'dossier.json'));
check('dossier.json matches buildDossier output byte for byte', Buffer.from(expected).equals(actual), `${actual.length} bytes`);
check('dossier.json <= 1.5 MiB', actual.length <= 1.5 * 1024 * 1024, `${actual.length} bytes`);

console.log(failures === 0 ? '\nALL CHECKS PASS' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
