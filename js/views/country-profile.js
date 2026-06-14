/* country-profile.js - Country profile with crop history dashboard. */

import State from '../state.js?v=20260522-mobile-ui18';
import DataLoader from '../data-loader.js?v=20260522-mobile-ui18';
import { COUNTRIES, fmt, fmtUnit, shortItemLabel, smartXTicks } from '../utils.js?v=20260522-mobile-ui18';
import { showTooltip, hideTooltip } from '../components/tooltip.js';

let _root = null;
let _token = 0;
let _countryList = null;
let _latestProfile = null;
let _resizeTimer = null;
let _profileProductionMetric = 'tonnes';
let _profileLaborMetric = 'workers';
let _profileTradeMetric = 'exports';

const PROFILE_COLORS = ['#6B4226', '#1B3A5C', '#4A6B3A', '#8B2500', '#D4A032', '#5F6F8F', '#9A5D2E', '#2F6F6A'];
const PROFILE_PRODUCTION_METRICS = [
    { id: 'tonnes', label: 't', title: 'Toneladas', key: 'production', unit: 'tonnes' },
    { id: 'energy', label: 'GJ', title: 'Energía', key: 'energy', unit: 'GJ' },
    { id: 'yield', label: 't/ha', title: 'Rendimiento', key: 'yield', unit: 't/ha' },
];
const PROFILE_LABOR_METRICS = [
    { id: 'workers', label: 'Total', title: 'Trabajadores', field: 'workers', unit: 'personas' },
    { id: 'hours', label: 'Horas', title: 'Horas trabajadas', field: 'hours', unit: 'M horas/año' },
    { id: 'share', label: '%', title: 'Peso en el empleo', field: 'share_economy', unit: '%' },
];
const PROFILE_TRADE_METRICS = [
    { id: 'exports', label: 'Exp.', title: 'Exportaciones', field: 'exports', unit: 'tonnes' },
    { id: 'imports', label: 'Imp.', title: 'Importaciones', field: 'imports', unit: 'tonnes' },
    { id: 'balance', label: 'Saldo', title: 'Balanza neta', field: 'balance', unit: 'tonnes' },
];

export function initCountryProfileView() {
    _root = ensureCountryPanel();
    if (!_root) return;

    State.subscribe('activeView', updateCountryProfileView);
    State.subscribe('selectedCountries', updateCountryProfileView);
    State.subscribe('currentYear', updateCountryProfileView);
    State.subscribe('geoLevel', updateCountryProfileView);

    window.addEventListener('resize', () => {
        if (State.get('activeView') !== 'country' || !_latestProfile) return;
        clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(() => renderProfileVisuals(_latestProfile), 120);
    });
}

function ensureCountryPanel() {
    let root = document.getElementById('country-panel-container');
    if (root) return root;

    const panel = document.createElement('div');
    panel.className = 'viz-panel';
    panel.id = 'panel-country';
    panel.innerHTML = '<div class="country-panel-container" id="country-panel-container"></div>';

    const aboutPanel = document.getElementById('panel-about');
    const container = document.querySelector('.viz-container');
    if (aboutPanel?.parentNode) {
        aboutPanel.parentNode.insertBefore(panel, aboutPanel);
    } else if (container) {
        container.appendChild(panel);
    }
    return document.getElementById('country-panel-container');
}

export async function updateCountryProfileView() {
    if (!_root || State.get('activeView') !== 'country') return;
    const token = ++_token;
    _root.innerHTML ||= '<div class="country-empty"><strong>Cargando perfil de país...</strong></div>';

    try {
        const [data, laborData, tradeData] = await Promise.all([
            DataLoader.loadCategory('agriculture'),
            DataLoader.loadCategory('labor'),
            DataLoader.loadCategory('trade'),
        ]);
        if (token !== _token) return;
        if (!data?.countries) throw new Error('No agriculture country data');

        const countries = buildCountryList(data);
        const selected = (State.get('selectedCountries') || []).find(iso => data.countries?.[iso]);

        if (!selected) {
            _latestProfile = null;
            renderSelector(countries);
            return;
        }

        const profile = buildProfile(data, selected, State.get('currentYear'), laborData, tradeData);
        _latestProfile = profile;
        renderProfile(profile, countries);
    } catch (err) {
        console.warn('[country-profile] failed', err);
        _root.innerHTML = `
            <div class="country-empty">
                <strong>No se pudo cargar el perfil de país.</strong>
                <span>Revisa que los datos de cultivos estén disponibles.</span>
            </div>
        `;
    }
}

