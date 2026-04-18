
const MODES = [
  { key: 'comuns_pct', label: 'Vots Comuns', legend: '% Comuns Sumar', type: 'pct', max: 45, decimals: 1, summaryLabel: 'Vots Comuns', accentParty: 'comuns' },
  { key: 'participacio_pct', label: 'Participació', legend: '% participació', type: 'pct', max: 100, decimals: 1, summaryLabel: 'Participació', accentParty: 'comuns' },
  { key: 'psc_pct', label: 'PSC', legend: '% PSC', type: 'pct', max: 45, decimals: 1, summaryLabel: 'Vots PSC', accentParty: 'psc' },
  { key: 'junts_pct', label: 'Junts', legend: '% Junts', type: 'pct', max: 45, decimals: 1, summaryLabel: 'Vots Junts', accentParty: 'junts' },
  { key: 'erc_pct', label: 'ERC', legend: '% ERC', type: 'pct', max: 45, decimals: 1, summaryLabel: 'Vots ERC', accentParty: 'erc' },
  { key: 'pp_pct', label: 'PP', legend: '% PP', type: 'pct', max: 35, decimals: 1, summaryLabel: 'Vots PP', accentParty: 'pp' },
  { key: 'vox_pct', label: 'VOX', legend: '% VOX', type: 'pct', max: 25, decimals: 1, summaryLabel: 'Vots VOX', accentParty: 'vox' },
  { key: 'esquerres_pct', label: 'Bloc esquerres', legend: '% bloc esquerres', type: 'pct', max: 80, decimals: 1, summaryLabel: 'Bloc esquerres', accentParty: 'psc' },
  { key: 'independentista_pct', label: 'Bloc indepe.', legend: '% bloc independentista', type: 'pct', max: 80, decimals: 1, summaryLabel: 'Bloc independentista', accentParty: 'junts' },
  { key: 'winner', label: 'Guanyador', legend: 'Partit guanyador', type: 'winner', summaryLabel: 'Partit líder', accentParty: 'comuns' },
];

const PARTY_META = {
  psc:    { name: 'PSC', color: '#ef4444' },
  junts:  { name: 'Junts', color: '#14b8a6' },
  erc:    { name: 'ERC', color: '#f59e0b' },
  comuns: { name: 'Comuns', color: '#a21caf' },
  pp:     { name: 'PP', color: '#2563eb' },
  vox:    { name: 'VOX', color: '#84cc16' },
  cup:    { name: 'CUP', color: '#eab308' },
  ac:     { name: 'AC', color: '#1d4ed8' },
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
  searchIndex: [],
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

function formatNumber(value) {
  return new Intl.NumberFormat('ca-ES').format(Math.round(value));
}
function formatPct(value, decimals = 1) {
  return `${Number(value).toFixed(decimals).replace('.', ',')}%`;
}
function formatDelta(value, suffix = '', decimals = 1) {
  const n = Number(value || 0);
  const sign = n > 0 ? '+' : '';
  if (suffix === '%') return `${sign}${n.toFixed(decimals).replace('.', ',')}%`;
  return `${sign}${formatNumber(n)}`;
}
function deltaClass(value) {
  if (Number(value) > 0) return 'positive';
  if (Number(value) < 0) return 'negative';
  return '';
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function getSequentialColor(value, max) {
  const t = clamp((Number(value) || 0) / max, 0, 1);
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
  return Number(feature.properties.codi_municipi);
}
function findTopParty(row) {
  const entries = PARTY_ORDER.map(key => ({ key, votes: row[`${key}_vots`] || 0, pct: row[`${key}_pct`] || 0 }));
  entries.sort((a,b)=> b.votes - a.votes);
  return entries[0];
}
function getRanking(row) {
  return PARTY_ORDER
    .map(key => ({ key, name: PARTY_META[key].name, votes: row[`${key}_vots`] || 0, pct: row[`${key}_pct`] || 0 }))
    .sort((a,b)=> b.votes - a.votes);
}
function rowValue(row, mode) {
  if (!row) return null;
  return row[mode.key];
}
function styleFeature(feature) {
  const row = state.rowsByCode.get(getFeatureCode(feature));
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
    fillOpacity = 0.5;
  }

  const isHovered = state.hoveredCode === getFeatureCode(feature);
  const isSelected = state.selectedCode === getFeatureCode(feature);

  return {
    color: isSelected ? '#111827' : isHovered ? '#404040' : '#cfc9c3',
    weight: isSelected ? 2.2 : isHovered ? 1.6 : 0.8,
    fillColor,
    fillOpacity
  };
}

function renderModeButtons() {
  const wrap = document.getElementById('mode-buttons');
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
    return PARTY_ORDER.slice(0,7).map(key => ({ color: PARTY_META[key].color, label: PARTY_META[key].name }));
  }
  const max = mode.max;
  const cuts = max === 100 ? [0, 10, 20, 35, 50, 70, 100] : [0, max*0.05, max*0.12, max*0.22, max*0.40, max*0.66, max];
  return cuts.map((cut, idx) => ({
    color: getSequentialColor(cut, max),
    label: idx === cuts.length - 1 ? `${Math.round(cut)}+` : `${Math.round(cut)}`
  }));
}

