const MODES = [
  { key: 'comuns_pct', label: 'Vots Comuns', legend: '% Comuns Sumar', type: 'pct', max: 45, decimals: 1, summaryLabel: 'Vots Comuns' },
  { key: 'participacio_pct', label: 'Participació', legend: '% participació', type: 'pct', max: 100, decimals: 1, summaryLabel: 'Participació' },
  { key: 'psc_pct', label: 'PSC', legend: '% PSC', type: 'pct', max: 45, decimals: 1, summaryLabel: 'Vots PSC' },
  { key: 'junts_pct', label: 'Junts', legend: '% Junts', type: 'pct', max: 45, decimals: 1, summaryLabel: 'Vots Junts' },
  { key: 'erc_pct', label: 'ERC', legend: '% ERC', type: 'pct', max: 45, decimals: 1, summaryLabel: 'Vots ERC' },
  { key: 'pp_pct', label: 'PP', legend: '% PP', type: 'pct', max: 35, decimals: 1, summaryLabel: 'Vots PP' },
  { key: 'vox_pct', label: 'VOX', legend: '% VOX', type: 'pct', max: 25, decimals: 1, summaryLabel: 'Vots VOX' },
  { key: 'esquerres_pct', label: 'Bloc esquerres', legend: '% bloc esquerres', type: 'pct', max: 80, decimals: 1, summaryLabel: 'Bloc esquerres' },
  { key: 'independentista_pct', label: 'Bloc indepe.', legend: '% bloc independentista', type: 'pct', max: 80, decimals: 1, summaryLabel: 'Bloc independentista' },
  { key: 'winner', label: 'Guanyador', legend: 'Partit guanyador', type: 'winner', summaryLabel: 'Partit líder' }
];

const PARTY_META = {
  psc:    { name: 'PSC', color: '#ef4444' },
  junts:  { name: 'Junts', color: '#14b8a6' },
  erc:    { name: 'ERC', color: '#f59e0b' },
  comuns: { name: 'Comuns', color: '#a21caf' },
  pp:     { name: 'PP', color: '#2563eb' },
  vox:    { name: 'VOX', color: '#84cc16' },
  cup:    { name: 'CUP', color: '#eab308' },
  ac:     { name: 'AC', color: '#1d4ed8' }
};

const PARTY_ORDER = ['psc', 'junts', 'erc', 'comuns', 'pp', 'vox', 'cup', 'ac'];

const state = {
  rows: [],
  rowsByCode: new Map(),
  geojson: null,
  map: null,
  layer: null,
  activeMode: MODES[0],
  hoveredCode: null,
  selectedCode: null,
  searchIndex: []
};

function getBasePath() {
  const path = window.location.pathname;
  if (path === '/' || path === '') return '';
  return path.endsWith('/') ? path.slice(0, -1) : path.substring(0, path.lastIndexOf('/'));
}