function buildCountryList(data) {
    if (_countryList) return _countryList;
    const collator = new Intl.Collator('es', { sensitivity: 'base' });
    _countryList = Object.entries(data.countries || {})
        .map(([iso3, entity]) => ({
            iso3,
            country: entity?.name || COUNTRIES[iso3]?.name || iso3,
            region: entity?.region || COUNTRIES[iso3]?.region || '',
        }))
        .sort((a, b) => collator.compare(a.country, b.country));
    return _countryList;
}

function renderSelector(countries) {
    _root.innerHTML = `
        <section class="country-selector-screen">
            <div class="country-selector-copy">
                <div class="country-kicker">Perfil de país</div>
                <h2>Selecciona un país</h2>
                <p>Busca o selecciona un país en el mapa para ver sus cultivos principales y sus series históricas.</p>
                <div class="country-selector-search">
                    <input type="text" id="country-profile-search" placeholder="Buscar país..." autocomplete="off">
                    <div class="country-search-results" id="country-profile-list"></div>
                </div>
            </div>
            <div class="country-map-shell country-map-shell-large" id="country-selector-map" aria-label="Mapa de selección de país"></div>
        </section>
    `;
    wireCountrySearch(countries, 'country-profile-search', 'country-profile-list', 7);
    requestAnimationFrame(() => drawCountryProfileMap('country-selector-map', null, { large: true }));
}

function renderProfile(profile, countries) {
    const dataYearText = profile.dataYear && profile.dataYear !== profile.requestedYear
        ? `dato más cercano: ${profile.dataYear}`
        : 'año seleccionado';
    const topYear = profile.dataYear || profile.requestedYear;
    const productionMetric = activeProfileMetric(PROFILE_PRODUCTION_METRICS, _profileProductionMetric);
    const laborMetric = activeProfileMetric(profile.laborMetrics, _profileLaborMetric);
    const tradeMetric = activeProfileMetric(profile.tradeMetrics, _profileTradeMetric);

    _root.innerHTML = `
        <section class="country-dashboard country-dashboard-latam">
            <aside class="country-id-card country-selector-card">
                <div class="country-id-top">
                    <div class="country-title-block">
                        <div class="country-kicker">Perfil país · ${escapeHtml(profile.iso)}</div>
                        <h2>${escapeHtml(profile.countryName)}</h2>
                        <p>Series históricas de cultivos principales</p>
                    </div>
                    <div class="country-year-chip" title="${escapeHtml(dataYearText)}">
                        <strong>${escapeHtml(String(profile.requestedYear))}</strong>
                        <span>${escapeHtml(dataYearText)}</span>
                    </div>
                </div>
                <div class="country-id-bottom">
                    <div class="country-inline-search">
                        <input type="text" id="country-profile-inline-search" placeholder="Cambiar país..." autocomplete="off">
                        <div class="country-search-results country-search-results-inline" id="country-profile-inline-list"></div>
                    </div>
                    <div class="country-map-shell country-map-shell-profile" id="country-profile-map" aria-label="Mapa del país seleccionado"></div>
                </div>
            </aside>

            <article class="country-card country-stats-card">
                <div class="country-card-head">
                    <div>
                        <h3>Datos clave</h3>
                        <span>${escapeHtml(profile.countryName)} · ${escapeHtml(dataYearText)}</span>
                    </div>
                </div>
                <div class="country-stats-body">
                    <div class="country-id-stats">
                        ${renderStat('Producción total', profile.totalProduction, 'tonnes')}
                        ${renderStat('Superficie cosechada', profile.totalArea, 'hectares')}
                        ${renderStat('Energía agraria', profile.totalEnergy, 'GJ')}
                        ${renderStat('Rendimiento medio', profile.totalYield, 't/ha')}
                        ${renderStat('Trabajo agrario', laborMetric?.hit, laborMetric?.unit)}
                        ${renderStat(tradeMetric?.title || 'Comercio agrario', tradeMetric?.hit, tradeMetric?.unit)}
                    </div>
                </div>
            </article>

            <div class="country-profile-grid">
            <article class="country-card country-chart-card country-main-chart-card">
                <div class="country-card-head country-card-head-tools">
                    <div>
                        <h3>Producción histórica</h3>
                        <span>Top 5 cultivos · ${escapeHtml(productionMetric.title)}</span>
                    </div>
                    ${renderProfilePills('production', PROFILE_PRODUCTION_METRICS, productionMetric.id)}
                    <div class="country-chart-legend">
                        ${profile.topCrops.map((crop, i) => `
                            <span><i style="background:${PROFILE_COLORS[i % PROFILE_COLORS.length]}"></i>${escapeHtml(shortItemLabel(crop.name))}</span>
                        `).join('')}
                    </div>
                </div>
                <div class="country-chart-body country-chart-body-large" id="country-production-chart"></div>
            </article>

            <article class="country-card country-chart-card country-area-chart-card">
                <div class="country-card-head">
                    <div>
                        <h3>Superficie cosechada</h3>
                        <span>Mismos cultivos · hectáreas</span>
                    </div>
                </div>
                <div class="country-chart-body" id="country-area-chart"></div>
            </article>

            <article class="country-card country-bars-card">
                <div class="country-card-head">
                    <div>
                        <h3>Cultivos principales</h3>
                        <span>Top del año ${escapeHtml(String(topYear))} · producción</span>
                    </div>
                </div>
                ${renderBars(profile)}
            </article>

            <article class="country-card country-chart-card country-yield-chart-card">
                <div class="country-card-head">
                    <div>
                        <h3>Rendimientos</h3>
                        <span>Mismos cultivos · toneladas por hectárea</span>
                    </div>
                </div>
                <div class="country-chart-body" id="country-yield-chart"></div>
            </article>

            <article class="country-card country-chart-card country-labor-chart-card">
                <div class="country-card-head country-card-head-tools">
                    <div>
                        <h3>Trabajo agrario</h3>
                        <span>${escapeHtml(laborMetric?.title || 'Sin serie disponible')}</span>
                    </div>
                    ${renderProfilePills('labor', profile.laborMetrics, laborMetric?.id)}
                </div>
                <div class="country-chart-body" id="country-labor-chart"></div>
            </article>

            <article class="country-card country-chart-card country-trade-chart-card">
                <div class="country-card-head country-card-head-tools">
                    <div>
                        <h3>Comercio agrario</h3>
                        <span>${escapeHtml(tradeMetric?.title || 'Sin serie disponible')}</span>
                    </div>
                    ${renderProfilePills('trade', profile.tradeMetrics, tradeMetric?.id)}
                </div>
                <div class="country-chart-body" id="country-trade-chart"></div>
            </article>
            </div>
        </section>
    `;

    wireCountrySearch(countries, 'country-profile-inline-search', 'country-profile-inline-list', 7);
    wireProfileMetricControls(profile);
    bindCountryBarTooltips(profile);
    requestAnimationFrame(() => renderProfileVisuals(profile));
}