function updateLegend() {
  const mode = state.activeMode;
  document.getElementById('legend-title').textContent = mode.legend;
  const scale = document.getElementById('legend-scale');
  const labels = document.getElementById('legend-labels');
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
    document.getElementById('legend-min').textContent = 'Partits';
    document.getElementById('legend-max').textContent = 'Mapa';
  } else {
    document.getElementById('legend-min').textContent = '0,0%';
    document.getElementById('legend-max').textContent = `${Number(mode.max).toFixed(1).replace('.', ',')}%+`;
  }
}

function attachLayerInteractions(layer, feature) {
  const code = getFeatureCode(feature);
  layer.on({
    mouseover: () => {
      state.hoveredCode = code;
      layer.setStyle(styleFeature(feature));
      updateHoverCard(code);
      if (state.layer) state.layer.eachLayer(l => {
        if (l !== layer && l.feature) {
          l.setStyle(styleFeature(l.feature));
        }
      });
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
      updateHoverCard(code, true);
      layer.openPopup();
    }
  });

  const row = state.rowsByCode.get(code);
  if (row) {
    layer.bindTooltip(`
      <div class="map-tooltip">
        <strong>${row.municipi}</strong>
        ${row.comarca} · ${row.provincia}<br>
        ${state.activeMode.label}: <b>${formatModeValue(row, state.activeMode)}</b>
      </div>
    `, { sticky: true, direction: 'top', opacity: 1 });

    layer.bindPopup(buildPopup(row), { maxWidth: 360 });
  }
}

