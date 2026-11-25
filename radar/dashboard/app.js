// Launch Radar dashboard: renders window.RADAR (written by the entry program as ../data.js) as a
// ranked board, a per-protocol detail view and a methods section. Hash routing only, no fetch, no
// framework: #/ is the board, #/protocol/<slug> a protocol, #/methods the methods section, and the
// board takes its first filter from the hash query (#/?watchlist=1 starts on the watchlist).

(function () {
  'use strict';

  var D = window.RADAR;
  var app = document.getElementById('app');

  // ------------------------------------------------------------ formatting

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function group(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function money(v) {
    return '$' + group(v);
  }

  // $1,682,000,000 reads as $1.68B at board size, and stays exact in the detail view via money().
  function compact(v) {
    if (v >= 1e9) return '$' + trim(v / 1e9, 2) + 'B';
    if (v >= 1e6) return '$' + trim(v / 1e6, 2) + 'M';
    if (v >= 1e3) return '$' + trim(v / 1e3, 1) + 'K';
    return money(v);
  }

  function trim(v, dp) {
    var s = v.toFixed(dp);
    return s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  }

  function change(v) {
    if (v === null || v === undefined) return '<span class="flat">—</span>';
    var cls = v > 0 ? 'pos' : v < 0 ? 'neg' : 'flat';
    var sign = v > 0 ? '+' : '';
    return '<span class="' + cls + '">' + sign + trim(v, 2) + '%</span>';
  }

  function mult(v) {
    return trim(v, 4) + '×';
  }

  // ------------------------------------------------------------ the board's scale

  var rows = D ? D.rows : [];
  var logMin = Infinity;
  var logMax = -Infinity;
  rows.forEach(function (r) {
    logMin = Math.min(logMin, Math.log10(Math.max(1, r.implied_low_usd)));
    logMax = Math.max(logMax, Math.log10(Math.max(1, r.implied_high_usd)));
  });

  function barPos(v) {
    var p = ((Math.log10(Math.max(1, v)) - logMin) / (logMax - logMin)) * 100;
    return Math.min(100, Math.max(0, p));
  }

  function rangeBar(r) {
    var lo = barPos(r.implied_low_usd);
    var hi = barPos(r.implied_high_usd);
    var pt = barPos(r.implied_value_usd);
    return (
      '<div class="bar"><div class="span" style="left:' + lo.toFixed(1) + '%;width:' + Math.max(1.5, hi - lo).toFixed(1) +
      '%"></div><div class="point" style="left:calc(' + pt.toFixed(1) + '% - 1px)"></div></div>' +
      '<div class="ends"><span>' + compact(r.implied_low_usd) + '</span><span>' + compact(r.implied_high_usd) + '</span></div>'
    );
  }

  // ------------------------------------------------------------ shared chrome

  function header() {
    return (
      '<header class="site-head"><div>' +
      '<div class="wordmark">Launch Radar<span class="dot">.</span></div>' +
      '<p class="tagline">Every protocol still waiting on a launch of its own, ranked by what its launch would be worth, ' +
      'with the steps to farm it. Prices come from a model fitted on the protocols that already trade.</p>' +
      '</div><div class="asof">Snapshot as of <span class="fig">' + esc(D.as_of) + '</span><br>' +
      'Watchlist floor <span class="fig">' + money(D.floor_usd) + '</span> TVL</div></header>'
    );
  }

  function stats() {
    var s = D.stats;
    var cells = [
      [group(s.protocols_scanned), 'protocols scanned'],
      [group(s.pre_token_ranked), 'launch candidates ranked'],
      [group(s.not_candidate_count), 'not launch candidates'],
      [group(s.watchlist_count), 'on the watchlist'],
      [compact(s.total_implied_usd), 'total implied value'],
      [mult(s.median_multiple), s.multiple_label],
    ];
    return '<div class="stats">' + cells.map(function (c) {
      return '<div class="stat"><div class="value">' + c[0] + '</div><div class="label">' + c[1] + '</div></div>';
    }).join('') + '</div>';
  }

  function foot() {
    return '<p class="foot">Source: ' + esc(D.source) + '. Implied values and launch odds are the model\'s estimates, ' +
      'fitted on this snapshot alone; they are not prices, promises or advice. Farm plans state actions, fees and times only.</p>';
  }

  // ------------------------------------------------------------ board view

  var state = { q: '', category: '', chain: '', watchlist: false, sort: 'implied' };

  function readHash() {
    var h = location.hash.replace(/^#/, '');
    var qAt = h.indexOf('?');
    var path = qAt >= 0 ? h.slice(0, qAt) : h;
    var query = qAt >= 0 ? new URLSearchParams(h.slice(qAt + 1)) : new URLSearchParams();
    return { path: path === '' ? '/' : path, query: query };
  }

  function filtered() {
    var out = rows.filter(function (r) {
      if (state.watchlist && !r.watchlist) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        if (r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      }
      return true;
    });
    var by = {
      implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      change: function (a, b) { return (b.change_7d === null ? -Infinity : b.change_7d) - (a.change_7d === null ? -Infinity : a.change_7d); },
      odds: function (a, b) { return b.launch_odds - a.launch_odds; },
      cost: function (a, b) { return a.farm_cost_low_usd - b.farm_cost_low_usd; },
    };
    out.sort(by[state.sort] || by.implied);
    return out;
  }

  function rowHtml(r) {
    return (
      '<tr data-slug="' + esc(r.slug) + '">' +
      '<td class="rank">' + r.rank + '</td>' +
      '<td><span class="pname">' + esc(r.name) + '</span>' + (r.watchlist ? '<span class="flag">Watchlist</span>' : '') +
      '<div class="pchains">' + esc(r.chains.join(' · ') || 'No chains recorded') + '</div></td>' +
      '<td>' + esc(r.category) + '</td>' +
      '<td class="num fig">' + compact(r.tvl_usd) + '</td>' +
      '<td class="num fig">' + change(r.change_7d) + '</td>' +
      '<td><div class="range"><span class="fig">' + compact(r.implied_value_usd) + '</span>' + rangeBar(r) + '</div></td>' +
      '<td class="num odds">' + r.launch_odds + '</td>' +
      '<td class="num fig">' + compact(r.farm_cost_low_usd) + '–' + compact(r.farm_cost_high_usd) + '</td>' +
      '</tr>'
    );
  }

  function renderRows() {
    var list = filtered();
    var body = document.getElementById('board-body');
    var count = document.getElementById('board-count');
    if (!body) return;
    body.innerHTML = list.length > 0 ? list.map(rowHtml).join('') : '<tr><td colspan="8" class="empty">No protocol matches this filter. Loosen the search or clear a filter.</td></tr>';
    if (count) count.textContent = 'Showing ' + list.length + ' of ' + rows.length;
    Array.prototype.forEach.call(body.querySelectorAll('tr[data-slug]'), function (tr) {
      tr.addEventListener('click', function () {
        location.hash = '#/protocol/' + encodeURIComponent(tr.getAttribute('data-slug'));
      });
    });
  }

  function options(values, current, allLabel) {
    var html = '<option value="">' + allLabel + '</option>';
    values.forEach(function (v) {
      html += '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>';
    });
    return html;
  }

  function boardView() {
    var categories = Array.from(new Set(rows.map(function (r) { return r.category; }))).sort();
    var chains = Array.from(new Set(rows.reduce(function (acc, r) { return acc.concat(r.chains); }, []))).sort();
    app.innerHTML =
      header() + stats() +
      '<div class="toolbar">' +
      '<label>Search <input type="search" id="f-q" placeholder="Name or slug" value="' + esc(state.q) + '"></label>' +
      '<label>Category <select id="f-category">' + options(categories, state.category, 'All categories') + '</select></label>' +
      '<label>Chain <select id="f-chain">' + options(chains, state.chain, 'All chains') + '</select></label>' +
      '<label><input type="checkbox" id="f-watchlist"' + (state.watchlist ? ' checked' : '') + '> Watchlist only</label>' +
      '<label>Sort by <select id="f-sort">' +
      '<option value="implied"' + (state.sort === 'implied' ? ' selected' : '') + '>Implied value</option>' +
      '<option value="tvl"' + (state.sort === 'tvl' ? ' selected' : '') + '>TVL</option>' +
      '<option value="change"' + (state.sort === 'change' ? ' selected' : '') + '>7d change</option>' +
      '<option value="odds"' + (state.sort === 'odds' ? ' selected' : '') + '>Launch odds</option>' +
      '<option value="cost"' + (state.sort === 'cost' ? ' selected' : '') + '>Farm cost</option>' +
      '</select></label>' +
      '<span class="count" id="board-count"></span>' +
      '</div>' +
      '<div class="panel board-wrap"><table class="board"><thead><tr>' +
      '<th>Rank</th><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">7d change</th>' +
      '<th>Implied value and range</th><th class="num">Launch odds</th><th class="num">Farm cost</th>' +
      '</tr></thead><tbody id="board-body"></tbody></table></div>' +
      methodsHtml() + foot();

    document.getElementById('f-q').addEventListener('input', function (e) { state.q = e.target.value; renderRows(); });
    document.getElementById('f-category').addEventListener('change', function (e) { state.category = e.target.value; renderRows(); });
    document.getElementById('f-chain').addEventListener('change', function (e) { state.chain = e.target.value; renderRows(); });
    document.getElementById('f-watchlist').addEventListener('change', function (e) { state.watchlist = e.target.checked; renderRows(); });
    document.getElementById('f-sort').addEventListener('change', function (e) { state.sort = e.target.value; renderRows(); });
    renderRows();
  }

  // ------------------------------------------------------------ methods

  // The fitted multiple a log-log line implies at a TVL of $100M: its fitted cap there over $100M.
  function multAt100m(line) {
    return Math.pow(10, line.a + line.b * 8) / 1e8;
  }

  function methodsHtml() {
    var g = D.global;
    var v = D.validation;
    var vm = D.validation_multiples;
    var vl = D.validation_loglog;
    var lg = D.loglog_global;
    var loglog = D.model === 'loglog';
    var factor = Math.pow(10, v.median_abs_log10_error);
    var cats = (loglog ? D.loglog_categories : D.categories).slice().sort(function (a, b) {
      return b.training_count - a.training_count || (a.category < b.category ? -1 : 1);
    });
    var catHead;
    var catRows;
    if (loglog) {
      catHead = '<th>Category</th><th class="num">Trading peers</th><th class="num">Intercept a</th><th class="num">Slope b</th>' +
        '<th class="num">Multiple at $100M TVL</th><th class="num">Already tokenised</th>';
      catRows = cats.map(function (c) {
        return '<tr><td>' + esc(c.category) + (c.uses_global ? ' <span class="sym">(global line)</span>' : '') + '</td>' +
          '<td class="num fig">' + c.training_count + '</td>' +
          '<td class="num fig">' + trim(c.a, 4) + '</td>' +
          '<td class="num fig">' + trim(c.b, 4) + '</td>' +
          '<td class="num fig">' + mult(multAt100m(c)) + '</td>' +
          '<td class="num fig">' + Math.round(c.propensity * 100) + '%</td></tr>';
      }).join('');
    } else {
      catHead = '<th>Category</th><th class="num">Trading peers</th><th class="num">Fitted multiple</th><th class="num">Fitted range</th>' +
        '<th class="num">Raw median</th><th class="num">Already tokenised</th>';
      catRows = cats.map(function (c) {
        return '<tr><td>' + esc(c.category) + '</td><td class="num fig">' + c.training_count + '</td>' +
          '<td class="num fig">' + mult(c.multiple) + '</td>' +
          '<td class="num fig">' + mult(c.multiple_low) + ' – ' + mult(c.multiple_high) + '</td>' +
          '<td class="num fig">' + (c.raw_median === null ? '—' : mult(c.raw_median)) + '</td>' +
          '<td class="num fig">' + Math.round(c.propensity * 100) + '%</td></tr>';
      }).join('');
    }
    var formula = loglog
      ? '<p><strong>The formula.</strong> Implied value = fitted cap × momentum × maturity. The fitted cap comes from a ' +
        'log-log line fitted per category by least squares: log10(market cap) = a + b × log10(TVL) over the category\'s ' +
        'trading protocols, with a and b shrunk toward the global line (a ' + trim(lg.a, 4) + ', b ' + trim(lg.b, 4) + ') ' +
        'with four borrowed members of weight; a category with fewer than three trading protocols prices from the global ' +
        'line outright. At a TVL of $100M the global line\'s fitted multiple is ' + mult(multAt100m(lg)) + '. ' +
        'Momentum = 1 + clamp(7-day TVL change, −50% to +100%) × 0.35. Maturity runs from 0.75 to 1.00 over the first 1,460 days ' +
        'since the protocol was listed; a protocol with no listing date is priced as 365 days old.</p>' +
        '<p><strong>The range</strong> is read off the winning model\'s own blind residuals: each row\'s range is its implied ' +
        'value × ' + trim(D.range_factor_low, 2) + ' to × ' + trim(D.range_factor_high, 2) + ', the middle half of its ' +
        'leave-one-out log10 residuals, so the band is exactly as wide as the model\'s blind prices actually were.</p>'
      : '<p><strong>The formula.</strong> Implied value = TVL × category multiple × momentum × maturity. ' +
        'The category multiple is the median market cap over TVL of that category\'s trading protocols, shrunk toward the ' +
        'global median of ' + mult(g.median) + ' with four borrowed members of weight, and clamped between 0.02× and 3×. ' +
        'The value range uses the category\'s fitted quartiles (' + mult(g.p25) + ' to ' + mult(g.p75) + ' globally), ' +
        'shrunk the same way for categories with at least eight trading members and scaled from the global spread below that. ' +
        'Momentum = 1 + clamp(7-day TVL change, −50% to +100%) × 0.35. Maturity runs from 0.75 to 1.00 over the first 1,460 days ' +
        'since the protocol was listed; a protocol with no listing date is priced as 365 days old.</p>';
    var training = D.training.map(function (t) {
      return '<tr><td>' + esc(t.name) + ' <span class="sym">' + esc(t.symbol || '—') + '</span></td>' +
        '<td class="num fig">' + compact(t.tvl_usd) + '</td><td class="num fig">' + compact(t.mcap_usd) + '</td>' +
        '<td class="num fig">' + mult(t.multiple) + '</td></tr>';
    }).join('');
    var represented = D.represented.map(function (t) {
      return '<tr><td>' + esc(t.name) + ' <span class="sym">' + esc(t.symbol) + '</span></td>' +
        '<td class="num fig">' + compact(t.tvl_usd) + '</td></tr>';
    }).join('');
    var notCandidates = D.not_candidates.map(function (t) {
      return '<tr><td>' + esc(t.name) + '</td><td>' + esc(t.category) + '</td>' +
        '<td class="num fig">' + compact(t.tvl_usd) + '</td><td>' + esc(t.reason) + '</td></tr>';
    }).join('');
    return (
      '<section class="block" id="methods"><h2>How the radar prices a launch</h2>' +
      '<p class="lede">The model is fitted on the ' + g.count + ' token-bearing protocols that record a real market cap, ' +
      'then prices the protocols still waiting on a launch of their own. Nothing is hand-set per protocol.</p>' +
      '<div class="panel padded">' +
      formula +
      '<p><strong>Launch odds</strong> add four terms into 100: 35 for the share of the protocol\'s category that already carries ' +
      'a token, 30 for its TVL percentile among launch candidates, 20 for its age, and 15 for its 7-day momentum.</p>' +
      '<p><strong>Checked blind.</strong> Two estimators were fitted, and each priced all ' + v.count + ' training protocols ' +
      'blind, leaving each one out of its own fit in turn. The median-multiple model\'s median absolute log10 error was ' +
      trim(vm.median_abs_log10_error, 2) + ' and the log-log model\'s was ' + trim(vl.median_abs_log10_error, 2) +
      ', so the board prices with the ' + (loglog ? 'log-log' : 'median-multiple') + ' model and the other stands as its ' +
      'cross-check. The winning model\'s median blind price came out at ' + trim(v.median_ratio, 2) +
      '× the real cap; ' + Math.round(v.within_x2 * 100) + '% landed within ×2 and ' + Math.round(v.within_x3 * 100) +
      '% within ×3. The median absolute log10 error is ' + trim(v.median_abs_log10_error, 2) + ', so a typical blind price lands ' +
      'within about ×' + trim(factor, 1) + ' of the real cap. The ranges on the board are honest about that spread: ' +
      'treat the point estimate as the middle of a wide band, not a forecast.</p>' +
      '</div>' +
      '<div class="panel" style="margin-top:14px;overflow-x:auto"><table class="mini"><thead><tr>' +
      catHead + '</tr></thead><tbody>' + catRows + '</tbody></table></div>' +
      '<div class="split" style="margin-top:14px">' +
      '<div class="panel"><h3>Already trading</h3><p class="note">The training set: these protocols carry a token and record a ' +
      'real, positive market cap, so the market prices them and the board does not. The model fitted its prices on this set; ' +
      'a recorded cap of zero, or the snapshot\'s one −1 artifact, is not a price and stays out of the fit.</p>' +
      '<table class="mini"><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Multiple</th></tr></thead><tbody>' +
      training + '</tbody></table></div>' +
      '<div class="panel"><h3>Already represented</h3><p class="note">These products record a symbol but no CoinGecko id: ' +
      'wrapped, staked and bridged forms of tokens that already trade. They are not launches waiting to happen, ' +
      'so the board leaves them out too.</p>' +
      '<table class="mini"><thead><tr><th>Protocol</th><th class="num">TVL</th></tr></thead><tbody>' +
      represented + '</tbody></table></div>' +
      '</div>' +
      '<div class="panel stacked"><h3>Not launch candidates</h3><p class="note">These protocols record no token either, but none ' +
      'of them is a launch waiting to happen: the board ranks only protocols still waiting on a launch of their own, so each ' +
      'of these is set aside with the first reason it fails the candidate test.</p>' +
      '<table class="mini"><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th>Why not</th></tr></thead><tbody>' +
      notCandidates + '</tbody></table></div>' +
      '</section>'
    );
  }

  // ------------------------------------------------------------ detail view

  function detailView(slug) {
    var r = null;
    rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) { boardView(); return; }
    var ageText = r.age_days === null ? 'no listing date recorded, priced as ' + r.age_used + ' days old' : r.age_days + ' days since listing';
    var steps = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    var arith;
    if (r.fit_a !== null && r.fit_a !== undefined) {
      arith =
        money(r.tvl_usd) + ' <span class="op">TVL</span><br>' +
        '<span class="op">→</span> ' + money(r.fitted_value_usd) + ' <span class="op">fitted cap</span> ' +
        '<span class="why">(log-log line for ' + esc(r.category) + ': log10(cap) = ' + trim(r.fit_a, 4) + ' + ' + trim(r.fit_b, 4) +
        ' × log10(TVL), fitted on ' + r.category_training_count + ' trading peer' + (r.category_training_count === 1 ? '' : 's') + ')</span><br>' +
        '<span class="op">×</span> ' + trim(r.momentum, 4) + ' <span class="op">momentum</span> ' +
        '<span class="why">(7-day change ' + (r.change_7d === null ? 'not recorded' : trim(r.change_7d, 2) + '%') + ')</span><br>' +
        '<span class="op">×</span> ' + trim(r.maturity, 4) + ' <span class="op">maturity</span> ' +
        '<span class="why">(' + ageText + ')</span><br>' +
        '<span class="op">=</span> <span class="result">' + money(r.implied_value_usd) + '</span> <span class="op">implied value</span>';
    } else {
      arith =
        money(r.tvl_usd) + ' <span class="op">TVL</span><br>' +
        '<span class="op">×</span> ' + trim(r.category_multiple, 4) + ' <span class="op">category multiple</span> ' +
        '<span class="why">(' + esc(r.category) + ', fitted on ' + r.category_training_count + ' trading peer' + (r.category_training_count === 1 ? '' : 's') + ', range ' +
        trim(r.multiple_low, 4) + '× to ' + trim(r.multiple_high, 4) + '×)</span><br>' +
        '<span class="op">×</span> ' + trim(r.momentum, 4) + ' <span class="op">momentum</span> ' +
        '<span class="why">(7-day change ' + (r.change_7d === null ? 'not recorded' : trim(r.change_7d, 2) + '%') + ')</span><br>' +
        '<span class="op">×</span> ' + trim(r.maturity, 4) + ' <span class="op">maturity</span> ' +
        '<span class="why">(' + ageText + ')</span><br>' +
        '<span class="op">=</span> <span class="result">' + money(r.implied_value_usd) + '</span> <span class="op">implied value</span>';
    }
    app.innerHTML =
      header() +
      '<a class="back" href="#/">&larr; Back to the board</a>' +
      '<div class="detail-head"><h1>' + esc(r.name) + (r.watchlist ? '<span class="flag">Watchlist</span>' : '') + '</h1>' +
      '<p class="sub">' + esc(r.category) + ' · ' + esc(r.chains.join(', ') || 'no chains recorded') + ' · ' + ageText + '</p></div>' +
      '<div class="figgrid">' +
      '<div class="stat"><div class="value">' + compact(r.tvl_usd) + '</div><div class="label">TVL</div></div>' +
      '<div class="stat"><div class="value">' + compact(r.implied_value_usd) + '</div><div class="label">Implied value</div></div>' +
      '<div class="stat"><div class="value">' + r.launch_odds + ' / 100</div><div class="label">Launch odds</div></div>' +
      '<div class="stat"><div class="value">' + compact(r.implied_low_usd) + ' – ' + compact(r.implied_high_usd) + '</div><div class="label">Value range</div></div>' +
      '<div class="stat"><div class="value">' + (r.change_7d === null ? '—' : trim(r.change_7d, 2) + '%') + '</div><div class="label">TVL change, 7 days</div></div>' +
      '<div class="stat"><div class="value">' + compact(r.farm_cost_low_usd) + ' – ' + compact(r.farm_cost_high_usd) + '</div><div class="label">Farm plan fees</div></div>' +
      '</div>' +
      '<section class="block"><h2>How this price is built</h2><div class="panel padded"><p class="arith">' +
      arith +
      '</p></div></section>' +
      '<section class="block"><h2>Launch odds, term by term</h2><div class="panel padded">' +
      '<table class="terms">' +
      '<tr><td>Category propensity: ' + Math.round(r.category_propensity * 100) + '% of ' + esc(r.category) + ' already carries a token</td><td class="num fig">' + trim(r.odds_terms.category, 1) + ' / 35</td></tr>' +
      '<tr><td>TVL percentile among launch candidates: ' + Math.round(r.tvl_percentile * 100) + 'th</td><td class="num fig">' + trim(r.odds_terms.tvl, 1) + ' / 30</td></tr>' +
      '<tr><td>Age: ' + r.age_used + ' days toward 1,460</td><td class="num fig">' + trim(r.odds_terms.age, 1) + ' / 20</td></tr>' +
      '<tr><td>Momentum: 7-day change in the −20% to +60% band</td><td class="num fig">' + trim(r.odds_terms.momentum, 1) + ' / 15</td></tr>' +
      '<tr class="total"><td>Total launch odds</td><td class="num fig">' + r.launch_odds + ' / 100</td></tr>' +
      '</table></div></section>' +
      '<section class="block"><h2>Farm plan</h2><p class="lede">Six steps, fees ' + compact(r.farm_cost_low_usd) + ' to ' +
      compact(r.farm_cost_high_usd) + ' in total on ' + esc(r.chains[0] || 'its main chain') + '. Actions, costs and times only: no step promises a return.</p>' +
      '<div class="panel padded"><ol class="plan">' + steps + '</ol></div></section>' +
      foot();
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------ routing

  function render() {
    if (!D) {
      app.innerHTML = '<p class="empty">No data yet: run the entry program first; it writes data.js beside the dashboard.</p>';
      return;
    }
    var h = readHash();
    if (h.path.indexOf('/protocol/') === 0) {
      detailView(decodeURIComponent(h.path.slice('/protocol/'.length)));
      return;
    }
    if (h.query.get('watchlist') === '1' && !state.watchlist) state.watchlist = true;
    boardView();
    if (h.path === '/methods') {
      var m = document.getElementById('methods');
      if (m) m.scrollIntoView();
    }
  }

  window.addEventListener('hashchange', render);
  render();
})();