function buildProfile(data, iso, requestedYear, laborData, tradeData) {
    const entity = data.countries?.[iso] || {};
    const years = data.years || [];
    const totalProduction = nearestFromArray(years, entity.totals?.production, requestedYear);
    const totalArea = nearestFromArray(years, entity.totals?.area, requestedYear);
    const totalEnergy = nearestFromArray(years, entity.totals?.value_GJ, requestedYear);
    const totalYield = nearestFromArray(years, entity.totals?.yield, requestedYear);
    const crops = buildTopCrops(entity, years, requestedYear, totalProduction?.value);
    const profile = {
        iso,
        countryName: entity.name || COUNTRIES[iso]?.name || iso,
        requestedYear,
        dataYear: totalProduction?.year || crops[0]?.year || requestedYear,
        totalProduction,
        totalArea,
        totalEnergy,
        totalYield,
        crops,
        topCrops: crops.slice(0, 5),
        laborMetrics: buildProfileMetrics(laborData, iso, requestedYear, PROFILE_LABOR_METRICS),
        tradeMetrics: buildProfileMetrics(tradeData, iso, requestedYear, PROFILE_TRADE_METRICS),
    };
    return profile;
}

function buildTopCrops(entity, years, requestedYear, totalProductionValue) {
    const items = Array.isArray(entity.topItems) ? entity.topItems : [];
    return items
        .map((item, index) => {
            const production = pointsFromArray(years, item.production);
            const area = pointsFromArray(years, item.area);
            const energy = pointsFromArray(years, item.value_GJ);
            const yieldPoints = pointsFromArray(years, item.yield);
            const yieldSeries = yieldPoints.length
                ? yieldPoints
                : ratioPointsFromArrays(years, item.production, item.area);
            const hit = nearestFromArray(years, item.production, requestedYear);
            if (hit?.value == null || hit.value <= 0 || !production.length) return null;
            return {
                name: item.name || item.code || `Cultivo ${index + 1}`,
                value: hit.value,
                year: hit.year,
                share: totalProductionValue ? (hit.value / totalProductionValue) * 100 : null,
                production,
                area,
                energy,
                yield: yieldSeries,
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
}

function buildProfileMetrics(data, iso, requestedYear, specs) {
    const entity = data?.countries?.[iso];
    const years = data?.years || [];
    return specs.map(spec => {
        const arr = entity?.totals?.[spec.field];
        const points = pointsFromArray(years, arr);
        return {
            ...spec,
            points,
            hit: nearestFromArray(years, arr, requestedYear),
        };
    });
}

function renderStat(label, hit, unit) {
    return `
        <div class="country-id-stat">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(hit?.value != null ? fmtUnit(hit.value, unit) : '—')}</strong>
            <small>${hit?.year ? escapeHtml(String(hit.year)) : '&nbsp;'}</small>
        </div>
    `;
}

function renderCropCards(profile) {
    if (!profile.crops.length) {
        return '<div class="country-note">No hay series de cultivos principales para este país.</div>';
    }
    return `
        <div class="country-crop-grid">
            ${profile.crops.slice(0, 6).map((crop, i) => `
                <div class="country-crop-card" title="${escapeHtml(crop.name)}">
                    <div class="country-crop-card-head">
                        <span>${escapeHtml(shortItemLabel(crop.name))}</span>
                        <small>#${i + 1}</small>
                    </div>
                    <strong>${escapeHtml(fmtUnit(crop.value, 'tonnes'))}</strong>
                    <div class="country-crop-meta">
                        <span>${crop.share != null ? escapeHtml(`${crop.share.toFixed(1)}% del total`) : 'participación n/d'}</span>
                        <span>${escapeHtml(String(crop.year))}</span>
                    </div>
                    ${sparklineSvg(crop.production, PROFILE_COLORS[i % PROFILE_COLORS.length])}
                </div>
            `).join('')}
        </div>
    `;
}

function renderBars(profile) {
    if (!profile.crops.length) return '<div class="country-note">Sin datos.</div>';
    const max = Math.max(...profile.crops.map(d => d.value), 1);
    return `
        <div class="country-bar-list">
            ${profile.crops.map((crop, i) => {
                const width = Math.max(2, Math.min(100, crop.value / max * 100));
                const color = PROFILE_COLORS[i % PROFILE_COLORS.length];
                return `
                    <div class="country-bar-row" data-country-bar-index="${i}" title="${escapeHtml(crop.name)} · ${escapeHtml(fmtUnit(crop.value, 'tonnes'))}">
                        <span>${escapeHtml(shortItemLabel(crop.name))}</span>
                        <div><i style="width:${width}%; background:${color}"></i></div>
                        <strong>${escapeHtml(fmtUnit(crop.value, 'tonnes'))}</strong>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderProfilePills(kind, metrics, activeId) {
    const rows = (metrics || []).filter(Boolean);
    if (!rows.length) return '';
    return `
        <div class="country-profile-pills" role="group">
            ${rows.map(metric => {
                const disabled = metric.points && metric.points.length < 2;
                return `
                    <button type="button"
                        class="${metric.id === activeId ? 'active' : ''}"
                        data-profile-metric-kind="${escapeHtml(kind)}"
                        data-profile-metric="${escapeHtml(metric.id)}"
                        ${disabled ? 'disabled' : ''}
                    >${escapeHtml(metric.label)}</button>
                `;
            }).join('')}
        </div>
    `;
}

function activeProfileMetric(metrics, activeId) {
    const rows = (metrics || []).filter(Boolean);
    return rows.find(metric => metric.id === activeId && (!metric.points || metric.points.length > 1))
        || rows.find(metric => !metric.points || metric.points.length > 1)
        || rows[0]
        || null;
}

function wireProfileMetricControls(profile) {
    _root?.querySelectorAll('[data-profile-metric-kind][data-profile-metric]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            const kind = btn.dataset.profileMetricKind;
            const metric = btn.dataset.profileMetric;
            if (kind === 'production') _profileProductionMetric = metric;
            if (kind === 'labor') _profileLaborMetric = metric;
            if (kind === 'trade') _profileTradeMetric = metric;
            renderProfile(profile, _countryList || []);
        });
    });
}

function bindCountryBarTooltips(profile) {
    _root?.querySelectorAll('[data-country-bar-index]').forEach(row => {
        row.addEventListener('mousemove', event => {
            const crop = profile.crops[Number(row.dataset.countryBarIndex)];
            if (!crop) return;
            const share = crop.share != null ? `${crop.share.toFixed(1)}% del total` : 'Participación no disponible';
            showTooltip(event, {
                title: `${crop.name} · ${crop.year}`,
                value: `<b>${fmtUnit(crop.value, 'tonnes')}</b>`,
                sub: share,
            });
        });
        row.addEventListener('mouseleave', () => hideTooltip());
    });
}

function renderProfileVisuals(profile) {
    if (!_root || State.get('activeView') !== 'country') return;
    const productionMetric = activeProfileMetric(PROFILE_PRODUCTION_METRICS, _profileProductionMetric);
    const laborMetric = activeProfileMetric(profile.laborMetrics, _profileLaborMetric);
    const tradeMetric = activeProfileMetric(profile.tradeMetrics, _profileTradeMetric);

    drawCountryProfileMap('country-profile-map', profile.iso, { large: true });
    renderLineChart('country-production-chart', profile.topCrops.map((crop, i) => ({
        label: shortItemLabel(crop.name),
        unit: productionMetric?.unit || 'tonnes',
        color: PROFILE_COLORS[i % PROFILE_COLORS.length],
        points: crop[productionMetric?.key || 'production'],
    })), { year: profile.dataYear, height: 220, endLabels: true, title: productionMetric?.title || 'Producción' });
    renderLineChart('country-area-chart', profile.topCrops.map((crop, i) => ({
        label: shortItemLabel(crop.name),
        unit: 'hectares',
        color: PROFILE_COLORS[i % PROFILE_COLORS.length],
        points: crop.area,
    })), { year: profile.dataYear, height: 178, endLabels: false, title: 'Superficie cosechada' });
    renderLineChart('country-yield-chart', profile.topCrops.map((crop, i) => ({
        label: shortItemLabel(crop.name),
        unit: 't/ha',
        color: PROFILE_COLORS[i % PROFILE_COLORS.length],
        points: crop.yield,
    })), { year: profile.dataYear, height: 178, endLabels: false, title: 'Rendimiento' });
    renderLineChart('country-labor-chart', laborMetric?.points?.length ? [{
        label: laborMetric.title,
        unit: laborMetric.unit,
        color: '#2B4570',
        points: laborMetric.points,
    }] : [], { year: profile.dataYear, height: 178, endLabels: false, title: 'Trabajo agrario' });
    renderLineChart('country-trade-chart', tradeMetric?.points?.length ? [{
        label: tradeMetric.title,
        unit: tradeMetric.unit,
        color: tradeMetric.id === 'imports' ? '#8B2500' : tradeMetric.id === 'balance' ? '#4A6B3A' : '#6B4226',
        points: tradeMetric.points,
    }] : [], { year: profile.dataYear, height: 178, endLabels: false, title: 'Comercio agrario', zeroBase: tradeMetric?.id !== 'balance' });
}

function wireCountrySearch(countries, inputId, listId, limit) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;

    function paint(filter) {
        const q = normalizeSearchText(filter || '');
        if (q.length < 1) {
            list.innerHTML = '';
            list.classList.remove('visible');
            return [];
        }
        const rows = countries
            .filter(c => normalizeSearchText(`${c.country} ${c.iso3}`).includes(q))
            .slice(0, limit);
        list.innerHTML = rows.map(c => `
            <button type="button" class="country-selector-row" data-iso="${escapeHtml(c.iso3)}">
                <span>${escapeHtml(c.country)}</span><small>${escapeHtml(c.iso3)}</small>
            </button>
        `).join('');
        list.classList.toggle('visible', rows.length > 0);
        list.querySelectorAll('[data-iso]').forEach(btn => {
            btn.addEventListener('click', () => selectCountry(btn.dataset.iso));
        });
        return rows;
    }

    input.addEventListener('input', () => paint(input.value));
    input.addEventListener('focus', () => paint(input.value));
    input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        const rows = paint(input.value);
        if (rows[0]) selectCountry(rows[0].iso3);
    });
}