function buildPopup(row) {
  const ranking = getRanking(row).slice(0,5);
  return `
    <div class="popup-title">${row.municipi}</div>
    <div class="popup-meta">${row.comarca} · ${row.provincia}</div>
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

function formatModeValue(row, mode) {
  if (!row) return '—';
  if (mode.type === 'winner') return PARTY_META[row.winner]?.name || '—';
  return formatPct(rowValue(row, mode), mode.decimals ?? 1);
}

function updateMapStyles() {
  if (!state.layer) return;
  state.layer.eachLayer(layer => {
    if (layer.feature) {
      layer.setStyle(styleFeature(layer.feature));
      const row = state.rowsByCode.get(getFeatureCode(layer.feature));
      if (row && layer.getTooltip()) {
        layer.setTooltipContent(`
          <div class="map-tooltip">
            <strong>${row.municipi}</strong>
            ${row.comarca} · ${row.provincia}<br>
            ${state.activeMode.label}: <b>${formatModeValue(row, state.activeMode)}</b>
          </div>
        `);
      }
      if (row && layer.getPopup()) {
        layer.setPopupContent(buildPopup(row));
      }
    }
  });
}

function updateHoverCard(code) {
  const card = document.getElementById('hover-card');
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
    <h3>${row.municipi}</h3>
    <div class="meta">${row.comarca} · ${row.provincia}</div>
    <div class="party-badge"><span class="party-dot" style="background:${PARTY_META[top.key].color}"></span> Lidera ${PARTY_META[top.key].name}</div>
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
  const totalMunicipis = rows.length;
  const withData = rows.filter(r => rowValue(r, mode) !== null && rowValue(r, mode) !== undefined).length;
  const topRow = mode.type === 'winner'
    ? rows.reduce((best, r) => {
        const curr = r[`${r.winner}_pct`] || 0;
        const bestVal = best ? (best[`${best.winner}_pct`] || 0) : -1;
        return curr > bestVal ? r : best;
      }, null)
    : rows.reduce((best, r) => (rowValue(r, mode) > (best ? rowValue(best, mode) : -Infinity) ? r : best), null);

  let mainValue = '—';
  let mainDelta = '—';
  if (mode.type === 'winner') {
    const counts = {};
    rows.forEach(r => counts[r.winner] = (counts[r.winner] || 0) + 1);
    const leaderKey = Object.entries(counts).sort((a,b)=> b[1]-a[1])[0]?.[0];
    mainValue = PARTY_META[leaderKey]?.name || '—';
    mainDelta = `${counts[leaderKey] || 0} municipis`;
  } else if (mode.key === 'participacio_pct') {
    const totalCens = rows.reduce((sum, r) => sum + r.cens, 0);
    const totalValids = rows.reduce((sum, r) => sum + r.vots_valids, 0);
    const totalPrevPctWeighted = rows.reduce((sum, r) => sum + ((r.participacio_2021_pct || 0) * r.cens), 0) / totalCens;
    const pct = totalValids / totalCens * 100;
    mainValue = formatPct(pct);
    mainDelta = formatDelta(pct - totalPrevPctWeighted, '%');
  } else {
    const votesKey = mode.key.replace('_pct', '_vots');
    const deltaKey = mode.key.replace('_pct', '_delta_vots');
    const totalVotes = rows.reduce((sum, r) => sum + (r[votesKey] || 0), 0);
    const totalDelta = rows.reduce((sum, r) => sum + (r[deltaKey] || 0), 0);
    mainValue = formatNumber(totalVotes);
    mainDelta = formatDelta(totalDelta);
  }

  document.getElementById('summary-main-label').textContent = mode.summaryLabel;
  const mainDeltaEl = document.getElementById('summary-main-delta');
  mainDeltaEl.textContent = mainDelta;
  mainDeltaEl.className = `delta ${deltaClass(mainDelta.replace(/[^\d\-+,]/g, '').replace(',', '.'))}`;
  document.getElementById('summary-main-value').textContent = mainValue;

  const totalCens = rows.reduce((sum, r) => sum + r.cens, 0);
  const totalValids = rows.reduce((sum, r) => sum + r.vots_valids, 0);
  const totalPrevPctWeighted = rows.reduce((sum, r) => sum + ((r.participacio_2021_pct || 0) * r.cens), 0) / totalCens;
  const partPct = totalValids / totalCens * 100;
  document.getElementById('summary-participacio-value').textContent = formatPct(partPct);
  const partDelta = document.getElementById('summary-participacio-delta');
  partDelta.textContent = formatDelta(partPct - totalPrevPctWeighted, '%');
  partDelta.className = `delta ${deltaClass(partPct - totalPrevPctWeighted)}`;

  document.getElementById('summary-municipis-value').textContent = formatNumber(withData);
  document.getElementById('summary-municipis-share').textContent = `${withData}/${totalMunicipis}`;

  if (topRow) {
    document.getElementById('summary-lider-value').textContent = topRow.municipi;
    document.getElementById('summary-lider-sub').textContent = `${topRow.comarca} · ${state.activeMode.type === 'winner' ? PARTY_META[topRow.winner]?.name : state.activeMode.label}`;
    document.getElementById('summary-lider-pct').textContent = state.activeMode.type === 'winner'
      ? formatPct(topRow[`${topRow.winner}_pct`] || 0)
      : formatModeValue(topRow, mode);
  }
}

function buildPartyCards() {
  const container = document.getElementById('party-cards');
  const template = document.getElementById('party-card-template');
  container.innerHTML = '';

  const totalValids = state.rows.reduce((sum, r) => sum + r.vots_valids, 0);

  const summaries = PARTY_ORDER.map(key => {
    const votes = state.rows.reduce((sum, r) => sum + (r[`${key}_vots`] || 0), 0);
    const prevVotes = state.rows.reduce((sum, r) => sum + ((r[`${key}_vots`] || 0) - (r[`${key}_delta_vots`] || 0)), 0);
    const pct = totalValids ? votes / totalValids * 100 : 0;
    const prevPctWeightedVotes = state.rows.reduce((sum, r) => sum + (((r[`${key}_vots`] || 0) - (r[`${key}_delta_vots`] || 0))), 0);
    const prevPct = totalValids ? prevPctWeightedVotes / totalValids * 100 : 0;
    const wins = state.rows.filter(r => r.winner === key).length;
    const prevWins = state.rows.filter(r => r.winner_2021 === key).length;
    return {
      key,
      votes,
      prevVotes,
      pct,
      prevPct,
      wins,
      prevWins
    };
  }).sort((a,b) => b.votes - a.votes);

  summaries.forEach(item => {
    const node = template.content.firstElementChild.cloneNode(true);
    const party = PARTY_META[item.key];
    node.style.borderColor = party.color;
    node.querySelector('.party-name').textContent = party.name;
    node.querySelector('.party-name').style.color = party.color;

    node.querySelector('.metric-wins').textContent = formatNumber(item.wins);
    const winsDelta = item.wins - item.prevWins;
    const winsDeltaEl = node.querySelector('.metric-wins-delta');
    winsDeltaEl.textContent = formatDelta(winsDelta);
    winsDeltaEl.classList.add(deltaClass(winsDelta));

    node.querySelector('.metric-votes').textContent = formatNumber(item.votes);
    const voteDelta = item.votes - item.prevVotes;
    const votesDeltaEl = node.querySelector('.metric-votes-delta');
    votesDeltaEl.textContent = formatDelta(voteDelta);
    votesDeltaEl.classList.add(deltaClass(voteDelta));

    node.querySelector('.metric-pct').textContent = formatPct(item.pct);
    const pctDelta = item.pct - item.prevPct;
    const pctDeltaEl = node.querySelector('.metric-pct-delta');
    pctDeltaEl.textContent = formatDelta(pctDelta, '%');
    pctDeltaEl.classList.add(deltaClass(pctDelta));

    container.appendChild(node);
  });
}

function fitToCatalonia() {
  if (!state.layer) return;
  state.map.fitBounds(state.layer.getBounds(), { padding: [18,18] });
}

function buildSearchIndex() {
  const items = [];
  state.rows.forEach(row => {
    items.push({
      type: 'municipi',
      label: row.municipi,
      subtitle: `${row.comarca} · ${row.provincia}`,
      code: row.codi_municipi
    });
  });

  const comarcaSet = new Map();
  state.rows.forEach(row => {
    if (!comarcaSet.has(row.comarca)) {
      comarcaSet.set(row.comarca, { type: 'comarca', label: row.comarca, subtitle: row.provincia, rows: [] });
    }
    comarcaSet.get(row.comarca).rows.push(row.codi_municipi);
  });

  const provSet = new Map();
  state.rows.forEach(row => {
    if (!provSet.has(row.provincia)) {
      provSet.set(row.provincia, { type: 'provincia', label: row.provincia, subtitle: 'Província', rows: [] });
    }
    provSet.get(row.provincia).rows.push(row.codi_municipi);
  });

  state.searchIndex = items.concat([...comarcaSet.values()], [...provSet.values()]);
}

function renderSearchResults(matches) {
  const box = document.getElementById('search-results');
  if (!matches.length) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.innerHTML = matches.slice(0,10).map(item => `
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
      document.getElementById('search-input').value = label;
    });
  });
}

