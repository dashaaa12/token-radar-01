// shoot.cjs — capture the entry's three screenshots from the built output.
//
// Serves the output directory (the argument, default ../out) on a local
// port, opens the dashboard in headless Chromium at 1280x800, and saves:
//   screenshots/1-board.png     the board, top rows
//   screenshots/2-detail.png    the detail view of the rank-1 protocol
//   screenshots/3-filtered.png  the board with a category filter applied
// Any page error fails the run. Run after main.ts, then run main.ts again
// so the dossier is built from the real screenshots.

const { chromium } = require('playwright-core');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'out'));
const SHOTS = path.resolve(__dirname, '..', 'screenshots');
const PORT = 8907;
const W = 1280;
const H = 800;

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = urlPath === '/' ? 'dashboard/index.html' : urlPath.replace(/^\/+/, '');
      const file = path.join(OUT, rel);
      if (!file.startsWith(OUT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const board = JSON.parse(fs.readFileSync(path.join(OUT, 'board.json'), 'utf8'));
  const topSlug = board.rows[0].slug;
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  const base = `http://127.0.0.1:${PORT}/dashboard/index.html`;

  // 1 — the board.
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('#board-body tr').length > 50);
  await sleep(400);
  await page.screenshot({ path: path.join(SHOTS, '1-board.png') });

  // 2 — the rank-1 protocol's detail view.
  await page.goto(`${base}#/p/${encodeURIComponent(topSlug)}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.getElementById('detail-view').hidden && document.querySelectorAll('ol.plan li').length >= 3);
  await sleep(300);
  await page.screenshot({ path: path.join(SHOTS, '2-detail.png') });

  // 3 — a filtered board: one category, visibly fewer rows.
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('#board-body tr').length > 50);
  await page.selectOption('#f-category', 'Dexs');
  await page.waitForFunction(() => {
    const n = document.querySelectorAll('#board-body tr').length;
    return n > 0 && n < 40;
  });
  await sleep(300);
  await page.screenshot({ path: path.join(SHOTS, '3-filtered.png') });

  await browser.close();
  server.close();

  for (const f of ['1-board.png', '2-detail.png', '3-filtered.png']) {
    const p = path.join(SHOTS, f);
    console.log(`shot ${f}: ${fs.statSync(p).size} bytes`);
  }
  if (errors.length) {
    console.log('PAGE ERRORS:\n' + errors.join('\n'));
    process.exitCode = 2;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
