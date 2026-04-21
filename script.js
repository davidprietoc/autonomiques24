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
    labelFields: ['NOM', 'name'],
    minZoom: 0,
    maxZoom: 7.19,
    clickZoom: 8.2,
    nextLevel: 'vegueries',
    contextLevel: null
  },
  vegueries: {
    geojson: 'data/vegueries.geojson',
    dades: 'data/dades_vegueries.json',
    featureKey: 'CODIVEGUE',
    labelFields: ['NOMVEGUE'],
    minZoom: 7.2,
    maxZoom: 8.19,
    clickZoom: 9.1,
    nextLevel: 'provincies',
    contextLevel: 'catalunya'
  },
  provincies: {
    geojson: 'data/provincies.geojson',
    dades: 'data/dades_provincies.json',
    featureKey: 'CODIPROV',
    labelFields: ['NOMPROV'],
    minZoom: 8.2,
    maxZoom: 9.19,
    clickZoom: 10.1,
    nextLevel: 'comarques',
    contextLevel: 'vegueries'
  },
  comarques: {
    geojson: 'data/comarques.geojson',
    dades: 'data/dades_comarques.json',
    featureKey: 'CODICOMAR',
    labelFields: ['NOMCOMAR'],
    minZoom: 9.2,
    maxZoom: 10.39,
    clickZoom: 11.1,
    nextLevel: 'municipis',
    contextLevel: 'provincies'
  },
  municipis: {
    geojson: 'data/municipis.geojson',
    dades: 'data/dades_municipis.json',
    featureKey: 'CODIMUNI',
    labelFields: ['NOMMUNI'],
    minZoom: 10.4,
    maxZoom: 11.39,
    clickZoom: 12.6,
    nextLevel: 'seccions',
    contextLevel: 'comarques'
  },
  seccions: {
    geojson: 'data/seccions.geojson',
    dades: 'data/dades_seccions.json',
    featureKey: 'codisecc',
    labelFields: ['codisecc', 'MUNDISSEC'],
    minZoom: 11.4,
    maxZoom: 24,
    clickZoom: 14,
    nextLevel: null,
    contextLevel: 'municipis'
  }
};

const state = {
  map: null,
  activeMode: MODES[0],
  currentLevel: null,
  activeLayer: null,
  contextLayer: null,
  hoveredId: null,
  selectedId: null,
  levelGeojsons: {},
  levelData: {},
  levelDataMaps: {},
  levelLayers: {},
  contextLayers: {},
  searchIndex: [],
  isSwitchingLevel: false,
  baseLayers: {},
  currentBase: 'light',
  labelsLayer: null
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
  if (z < 7.2) return 'catalunya';
  if (z < 8.2) return 'vegueries';
  if (z < 9.2) return 'provincies';
  if (z < 10.4) return 'comarques';
  if (z < 11.4) return 'municipis';
  return 'seccions';
}

function getFeatureId(level, feature) {
  if (level === 'catalunya') return 'CAT';

  const props = feature?.properties || {};

  if (level === 'seccions') {
    return String(props.codisecc || props.MUNDISSEC || '');
  }

  const key = LEVELS[level].featureKey;
  return String(props[key] ?? '');
}

function getFeatureLabel(level, feature) {
  if (level === 'catalunya') return 'Catalunya';

  const props = feature?.properties || {};
  const fields = LEVELS[level].labelFields || [];

  for (const field of fields) {
    if (props[field]) return String(props[field]);
  }

  return getFeatureId(level, feature);
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
      fillColor = mode.type === 'winner'
        ? getWinnerColor(row.winner)
        : getSequentialColor(rowValue(row, mode), mode.max);
    } else {
      fillOpacity = 0.12;
    }

    const isHovered = state.hoveredId === `${level}:${id}`;
    const isSelected = state.selectedId === `${level}:${id}`;

    let weight = 0.8;
    if (level === 'catalunya') weight = isSelected ? 2.8 : isHovered ? 2.4 : 2.1;
    else if (level === 'vegueries') weight = isSelected ? 2.2 : isHovered ? 1.9 : 1.4;
    else if (level === 'provincies') weight = isSelected ? 2.0 : isHovered ? 1.6 : 1.2;
    else if (level === 'comarques') weight = isSelected ? 1.6 : isHovered ? 1.25 : 0.85;
    else if (level === 'municipis') weight = isSelected ? 1.15 : isHovered ? 0.9 : 0.45;
    else if (level === 'seccions') weight = isSelected ? 0.85 : isHovered ? 0.65 : 0.18;

    return {
      color: isSelected ? '#2b2b2b' : isHovered ? '#5b5b5b' : '#bfb8b2',
      weight,
      fillColor,
      fillOpacity: isHovered ? Math.min(fillOpacity + 0.08, 1) : fillOpacity
    };
  };
}