async function fetchJson(relativePath) {
  const base = getBasePath();
  const url = `${base}${relativePath}?v=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`No s'ha pogut carregar ${relativePath} (${res.status})`);
  return res.json();
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function hasValidCode(row) {
  return row && row.codi_municipi !== undefined && row.codi_municipi !== null && row.codi_municipi !== '';
}

function formatNumber(value) {
  return new Intl.NumberFormat('ca-ES').format(Math.round(safeNumber(value)));
}

function formatPct(value, decimals = 1) {
  return `${safeNumber(value).toFixed(decimals).replace('.', ',')}%`;
}

function formatDelta(value, suffix = '', decimals = 1) {
  const n = safeNumber(value);
  const sign = n > 0 ? '+' : '';
  if (suffix === '%') return `${sign}${n.toFixed(decimals).replace('.', ',')}%`;
  return `${sign}${formatNumber(n)}`;
}

function deltaClass(value) {
  const n = safeNumber(value);
  if (n > 0) return 'positive';
  if (n < 0) return 'negative';
  return null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getSequentialColor(value, max) {
  const t = clamp(safeNumber(value) / max, 0, 1);
  const stops = [
    [245, 238, 242],
    [232, 199, 214],
    [214, 144, 173],
    [191, 90, 131],
    [157, 33, 73]
  ];
  const scaled = t * (stops.length - 1);
  const i = Math.floor(scaled);
  const frac = scaled - i;
  const c1 = stops[i];
  const c2 = stops[Math.min(i + 1, stops.length - 1)];
  const rgb = c1.map((v, idx) => Math.round(v + (c2[idx] - v) * frac));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function getWinnerColor(winner) {
  return PARTY_META[winner]?.color || '#d4d4d8';
}

function getFeatureCode(feature) {
  return safeNumber(feature?.properties?.codi_municipi, null);
}

function findTopParty(row) {
  const entries = PARTY_ORDER.map(key => ({
    key,
    votes: safeNumber(row?.[`${key}_vots`]),
    pct: safeNumber(row?.[`${key}_pct`])
  }));
  entries.sort((a, b) => b.votes - a.votes);
  return entries[0] || { key: 'psc', votes: 0, pct: 0 };
}

function getRanking(row) {
  return PARTY_ORDER
    .map(key => ({
      key,
      name: PARTY_META[key].name,
      votes: safeNumber(row?.[`${key}_vots`]),
      pct: safeNumber(row?.[`${key}_pct`])
    }))
    .sort((a, b) => b.votes - a.votes);
}

function rowValue(row, mode) {
  if (!row) return null;
  return row[mode.key];
}

function formatModeValue(row, mode) {
  if (!row) return '—';
  if (mode.type === 'winner') return PARTY_META[row.winner]?.name || '—';
  return formatPct(rowValue(row, mode), mode.decimals ?? 1);
}

function styleFeature(feature) {
  const code = getFeatureCode(feature);
  const row = state.rowsByCode.get(code);
  const mode = state.activeMode;

  let fillColor = '#f6f5f4';
  let fillOpacity = 0.88;

  if (row) {
    if (mode.type === 'winner') {
      fillColor = getWinnerColor(row.winner);
    } else {
      fillColor = getSequentialColor(rowValue(row, mode), mode.max);
    }
  } else {
    fillOpacity = 0.45;
  }

  const isHovered = state.hoveredCode === code;
  const isSelected = state.selectedCode === code;

  return {
    color: isSelected ? '#111827' : isHovered ? '#404040' : '#cfc9c3',
    weight: isSelected ? 2.2 : isHovered ? 1.6 : 0.8,
    fillColor,
    fillOpacity
  };
}

function renderModeButtons() {
  const wrap = document.getElementById('mode-buttons');
  if (!wrap) return;

  wrap.innerHTML = '';

  MODES.forEach(mode => {
    const btn = document.createElement('button');
    btn.className = `mode-btn ${state.activeMode.key === mode.key ? 'active' : ''}`;
    btn.textContent = mode.label;

    btn.addEventListener('click', () => {
      state.activeMode = mode;
      renderModeButtons();
      updateMapStyles();
      updateLegend();
      updateSummary();
      updateHoverCard(state.selectedCode || state.hoveredCode);
    });

    wrap.appendChild(btn);
  });
}

function legendStops(mode) {
  if (mode.type === 'winner') {
    return PARTY_ORDER.map(key => ({
      color: PARTY_META[key].color,
      label: PARTY_META[key].name
    }));
  }

  const max = mode.max;
  const cuts = max === 100
    ? [0, 10, 20, 35, 50, 70, 100]
    : [0, max * 0.05, max * 0.12, max * 0.22, max * 0.40, max * 0.66, max];

  return cuts.map((cut, idx) => ({
    color: getSequentialColor(cut, max),
    label: idx === cuts.length - 1 ? `${Math.round(cut)}+` : `${Math.round(cut)}`
  }));
}

function updateLegend() {
  const mode = state.activeMode;
  const title = document.getElementById('legend-title');
  const scale = document.getElementById('legend-scale');
  const labels = document.getElementById('legend-labels');
  const minEl = document.getElementById('legend-min');
  const maxEl = document.getElementById('legend-max');

  if (!title || !scale || !labels || !minEl || !maxEl) return;

  title.textContent = mode.legend;
  scale.innerHTML = '';
  labels.innerHTML = '';

  const stops = legendStops(mode);
  stops.forEach(stop => {
    const el = document.createElement('div');
    el.className = 'legend-stop';
    el.style.background = stop.color;
    scale.appendChild(el);

    const lab = document.createElement('div');
    lab.textContent = stop.label;
    labels.appendChild(lab);
  });

  if (mode.type === 'winner') {
    minEl.textContent = 'Partits';
    maxEl.textContent = 'Mapa';
  } else {
    minEl.textContent = '0,0%';
    maxEl.textContent = `${safeNumber(mode.max).toFixed(1).replace('.', ',')}%+`;
  }
}

function buildPopup(row) {
  const ranking = getRanking(row).slice(0, 5);

  return `
    <div class="popup-title">${row.municipi || '—'}</div>
    <div class="popup-meta">${row.comarca || '—'} · ${row.provincia || '—'}</div>
    <div class="popup-grid">
      <div><div class="label">Participació</div><div class="value">${formatPct(row.participacio_pct)}</div></div>
      <div><div class="label">Vots vàlids</div><div class="value">${formatNumber(row.vots_valids)}</div></div>
      <div><div class="label">Partit líder</div><div class="value">${PARTY_META[row.winner]?.name || '—'}</div></div>
      <div><div class="label">Indicador actiu</div><div class="value">${formatModeValue(row, state.activeMode)}</div></div>
    </div>
    <div class="popup-ranking">
      ${ranking.map(item => `
        <div class="popup-ranking-row">
          <span>${item.name}</span>
          <strong>${formatPct(item.pct)}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function attachLayerInteractions(feature, layer) {
  const code = getFeatureCode(feature);
  if (code == null) return;

  layer.on({
    mouseover: () => {
      state.hoveredCode = code;
      layer.setStyle(styleFeature(feature));
      updateHoverCard(code);

      if (state.layer) {
        state.layer.eachLayer(l => {
          if (l !== layer && l.feature) {
            l.setStyle(styleFeature(l.feature));
          }
        });
      }
    },
    mouseout: () => {
      if (state.selectedCode !== code) {
        state.hoveredCode = null;
      }
      updateMapStyles();
      updateHoverCard(state.selectedCode);
    },
    click: () => {
      state.selectedCode = code;
      updateMapStyles();
      updateHoverCard(code);
      if (layer.getPopup()) layer.openPopup();
    }
  });

  const row = state.rowsByCode.get(code);
  if (!row) return;

  layer.bindTooltip(`
    <div class="map-tooltip">
      <strong>${row.municipi || '—'}</strong>
      ${row.comarca || '—'} · ${row.provincia || '—'}<br>
      ${state.activeMode.label}: <b>${formatModeValue(row, state.activeMode)}</b>
    </div>
  `, { sticky: true, direction: 'top', opacity: 1 });

  layer.bindPopup(buildPopup(row), { maxWidth: 360 });
}

function updateMapStyles() {
  if (!state.layer) return;

  state.layer.eachLayer(layer => {
    if (!layer.feature) return;

    layer.setStyle(styleFeature(layer.feature));

    const code = getFeatureCode(layer.feature);
    const row = state.rowsByCode.get(code);

    if (row && layer.getTooltip()) {
      layer.setTooltipContent(`
        <div class="map-tooltip">
          <strong>${row.municipi || '—'}</strong>
          ${row.comarca || '—'} · ${row.provincia || '—'}<br>
          ${state.activeMode.label}: <b>${formatModeValue(row, state.activeMode)}</b>
        </div>
      `);
    }

    if (row && layer.getPopup()) {
      layer.setPopupContent(buildPopup(row));
    }
  });
}

function updateHoverCard(code) {
  const card = document.getElementById('hover-card');
  if (!card) return;

  if (!code) {
    card.classList.add('hidden');
    return;
  }

  const row = state.rowsByCode.get(Number(code));
  if (!row) {
    card.classList.add('hidden');
    return;
  }

  const top = findTopParty(row);

  card.innerHTML = `
    <h3>${row.municipi || '—'}</h3>
    <div class="meta">${row.comarca || '—'} · ${row.provincia || '—'}</div>
    <div class="party-badge">
      <span class="party-dot" style="background:${PARTY_META[top.key]?.color || '#999'}"></span>
      Lidera ${PARTY_META[top.key]?.name || '—'}
    </div>
    <div class="hover-grid" style="margin-top:12px">
      <div><div class="k">${state.activeMode.label}</div><div class="v">${formatModeValue(row, state.activeMode)}</div></div>
      <div><div class="k">Participació</div><div class="v">${formatPct(row.participacio_pct)}</div></div>
      <div><div class="k">Vots vàlids</div><div class="v">${formatNumber(row.vots_valids)}</div></div>
      <div><div class="k">Bloc indepe.</div><div class="v">${formatPct(row.independentista_pct)}</div></div>
    </div>
  `;

  card.classList.remove('hidden');
}

function updateSummary() {
  const mode = state.activeMode;
  const rows = state.rows;
  if (!rows.length) return;

  const totalMunicipis = rows.length;
  const withData = rows.filter(r => rowValue(r, mode) !== null && rowValue(r, mode) !== undefined).length;

  const topRow = mode.type === 'winner'
    ? rows.reduce((best, r) => {
        const curr = safeNumber(r?.[`${r.winner}_pct`], -1);
        const bestVal = best ? safeNumber(best?.[`${best.winner}_pct`], -1) : -1;
        return curr > bestVal ? r : best;
      }, null)
    : rows.reduce((best, r) => (
        safeNumber(rowValue(r, mode), -Infinity) > safeNumber(best ? rowValue(best, mode) : -Infinity, -Infinity)
          ? r
          : best
      ), null);

  let mainValue = '—';
  let mainDeltaText = '—';
  let mainDeltaNumber = 0;

  if (mode.type === 'winner') {
    const counts = {};
    rows.forEach(r => {
      if (r?.winner) counts[r.winner] = (counts[r.winner] || 0) + 1;
    });
    const leaderKey = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    mainValue = PARTY_META[leaderKey]?.name || '—';
    mainDeltaText = `${counts[leaderKey] || 0} municipis`;
  } else if (mode.key === 'participacio_pct') {
    const totalCens = rows.reduce((sum, r) => sum + safeNumber(r.cens), 0);
    const totalValids = rows.reduce((sum, r) => sum + safeNumber(r.vots_valids), 0);
    const totalPrevPctWeighted = totalCens > 0
      ? rows.reduce((sum, r) => sum + (safeNumber(r.participacio_2021_pct) * safeNumber(r.cens)), 0) / totalCens
      : 0;

    const pct = totalCens > 0 ? (totalValids / totalCens) * 100 : 0;
    mainValue = formatPct(pct);
    mainDeltaNumber = pct - totalPrevPctWeighted;
    mainDeltaText = formatDelta(mainDeltaNumber, '%');
  } else {
    const votesKey = mode.key.replace('_pct', '_vots');
    const deltaKey = mode.key.replace('_pct', '_delta_vots');

    const totalVotes = rows.reduce((sum, r) => sum + safeNumber(r[votesKey]), 0);
    const totalDelta = rows.reduce((sum, r) => sum + safeNumber(r[deltaKey]), 0);

    mainValue = formatNumber(totalVotes);
    mainDeltaNumber = totalDelta;
    mainDeltaText = formatDelta(totalDelta);
  }

  const mainLabelEl = document.getElementById('summary-main-label');
  const mainValueEl = document.getElementById('summary-main-value');
  const mainDeltaEl = document.getElementById('summary-main-delta');
  const partValueEl = document.getElementById('summary-participacio-value');
  const partDeltaEl = document.getElementById('summary-participacio-delta');
  const municipisValueEl = document.getElementById('summary-municipis-value');
  const municipisShareEl = document.getElementById('summary-municipis-share');
  const liderValueEl = document.getElementById('summary-lider-value');
  const liderSubEl = document.getElementById('summary-lider-sub');
  const liderPctEl = document.getElementById('summary-lider-pct');

  if (mainLabelEl) mainLabelEl.textContent = mode.summaryLabel;
  if (mainValueEl) mainValueEl.textContent = mainValue;
  if (mainDeltaEl) {
    mainDeltaEl.textContent = mainDeltaText;
    mainDeltaEl.className = `delta ${deltaClass(mainDeltaNumber) || ''}`.trim();
  }

  const totalCens = rows.reduce((sum, r) => sum + safeNumber(r.cens), 0);
  const totalValids = rows.reduce((sum, r) => sum + safeNumber(r.vots_valids), 0);
  const totalPrevPctWeighted = totalCens > 0
    ? rows.reduce((sum, r) => sum + (safeNumber(r.participacio_2021_pct) * safeNumber(r.cens)), 0) / totalCens
    : 0;
  const partPct = totalCens > 0 ? (totalValids / totalCens) * 100 : 0;
  const partDeltaNum = partPct - totalPrevPctWeighted;

  if (partValueEl) partValueEl.textContent = formatPct(partPct);
  if (partDeltaEl) {
    partDeltaEl.textContent = formatDelta(partDeltaNum, '%');
    partDeltaEl.className = `delta ${deltaClass(partDeltaNum) || ''}`.trim();
  }

  if (municipisValueEl) municipisValueEl.textContent = formatNumber(withData);
  if (municipisShareEl) municipisShareEl.textContent = `${withData}/${totalMunicipis}`;

  if (topRow) {
    if (liderValueEl) liderValueEl.textContent = topRow.municipi || '—';
    if (liderSubEl) {
      liderSubEl.textContent = `${topRow.comarca || '—'} · ${
        state.activeMode.type === 'winner'
          ? (PARTY_META[topRow.winner]?.name || '—')
          : state.activeMode.label
      }`;
    }
    if (liderPctEl) {
      liderPctEl.textContent = state.activeMode.type === 'winner'
        ? formatPct(topRow?.[`${topRow.winner}_pct`] || 0)
        : formatModeValue(topRow, mode);
    }
  }
}

function buildPartyCards() {
  const container = document.getElementById('party-cards');
  const template = document.getElementById('party-card-template');
  if (!container || !template) return;

  container.innerHTML = '';

  const totalValids = state.rows.reduce((sum, r) => sum + safeNumber(r.vots_valids), 0);

  const summaries = PARTY_ORDER.map(key => {
    const votes = state.rows.reduce((sum, r) => sum + safeNumber(r[`${key}_vots`]), 0);
    const deltaVotes = state.rows.reduce((sum, r) => sum + safeNumber(r[`${key}_delta_vots`]), 0);
    const pct = totalValids > 0 ? (votes / totalValids) * 100 : 0;
    const prevVotes = votes - deltaVotes;
    const prevPct = totalValids > 0 ? (prevVotes / totalValids) * 100 : 0;
    const wins = state.rows.filter(r => r.winner === key).length;
    const prevWins = state.rows.filter(r => r.winner_2021 === key).length;

    return { key, votes, prevVotes, pct, prevPct, wins, prevWins };
  }).sort((a, b) => b.votes - a.votes);

  summaries.forEach(item => {
    const node = template.content.firstElementChild.cloneNode(true);
    const party = PARTY_META[item.key];

    node.style.borderColor = party.color;

    const partyNameEl = node.querySelector('.party-name');
    if (partyNameEl) {
      partyNameEl.textContent = party.name;
      partyNameEl.style.color = party.color;
    }

    const winsEl = node.querySelector('.metric-wins');
    const winsDeltaEl = node.querySelector('.metric-wins-delta');
    const votesEl = node.querySelector('.metric-votes');
    const votesDeltaEl = node.querySelector('.metric-votes-delta');
    const pctEl = node.querySelector('.metric-pct');
    const pctDeltaEl = node.querySelector('.metric-pct-delta');

    const winsDelta = item.wins - item.prevWins;
    const voteDelta = item.votes - item.prevVotes;
    const pctDelta = item.pct - item.prevPct;

    if (winsEl) winsEl.textContent = formatNumber(item.wins);
    if (winsDeltaEl) {
      winsDeltaEl.textContent = formatDelta(winsDelta);
      const cls = deltaClass(winsDelta);
      if (cls) winsDeltaEl.classList.add(cls);
    }

    if (votesEl) votesEl.textContent = formatNumber(item.votes);
    if (votesDeltaEl) {
      votesDeltaEl.textContent = formatDelta(voteDelta);
      const cls = deltaClass(voteDelta);
      if (cls) votesDeltaEl.classList.add(cls);
    }

    if (pctEl) pctEl.textContent = formatPct(item.pct);
    if (pctDeltaEl) {
      pctDeltaEl.textContent = formatDelta(pctDelta, '%');
      const cls = deltaClass(pctDelta);
      if (cls) pctDeltaEl.classList.add(cls);
    }

    container.appendChild(node);
  });
}

function fitToCatalonia() {
  if (!state.layer || !state.map) return;
  state.map.fitBounds(state.layer.getBounds(), { padding: [18, 18] });
}

function buildSearchIndex() {
  const items = [];

  state.rows.forEach(row => {
    if (!row || !hasValidCode(row)) return;

    items.push({
      type: 'municipi',
      label: row.municipi || '—',
      subtitle: `${row.comarca || '—'} · ${row.provincia || '—'}`,
      code: row.codi_municipi
    });
  });

  const comarcaSet = new Map();
  state.rows.forEach(row => {
    if (!row?.comarca) return;
    if (!comarcaSet.has(row.comarca)) {
      comarcaSet.set(row.comarca, {
        type: 'comarca',
        label: row.comarca,
        subtitle: row.provincia || '—',
        rows: []
      });
    }
    comarcaSet.get(row.comarca).rows.push(row.codi_municipi);
  });

  const provSet = new Map();
  state.rows.forEach(row => {
    if (!row?.provincia) return;
    if (!provSet.has(row.provincia)) {
      provSet.set(row.provincia, {
        type: 'provincia',
        label: row.provincia,
        subtitle: 'Província',
        rows: []
      });
    }
    provSet.get(row.provincia).rows.push(row.codi_municipi);
  });

  state.searchIndex = items.concat([...comarcaSet.values()], [...provSet.values()]);
}

function renderSearchResults(matches) {
  const box = document.getElementById('search-results');
  if (!box) return;

  if (!matches.length) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }

  box.innerHTML = matches.slice(0, 10).map(item => `
    <div class="search-item" data-type="${item.type}" data-code="${item.code || ''}" data-label="${item.label}">
      <strong>${item.label}</strong>
      <span>${item.type} · ${item.subtitle}</span>
    </div>
  `).join('');

  box.classList.remove('hidden');

  box.querySelectorAll('.search-item').forEach(el => {
    el.addEventListener('click', () => {
      const type = el.dataset.type;
      const label = el.dataset.label;

      if (type === 'municipi') {
        focusMunicipi(Number(el.dataset.code));
      } else {
        focusGroup(type, label);
      }

      box.classList.add('hidden');

      const input = document.getElementById('search-input');
      if (input) input.value = label;
    });
  });
}

function focusMunicipi(code) {
  if (!state.layer || !state.map) return;

  let targetLayer = null;

  state.layer.eachLayer(layer => {
    if (getFeatureCode(layer.feature) === code) targetLayer = layer;
  });

  if (targetLayer) {
    state.selectedCode = code;
    updateMapStyles();
    state.map.fitBounds(targetLayer.getBounds(), { padding: [40, 40], maxZoom: 11 });
    if (targetLayer.getPopup()) targetLayer.openPopup();
    updateHoverCard(code);
  }
}

function focusGroup(type, label) {
  if (!state.layer || !state.map) return;

  const codes = state.rows
    .filter(r => r?.[type] === label)
    .map(r => r.codi_municipi);

  let bounds = null;

  state.layer.eachLayer(layer => {
    if (codes.includes(getFeatureCode(layer.feature))) {
      bounds = bounds ? bounds.extend(layer.getBounds()) : layer.getBounds();
    }
  });

  if (bounds) {
    state.selectedCode = null;
    updateMapStyles();
    state.map.fitBounds(bounds, { padding: [30, 30] });

    const hoverCard = document.getElementById('hover-card');
    if (hoverCard) hoverCard.classList.add('hidden');
  }
}

function bindSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();

    if (!q) {
      renderSearchResults([]);
      return;
    }

    const matches = state.searchIndex.filter(item =>
      (item.label || '').toLowerCase().includes(q) ||
      (item.subtitle || '').toLowerCase().includes(q)
    );

    renderSearchResults(matches);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-card')) {
      const results = document.getElementById('search-results');
      if (results) results.classList.add('hidden');
    }
  });
}