function selectCountry(iso) {
    if (!iso) return;
    if (State.get('geoLevel') !== 'country') State.set('geoLevel', 'country');
    State.setCountries([iso]);
}

function drawCountryProfileMap(containerId, selectedIso, opts = {}) {
    const container = document.getElementById(containerId);
    const geo = DataLoader.getGeo();
    if (!container || !geo?.features?.length || typeof d3 === 'undefined') return;

    const rect = container.getBoundingClientRect();
    const fallbackW = opts.large ? 720 : 260;
    const fallbackH = opts.large ? 440 : 220;
    const width = Math.max(opts.large ? 320 : 180, Math.round(rect.width || container.clientWidth || fallbackW));
    const height = Math.max(opts.large ? 260 : 160, Math.round(rect.height || container.clientHeight || fallbackH));
    const pad = opts.large ? 20 : 10;
    const projection = d3.geoMercator().fitExtent([[pad, pad], [width - pad, height - pad]], geo);
    const path = d3.geoPath(projection);
    const available = new Set((_countryList || []).map(c => c.iso3));

    const svg = d3.select(container).html('').append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('role', 'img')
        .attr('aria-label', 'Mapa de América Latina');

    svg.append('rect')
        .attr('class', 'country-profile-map-bg')
        .attr('width', width)
        .attr('height', height);

    const paths = svg.append('g')
        .selectAll('path')
        .data(geo.features)
        .join('path')
        .attr('class', d => {
            const iso = d.properties?.iso3;
            return 'country-profile-map-country'
                + (iso === selectedIso ? ' selected' : '')
                + (!available.has(iso) ? ' disabled' : '');
        })
        .attr('d', path)
        .on('click', (event, d) => {
            const iso = d.properties?.iso3;
            if (!available.has(iso)) return;
            event.stopPropagation();
            selectCountry(iso);
        })
        .on('mousemove', (event, d) => {
            const iso = d.properties?.iso3;
            const name = d.properties?.name || COUNTRIES[iso]?.name || iso || '';
            showTooltip(event, {
                title: name,
                value: iso === selectedIso ? 'País seleccionado' : (available.has(iso) ? 'Clic para ver perfil' : 'Sin datos de perfil'),
            });
        })
        .on('mouseleave', () => hideTooltip());

    paths
        .append('title')
        .text(d => d.properties?.name || d.properties?.iso3 || '');

    if (selectedIso) {
        const selected = geo.features.find(f => f.properties?.iso3 === selectedIso);
        if (selected) {
            const [cx, cy] = path.centroid(selected);
            svg.append('circle')
                .attr('class', 'country-profile-map-pin')
                .attr('cx', cx)
                .attr('cy', cy)
                .attr('r', opts.large ? 5 : 4);
        }
    }
}