function styleContextFactory(level) {
  return function() {
    let weight = 1;
    if (level === 'catalunya') weight = 1.8;
    else if (level === 'vegueries') weight = 1.2;
    else if (level === 'provincies') weight = 1.0;
    else if (level === 'comarques') weight = 0.8;
    else if (level === 'municipis') weight = 0.5;

    return {
      color: '#9d9d9d',
      weight,
      fill: false,
      opacity: 0.35,
      interactive: false
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

function zoomOnFeature(level, layer) {
  const targetZoom = LEVELS[level].clickZoom;
  const bounds = layer.getBounds();

  state.map.fitBounds(bounds, {
    padding: [28, 28],
    maxZoom: targetZoom
  });

  window.setTimeout(() => {
    if (state.map.getZoom() < targetZoom) {
      state.map.setZoom(targetZoom);
    }
  }, 80);
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
      L.DomEvent.stopPropagation(layer);

      state.selectedId = compositeId;
      refreshActiveLayerStyles();
      updateHoverCard(level, id);

      if (layer.getPopup()) {
        layer.openPopup();
      }

      zoomOnFeature(level, layer);
    }
  });

  if (row) {
    layer.bindTooltip(`
      <div class="map-tooltip">
        <strong>${getFeatureLabel(level, feature)}</strong><br>
        ${state.activeMode.label}: <b>${formatModeValue(row, state.activeMode)}</b>
      </div>
    `, {
      sticky: true,
      direction: 'top',
      opacity: 1
    });

    layer.bindPopup(buildPopup(level, feature), { maxWidth: 360 });
  }
}

function createLayer(level) {
  const geojson = state.levelGeojsons[level];
  return L.geoJSON(geojson, {
    renderer: L.canvas(),
    style: styleFeatureFactory(level),
    onEachFeature: (feature, layer) => attachInteractions(level, feature, layer)
  });
}

function createContextLayer(level) {
  if (!level) return null;
  const geojson = state.levelGeojsons[level];
  return L.geoJSON(geojson, {
    renderer: L.canvas(),
    style: styleContextFactory(level),
    interactive: false
  });
}

