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
  psc: { name: 'PSC', color: '#ef4444' },
  junts: { name: 'Junts', color: '#14b8a6' },
  erc: { name: 'ERC', color: '#f59e0b' },
  comuns: { name: 'Comuns', color: '#a21caf' },
  pp: { name: 'PP', color: '#2563eb' },
  vox: { name: 'VOX', color: '#84cc16' },
  cup: { name: 'CUP', color: '#eab308' },
  ac: { name: 'AC', color: '#1d4ed8' }
};

const PARTY_ORDER = ['psc', 'junts', 'erc', 'comuns', 'pp', 'vox', 'cup', 'ac'];

const LEVELS = {
  catalunya: {
    geojson: 'data/catalunya.geojson',
    dades: 'data/dades_catalunya.json',
    featureKey: null,
    labelField: null
  },
  vegueries: {
    geojson: 'data/vegueries.geojson',
    dades: 'data/dades_vegueries.json',
    featureKey: 'CODIVEGUE',
    labelField: 'NOMVEGUE'
  },
  provincies: {
    geojson: 'data/provincies.geojson',
    dades: 'data/dades_provincies.json',
    featureKey: 'CODIPROV',
    labelField: 'NOMPROV'
  },
  comarques: {
    geojson: 'data/comarques.geojson',
    dades: 'data/dades_comarques.json',
    featureKey: 'CODICOMAR',
    labelField: 'NOMCOMAR'
  },
  municipis: {
    geojson: 'data/municipis.geojson',
    dades: 'data/dades_municipis.json',
    featureKey: 'CODIMUNI',
    labelField: 'NOMMUNI'
  },
  seccions: {
    geojson: 'data/seccions.geojson',
    dades: 'data/dades_seccions.json',
    featureKey: 'codisecc',
    labelField: 'codisecc'
  }
};

const state = {
  map: null,
  activeMode: MODES[0],
  currentLevel: null,
  activeLayer: null,
  hoveredId: null,
  selectedId: null,
  searchIndex: [],
  levelData: {},
  levelDataMaps: {},
  levelGeojsons: {},
  levelLayers: {}
};

function getBasePath() {
  const path = window.location.pathname;
  if (path === '/' || path === '') return '';
  return path.endsWith('/') ? path.slice(0, -1) : path.substring(0, path.lastIndexOf('/'));
}