function bindPanelToggle() {
  const btn = document.getElementById('panel-toggle');
  const panel = document.getElementById('right-panel');
  if (!btn || !panel) return;

  const sync = () => {
    const collapsed = panel.classList.contains('collapsed');
    btn.textContent = collapsed ? '❮' : '❯';
    btn.setAttribute('aria-expanded', String(!collapsed));
  };

  sync();

  btn.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    sync();
  });
}

function createMap() {
  const mapEl = document.getElementById('map');
  if (!mapEl) throw new Error("Falta l'element #map");

  state.map = L.map('map', {
    zoomControl: true,
    attributionControl: false,
    minZoom: 7,
    maxZoom: 12,
    preferCanvas: true
  });

  state.layer = L.geoJSON(state.geojson, {
    style: styleFeature,
    onEachFeature: attachLayerInteractions
  }).addTo(state.map);

  fitToCatalonia();

  state.map.on('click', () => {
    state.selectedCode = null;
    updateMapStyles();
    updateHoverCard(state.hoveredCode);
  });
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];

  return rows
    .filter(row => hasValidCode(row))
    .map(row => ({
      ...row,
      codi_municipi: safeNumber(row.codi_municipi),
      cens: safeNumber(row.cens),
      abstencio: safeNumber(row.abstencio),
      vots_candidatures: safeNumber(row.vots_candidatures),
      vots_valids: safeNumber(row.vots_valids),
      participacio_pct: safeNumber(row.participacio_pct),
      participacio_2021_pct: safeNumber(row.participacio_2021_pct),
      psc_vots: safeNumber(row.psc_vots),
      psc_pct: safeNumber(row.psc_pct),
      psc_delta_vots: safeNumber(row.psc_delta_vots),
      junts_vots: safeNumber(row.junts_vots),
      junts_pct: safeNumber(row.junts_pct),
      junts_delta_vots: safeNumber(row.junts_delta_vots),
      erc_vots: safeNumber(row.erc_vots),
      erc_pct: safeNumber(row.erc_pct),
      erc_delta_vots: safeNumber(row.erc_delta_vots),
      pp_vots: safeNumber(row.pp_vots),
      pp_pct: safeNumber(row.pp_pct),
      pp_delta_vots: safeNumber(row.pp_delta_vots),
      vox_vots: safeNumber(row.vox_vots),
      vox_pct: safeNumber(row.vox_pct),
      vox_delta_vots: safeNumber(row.vox_delta_vots),
      comuns_vots: safeNumber(row.comuns_vots),
      comuns_pct: safeNumber(row.comuns_pct),
      comuns_delta_vots: safeNumber(row.comuns_delta_vots),
      cup_vots: safeNumber(row.cup_vots),
      cup_pct: safeNumber(row.cup_pct),
      cup_delta_vots: safeNumber(row.cup_delta_vots),
      ac_vots: safeNumber(row.ac_vots),
      ac_pct: safeNumber(row.ac_pct),
      ac_delta_vots: safeNumber(row.ac_delta_vots),
      esquerres_pct: safeNumber(row.esquerres_pct),
      independentista_pct: safeNumber(row.independentista_pct),
      winner: row.winner || findTopParty(row).key,
      winner_2021: row.winner_2021 || null
    }));
}