function renderLineChart(containerId, seriesDefs, opts = {}) {
    const container = document.getElementById(containerId);
    if (!container || typeof d3 === 'undefined') return;

    const defs = (seriesDefs || [])
        .map(def => ({ ...def, points: (def.points || []).filter(p => p.value != null && isFinite(+p.value)) }))
        .filter(def => def.points.length > 1);

    if (!defs.length) {
        container.innerHTML = '<div class="country-chart-empty">Sin datos.</div>';
        return;
    }

    const allPoints = defs.flatMap(def => def.points);
    const rect = container.getBoundingClientRect();
    const width = Math.max(260, Math.round(rect.width || container.clientWidth || 520));
    const height = Math.max(170, Math.round(rect.height || opts.height || 220));
    const margin = { top: 16, right: opts.endLabels ? 96 : 18, bottom: 31, left: 56 };
    const plotWidth = Math.max(80, width - margin.left - margin.right);
    const plotHeight = Math.max(80, height - margin.top - margin.bottom);
    const xExtent = d3.extent(allPoints, d => d.year);
    const values = allPoints.map(d => +d.value).filter(Number.isFinite);
    const dataMin = Math.min(...values);
    const yMinRaw = opts.zeroBase === false ? dataMin : Math.min(0, dataMin);
    const yMaxRaw = Math.max(...values, 1);
    const ySpread = Math.max(yMaxRaw - yMinRaw, Math.abs(yMaxRaw) * 0.08, 1);
    const yMin = yMinRaw < 0 ? yMinRaw - ySpread * 0.08 : 0;
    const yMax = yMaxRaw + ySpread * 0.08;
    const x = d3.scaleLinear()
        .domain(xExtent[0] === xExtent[1] ? [xExtent[0] - 1, xExtent[1] + 1] : xExtent)
        .range([margin.left, width - margin.right]);
    const y = d3.scaleLinear()
        .domain([yMin, yMax])
        .nice(5)
        .range([height - margin.bottom, margin.top]);
    const xTicks = smartXTicks(x.domain(), plotWidth);
    const line = d3.line()
        .defined(d => d.value != null && isFinite(+d.value))
        .x(d => x(d.year))
        .y(d => y(+d.value));

    const svg = d3.select(container).html('').append('svg')
        .attr('class', 'country-profile-chart')
        .attr('viewBox', `0 0 ${width} ${height}`);

    svg.append('g')
        .attr('class', 'country-chart-grid')
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).tickValues(xTicks).tickFormat(d3.format('d')).tickSize(-plotHeight))
        .call(g => g.select('.domain').remove());

    svg.append('g')
        .attr('class', 'country-chart-axis')
        .attr('transform', `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(5).tickFormat(formatAxis).tickSizeOuter(0))
        .call(g => g.select('.domain').remove());

    svg.append('g')
        .attr('class', 'country-chart-axis country-chart-axis-x')
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).tickValues(xTicks).tickFormat(d3.format('d')).tickSizeOuter(0))
        .call(g => g.select('.domain').remove());

    if (y.domain()[0] < 0 && y.domain()[1] > 0) {
        svg.append('line')
            .attr('class', 'country-chart-zero')
            .attr('x1', margin.left)
            .attr('x2', width - margin.right)
            .attr('y1', y(0))
            .attr('y2', y(0));
    }

    const currentYear = +opts.year;
    if (isFinite(currentYear) && currentYear >= x.domain()[0] && currentYear <= x.domain()[1]) {
        svg.append('line')
            .attr('class', 'country-chart-year')
            .attr('x1', x(currentYear))
            .attr('x2', x(currentYear))
            .attr('y1', margin.top)
            .attr('y2', height - margin.bottom);
    }

    defs.forEach(def => {
        svg.append('path')
            .datum(def.points)
            .attr('class', 'country-chart-line')
            .attr('fill', 'none')
            .attr('stroke', def.color)
            .attr('d', line)
            .append('title')
            .text(`${def.label} · ${def.unit || ''}`);

        const focus = nearestPoint(def.points, currentYear) || def.points[def.points.length - 1];
        if (focus) {
            svg.append('circle')
                .attr('class', 'country-chart-focus')
                .attr('cx', x(focus.year))
                .attr('cy', y(focus.value))
                .attr('r', 3.4)
                .attr('fill', '#fff')
                .attr('stroke', def.color);
        }

    });

    if (opts.endLabels) {
        layoutEndLabels(defs, y, height, margin).forEach(row => {
            svg.append('text')
                .attr('class', 'country-chart-label')
                .attr('x', x(row.last.year) + 7)
                .attr('y', row.labelY)
                .attr('fill', row.def.color)
                .text(row.def.label);
        });
    }

    addLineChartHover(svg, defs, x, y, width, height, margin, opts);
}

function layoutEndLabels(defs, y, height, margin) {
    const gap = 12;
    const top = margin.top + 8;
    const bottom = height - margin.bottom - 6;
    const rows = defs
        .map(def => {
            const last = def.points?.[def.points.length - 1];
            return last ? { def, last, labelY: y(last.value) + 3 } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.labelY - b.labelY);

    rows.forEach(row => {
        row.labelY = Math.max(top, Math.min(bottom, row.labelY));
    });
    for (let i = 1; i < rows.length; i += 1) {
        rows[i].labelY = Math.max(rows[i].labelY, rows[i - 1].labelY + gap);
    }
    const overflow = rows.length ? rows[rows.length - 1].labelY - bottom : 0;
    if (overflow > 0) {
        rows.forEach(row => { row.labelY -= overflow; });
        for (let i = rows.length - 2; i >= 0; i -= 1) {
            rows[i].labelY = Math.min(rows[i].labelY, rows[i + 1].labelY - gap);
        }
        rows.forEach(row => {
            row.labelY = Math.max(top, Math.min(bottom, row.labelY));
        });
    }
    return rows;
}

function addLineChartHover(svg, defs, x, y, width, height, margin, opts) {
    const years = Array.from(new Set(defs.flatMap(def => def.points.map(point => point.year)))).sort((a, b) => a - b);
    if (!years.length) return;

    const hover = svg.append('g')
        .attr('class', 'country-chart-hover')
        .style('display', 'none');
    const hoverLine = hover.append('line')
        .attr('class', 'country-chart-hover-line')
        .attr('y1', margin.top)
        .attr('y2', height - margin.bottom);
    const dots = defs.map(def => hover.append('circle')
        .attr('r', 3.6)
        .attr('fill', def.color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .style('display', 'none'));

    svg.append('rect')
        .attr('class', 'country-chart-overlay')
        .attr('x', margin.left)
        .attr('y', margin.top)
        .attr('width', Math.max(0, width - margin.left - margin.right))
        .attr('height', Math.max(0, height - margin.top - margin.bottom))
        .on('mousemove', event => {
            const [mx] = d3.pointer(event, svg.node());
            const rawYear = x.invert(mx);
            const year = years.reduce((best, candidate) =>
                Math.abs(candidate - rawYear) < Math.abs(best - rawYear) ? candidate : best,
                years[0]
            );
            hover.style('display', null);
            hoverLine.attr('x1', x(year)).attr('x2', x(year));

            const entries = [];
            defs.forEach((def, i) => {
                const point = def.points.find(d => d.year === year);
                if (!point) {
                    dots[i].style('display', 'none');
                    return;
                }
                dots[i]
                    .attr('cx', x(point.year))
                    .attr('cy', y(point.value))
                    .style('display', null);
                entries.push(`<span style="color:${def.color}">-</span> ${escapeHtml(def.label)}: <b>${escapeHtml(fmtUnit(point.value, def.unit || opts.unit || ''))}</b>`);
            });

            if (entries.length) {
                showTooltip(event, {
                    title: `${escapeHtml(opts.title || 'Serie')} · ${year}`,
                    value: entries.join('<br>'),
                });
            }
        })
        .on('mouseleave', () => {
            hover.style('display', 'none');
            hideTooltip();
        });
}

function pointsFromArray(years, arr) {
    if (!Array.isArray(years) || !Array.isArray(arr)) return [];
    return years.map((year, i) => ({ year: +year, value: cleanNumber(arr[i]) }))
        .filter(d => isFinite(d.year) && d.value != null);
}

function ratioPointsFromArrays(years, numerator, denominator) {
    if (!Array.isArray(years) || !Array.isArray(numerator) || !Array.isArray(denominator)) return [];
    return years.map((year, i) => {
        const top = cleanNumber(numerator[i]);
        const bottom = cleanNumber(denominator[i]);
        const value = top != null && bottom != null && bottom > 0 ? top / bottom : null;
        return { year: +year, value };
    }).filter(d => isFinite(d.year) && d.value != null);
}

function nearestFromArray(years, arr, requestedYear) {
    const points = pointsFromArray(years, arr);
    if (!points.length) return null;
    const requested = +requestedYear;
    return points.reduce((best, point) => {
        const dist = Math.abs(point.year - requested);
        const bestDist = Math.abs(best.year - requested);
        if (dist < bestDist) return point;
        if (dist === bestDist && point.year > best.year) return point;
        return best;
    }, points[0]);
}

function nearestPoint(points, requestedYear) {
    const rows = (points || []).filter(p => p.value != null && isFinite(+p.value));
    if (!rows.length || !isFinite(+requestedYear)) return rows[rows.length - 1] || null;
    return rows.reduce((best, point) => {
        const dist = Math.abs(point.year - requestedYear);
        const bestDist = Math.abs(best.year - requestedYear);
        return dist < bestDist ? point : best;
    }, rows[0]);
}

function sparklineSvg(points, color) {
    const rows = (points || []).filter(d => d.value != null && isFinite(+d.value));
    if (rows.length < 2) return '<svg class="country-sparkline" viewBox="0 0 120 34" aria-hidden="true"></svg>';
    const width = 120;
    const height = 34;
    const x0 = rows[0].year;
    const x1 = rows[rows.length - 1].year;
    const yMax = Math.max(...rows.map(d => +d.value), 1);
    const path = rows.map((d, i) => {
        const x = x1 === x0 ? width / 2 : ((d.year - x0) / (x1 - x0)) * (width - 4) + 2;
        const y = height - 3 - (+d.value / yMax) * (height - 8);
        return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `
        <svg class="country-sparkline" viewBox="0 0 ${width} ${height}" aria-hidden="true">
            <path d="${path}" fill="none" stroke="${escapeHtml(color)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `;
}

function cleanNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function formatAxis(value) {
    return fmt(+value);
}

function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[ch]));
}