async function fetchJson(relativePath) {
  const base = getBasePath();
  const url = `${base}/${relativePath}`.replace(/([^:]\/)\/+/g, '$1');
  const res = await fetch(`${url}?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`No s'ha pogut carregar ${relativePath} (${res.status})`);
  return res.json();
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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
  return '';
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

function getLevelByZoom(z) {
  if (z < 7.5) return 'catalunya';
  if (z < 8.5) return 'vegueries';
  if (z < 9.5) return 'provincies';
  if (z < 10.5) return 'comarques';
  if (z < 12) return 'municipis';
  return 'seccions';
}

function getFeatureId(level, feature) {
  if (level === 'catalunya') return 'CAT';
  const key = LEVELS[level].featureKey;
  return feature?.properties?.[key] ?? null;
}

function getFeatureLabel(level, feature) {
  if (level === 'catalunya') return 'Catalunya';
  const field = LEVELS[level].labelField;
  return feature?.properties?.[field] || feature?.properties?.NOMMUNI || feature?.properties?.NOMCOMAR || feature?.properties?.NOMPROV || feature?.properties?.NOMVEGUE || getFeatureId(level, feature);
}

function getRow(level, id) {
  return state.levelDataMaps[level]?.get(String(id)) || null;
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

function findTopParty(row) {
  const entries = PARTY_ORDER.map(key => ({
    key,
    votes: safeNumber(row?.[`${key}_vots`]),
    pct: safeNumber(row?.[`${key}_pct`])
  })).sort((a, b) => b.votes - a.votes);
  return entries[0] || { key: 'psc', votes: 0, pct: 0 };
}

function getRanking(row) {
  return PARTY_ORDER.map(key => ({
    key,
    name: PARTY_META[key].name,
    votes: safeNumber(row?.[`${key}_vots`]),
    pct: safeNumber(row?.[`${key}_pct`])
  })).sort((a, b) => b.votes - a.votes);
}

function styleFeatureFactory(level) {
  return function(feature) {
    const id = getFeatureId(level, feature);
    const row = getRow(level, id);
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
      fillOpacity = 0.40;
    }

    const isHovered = state.hoveredId === `${level}:${id}`;
    const isSelected = state.selectedId === `${level}:${id}`;

    return {
      color: isSelected ? '#111827' : isHovered ? '#2f241a' : '#cfc9c3',
      weight: level === 'seccions' ? (isSelected ? 1.5 : isHovered ? 1.1 : 0.35) : (isSelected ? 2.4 : isHovered ? 1.8 : 0.9),
      fillColor,
      fillOpacity: isHovered ? Math.min(fillOpacity + 0.06, 1) : fillOpacity
    };
  };
}

function buildPopup(level, feature) {
  const id = getFeatureId(level, feature);
  const row = getRow(level, id);
  const label = getFeatureLabel(level, feature);

  if (!row) {
    return `
      <div class="popup-title">${label}</div>
      <div class="popup-meta">${level}</div>
      <div class="popup-grid">
        <div><div class="label">Dades</div><div class="value">No disponibles</div></div>
      </div>
    `;
  }

  const ranking = getRanking(row).slice(0, 5);
  const winnerName = PARTY_META[row.winner]?.name || '—';
  const winnerPct = row.winner ? formatPct(row[`${row.winner}_pct`] || 0) : '—';

  return `
    <div class="popup-title">${label}</div>
    <div class="popup-meta">${level}</div>

    <div class="popup-highlight">
      <span class="popup-highlight-party">${winnerName}</span>
      <span class="popup-highlight-pct">${winnerPct}</span>
    </div>

    <div class="popup-grid">
      <div><div class="label">Participació</div><div class="value">${formatPct(row.participacio_pct)}</div></div>
      <div><div class="label">Vots vàlids</div><div class="value">${formatNumber(row.vots_valids)}</div></div>
      <div><div class="label">Bloc esquerres</div><div class="value">${formatPct(row.esquerres_pct)}</div></div>
      <div><div class="label">Bloc indepe.</div><div class="value">${formatPct(row.independentista_pct)}</div></div>
    </div>

    <div class="popup-ranking">
      ${ranking.map((item, idx) => `
        <div class="popup-ranking-row">
          <span>${idx + 1}. ${item.name}</span>
          <strong>${formatPct(item.pct)}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function attachInteractions(level, feature, layer) {
  const id = getFeatureId(level, feature);
  const row = getRow(level, id);
  const compositeId = `${level}:${id}`;

  layer.on({
    mouseover: () => {
      state.hoveredId = compositeId;
      refreshActiveLayerStyles();
      updateHoverCard(level, id);
    },
    mouseout: () => {
      if (state.selectedId !== compositeId) {
        state.hoveredId = null;
      }
      refreshActiveLayerStyles();
      if (state.selectedId) {
        const [selLevel, selId] = state.selectedId.split(':');
        updateHoverCard(selLevel, selId);
      } else {
        hideHoverCard();
      }
    },
    click: () => {
      state.selectedId = compositeId;
      refreshActiveLayerStyles();
      updateHoverCard(level, id);
      layer.openPopup();
    }
  });

  if (row) {
    layer.bindTooltip(`
      <div class="map-tooltip">
        <strong>${getFeatureLabel(level, feature)}</strong><br>
        ${state.activeMode.label}: <b>${formatModeValue(row, state.activeMode)}</b>
      </div>
    `, { sticky: true, direction: 'top', opacity: 1 });

    layer.bindPopup(buildPopup(level, feature), { maxWidth: 360 });
  }
}

function createLayer(level) {
  const geojson = state.levelGeojsons[level];
  return L.geoJSON(geojson, {
    style: styleFeatureFactory(level),
    onEachFeature: (feature, layer) => attachInteractions(level, feature, layer)
  });
}

function refreshActiveLayerStyles() {
  if (!state.activeLayer) return;

  state.activeLayer.eachLayer(layer => {
    if (!layer.feature) return;
    const level = state.currentLevel;
    layer.setStyle(styleFeatureFactory(level)(layer.feature));

    const id = getFeatureId(level, layer.feature);
    const row = getRow(level, id);

    if (row && layer.getTooltip()) {
      layer.setTooltipContent(`
        <div class="map-tooltip">
          <strong>${getFeatureLabel(level, layer.feature)}</strong><br>
          ${state.activeMode.label}: <b>${formatModeValue(row, state.activeMode)}</b>
        </div>
      `);
    }

    if (row && layer.getPopup()) {
      layer.setPopupContent(buildPopup(level, layer.feature));
    }
  });
}

function switchLevel(newLevel) {
  if (state.currentLevel === newLevel) {
    refreshActiveLayerStyles();
    updateSidebarForVisible();
    return;
  }

  if (state.activeLayer) {
    state.map.removeLayer(state.activeLayer);
  }

  if (!state.levelLayers[newLevel]) {
    state.levelLayers[newLevel] = createLayer(newLevel);
  }

  state.currentLevel = newLevel;
  state.activeLayer = state.levelLayers[newLevel];
  state.activeLayer.addTo(state.map);

  refreshActiveLayerStyles();
  updateSidebarForVisible();
}

function getVisibleRows(level) {
  const bounds = state.map.getBounds();
  const rows = [];

  if (!state.activeLayer) return rows;

  state.activeLayer.eachLayer(layer => {
    if (!layer.feature) return;
    const layerBounds = layer.getBounds ? layer.getBounds() : null;
    if (!layerBounds || !bounds.intersects(layerBounds)) return;

    const id = getFeatureId(level, layer.feature);
    const row = getRow(level, id);
    if (row) rows.push(row);
  });

  return rows;
}

function aggregateRows(rows) {
  if (!rows.length) return null;

  const total = {
    id: 'visible',
    nom: 'Visible',
    cens: 0,
    vots_valids: 0,
    participacio_pct: 0,
    psc_vots: 0,
    junts_vots: 0,
    erc_vots: 0,
    pp_vots: 0,
    vox_vots: 0,
    comuns_vots: 0,
    cup_vots: 0,
    ac_vots: 0,
    esquerres_pct: 0,
    independentista_pct: 0,
    winner: null
  };

  rows.forEach(r => {
    total.cens += safeNumber(r.cens);
    total.vots_valids += safeNumber(r.vots_valids);
    PARTY_ORDER.forEach(p => {
      total[`${p}_vots`] += safeNumber(r[`${p}_vots`]);
    });
  });

  total.participacio_pct = total.cens > 0 ? (total.vots_valids / total.cens) * 100 : 0;
  PARTY_ORDER.forEach(p => {
    total[`${p}_pct`] = total.vots_valids > 0 ? (total[`${p}_vots`] / total.vots_valids) * 100 : 0;
  });

  total.esquerres_pct = total.vots_valids > 0
    ? ((total.psc_vots + total.erc_vots + total.comuns_vots + total.cup_vots) / total.vots_valids) * 100
    : 0;

  total.independentista_pct = total.vots_valids > 0
    ? ((total.junts_vots + total.erc_vots + total.cup_vots + total.ac_vots) / total.vots_valids) * 100
    : 0;

  total.winner = PARTY_ORDER
    .map(p => ({ key: p, votes: total[`${p}_vots`] }))
    .sort((a, b) => b.votes - a.votes)[0]?.key || 'psc';

  return total;
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
      updateLegend();
      refreshActiveLayerStyles();
      updateSidebarForVisible();

      if (state.selectedId) {
        const [level, id] = state.selectedId.split(':');
        updateHoverCard(level, id);
      }
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

function hideHoverCard() {
  const card = document.getElementById('hover-card');
  if (card) card.classList.add('hidden');
}

function updateHoverCard(level, id) {
  const card = document.getElementById('hover-card');
  if (!card) return;

  const row = getRow(level, id);
  if (!row) {
    card.classList.add('hidden');
    return;
  }

  const top = findTopParty(row);
  const label = row.nom || row.id || id;

  card.innerHTML = `
    <h3>${label}</h3>
    <div class="meta">${level}</div>
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

function updateSummaryFromAggregate(agg, visibleCount) {
  if (!agg) return;

  const mode = state.activeMode;
  let mainValue = '—';

  if (mode.type === 'winner') {
    mainValue = PARTY_META[agg.winner]?.name || '—';
  } else if (mode.key === 'participacio_pct') {
    mainValue = formatPct(agg.participacio_pct);
  } else {
    const votesKey = mode.key.replace('_pct', '_vots');
    mainValue = formatNumber(agg[votesKey]);
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

  if (mainLabelEl) mainLabelEl.textContent = `${mode.summaryLabel} (${state.currentLevel})`;
  if (mainValueEl) mainValueEl.textContent = mainValue;
  if (mainDeltaEl) {
    mainDeltaEl.textContent = `Visible: ${visibleCount}`;
    mainDeltaEl.className = 'delta';
  }

  if (partValueEl) partValueEl.textContent = formatPct(agg.participacio_pct);
  if (partDeltaEl) {
    partDeltaEl.textContent = 'Àmbit visible';
    partDeltaEl.className = 'delta';
  }

  if (municipisValueEl) municipisValueEl.textContent = formatNumber(visibleCount);
  if (municipisShareEl) municipisShareEl.textContent = state.currentLevel;

  const leader = PARTY_ORDER
    .map(key => ({ key, votes: safeNumber(agg[`${key}_vots`]), pct: safeNumber(agg[`${key}_pct`]) }))
    .sort((a, b) => b.votes - a.votes)[0];

  if (liderValueEl) liderValueEl.textContent = PARTY_META[leader?.key]?.name || '—';
  if (liderSubEl) liderSubEl.textContent = 'Partit líder visible';
  if (liderPctEl) liderPctEl.textContent = formatPct(leader?.pct || 0);
}

function buildPartyCardsFromAggregate(agg) {
  const container = document.getElementById('party-cards');
  const template = document.getElementById('party-card-template');
  if (!container || !template || !agg) return;

  container.innerHTML = '';

  const summaries = PARTY_ORDER.map(key => ({
    key,
    votes: safeNumber(agg[`${key}_vots`]),
    pct: safeNumber(agg[`${key}_pct`]),
    wins: key === agg.winner ? 1 : 0
  })).sort((a, b) => b.votes - a.votes);

  summaries.forEach(item => {
    const node = template.content.firstElementChild.cloneNode(true);
    const party = PARTY_META[item.key];

    node.style.borderColor = party.color;

    node.querySelector('.party-name').textContent = party.name;
    node.querySelector('.party-name').style.color = party.color;

    node.querySelector('.metric-wins').textContent = item.key === agg.winner ? 'Líder' : '—';
    node.querySelector('.metric-wins-delta').textContent = state.currentLevel;

    node.querySelector('.metric-votes').textContent = formatNumber(item.votes);
    node.querySelector('.metric-votes-delta').textContent = 'visible';

    node.querySelector('.metric-pct').textContent = formatPct(item.pct);
    node.querySelector('.metric-pct-delta').textContent = '';

    container.appendChild(node);
  });
}

function updateSidebarForVisible() {
  const rows = getVisibleRows(state.currentLevel);
  const agg = aggregateRows(rows);
  updateSummaryFromAggregate(agg, rows.length);
  buildPartyCardsFromAggregate(agg);
}

function buildSearchIndex() {
  const idx = [];

  ['municipis', 'comarques', 'provincies', 'vegueries'].forEach(level => {
    const rows = state.levelData[level] || [];
    rows.forEach(row => {
      idx.push({
        level,
        id: row.id,
        label: row.nom,
        subtitle: level
      });
    });
  });

  state.searchIndex = idx;
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
    <div class="search-item" data-level="${item.level}" data-id="${item.id}" data-label="${item.label}">
      <strong>${item.label}</strong>
      <span>${item.subtitle}</span>
    </div>
  `).join('');

  box.classList.remove('hidden');

  box.querySelectorAll('.search-item').forEach(el => {
    el.addEventListener('click', () => {
      const level = el.dataset.level;
      const id = el.dataset.id;
      focusFeature(level, id);
      box.classList.add('hidden');
      document.getElementById('search-input').value = el.dataset.label;
    });
  });
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

function focusFeature(level, id) {
  const targetZoom = {
    vegueries: 8,
    provincies: 9,
    comarques: 10,
    municipis: 11,
    seccions: 13
  }[level] || 8;

  state.map.setZoom(targetZoom);

  setTimeout(() => {
    switchLevel(level);

    let targetLayer = null;
    state.activeLayer.eachLayer(layer => {
      if (String(getFeatureId(level, layer.feature)) === String(id)) {
        targetLayer = layer;
      }
    });

    if (targetLayer) {
      state.selectedId = `${level}:${id}`;
      refreshActiveLayerStyles();
      state.map.fitBounds(targetLayer.getBounds(), { padding: [40, 40], maxZoom: targetZoom + 1 });
      if (targetLayer.getPopup()) targetLayer.openPopup();
      updateHoverCard(level, id);
    }
  }, 100);
}

function bindPanelToggle() {
  const btn = document.getElementById('panel-toggle');
  const panel = document.getElementById('right-panel');
  if (!btn || !panel) return;

  let closeTimer = null;

  function openPanel() {
    panel.classList.remove('collapsed');
    btn.textContent = '❯';
    btn.setAttribute('aria-expanded', 'true');
  }

  function closePanel() {
    panel.classList.add('collapsed');
    btn.textContent = '❮';
    btn.setAttribute('aria-expanded', 'false');
  }

  function cancelClose() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  }

  function scheduleClose() {
    cancelClose();
    closeTimer = setTimeout(closePanel, 220);
  }

  closePanel();

  btn.addEventListener('click', () => {
    const isCollapsed = panel.classList.contains('collapsed');
    if (isCollapsed) openPanel();
    else closePanel();
  });

  panel.addEventListener('mouseenter', () => {
    cancelClose();
    openPanel();
  });

  panel.addEventListener('mouseleave', () => {
    scheduleClose();
  });

  document.addEventListener('mousemove', (e) => {
    const triggerZone = window.innerWidth < 900 ? 36 : 80;
    if (window.innerWidth - e.clientX <= triggerZone) {
      cancelClose();
      openPanel();
    }
  });

  document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget) scheduleClose();
  });
}