function refreshActiveLayerStyles() {
  if (!state.activeLayer) return;

  const level = state.currentLevel;

  state.activeLayer.eachLayer(layer => {
    if (!layer.feature) return;

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

function removeThematicLayers() {
  Object.values(state.levelLayers).forEach(layer => {
    if (layer && state.map.hasLayer(layer)) state.map.removeLayer(layer);
  });

  Object.values(state.contextLayers).forEach(layer => {
    if (layer && state.map.hasLayer(layer)) state.map.removeLayer(layer);
  });
}

function switchLevel(newLevel) {
  if (!newLevel) return;

  if (state.currentLevel === newLevel && state.activeLayer) {
    refreshActiveLayerStyles();
    updateSidebarForVisible();
    return;
  }

  state.isSwitchingLevel = true;

  removeThematicLayers();

  const contextLevel = LEVELS[newLevel].contextLevel;

  if (contextLevel) {
    if (!state.contextLayers[contextLevel]) {
      state.contextLayers[contextLevel] = createContextLayer(contextLevel);
    }
    state.contextLayer = state.contextLayers[contextLevel];
    if (state.contextLayer) state.contextLayer.addTo(state.map);
  } else {
    state.contextLayer = null;
  }

  if (!state.levelLayers[newLevel]) {
    state.levelLayers[newLevel] = createLayer(newLevel);
  }

  state.currentLevel = newLevel;
  state.activeLayer = state.levelLayers[newLevel];
  state.activeLayer.addTo(state.map);

  refreshActiveLayerStyles();
  updateSidebarForVisible();

  window.setTimeout(() => {
    state.isSwitchingLevel = false;
  }, 150);
}

function getVisibleRows(level) {
  const bounds = state.map.getBounds();
  const rows = [];

  if (!state.activeLayer) return rows;

  state.activeLayer.eachLayer(layer => {
    if (!layer.feature || !layer.getBounds) return;
    const layerBounds = layer.getBounds();
    if (!bounds.intersects(layerBounds)) return;

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
    total[`${p}_pct`] = total.vots_valids > 0
      ? (total[`${p}_vots`] / total.vots_valids) * 100
      : 0;
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
    .map(key => ({
      key,
      votes: safeNumber(agg[`${key}_vots`]),
      pct: safeNumber(agg[`${key}_pct`])
    }))
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

    const nameEl = node.querySelector('.party-name');
    if (nameEl) {
      nameEl.textContent = party.name;
      nameEl.style.color = party.color;
    }

    const winsEl = node.querySelector('.metric-wins');
    const winsDeltaEl = node.querySelector('.metric-wins-delta');
    const votesEl = node.querySelector('.metric-votes');
    const votesDeltaEl = node.querySelector('.metric-votes-delta');
    const pctEl = node.querySelector('.metric-pct');
    const pctDeltaEl = node.querySelector('.metric-pct-delta');

    if (winsEl) winsEl.textContent = item.key === agg.winner ? 'Líder' : '—';
    if (winsDeltaEl) winsDeltaEl.textContent = state.currentLevel;
    if (votesEl) votesEl.textContent = formatNumber(item.votes);
    if (votesDeltaEl) votesDeltaEl.textContent = 'visible';
    if (pctEl) pctEl.textContent = formatPct(item.pct);
    if (pctDeltaEl) pctDeltaEl.textContent = '';

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

  ['vegueries', 'provincies', 'comarques', 'municipis'].forEach(level => {
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
      const input = document.getElementById('search-input');
      if (input) input.value = el.dataset.label;
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
  const targetZoom = LEVELS[level].clickZoom || 10;

  state.map.setZoom(targetZoom);

  window.setTimeout(() => {
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
      state.map.fitBounds(targetLayer.getBounds(), {
        padding: [40, 40],
        maxZoom: targetZoom
      });
      if (targetLayer.getPopup()) targetLayer.openPopup();
      updateHoverCard(level, id);
    }
  }, 120);
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

function setBaseLayer(mode) {
  if (state.currentBase === mode) return;

  if (state.baseLayers[state.currentBase] && state.map.hasLayer(state.baseLayers[state.currentBase])) {
    state.map.removeLayer(state.baseLayers[state.currentBase]);
  }

  state.currentBase = mode;
  state.baseLayers[mode].addTo(state.map);

  const btn = document.getElementById('basemap-toggle');
  if (btn) {
    btn.textContent = mode === 'light' ? '🛰️ Satèl·lit' : '🗺️ Mapa';
  }
}

function createBasemapToggleControl() {
  const control = L.control({ position: 'topright' });

  control.onAdd = function() {
    const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control custom-basemap-control');
    div.innerHTML = `<button id="basemap-toggle" type="button">🛰️ Satèl·lit</button>`;
    L.DomEvent.disableClickPropagation(div);

    window.setTimeout(() => {
      const btn = document.getElementById('basemap-toggle');
      if (btn) {
        btn.addEventListener('click', () => {
          setBaseLayer(state.currentBase === 'light' ? 'satellite' : 'light');
        });
      }
    }, 0);

    return div;
  };

  control.addTo(state.map);
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

function updateLayersForZoom() {
  if (!state.map || state.isSwitchingLevel) return;
  const newLevel = getLevelByZoom(state.map.getZoom());
  switchLevel(newLevel);
}

function createMap() {
  const mapEl = document.getElementById('map');
  if (!mapEl) throw new Error("Falta l'element #map");

  state.map = L.map('map', {
    zoomControl: true,
    attributionControl: true,
    minZoom: 6,
    maxZoom: 15,
    preferCanvas: true
  });

  state.baseLayers.light = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
    {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    }
  );

  state.baseLayers.satellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 20,
      attribution: '&copy; Esri'
    }
  );

  state.baseLayers.light.addTo(state.map);
  state.currentBase = 'light';

  createBasemapToggleControl();

  state.map.setView([41.8, 1.6], 7);
  switchLevel('catalunya');

  const catBounds = state.levelLayers.catalunya
    ? state.levelLayers.catalunya.getBounds()
    : null;

  if (catBounds && catBounds.isValid()) {
    state.map.fitBounds(catBounds, { padding: [24, 24] });
  }

  state.map.on('zoomend', updateLayersForZoom);

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
