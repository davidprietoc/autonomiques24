const map = L.map('map', {
  zoomControl: true,
  attributionControl: false,
  preferCanvas: true
});

const COLORS = ['#f5f0f2', '#edd9e1', '#ddb3c4', '#cf8ca7', '#bc6486', '#a73a61', '#7f163e'];
const METRICS = {
  comuns_pct: {
    label: '% Comuns Sumar',
    shortLabel: 'Vots Comuns',
    valueType: 'percent',
    volumeField: 'comuns_vots',
    volumeLabel: 'Vots Comuns',
    breaks: [0, 2, 5, 10, 20, 30, 45]
  },
  participacio_pct: {
    label: '% Participació',
    shortLabel: 'Participació',
    valueType: 'percent',
    volumeField: 'vots_valids',
    volumeLabel: 'Vots vàlids',
    breaks: [0, 40, 50, 55, 60, 65, 70]
  },
  psc_pct: {
    label: '% PSC',
    shortLabel: 'PSC',
    valueType: 'percent',
    volumeField: 'psc_vots',
    volumeLabel: 'Vots PSC',
    breaks: [0, 5, 10, 20, 30, 40, 50]
  },
  erc_pct: {
    label: '% ERC',
    shortLabel: 'ERC',
    valueType: 'percent',
    volumeField: 'erc_vots',
    volumeLabel: 'Vots ERC',
    breaks: [0, 5, 10, 15, 20, 30, 40]
  },
  junts_pct: {
    label: '% Junts',
    shortLabel: 'Junts',
    valueType: 'percent',
    volumeField: 'junts_vots',
    volumeLabel: 'Vots Junts',
    breaks: [0, 5, 10, 15, 20, 30, 40]
  }
};

const metricButtons = [...document.querySelectorAll('.metric-btn')];
const legendEl = document.getElementById('legend');
const legendLabelsEl = document.getElementById('legend-labels');
const legendTitleEl = document.getElementById('legend-title');
const legendMinEl = document.getElementById('legend-min');
const legendMaxEl = document.getElementById('legend-max');
const mainStatLabelEl = document.getElementById('main-stat-label');
const mainStatValueEl = document.getElementById('main-stat-value');
const municipisCountEl = document.getElementById('municipis-count');
const missingCountEl = document.getElementById('missing-count');
const leaderNameEl = document.getElementById('leader-name');
const leaderValueEl = document.getElementById('leader-value');
const volumeLabelEl = document.getElementById('volume-label');
const volumeValueEl = document.getElementById('volume-value');
const maxValueEl = document.getElementById('max-value');
const hoverCardEl = document.getElementById('hover-card');
const searchInputEl = document.getElementById('search-input');
const searchResultsEl = document.getElementById('search-results');

let currentMetric = 'comuns_pct';
let geojsonLayer;
let dataByMunicipi = {};
let layerByCode = {};
let rows = [];

function formatNumber(value) {
  return Number(value || 0).toLocaleString('ca-ES');
}

function formatPercent(value) {
  if (value == null || Number.isNaN(value)) return 'Sense dades';
  return `${Number(value).toFixed(1).replace('.', ',')}%`;
}

function getBreaks() {
  return METRICS[currentMetric].breaks;
}

function getColor(value) {
  if (value == null || Number.isNaN(value)) return '#ffffff';
  const breaks = getBreaks();
  for (let i = breaks.length - 1; i >= 0; i -= 1) {
    if (value >= breaks[i]) return COLORS[i];
  }
  return COLORS[0];
}

function style(feature) {
  const code = Number(feature.properties.codi_municipi);
  const row = dataByMunicipi[code];
  const value = row ? row[currentMetric] : null;

  return {
    fillColor: getColor(value),
    weight: 0.9,
    opacity: 1,
    color: '#c9c5c4',
    fillOpacity: 0.97
  };
}

function styleHover(layer) {
  layer.setStyle({
    weight: 2.2,
    color: '#2b2b2b'
  });
  if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
    layer.bringToFront();
  }
}