async function loadAllData() {
  const entries = Object.entries(LEVELS);

  for (const [level, cfg] of entries) {
    const [geojson, dades] = await Promise.all([
      fetchJson(cfg.geojson),
      fetchJson(cfg.dades)
    ]);

    state.levelGeojsons[level] = geojson;
    state.levelData[level] = dades;
    state.levelDataMaps[level] = new Map(dades.map(row => [String(row.id), row]));
  }
}

function createMap() {
  state.map = L.map('map', {
    zoomControl: true,
    attributionControl: false,
    minZoom: 6,
    maxZoom: 14,
    preferCanvas: true
  });

  const initialLayer = createLayer('catalunya');
  state.levelLayers.catalunya = initialLayer;
  state.currentLevel = 'catalunya';
  state.activeLayer = initialLayer;
  initialLayer.addTo(state.map);
  state.map.fitBounds(initialLayer.getBounds(), { padding: [18, 18] });

  state.map.on('zoomend', () => {
    const newLevel = getLevelByZoom(state.map.getZoom());
    switchLevel(newLevel);
  });

  state.map.on('moveend', () => {
    updateSidebarForVisible();
  });

  state.map.on('click', () => {
    state.selectedId = null;
    refreshActiveLayerStyles();
    if (state.hoveredId) {
      const [level, id] = state.hoveredId.split(':');
      updateHoverCard(level, id);
    } else {
      hideHoverCard();
    }
  });
}

async function init() {
  try {
    await loadAllData();
    renderModeButtons();
    updateLegend();
    buildSearchIndex();
    bindSearch();
    bindPanelToggle();
    createMap();
    updateSidebarForVisible();
  } catch (error) {
    console.error(error);
    alert(`No s’han pogut carregar les dades.\n\n${error.message}`);
  }
}

init();