function focusMunicipi(code) {
  let targetLayer = null;
  state.layer.eachLayer(layer => {
    if (getFeatureCode(layer.feature) === code) targetLayer = layer;
  });
  if (targetLayer) {
    state.selectedCode = code;
    updateMapStyles();
    state.map.fitBounds(targetLayer.getBounds(), { padding:[40,40], maxZoom: 11 });
    targetLayer.openPopup();
    updateHoverCard(code, true);
  }
}

function focusGroup(type, label) {
  const codes = state.rows
    .filter(r => r[type] === label)
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
    state.map.fitBounds(bounds, { padding:[30,30] });
    document.getElementById('hover-card').classList.add('hidden');
  }
}

function bindSearch() {
  const input = document.getElementById('search-input');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      renderSearchResults([]);
      return;
    }
    const matches = state.searchIndex.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.subtitle.toLowerCase().includes(q)
    );
    renderSearchResults(matches);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-card')) {
      document.getElementById('search-results').classList.add('hidden');
    }
  });
}

function bindPanelToggle() {
  const btn = document.getElementById('panel-toggle');
  const panel = document.getElementById('right-panel');
  btn.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    btn.classList.toggle('collapsed');
    const collapsed = panel.classList.contains('collapsed');
    btn.textContent = collapsed ? '❮' : '❯';
    btn.setAttribute('aria-expanded', String(!collapsed));
  });
}

function createMap() {
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

async function init() {
  try {
    const [geojson, rows] = await Promise.all([
      fetchJson('/data/base.geojson'),
      fetchJson('/data/dades_municipals.json')
    ]);

    state.geojson = geojson;
    state.rows = rows;
    rows.forEach(row => state.rowsByCode.set(Number(row.codi_municipi), row));

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