function popupHtml(props, row) {
  return `
    <div class="popup-card">
      <div class="popup-title">${props.municipi}</div>
      <div class="popup-subtitle">${props.comarca} · ${props.provincia}</div>
      <div class="popup-grid">
        <div><strong>${METRICS[currentMetric].label}</strong></div><div>${formatPercent(row?.[currentMetric])}</div>
        <div>Cens</div><div>${formatNumber(row?.cens)}</div>
        <div>Vots vàlids</div><div>${formatNumber(row?.vots_valids)}</div>
        <div>Comuns</div><div>${formatNumber(row?.comuns_vots)} · ${formatPercent(row?.comuns_pct)}</div>
        <div>PSC</div><div>${formatNumber(row?.psc_vots)} · ${formatPercent(row?.psc_pct)}</div>
        <div>ERC</div><div>${formatNumber(row?.erc_vots)} · ${formatPercent(row?.erc_pct)}</div>
        <div>Junts</div><div>${formatNumber(row?.junts_vots)} · ${formatPercent(row?.junts_pct)}</div>
      </div>
    </div>
  `;
}

function updateHoverCard(props, row) {
  hoverCardEl.innerHTML = `
    <div class="hover-name">${props.municipi}</div>
    <div class="hover-sub">${props.comarca} · ${props.provincia}</div>
    <div class="hover-metric"><span>${METRICS[currentMetric].label}</span><strong>${formatPercent(row?.[currentMetric])}</strong></div>
  `;
  hoverCardEl.classList.remove('hidden');
}

function clearHoverCard() {
  hoverCardEl.classList.add('hidden');
}

function onEachFeature(feature, layer) {
  const code = Number(feature.properties.codi_municipi);
  const row = dataByMunicipi[code];
  layerByCode[code] = layer;

  layer.on({
    mouseover: (e) => {
      styleHover(e.target);
      updateHoverCard(feature.properties, row);
      layer.bindTooltip(`${feature.properties.municipi}<br>${METRICS[currentMetric].label}: ${formatPercent(row?.[currentMetric])}`, {
        sticky: true,
        direction: 'auto',
        opacity: 0.95
      }).openTooltip();
    },
    mouseout: (e) => {
      geojsonLayer.resetStyle(e.target);
      layer.closeTooltip();
      clearHoverCard();
    },
    click: () => {
      layer.bindPopup(popupHtml(feature.properties, row), { maxWidth: 320 }).openPopup();
    }
  });
}

function buildLegend() {
  const { label, breaks } = METRICS[currentMetric];
  legendTitleEl.textContent = label;
  legendMinEl.textContent = `${String(breaks[0]).replace('.', ',')}%`;
  legendMaxEl.textContent = `${String(breaks[breaks.length - 1]).replace('.', ',')}%+`;
  legendEl.innerHTML = COLORS.map(color => `<div class="legend-step" style="background:${color}"></div>`).join('');
  legendLabelsEl.innerHTML = breaks.map((start, idx) => {
    const next = breaks[idx + 1];
    const text = next == null ? `${start}+` : idx === 0 ? `<${next}` : `${start}–${next}`;
    return `<div>${String(text).replace('.', ',')}</div>`;
  }).join('');
}

function updateStats() {
  const validRows = rows.filter(row => typeof row[currentMetric] === 'number' && !Number.isNaN(row[currentMetric]));
  const missing = rows.length - validRows.length;
  municipisCountEl.textContent = formatNumber(validRows.length);
  missingCountEl.textContent = formatNumber(missing);

  if (!validRows.length) {
    mainStatLabelEl.textContent = METRICS[currentMetric].label;
    mainStatValueEl.textContent = '-';
    leaderNameEl.textContent = '-';
    leaderValueEl.textContent = '-';
    volumeLabelEl.textContent = METRICS[currentMetric].volumeLabel;
    volumeValueEl.textContent = '-';
    maxValueEl.textContent = '-';
    return;
  }

  const avg = validRows.reduce((sum, row) => sum + row[currentMetric], 0) / validRows.length;
  const leader = validRows.reduce((best, row) => row[currentMetric] > best[currentMetric] ? row : best, validRows[0]);
  const volumeField = METRICS[currentMetric].volumeField;
  const totalVolume = validRows.reduce((sum, row) => sum + Number(row[volumeField] || 0), 0);

  mainStatLabelEl.textContent = METRICS[currentMetric].label;
  mainStatValueEl.textContent = formatPercent(avg);
  leaderNameEl.textContent = leader.municipi;
  leaderValueEl.textContent = formatPercent(leader[currentMetric]);
  volumeLabelEl.textContent = METRICS[currentMetric].volumeLabel;
  volumeValueEl.textContent = formatNumber(totalVolume);
  maxValueEl.textContent = formatPercent(leader[currentMetric]);
}