function debugDataMatch() {
  const geoFeatures = state.geojson?.features || [];
  const geoCodes = geoFeatures
    .map(f => getFeatureCode(f))
    .filter(v => v !== null);

  const rowCodes = state.rows.map(r => r.codi_municipi);
  const matched = geoCodes.filter(code => state.rowsByCode.has(code));

  console.log('DEBUG GEOJSON features:', geoFeatures.length);
  console.log('DEBUG rows JSON:', state.rows.length);
  console.log('DEBUG geo codes sample:', geoCodes.slice(0, 10));
  console.log('DEBUG row codes sample:', rowCodes.slice(0, 10));
  console.log('DEBUG matched codes:', matched.length);

  const debugEl = document.getElementById('summary-main-delta');
  if (debugEl) {
    debugEl.textContent = `match ${matched.length}/${geoFeatures.length}`;
  }
}

async function init() {
  try {
    const [geojson, rawRows] = await Promise.all([
      fetchJson('/data/base.geojson'),
      fetchJson('/data/dades_municipals.json')
    ]);

    state.geojson = geojson;
    state.rows = normalizeRows(rawRows);
    state.rowsByCode.clear();

    state.rows.forEach(row => {
      state.rowsByCode.set(row.codi_municipi, row);
    });

    debugDataMatch();

    renderModeButtons();
    updateLegend();
    buildPartyCards();
    buildSearchIndex();
    bindSearch();
    bindPanelToggle();
    createMap();
    updateSummary();
  } catch (error) {
    console.error(error);
    alert(`No s’han pogut carregar les dades.\n\n${error.message}`);
  }
}

init();
