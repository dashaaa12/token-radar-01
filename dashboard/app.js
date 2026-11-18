'use strict';
/* Token Launch Radar — board + detail rendering over window.RADAR_DATA.
   Plain script, no modules, no network: everything comes from zz-data.js. */

var DATA = window.RADAR_DATA;
var ROWS = DATA.rows;
var META = DATA.meta;
var bySlug = {};
ROWS.forEach(function (r) { bySlug[r.slug] = r; });

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function fmtUsd(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n;
}

function fmtUsdFull(n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtPct(x) {
  if (x === null || x === undefined) return '<span class="flat">&mdash;</span>';
  var cls = x > 0 ? 'up' : x < 0 ? 'down' : 'flat';
  var sign = x > 0 ? '+' : '';
  return '<span class="' + cls + '">' + sign + x.toFixed(2) + '%</span>';
}

function fmtAge(days) {
  if (days >= 730) return (days / 365).toFixed(1) + ' yrs';
  if (days >= 60) return Math.round(days / 30.4) + ' mo';
  return days + ' d';
}

/* ------------------------------------------------------------- board */

var els = {
  q: document.getElementById('q'),
  cat: document.getElementById('f-category'),
  chain: document.getElementById('f-chain'),
  sort: document.getElementById('f-sort'),
  watch: document.getElementById('f-watch'),
  body: document.getElementById('board-body'),
  showing: document.getElementById('showing'),
  empty: document.getElementById('empty'),
  boardView: document.getElementById('board-view'),
  detailView: document.getElementById('detail-view'),
  detail: document.getElementById('detail'),
};

function fillSelect(sel, values, allLabel) {
  var html = '<option value="">' + allLabel + '</option>';
  values.forEach(function (v) { html += '<option value="' + esc(v) + '">' + esc(v) + '</option>'; });
  sel.innerHTML = html;
}

function distinctSorted(getter) {
  var seen = {};
  ROWS.forEach(function (r) { getter(r).forEach(function (v) { if (v) seen[v] = true; }); });
  return Object.keys(seen).sort();
}

function currentFilters() {
  return {
    q: els.q.value.trim().toLowerCase(),
    cat: els.cat.value,
    chain: els.chain.value,
    watch: els.watch.checked,
    sort: els.sort.value,
  };
}

function applyFilters(f) {
  var out = ROWS.filter(function (r) {
    if (f.watch && !r.watchlist) return false;
    if (f.cat && r.category !== f.cat) return false;
    if (f.chain && r.chains.indexOf(f.chain) === -1) return false;
    if (f.q && r.name.toLowerCase().indexOf(f.q) === -1 && r.slug.indexOf(f.q) === -1) return false;
    return true;
  });
  var by = {
    implied: function (a, b) { return a.rank - b.rank; },
    tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
    change: function (a, b) {
      var x = a.change_7d === null ? -Infinity : a.change_7d;
      var y = b.change_7d === null ? -Infinity : b.change_7d;
      return y - x;
    },
    age: function (a, b) { return b.age_days - a.age_days; },
  };
  out.sort(by[f.sort] || by.implied);
  return out;
}

function rowHtml(r) {
  var chains = r.chains.length <= 3
    ? esc(r.chains.join(', '))
    : esc(r.chains.slice(0, 3).join(', ')) + ' +' + (r.chains.length - 3);
  return '<tr data-slug="' + esc(r.slug) + '">' +
    '<td class="num rank' + (r.rank <= 3 ? ' top' : '') + '">' + r.rank + '</td>' +
    '<td><span class="pname">' + esc(r.name) + '</span>' +
      (r.watchlist ? '<span class="wl">WATCHLIST</span>' : '') +
      '<span class="pslug">' + esc(r.slug) + '</span></td>' +
    '<td class="cat">' + esc(r.category || '&mdash;') + '</td>' +
    '<td class="chains">' + chains + '</td>' +
    '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
    '<td class="num">' + fmtPct(r.change_7d) + '</td>' +
    '<td class="num iv">' + fmtUsd(r.implied_value_usd) + '</td>' +
    '</tr>';
}

function renderBoard() {
  var f = currentFilters();
  var rows = applyFilters(f);
  els.body.innerHTML = rows.map(rowHtml).join('');
  els.empty.hidden = rows.length > 0;
  var total = rows.reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
  els.showing.innerHTML = 'Showing <b>' + rows.length + '</b> of ' + ROWS.length +
    ' protocols &middot; combined implied value <b>' + fmtUsd(total) + '</b>';
}

/* ------------------------------------------------------------- detail */

function factorRow(label, display, barPct) {
  var pct = Math.max(2, Math.min(100, barPct));
  return '<div class="factor"><span class="fk">' + esc(label) + '</span>' +
    '<span class="bar"><i style="width:' + pct.toFixed(1) + '%"></i></span>' +
    '<span class="fv">' + esc(display) + '</span></div>';
}

function renderDetail(r) {
  var m = r.model;
  var maxTvl = ROWS[0] ? Math.max.apply(null, ROWS.map(function (x) { return x.tvl_usd; })) : r.tvl_usd;
  var tvlBar = 100 * Math.log10(Math.max(r.tvl_usd, 1)) / Math.log10(Math.max(maxTvl, 10));
  var stats = [
    ['Implied value', fmtUsdFull(r.implied_value_usd), '', 'green money'],
    ['TVL', fmtUsdFull(r.tvl_usd), '', 'money'],
    ['Category', r.category || '—', '', ''],
    ['7d TVL change', r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(2) + '%', '', ''],
    ['Age on snapshot', fmtAge(r.age_days), r.listed_at ? 'tracked since ' + r.listed_at : 'listed date unknown', ''],
    ['Chains', String(r.chains.length), r.chains.join(', '), ''],
    ['Watchlist', r.watchlist ? 'Yes' : 'No', r.watchlist ? 'house watchlist member' : 'below the $50M floor or unlisted', ''],
  ];
  var statsHtml = stats.map(function (s) {
    return '<div class="stat"><div class="k">' + esc(s[0]) + '</div><div class="v ' + s[3] + '">' + esc(s[1]) + '</div>' +
      (s[2] ? '<div class="sub">' + esc(s[2]) + '</div>' : '') + '</div>';
  }).join('');

  var modelHtml =
    factorRow('TVL (base input)', fmtUsdFull(r.tvl_usd), tvlBar) +
    factorRow('Peer ratio — ' + m.peer_ratio_source + ' (' + m.peer_count + ' peers)', 'x ' + m.peer_ratio.toFixed(3), m.peer_ratio / 2.5 * 100) +
    factorRow('Base value', fmtUsdFull(m.base_value_usd), tvlBar * m.peer_ratio) +
    factorRow('Momentum (7d TVL)', 'x ' + m.momentum_factor.toFixed(3), m.momentum_factor / 1.5 * 100) +
    factorRow('Age (track record)', 'x ' + m.age_factor.toFixed(3), m.age_factor / 1.5 * 100) +
    factorRow('Chain breadth (' + r.chains.length + ' chains)', 'x ' + m.chain_factor.toFixed(2), m.chain_factor / 1.24 * 100) +
    '<div class="factor total"><span class="fk">Implied value</span><span></span><span class="fv">' +
      fmtUsdFull(r.implied_value_usd) + '</span></div>';

  var planHtml = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');

  els.detail.innerHTML =
    '<div class="detail-head"><span class="drank">#' + r.rank + '</span><h2>' + esc(r.name) + '</h2>' +
    '<span class="dslug">' + esc(r.slug) + '</span>' +
    (r.watchlist ? '<span class="wl">WATCHLIST</span>' : '') + '</div>' +
    '<div class="stat-grid">' + statsHtml + '</div>' +
    '<div class="panel"><h3>How the implied value is built</h3>' + modelHtml +
    '<p class="note">The peer ratio is the median market-cap / TVL of tokenized protocols in the same ' +
    'category in this snapshot (the global median when a category has fewer than 3 peers), clamped to ' +
    '0.02–2.50. Momentum, age and chain factors adjust it; nothing is hand-set per protocol.</p></div>' +
    '<div class="panel"><h3>Farm plan</h3><ol class="plan">' + planHtml + '</ol>' +
    '<p class="note">As of the ' + esc(META.as_of) + ' snapshot this protocol records no token. ' +
    'The plan is a usage routine with real costs and time, not a promise of any airdrop.</p></div>';
}

/* ------------------------------------------------------------- routing */

function route() {
  var hash = location.hash || '#/';
  var match = /^#\/p\/(.+)$/.exec(hash);
  if (match && bySlug[decodeURIComponent(match[1])]) {
    renderDetail(bySlug[decodeURIComponent(match[1])]);
    els.boardView.hidden = true;
    els.detailView.hidden = false;
    window.scrollTo(0, 0);
  } else {
    els.detailView.hidden = true;
    els.boardView.hidden = false;
    renderBoard();
  }
}

function init() {
  document.getElementById('meta-box').innerHTML =
    'Snapshot <b>' + esc(META.as_of) + '</b> &middot; ' + META.protocol_count + ' protocols scanned<br>' +
    '<b>' + META.board_count + '</b> pre-token on the board &middot; watchlist <b>' +
    META.watchlist_covered + '/' + META.watchlist_count + '</b> covered';
  document.getElementById('model-line').textContent = META.model_summary;
  fillSelect(els.cat, distinctSorted(function (r) { return [r.category]; }), 'All categories');
  fillSelect(els.chain, distinctSorted(function (r) { return r.chains; }), 'All chains');
  [els.q, els.cat, els.chain, els.sort, els.watch].forEach(function (el) {
    el.addEventListener('input', renderBoard);
    el.addEventListener('change', renderBoard);
  });
  els.body.addEventListener('click', function (ev) {
    var tr = ev.target.closest ? ev.target.closest('tr[data-slug]') : null;
    if (tr) location.hash = '#/p/' + encodeURIComponent(tr.getAttribute('data-slug'));
  });
  window.addEventListener('hashchange', route);
  route();
}

init();