function refreshMap() {
  buildLegend();
  updateStats();
  geojsonLayer.setStyle(style);
  geojsonLayer.eachLayer(layer => {
    if (layer.isPopupOpen()) {
      const code = Number(layer.feature.properties.codi_municipi);
      const row = dataByMunicipi[code];
      layer.setPopupContent(popupHtml(layer.feature.properties, row));
    }
  });
}

function setMetric(metricKey) {
  currentMetric = metricKey;
  metricButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.metric === metricKey));
  refreshMap();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderSearchResults(items) {
  if (!items.length) {
    searchResultsEl.innerHTML = '<div class="search-result"><strong>Cap resultat</strong><span>Prova amb un altre municipi o comarca</span></div>';
    searchResultsEl.classList.remove('hidden');
    return;
  }

  searchResultsEl.innerHTML = items.slice(0, 8).map(row => `
    <div class="search-result" data-code="${row.codi_municipi}">
      <strong>${escapeHtml(row.municipi)}</strong>
      <span>${escapeHtml(row.comarca)} · ${escapeHtml(row.provincia)}</span>
    </div>
  `).join('');
  searchResultsEl.classList.remove('hidden');
}

function zoomToMunicipi(code) {
  const layer = layerByCode[Number(code)];
  if (!layer) return;
  map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 11 });
  styleHover(layer);
  const row = dataByMunicipi[Number(code)];
  updateHoverCard(layer.feature.properties, row);
  layer.bindPopup(popupHtml(layer.feature.properties, row), { maxWidth: 320 }).openPopup();
  window.setTimeout(() => geojsonLayer.resetStyle(layer), 1200);
}

function runSearch(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    searchResultsEl.classList.add('hidden');
    searchResultsEl.innerHTML = '';
    return;
  }

  const matches = rows.filter(row =>
    row.municipi.toLowerCase().includes(q) ||
    row.comarca.toLowerCase().includes(q) ||
    row.provincia.toLowerCase().includes(q)
  );
  renderSearchResults(matches);
}

searchInputEl.addEventListener('input', (e) => runSearch(e.target.value));
searchInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    searchResultsEl.classList.add('hidden');
  }
});
searchResultsEl.addEventListener('click', (e) => {
  const item = e.target.closest('.search-result[data-code]');
  if (!item) return;
  const code = item.dataset.code;
  const row = dataByMunicipi[Number(code)];
  searchInputEl.value = row.municipi;
  searchResultsEl.classList.add('hidden');
  zoomToMunicipi(code);
});
document.addEventListener('click', (e) => {
  if (!searchResultsEl.contains(e.target) && e.target !== searchInputEl) {
    searchResultsEl.classList.add('hidden');
  }
});
metricButtons.forEach(btn => btn.addEventListener('click', () => setMetric(btn.dataset.metric)));

Promise.all([
  fetch('./data/base.geojson').then(r => r.json()),
  fetch('./data/dades_municipals.json').then(r => r.json())
]).then(([geojson, dataRows]) => {
  rows = dataRows;
  dataRows.forEach(row => {
    dataByMunicipi[Number(row.codi_municipi)] = row;
  });

  geojsonLayer = L.geoJSON(geojson, {
    style,
    onEachFeature
  }).addTo(map);

  map.fitBounds(geojsonLayer.getBounds(), { padding: [24, 24] });
  buildLegend();
  updateStats();
}).catch((error) => {
  console.error(error);
  alert('No s’han pogut carregar les dades. Revisa les rutes dels fitxers o torna a desplegar GitHub Pages.');
});
