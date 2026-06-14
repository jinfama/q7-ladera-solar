/* app.js - Main application controller for Atlas Agrario de América Latina */

import State from './state.js?v=20260522-mobile-ui18';
import DataLoader from './data-loader.js?v=20260522-mobile-ui18';
import { COUNTRIES, REGIONS, CATEGORY_ICONS, VIEWS, CAT_COLORS, fmt, fmtUnit, shortItemLabel, shortEntityLabel } from './utils.js?v=20260522-mobile-ui18';
import { initMapView, updateMapView } from './views/map-view.js?v=20260522-mobile-ui18';
import { initTrendView, updateTrendView } from './views/trend-view.js?v=20260522-mobile-ui18';
import { initTreemapView, updateTreemapView } from './views/treemap-view.js?v=20260522-mobile-ui18';
import { initRankingView, updateRankingView } from './views/ranking-view.js?v=20260522-mobile-ui18';
import { initTableView, updateTableView } from './views/table-view.js?v=20260522-mobile-ui18';
import { initBilateralView, updateBilateralView } from './views/bilateral-view.js?v=20260522-mobile-ui18';
import { initCountryProfileView, updateCountryProfileView } from './views/country-profile.js?v=20260522-mobile-ui18';
import { initTimeline, updateTimeline } from './components/timeline.js?v=20260522-mobile-ui18';
import { initTooltip, showTooltip, hideTooltip } from './components/tooltip.js';

const CATEGORY_ORDER = ['landuse', 'agriculture', 'livestock', 'trade', 'labor', 'footprints', 'socioeconomic'];

const ITEM_PICKER_LABELS = {
    landuse:     { title: 'Seleccionar uso', search: 'Buscar uso...', all: 'Todos los usos', header: 'USOS DEL SUELO' },
    agriculture: { title: 'Seleccionar cultivo', search: 'Buscar cultivo...', all: 'Todos los cultivos', header: 'CULTIVOS' },
    trade:       { title: 'Seleccionar producto', search: 'Buscar producto...', all: 'Todos los productos', header: 'PRODUCTOS' },
    livestock:   { title: 'Seleccionar especie', search: 'Buscar especie...', all: 'Todas las especies', header: 'ESPECIES' },
    labor:       { title: 'Seleccionar tipo', search: 'Buscar tipo...', all: 'Todos los tipos', header: 'TIPOS DE PRODUCTO' },
};

const ITEM_FACET_LABEL = {
    agriculture: 'producto',
    trade: 'producto',
    livestock: 'especie',
    landuse: 'uso',
    labor: 'tipo',
};

const FOOTPRINT_DIMENSIONS = [
    { id: 'land', label: 'Tierra' },
    { id: 'labor', label: 'Trabajo' },
];

const FOOTPRINT_FLOWS = [
    { id: 'footprint', label: 'Huella' },
    { id: 'production', label: 'Producción', shortLabel: 'Prod.' },
    { id: 'imports', label: 'Importaciones', shortLabel: 'Import.' },
    { id: 'exports', label: 'Exportaciones', shortLabel: 'Export.' },
];

const CATEGORY_SOURCE_INFO = {
    agriculture: {
        sources: 'Instituto Internacional de Agricultura, FAO/FAOSTAT, estadísticas nacionales y series históricas por producto.',
        method: 'Se conservan observaciones originales cuando existen. Las lagunas se completan en el pipeline con interpolación entre anclas, extrapolación documentada y empalmes con FAOSTAT.',
        availability: 'El JSON del visor no conserva fuente y método por celda para cultivos; para una pestaña fila-a-fila hay que exportar esos campos desde la base larga original.',
    },
    trade: {
        sources: 'FAOSTAT, panel histórico de comercio agrario y agregaciones regionales propias. El módulo bilateral usa matrices de socios por producto cuando existen.',
        method: 'Comercio directo agrega exportaciones, importaciones y balanza. Comercio bilateral muestra socios y productos con desagregación bilateral disponible.',
        availability: 'El JSON de navegador conserva productos/socios bilaterales agregados, pero no una etiqueta fuente/método por celda.',
    },
    footprints: {
        sources: 'Resumen M03 de huellas agrarias en el comercio: tierra incorporada (land_ha) y horas de trabajo agrario (hours_total).',
        method: 'Se agregan cuatro flujos país-año: huella de consumo, producción territorial, importaciones incorporadas y exportaciones incorporadas. No se muestra desglose por tipo de producto.',
        availability: 'Cobertura 1962-2021 para el panel fijo de América Latina; las regiones son sumas de países miembros.',
    },
    landuse: {
        sources: 'FAOSTAT Inputs/Land Use y la base final land_use_national cuando est- disponible.',
        method: 'Se armonizan usos de suelo principales y agregados regionales a partir de las series nacionales.',
        availability: 'El JSON actual no incluye fuente/método por observación; se puede añadir regenerando desde el panel largo original.',
    },
    livestock: {
        sources: 'Base procesada livestock.rds con cabezas, unidades ganaderas, consumo de forraje, source y method_value en origen.',
        method: 'El visor agrega por especie, país y región; el selector se ordena por unidades ganaderas para evitar que las cabezas de aves dominen la relevancia.',
        availability: 'La base original sí contiene source/method_value, pero el JSON agregado del visor aún no los expone por celda.',
    },
    labor: {
        sources: 'Panel histórico de empleo agrario y forestal y base labour_synthesis del proyecto de huella laboral por tipo de producto.',
        method: 'Los totales nacionales mantienen la serie histórica 1900-2024. El selector por tipo usa la desagregación producto/categoría disponible para 1961-2021, agregada a países y regiones latinoamericanas.',
        availability: 'El JSON del visor conserva la desagregación por tipo, pero no aún la fuente/método por celda de la base larga original.',
    },
    socioeconomic: {
        sources: 'Gini de tierra: Frankema, Deininger/Olinto y WCAD/FAOSTAT. Reforma agraria: Albertus.',
        method: 'Las observaciones originales se preservan como puntos de corte; las series anuales pueden incluir interpolación lineal y agregación regional con panel fijo.',
        availability: 'Este módulo s- conserva metadatos de source/method en las observaciones del JSON.',
    },
};

const FOOTER_SOURCE_LABELS = {
    agriculture: 'Fuente: IIA · FAO/FAOSTAT · estadísticas nacionales',
    trade: 'Fuente: FAOSTAT · panel histórico de comercio · matrices bilaterales',
    footprints: 'Fuente: M03 trade footprint · land_ha · hours_total',
    landuse: 'Fuente: FAOSTAT Land Use · base land_use_national',
    livestock: 'Fuente: base livestock.rds · FAOSTAT · fuentes nacionales',
    labor: 'Fuente: empleo agrario histórico · labour_synthesis',
    socioeconomic: 'Fuente: Gini tierra histórico · reforma agraria · ver fuentes y método',
};

const DATASET_CITATIONS = {
    default: 'Infante-Amate et al. (forthcoming). Latin American Agrarian Database.',
    labor: 'Infante-Amate and Escalante (forthcoming). Agricultural Labour Database for Latin America.',
    footprints: 'Infante-Amate and Escalante (forthcoming). Agricultural Labour Database for Latin America.',
};

const INDICATOR_HELP = {
    production: 'Producción física anual del cultivo o conjunto de cultivos seleccionados. Es aditiva por producto y territorio.',
    area: 'Superficie cosechada o cultivada asociada al producto seleccionado. Es una magnitud aditiva.',
    yield: 'Rendimiento por hectárea. Es un cociente, por eso no debe sumarse como si fuera producción.',
    exports: 'Exportaciones agrarias directas del territorio seleccionado hacia el resto del mundo, agregadas por producto.',
    imports: 'Importaciones agrarias directas recibidas por el territorio seleccionado, agregadas por producto.',
    balance: 'Exportaciones menos importaciones. Puede ser positivo o negativo y no conviene tratarlo como participación porcentual.',
    bilateral_exports: 'Flujos bilaterales de exportación desde el origen latinoamericano hacia cada socio. El mapa mundial muestra los principales socios del año y producto seleccionados.',
    bilateral_imports: 'Flujos bilaterales de importación desde cada socio hacia el territorio latinoamericano seleccionado.',
    bilateral_balance: 'Saldo bilateral entre exportaciones e importaciones para el socio seleccionado. Puede ser positivo o negativo.',
    land_footprint: 'Huella de tierra asociada al consumo agrario: tierra doméstica consumida en el país más tierra incorporada en importaciones.',
    land_production: 'Tierra incorporada en la producción agraria territorial.',
    land_imports: 'Tierra incorporada en importaciones agrarias consumidas por el territorio.',
    land_exports: 'Tierra incorporada en exportaciones agrarias enviadas al exterior.',
    labor_footprint: 'Huella de trabajo asociada al consumo agrario: horas domésticas consumidas en el país más horas incorporadas en importaciones.',
    labor_production: 'Horas de trabajo agrario incorporadas en la producción territorial.',
    labor_imports: 'Horas de trabajo agrario incorporadas en importaciones consumidas por el territorio.',
    labor_exports: 'Horas de trabajo agrario incorporadas en exportaciones enviadas al exterior.',
    land_area: 'Superficie dedicada al uso del suelo seleccionado. La serie nacional se usa como respaldo cuando no hay desagregación subnacional.',
    heads: 'Número de cabezas de ganado. Es útil para stock físico, pero no compara bien especies de tamaños muy distintos.',
    lu: 'Unidades ganaderas, una conversión del stock animal a una unidad común para comparar especies.',
    grass_intake: 'Energía anual de forraje o alimentación asociada al stock ganadero.',
    workers: 'Personas ocupadas en actividades agrarias. Si seleccionas un tipo de producto, muestra el trabajo asignado a ese tipo en la base de huella laboral.',
    workers_forestry: 'Personas ocupadas en agricultura y actividades forestales cuando la fuente las presenta conjuntamente.',
    workers_livestock: 'Personas ocupadas en ganadería estimadas a partir del componente ganadero.',
    hours: 'Horas anuales de trabajo agrario, expresadas en millones de horas. Con tipo de producto seleccionado, muestra las horas asignadas a ese tipo.',
    hours_forestry: 'Horas anuales de agricultura y forestal cuando la fuente combina ambas actividades.',
    hours_livestock: 'Horas anuales de trabajo ganadero estimadas.',
    share: 'Participación del empleo agrario en el empleo total. Es un porcentaje, no una cantidad aditiva.',
    land_gini: 'Índice de concentración de la propiedad o distribución de la tierra. Cero sería igualdad perfecta y uno máxima concentración.',
    gini_disp: 'Índice de Gini de ingreso disponible, después de impuestos y transferencias cuando la fuente lo permite.',
    gini_mkt: 'Índice de Gini de ingreso de mercado, antes del efecto redistributivo de impuestos y transferencias.',
    reform_total_pc: 'Tierra afectada por reforma agraria en el año, expresada como porcentaje de la tierra cultivable. Mide alcance anual, no producción.',
    reform_intensity: 'Código ordinal de intensidad de reforma agraria. Los valores ordenan intensidad institucional, no son una cantidad física.',
    reform_binary: 'Indicador 0/1 de presencia de legislación o episodio de reforma agraria. Sirve para identificar eventos, no magnitudes.',
};

function _orderedCategories(meta) {
    const order = new Map(CATEGORY_ORDER.map((id, i) => [id, i]));
    return [...(meta?.categories || [])].sort((a, b) => {
        const ai = order.has(a.id) ? order.get(a.id) : 99;
        const bi = order.has(b.id) ? order.get(b.id) : 99;
        return ai - bi;
    });
}

// Guard flag: while true, intermediate State changes inside _onCategoryChange
// should NOT trigger redundant view updates (data may not match the new category yet).
let _categoryChanging = false;
let _categoryChangeSeq = 0;
let _aboutCoverageLoaded = false;

/* -----------------------------------------------
   Initialization
   ----------------------------------------------- */
(function init() {
  try {
    console.log('[INIT] Starting app initialization...');
    const meta = DataLoader.getMetadata();
    if (!meta) {
        console.error('[INIT] FAIL: Metadata not loaded');
        return;
    }
    console.log('[INIT] Metadata OK, categories:', meta.categories?.length);

    // Init views FIRST (before anything that might call updateXxxView)
    initTooltip();
    initMapView();
    initTrendView();
    initTreemapView();
    initRankingView();
    initTableView();
    try { initBilateralView(); } catch(e) { console.warn('[INIT] Bilateral init error (cached?):', e.message); }
    initCountryProfileView();
    initTimeline();
    console.log('[INIT] Views initialized');

    // Build UI
    _buildSidebar(meta);
    _buildTopViews();
    _buildIndicatorPanel(meta);
    _buildSelectionBar();
    _buildRightPanel(meta);
    console.log('[INIT] UI built');

    // Preload subnational data in background (so it's ready when user clicks Subnacional)
    DataLoader.loadSubnational();

    // Sync yearRange with loaded data - use effective range based on actual data availability
    _updateYearRangeFromData();
    const effectiveRange = State.get('yearRange');
    if (effectiveRange) {
        State.set('currentYear', effectiveRange[1]);
        updateTimeline();
    }

    // State subscriptions
    State.subscribe('activeView', _switchView);
    State.subscribe('activeCategory', () => _onCategoryChange(meta));
    State.subscribe('activeIndicator', _onIndicatorChange);
    State.subscribe('currentYear', _onYearChange);
    State.subscribe('yearRange', () => {
        updateTimeline();
        _updateCurrentView();
        if (_isSplitActive()) updateTrendView();
    });
    State.subscribe('selectedCountries', () => {
        _buildSelectionBar();
        if (State.get('activeView') === 'trend') {
            _updateYearRangeFromData();
            updateTimeline();
        }
    });
    State.subscribe('geoLevel', _onGeoLevelChange);
    State.subscribe('compareMode', () => {
        _buildRPOptions();
        updateTimeline();
        _updateCurrentView();
    });
    State.subscribe('startYear', () => {
        updateTimeline();
        _updateCurrentView();
    });
    State.subscribe('splitMode', () => {
        _applySplitLayout();
        _buildRPOptions();
        _updateCurrentView();
        if (_isSplitActive()) updateTrendView();
        setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    });
    // Re-evaluate split eligibility when the window crosses the breakpoint
    window.addEventListener('resize', () => {
        const wasSplit = document.body.classList.contains('split-active');
        _applySplitLayout();
        if (_isSplitActive() && !wasSplit) updateTrendView();
    });
    _initRightPanelResize();
    _initResponsivePanels();
    _initMobileRightPanelDismiss();

    // Geo pills (if any remain in the DOM)
    document.querySelectorAll('.geo-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            State.set('geoLevel', btn.dataset.level);
            document.querySelectorAll('.geo-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Toggle right panel
    document.getElementById('btn-toggle-panel')?.addEventListener('click', () => {
        const panel = document.getElementById('right-panel');
        if (!panel) return;
        _setRightPanelOpen(panel.classList.contains('hidden'));
    });
    document.getElementById('right-panel-close')?.addEventListener('click', () => {
        _setRightPanelOpen(false);
    });
    _bindIndicatorInfoButton();

    // Info / about buttons
    document.querySelectorAll('.about-toggle-btn').forEach(btn => btn.addEventListener('click', () => {
        if (State.get('activeView') === 'about') {
            State.set('activeView', 'map');
        } else {
            _activateAboutSection('equipo', meta);
            State.set('activeView', 'about');
        }
    }));

    // Download/export dialog
    document.getElementById('btn-csv').addEventListener('click', _downloadDataPackage);

    // Fullscreen
    document.getElementById('btn-fs').addEventListener('click', _toggleFullscreen);

    // About navigation
    document.querySelectorAll('.about-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _activateAboutSection(btn.dataset.section, meta);
        });
    });

    // Update year display
    document.getElementById('tl-year').textContent = State.get('currentYear');

    // Mark init done so selection bar updates trigger view refreshes
    _initDone = true;

    // Ensure initial view panel is activated
    _switchView(State.get('activeView'));

    // Trigger initial render - use rAF to ensure DOM has reflowed after panel activation
    requestAnimationFrame(() => {
        _updateAllViews();
        // Rebuild right panel after data is loaded and views rendered
        _buildRPOptions();
        _buildRPProducts();
        _buildRPPartners();
        _buildRPTerritories();
        requestAnimationFrame(() => _updateAllViews());
    });

    console.log('[INIT] Atlas Agrario initialized OK');
  } catch (err) {
    console.error('[INIT] CRASH:', err, err?.stack);
  }
})();

/* -----------------------------------------------
   About: methodology and coverage
   ----------------------------------------------- */
async function _ensureAboutCoverage(meta) {
    if (_aboutCoverageLoaded) return;
    const summary = document.getElementById('coverage-summary');
    const grid = document.getElementById('coverage-grid');
    if (!summary || !grid) return;

    _aboutCoverageLoaded = true;
    summary.innerHTML = '<span class="coverage-loading">Calculando cobertura desde los JSON actuales del visor...</span>';
    grid.innerHTML = '';

    try {
        const cats = _orderedCategories(meta).filter(cat => cat.enabled);
        const results = await Promise.all(cats.map(async cat => {
            const data = await DataLoader.loadCategory(cat.id);
            return { cat, data };
        }));

        const cards = results.map(({ cat, data }) => _buildCoverageCard(cat, data));
        try {
            await DataLoader.loadSubnational();
            cards.push(_buildSubnationalCoverageCard(DataLoader.getSubnationalData()));
        } catch (err) {
            console.warn('[ABOUT] Subnational coverage unavailable:', err);
        }

        grid.innerHTML = cards.join('');

        const totalIndicators = results.reduce((sum, item) => sum + _indicatorEntries(item.cat).length, 0);
        const totalCountries = new Set(results.flatMap(item => Object.keys(item.data?.countries || {}))).size;
        const globalRange = _formatRange(_mergeCoverageRanges(
            results.map(item => _dataYearRange(item.data)).filter(Boolean)
        ));
        summary.innerHTML = `
            <div class="coverage-summary-card">
                <strong>${totalIndicators}</strong> indicadores activos -
                <strong>${totalCountries}</strong> pa&iacute;ses con datos -
                cobertura temporal general <strong>${globalRange}</strong>.
                <span>Los rangos se calculan sobre valores no nulos; no sustituyen la documentaci&oacute;n metodol&oacute;gica final.</span>
            </div>
        `;
    } catch (err) {
        _aboutCoverageLoaded = false;
        console.error('[ABOUT] Coverage failed:', err);
        summary.innerHTML = '<span class="coverage-error">No se pudo calcular la cobertura. Revisa la consola del navegador.</span>';
    }
}

function _buildCoverageCard(cat, data) {
    const entries = _indicatorEntries(cat);
    const dataRange = _formatRange(_dataYearRange(data));
    const countryCount = Object.keys(data?.countries || {}).length;
    const regionCount = Object.keys(data?.regions || {}).length;
    const source = CATEGORY_SOURCE_INFO[cat.id]?.sources || 'Fuente pendiente de documentar.';
    const rows = entries.map(entry => _coverageRow(entry, data));
    const rowHtml = rows.length
        ? rows.map(row => `
            <tr>
                <td>${_escapeHtml(row.label)}</td>
                <td>${_escapeHtml(row.range)}</td>
                <td>${row.countries}</td>
                <td>${row.regions}</td>
                <td>${_fmtInt(row.observations)}</td>
            </tr>
        `).join('')
        : '<tr><td colspan="5">Sin indicadores activos.</td></tr>';

    return `
        <article class="coverage-card">
            <div class="coverage-card-header">
                <div>
                    <h2>${_escapeHtml(cat.label)}</h2>
                    <p>${dataRange} - ${countryCount} pa&iacute;ses - ${regionCount} regiones</p>
                </div>
                <span class="coverage-pill">${entries.length} ind.</span>
            </div>
            <div class="coverage-source">${_escapeHtml(source)}</div>
            <table class="coverage-table">
                <thead>
                    <tr>
                        <th>Indicador</th>
                        <th>A&ntilde;os</th>
                        <th>Pa&iacute;ses</th>
                        <th>Regiones</th>
                        <th>Obs.</th>
                    </tr>
                </thead>
                <tbody>${rowHtml}</tbody>
            </table>
        </article>
    `;
}

function _buildSubnationalCoverageCard(subData) {
    if (!subData?.countries) {
        return `
            <article class="coverage-card">
                <div class="coverage-card-header">
                    <div>
                        <h2>Subnacional</h2>
                        <p>Sin datos subnacionales cargados</p>
                    </div>
                    <span class="coverage-pill">admin1</span>
                </div>
            </article>
        `;
    }

    const fieldLabels = {
        production: 'Producci&oacute;n',
        area: 'Superficie',
        value_GJ: 'Producci&oacute;n (GJ)',
        yield: 'Rendimiento',
    };
    const fields = new Set();
    Object.values(subData.countries || {}).forEach(country => {
        Object.values(country.admin1 || {}).forEach(admin => {
            Object.keys(admin.totals || {}).forEach(field => fields.add(field));
        });
    });
    const countryCount = Object.keys(subData.countries || {}).length;
    const adminCount = Object.values(subData.countries || {})
        .reduce((sum, country) => sum + Object.keys(country.admin1 || {}).length, 0);
    const rows = [...fields].sort().map(field => {
        const cov = _scanAdminCoverage(subData, field);
        return `
            <tr>
                <td>${fieldLabels[field] || _escapeHtml(field)}</td>
                <td>${_formatRange(cov.range)}</td>
                <td>${cov.countries}</td>
                <td>${cov.admins} uds.</td>
                <td>${_fmtInt(cov.observations)}</td>
            </tr>
        `;
    }).join('');

    return `
        <article class="coverage-card coverage-card-subnational">
            <div class="coverage-card-header">
                <div>
                    <h2>Subnacional</h2>
                    <p>${_formatRange(_dataYearRange(subData))} - ${countryCount} pa&iacute;ses - ${adminCount} unidades admin1</p>
                </div>
                <span class="coverage-pill">admin1</span>
            </div>
            <div class="coverage-source">Cobertura territorial desagregada disponible en los JSON subnacionales del visor.</div>
            <table class="coverage-table">
                <thead>
                    <tr>
                        <th>Variable</th>
                        <th>A&ntilde;os</th>
                        <th>Pa&iacute;ses</th>
                        <th>Unidades</th>
                        <th>Obs.</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </article>
    `;
}

function _indicatorEntries(cat) {
    return (cat.indicatorGroups || []).flatMap(group => (
        (group.indicators || [])
            .filter(ind => ind.enabled)
            .map(ind => ({ group, ind, cat }))
    ));
}

function _coverageRow(entry, data) {
    const field = entry.ind.dataField || entry.ind.id;
    const country = _scanEntityCoverage(data?.countries, data?.years, field);
    const region = _scanEntityCoverage(data?.regions, data?.years, field);
    const range = _mergeCoverageRanges([country.range, region.range]);
    const groupLabel = entry.group?.label || '';
    const indicatorLabel = entry.ind?.label || field;
    const label = groupLabel && groupLabel !== indicatorLabel
        ? `${groupLabel} - ${indicatorLabel}`
        : indicatorLabel;

    return {
        label,
        range: _formatRange(range),
        countries: country.entities,
        regions: region.entities,
        observations: country.observations + region.observations,
    };
}

function _scanEntityCoverage(entities, years = [], field) {
    const out = { entities: 0, observations: 0, range: null };
    if (!entities || !field) return out;
    let first = Infinity;
    let last = -Infinity;

    Object.values(entities).forEach(entity => {
        const series = entity?.totals?.[field];
        if (!Array.isArray(series)) return;
        let hasData = false;
        series.forEach((value, index) => {
            if (!_isFiniteValue(value)) return;
            const year = years[index];
            if (year == null) return;
            hasData = true;
            out.observations += 1;
            first = Math.min(first, year);
            last = Math.max(last, year);
        });
        if (hasData) out.entities += 1;
    });

    out.range = first === Infinity ? null : [first, last];
    return out;
}

function _scanAdminCoverage(subData, field) {
    const out = { countries: 0, admins: 0, observations: 0, range: null };
    let first = Infinity;
    let last = -Infinity;
    Object.values(subData?.countries || {}).forEach(country => {
        let countryHasData = false;
        Object.values(country.admin1 || {}).forEach(admin => {
            const series = admin?.totals?.[field];
            if (!Array.isArray(series)) return;
            let adminHasData = false;
            series.forEach((value, index) => {
                if (!_isFiniteValue(value)) return;
                const year = subData.years?.[index];
                if (year == null) return;
                adminHasData = true;
                countryHasData = true;
                out.observations += 1;
                first = Math.min(first, year);
                last = Math.max(last, year);
            });
            if (adminHasData) out.admins += 1;
        });
        if (countryHasData) out.countries += 1;
    });
    out.range = first === Infinity ? null : [first, last];
    return out;
}

function _dataYearRange(data) {
    const years = data?.years || [];
    if (!years.length) return null;
    return [years[0], years[years.length - 1]];
}

function _mergeCoverageRanges(ranges) {
    const valid = (ranges || []).filter(range => Array.isArray(range) && range.length === 2);
    if (!valid.length) return null;
    return [
        Math.min(...valid.map(range => Number(range[0]))),
        Math.max(...valid.map(range => Number(range[1]))),
    ];
}

function _formatRange(range) {
    if (!Array.isArray(range) || range.length !== 2) return 'Sin datos';
    if (range[0] === range[1]) return String(range[0]);
    return `${range[0]}-${range[1]}`;
}

function _isFiniteValue(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function _fmtInt(value) {
    return new Intl.NumberFormat('es-ES').format(value || 0);
}

function _escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* -----------------------------------------------
   Sidebar (App Categories)
   ----------------------------------------------- */
function _buildSidebar() {
    const container = document.getElementById('sidebar');
    if (!container) return;
    container.innerHTML = '';

    const meta = DataLoader.getMetadata();

    _orderedCategories(meta).forEach(cat => {
        if (!cat.enabled) return;
        const btn = document.createElement('button');
        btn.className = 'sb-btn' + (_isCategorySidebarActive(cat.id) ? ' active' : '');
        btn.dataset.category = cat.id;

        const iconSvg = CATEGORY_ICONS[cat.icon] || '';
        const sidebarLabel = cat.sidebarLabel || cat.label;

        btn.innerHTML = `
            <svg class="sb-icon" viewBox="0 0 24 24">${iconSvg}</svg>
            <span class="sb-label">${sidebarLabel}</span>
        `;
        btn.title = cat.label;

        btn.addEventListener('click', () => {
            const sameCategory = State.get('activeCategory') === cat.id;
            if (!sameCategory) State.set('activeCategory', cat.id);
            if (State.get('activeView') === 'country' || State.get('activeView') === 'about') {
                State.set('activeView', 'map');
            }
            _updateSidebarActiveState();
        });

        container.appendChild(btn);
    });

    const countryBtn = document.createElement('button');
    countryBtn.className = 'sb-btn sb-view-btn sb-country-profile-btn'
        + (State.get('activeView') === 'country' ? ' active' : '');
    countryBtn.dataset.view = 'country';
    countryBtn.type = 'button';
    countryBtn.title = 'Seleccionar país';
    countryBtn.setAttribute('aria-label', 'Seleccionar país');
    countryBtn.innerHTML = `
        <svg class="sb-icon" viewBox="0 0 24 24">${_countryProfileIconInner()}</svg>
        <span class="sb-label">Países</span>
    `;
    countryBtn.addEventListener('click', () => {
        if (State.get('geoLevel') !== 'country') State.set('geoLevel', 'country');
        if (State.get('activeView') !== 'country') State.set('activeView', 'country');
        _updateSidebarActiveState();
    });
    container.appendChild(countryBtn);
}

function _isCategorySidebarActive(catId) {
    const view = State.get('activeView');
    return State.get('activeCategory') === catId && view !== 'country' && view !== 'about';
}

function _updateSidebarActiveState() {
    document.querySelectorAll('#sidebar .sb-btn[data-category]').forEach(btn => {
        btn.classList.toggle('active', _isCategorySidebarActive(btn.dataset.category));
    });
    document.querySelectorAll('#sidebar .sb-view-btn[data-view]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === State.get('activeView'));
    });
}

/**
 * Determine which view tabs are available given the current geo context.
 */
function _getAvailableViews() {
    const geoLevel = State.get('geoLevel');
    const catId = State.get('activeCategory');

    // Categories that have item-level breakdown for treemap
    const hasItemData = (catId === 'agriculture' || catId === 'trade' || catId === 'livestock' || catId === 'labor');

    // Bilateral indicator -> show bilateral world map
    const ind = State.get('activeIndicator');
    const isBilateral = ind?.startsWith('bilateral_');
    if (isBilateral) {
        return ['bilateral', 'trend', 'treemap', 'table'];
    }

    if (geoLevel === 'subnational') {
        return ['map', 'trend', 'ranking', 'table'];
    }

    const views = ['map', 'trend', 'country'];
    if (hasItemData) views.push('treemap');
    views.push('ranking');
    views.push('table');
    return views;
}

function _buildTopViews() {
    document.querySelector('.top-nav')?.remove();

    let container = document.getElementById('view-switcher');
    if (!container) {
        container = document.createElement('div');
        container.className = 'view-switcher';
        container.id = 'view-switcher';
        const anchor = document.getElementById('btn-toggle-panel');
        if (anchor?.parentNode) {
            anchor.parentNode.insertBefore(container, anchor);
        } else {
            document.querySelector('.query-bar')?.appendChild(container);
        }
    }
    if (!container) return;
    container.innerHTML = '';

    const available = _getAvailableViews();
    const activeView = State.get('activeView');

    // If current view is not available, auto-switch to first available
    if (!available.includes(activeView)) {
        State.set('activeView', available[0]);
    }

    VIEWS.filter(v => !v.hidden && v.id !== 'country').forEach(view => {
        const isAvail = available.includes(view.id);
        const btn = document.createElement('button');
        btn.className = 'vw-btn'
            + (view.id === State.get('activeView') ? ' active' : '')
            + (!isAvail ? ' disabled' : '');
        btn.dataset.view = view.id;
        btn.type = 'button';
        if (!isAvail) btn.disabled = true;

        btn.innerHTML = `${_viewIconSvg(view.id)}<span class="sr-only">${view.label}</span>`;
        btn.title = isAvail ? view.label : `${view.label} (no disponible en este nivel)`;
        btn.setAttribute('aria-label', btn.title);

        if (isAvail) {
            btn.addEventListener('click', () => {
                if (State.get('activeView') === view.id) return;
                State.set('activeView', view.id);
                _updateActiveViewButton(view.id);
            });
        }

        container.appendChild(btn);
    });
}

function _updateActiveViewButton(viewId) {
    document.querySelectorAll('.top-view-btn, .vw-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.view === viewId);
    });
    _updateSidebarActiveState();
}

function _countryProfileIconInner() {
    return '<path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11z" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.2" fill="none" stroke="currentColor" stroke-width="1.55"/><path d="M5 20c2.1-1 4.4-1.5 7-1.5s4.9.5 7 1.5" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>';
}

function _viewIconSvg(viewId) {
    if (viewId === 'treemap') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h8v10H3zM13 3h8v6h-8zM13 11h8v10h-8zM3 15h8v6H3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    if (viewId === 'bilateral') return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 12h18M12 3c-2.5 2.5-4 5-4 9s1.5 6.5 4 9M12 3c2.5 2.5 4 5 4 9s-1.5 6.5-4 9" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
    if (viewId === 'map') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5l5-2 6 2 5-2v15l-5 2-6-2-5 2v-15z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 3.5v15M15 5.5v15" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/><path d="M6.2 15.8c1.9-1.7 3.8-2 5.7-.9 2.2 1.2 4.1.8 5.9-1.1" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/><circle cx="17.9" cy="7.4" r="1.35" fill="currentColor"/></svg>';
    if (viewId === 'trend') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17l4-5 4 3 8-10" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    if (viewId === 'country') return `<svg viewBox="0 0 24 24" aria-hidden="true">${_countryProfileIconInner()}</svg>`;
    if (viewId === 'ranking') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h12M4 13h8M4 18h14" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>';
    if (viewId === 'table') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18M3 10h18M3 15h18M3 20h18M8 5v15M14 5v15" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
}

function _clearMapLegend() {
    const legend = document.getElementById('map-legend');
    if (legend) legend.innerHTML = '';
}

/* -----------------------------------------------
   Query bar dropdowns (category + indicator)
   ----------------------------------------------- */
function _buildIndicatorPanel(meta) {
    _buildCategoryDropdown(meta);
    _updateQueryBarLabels(meta);
}

var _catDropdownInit = false;
function _buildCategoryDropdown(meta) {
    const dropdown = document.getElementById('query-cat-dropdown');
    dropdown.innerHTML = '';

    _orderedCategories(meta).forEach(cat => {
        if (!cat.enabled) return;
        const item = document.createElement('button');
        item.className = 'query-dropdown-item' + (cat.id === State.get('activeCategory') ? ' active' : '');
        item.innerHTML = `<svg viewBox="0 0 24 24">${CATEGORY_ICONS[cat.icon] || CATEGORY_ICONS.agriculture}</svg> ${cat.label}`;
        item.addEventListener('click', () => {
            State.set('activeCategory', cat.id);
            if (State.get('activeView') === 'country' || State.get('activeView') === 'about') {
                State.set('activeView', 'map');
            }
            _updateSidebarActiveState();
            dropdown.querySelectorAll('.query-dropdown-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            dropdown.classList.remove('open');
        });
        dropdown.appendChild(item);
    });

    const catBtn = document.getElementById('query-cat');
    catBtn?.setAttribute('aria-disabled', 'true');
    catBtn?.setAttribute('tabindex', '-1');

    // The top bar is a compact title; category changes live in the sidebar.
    if (!_catDropdownInit) {
        _catDropdownInit = true;
        catBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            dropdown.classList.remove('open');
        });
    }
}

function _buildIndicatorDropdown(meta) {
    const dropdown = document.getElementById('query-ind-dropdown');
    dropdown.innerHTML = '';

    const cat = meta.categories.find(c => c.id === State.get('activeCategory'));
    if (!cat || !cat.indicatorGroups) return;

    // Flatten all indicators - group headers only if multiple groups exist
    const totalIndicators = cat.indicatorGroups.reduce((n, g) => n + g.indicators.filter(i => i.enabled).length, 0);
    const showHeaders = cat.indicatorGroups.length > 1 && totalIndicators > cat.indicatorGroups.length;

    cat.indicatorGroups.forEach(group => {
        if (showHeaders) {
            const header = document.createElement('div');
            header.style.cssText = 'padding:6px 12px 2px;font-size:10px;color:var(--c-text-3);text-transform:uppercase;letter-spacing:0.5px';
            header.textContent = group.label;
            dropdown.appendChild(header);
        }
        group.indicators.forEach(ind => {
            if (!ind.enabled) return;
            const item = document.createElement('button');
            item.className = 'query-dropdown-item' + (ind.id === State.get('activeIndicator') ? ' active' : '');
            item.textContent = ind.label;
            item.addEventListener('click', () => {
                State.set('activeIndicator', ind.id);
                dropdown.querySelectorAll('.query-dropdown-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                dropdown.classList.remove('open');
                _updateQueryBarLabels(meta);
            });
            dropdown.appendChild(item);
        });
    });

    // Toggle dropdown on click
    const btn = document.getElementById('query-ind');
    // Remove old listeners by cloning
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('query-cat-dropdown').classList.remove('open');
        dropdown.classList.toggle('open');
    });
}

function _indicatorDisplayLabel(cat, group, ind) {
    const label = ind?.label || '';
    const groupLabel = group?.label || '';
    if (!label || !groupLabel || (cat?.indicatorGroups || []).length <= 1) return label;

    const normGroup = _normalizeLabelForCompare(groupLabel);
    const normLabel = _normalizeLabelForCompare(label);
    const stemGroup = normGroup.replace(/s$/, '');
    const stemLabel = normLabel.replace(/s$/, '');
    if (!normGroup || normGroup === normLabel || stemGroup === stemLabel || normLabel.startsWith(`${normGroup} `)) {
        return label;
    }
    return `${groupLabel} - ${label}`;
}

function _normalizeLabelForCompare(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/gi, ' ')
        .trim()
        .toLowerCase();
}

function _updateQueryBarLabels(meta) {
    const cat = meta.categories.find(c => c.id === State.get('activeCategory'));
    const catLabel = document.getElementById('category-label');
    const indLabel = document.getElementById('indicator-label');
    const catIcon = document.getElementById('query-cat-icon');
    _updateFooterSource(cat?.id);

    if (cat) {
        if (catLabel) catLabel.textContent = cat.label;
        if (catIcon) catIcon.innerHTML = CATEGORY_ICONS[cat.icon] || CATEGORY_ICONS.agriculture;
    }

    if (cat && indLabel) {
        // Build rich breadcrumb: Indicator - Product - Unit
        const parts = [];
        let found = false;
        for (const group of (cat.indicatorGroups || [])) {
            for (const ind of group.indicators) {
                if (ind.id === State.get('activeIndicator')) {
                    parts.push(_indicatorDisplayLabel(cat, group, ind));
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
        const selectedItems = _getSelectedItems();
        const cropCat = State.get('cropCategory');
        if (selectedItems.length === 1) parts.push(shortItemLabel(selectedItems[0]));
        else if (selectedItems.length > 1) {
            const facet = ITEM_FACET_LABEL[cat.id] || 'producto';
            const plural = facet === 'especie' ? 'especies'
                : facet === 'uso' ? 'usos'
                : facet === 'tipo' ? 'tipos'
                : 'productos';
            parts.push(`${selectedItems.length} ${plural}`);
        }
        else if (cropCat !== 'all') parts.push(cropCat);

        const activeUnit = State.get('activeUnit');
        if (activeUnit === 'GJ') parts.push('GJ');

        indLabel.textContent = parts.join(' - ');
    }

    const infoBtn = document.getElementById('btn-indicator-info');
    const activeInd = _getActiveIndicator(meta);
    if (infoBtn && cat && activeInd) {
        const activeGroup = _getActiveIndicatorGroupMeta(meta);
        const label = [cat.label, _indicatorDisplayLabel(cat, activeGroup, activeInd)].filter(Boolean).join(' - ');
        infoBtn.dataset.info = _indicatorInfoSummary(meta);
        infoBtn.removeAttribute('title');
        infoBtn.classList.remove('open');
        infoBtn.setAttribute('aria-label', `Informacion del indicador: ${label}`);
    }
}

function _updateFooterSource(catId) {
    const footerSource = document.getElementById('footer-source');
    if (!footerSource) return;
    const source = FOOTER_SOURCE_LABELS[catId] || 'Fuente: ver fuentes y método';
    const citation = DATASET_CITATIONS[catId] || DATASET_CITATIONS.default;
    footerSource.textContent = `${source} · Suggested citation: ${citation}`;
}

function _bindIndicatorInfoButton() {
    const btn = document.getElementById('btn-indicator-info');
    if (!btn) return;
    let mobileInfoTimer = null;
    btn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (mobileInfoTimer) {
            clearTimeout(mobileInfoTimer);
            mobileInfoTimer = null;
        }
        if (window.matchMedia?.('(max-width: 760px)').matches) {
            btn.classList.toggle('open');
            if (btn.classList.contains('open')) {
                mobileInfoTimer = setTimeout(() => {
                    btn.classList.remove('open');
                    btn.blur();
                    mobileInfoTimer = null;
                }, 4500);
            } else {
                btn.blur();
            }
            return;
        }
        btn.classList.toggle('open');
        if (!btn.classList.contains('open')) btn.blur();
    });
    document.addEventListener('click', event => {
        if (mobileInfoTimer) {
            clearTimeout(mobileInfoTimer);
            mobileInfoTimer = null;
        }
        if (!btn.contains(event.target)) btn.classList.remove('open');
    });
}

function _buildIndicatorInfoTooltip(meta) {
    const cat = meta?.categories?.find(c => c.id === State.get('activeCategory'));
    const ind = _getActiveIndicator(meta);
    if (!cat || !ind) {
        return {
            title: 'Indicador',
            value: 'Sin indicador activo',
            sub: 'Selecciona una categoría e indicador para ver su definición.',
        };
    }

    const group = _getActiveIndicatorGroupMeta(meta);
    const sourceInfo = CATEGORY_SOURCE_INFO[cat.id] || {};
    const unit = _indicatorUnitLabel(cat, ind);
    const field = State.get('activeUnit') === 'GJ' && ind.dataFieldGJ ? ind.dataFieldGJ : ind.dataField;
    const view = _viewLabel(State.get('activeView'));
    const description = INDICATOR_HELP[ind.id] || `Muestra ${ind.label} dentro de ${cat.label}.`;
    const note = _indicatorInfoNote(cat, group, ind);
    const groupLabel = group?.label ? `${cat.label} / ${group.label}` : cat.label;
    const sub = [
        _html(description),
        '',
        `<strong>Unidad:</strong> ${_html(unit || 'según indicador')} | <strong>Vista:</strong> ${_html(view)}`,
        field ? `<strong>Campo:</strong> ${_html(field)}` : '',
        note ? `<strong>Nota:</strong> ${_html(note)}` : '',
        sourceInfo.sources ? `<strong>Fuente:</strong> ${_html(sourceInfo.sources)}` : '',
    ].filter(line => line !== '').join('<br>');

    return {
        title: groupLabel,
        value: _html(ind.label),
        sub,
    };
}

function _indicatorInfoSummary(meta) {
    const cat = meta?.categories?.find(c => c.id === State.get('activeCategory'));
    const ind = _getActiveIndicator(meta);
    const group = _getActiveIndicatorGroupMeta(meta);
    if (!cat || !ind) return 'Selecciona un indicador para ver que muestra.';

    const description = INDICATOR_HELP[ind.id] || `Muestra ${ind.label} dentro de ${cat.label}.`;
    const note = _indicatorInfoNote(cat, group, ind);
    return [description, note].filter(Boolean).join(' ');
}

function _plainText(value) {
    return String(value ?? '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function _titleCase(value) {
    const text = String(value ?? '');
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function _indicatorUnitLabel(cat, ind) {
    if (State.get('activeUnit') === 'GJ' && ind?.dataFieldGJ) {
        return ind.id === 'yield' ? 'GJ/ha' : 'GJ';
    }
    return ind?.unit || cat?.unitOptions?.find(opt => opt.id === State.get('activeUnit'))?.label || '';
}

function _indicatorInfoNote(cat, group, ind) {
    if (!ind) return '';
    if (ind.id?.startsWith('bilateral_')) {
        return 'La matriz bilateral del visor está disponible en toneladas; no se muestran energía, tierra o trabajo incorporado si esos campos no existen en el JSON bilateral.';
    }
    if (cat?.id === 'socioeconomic' && group?.id === 'land_reform') {
        return 'Los indicadores de reforma agraria identifican alcance, intensidad o evento institucional; no son magnitudes productivas aditivas.';
    }
    if (_isNonAdditiveIndicator(ind)) {
        return 'Indicador no aditivo: las opciones de suma, porcentajes o área apilada deben tratarse con cautela.';
    }
    return '';
}

// Close dropdowns when clicking outside
document.addEventListener('click', () => {
    document.querySelectorAll('.query-dropdown').forEach(d => d.classList.remove('open'));
});



function _switchView(viewId) {
    console.log('[VIEW] Switching to:', viewId);
    hideTooltip();
    document.getElementById('btn-indicator-info')?.classList.remove('open');
    if (viewId === 'trend') _ensureDefaultTrendCountry();
    document.body.classList.toggle('about-active', viewId === 'about');
    document.body.classList.toggle('country-profile-active', viewId === 'country');
    if (viewId === 'about') _activateAboutSection('equipo', DataLoader.getMetadata());
    document.querySelectorAll('.viz-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`panel-${viewId}`);
    if (panel) { panel.classList.add('active'); }

    // Show/hide selection bar (bilateral has its own controls)
    const selBar = document.getElementById('selection-bar');
    if (selBar) selBar.style.display = viewId === 'bilateral' ? 'none' : '';

    const selectedItems = _getSelectedItems();
    if (viewId !== 'trend' && selectedItems.length > 1) {
        _setSelectedItems([selectedItems[0]]);
        _updateQueryBarLabels(DataLoader.getMetadata());
    }
    const selectedCountries = State.get('selectedCountries') || [];
    if (viewId === 'bilateral' && selectedCountries.length > 1) {
        State.setCountries([selectedCountries[0]]);
    }

    // Update sidebar active state
    _updateActiveViewButton(viewId);

    // Update view tab highlight
    document.querySelectorAll('.view-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.view === viewId);
    });

    // Split-mode pair: trend panel shown beside map on wide screens
    _applySplitLayout();

    // Rebuild options panel since available options depend on the active view
    _buildRPOptions();
    _buildRPProducts();
    _buildRPPartners();
    _buildRPTerritories();
    _syncRightPanelState();
    if (viewId === 'bilateral' && !DataLoader.isBilateralLoaded?.()) {
        DataLoader.loadBilateral?.().then(() => {
            if (State.get('activeView') !== 'bilateral') return;
            _buildRPProducts();
            _buildRPPartners();
            _updateCurrentView();
        });
    }

    // Update info button
    document.querySelectorAll('.about-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', viewId === 'about');
    });

    _updateCurrentView();
    if (_isSplitActive()) updateTrendView();
}

function _ensureDefaultTrendCountry() {
    if (State.get('geoLevel') !== 'country') return;
    if ((State.get('selectedCountries') || []).length > 0) return;
    const fallback = ['BRA', 'MEX', 'ARG', 'COL'].find(code => DataLoader.getCountryName(code)) || 'BRA';
    State.setCountries([fallback]);
}

function _activateAboutSection(sectionId = 'equipo', meta = DataLoader.getMetadata()) {
    const section = sectionId || 'equipo';
    document.querySelectorAll('.about-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === section);
    });
    document.querySelectorAll('.about-section').forEach(el => {
        el.classList.toggle('active', el.id === `about-${section}`);
    });
    if (section === 'cobertura') _ensureAboutCoverage(meta);
}

function _syncRightPanelState() {
    const panel = document.getElementById('right-panel');
    if (!panel) return;
    const products = document.getElementById('rp-products');
    const productsVisible = products && products.style.display !== 'none';
    const partners = document.getElementById('rp-partners');
    const partnersVisible = partners && partners.style.display !== 'none';
    const view = State.get('activeView');
    const visibleSections = [...panel.querySelectorAll('.rp-section')]
        .filter(section => section.style.display !== 'none');
    const openSections = visibleSections
        .filter(section => !section.classList.contains('collapsed'));
    panel.classList.toggle('map-view', view === 'map');
    panel.classList.toggle('has-products', !!productsVisible || !!partnersVisible);
    panel.classList.toggle('all-open', openSections.length >= 3);
    panel.dataset.openSections = String(openSections.length);
}

// Split layout helpers - keep a trend chart visible alongside the map on wide screens
function _isSplitActive() {
    return State.get('splitMode') === true
        && State.get('activeView') === 'map'
        && window.innerWidth >= 960;
}

function _applySplitLayout() {
    const on = State.get('splitMode') === true;
    const active = _isSplitActive();
    document.body.classList.toggle('split-mode', on);
    document.body.classList.toggle('split-active', active);
    const trendPanel = document.getElementById('panel-trend');
    if (trendPanel) trendPanel.classList.toggle('active-pair', active);
}

/* -----------------------------------------------
   Selection bar (country chips)
   ----------------------------------------------- */
var _initDone = false;

function _getSelectedItems() {
    const selectedItems = State.get('selectedItems');
    if (Array.isArray(selectedItems) && selectedItems.length > 0) return selectedItems;
    const cropItem = State.get('cropItem');
    return cropItem && cropItem !== 'all' ? [cropItem] : [];
}

function _isBilateralIndicator() {
    return State.get('activeIndicator')?.startsWith('bilateral_');
}

function _getSelectedPartners() {
    const selectedPartners = State.get('selectedPartners');
    return Array.isArray(selectedPartners) ? selectedPartners : [];
}

function _setSelectedPartners(partners) {
    State.set('selectedPartners', [...new Set((partners || []).filter(Boolean))]);
}

function _toggleSelectedPartner(name) {
    const current = _getSelectedPartners();
    _setSelectedPartners(current.includes(name)
        ? current.filter(partner => partner !== name)
        : [...current, name]);
}

function _clearSelectedPartners() {
    _setSelectedPartners([]);
}

function _setSelectedItems(items) {
    const unique = [...new Set((items || []).filter(Boolean))];
    State.set('selectedItems', unique);
    State.set('cropItem', unique.length === 1 ? unique[0] : 'all');
    State.set('cropCategory', 'all');
}

function _allowsMultiProductSelection() {
    return State.get('activeView') === 'trend';
}

function _toggleSelectedItem(name) {
    const current = _getSelectedItems();
    if (!_allowsMultiProductSelection()) {
        _setSelectedItems(current.includes(name) ? [] : [name]);
        return;
    }
    _setSelectedItems(current.includes(name)
        ? current.filter(item => item !== name)
        : [...current, name]);
}

function _clearSelectedItems() {
    _setSelectedItems([]);
}

function _buildSelectionBar() {
    const bar = document.getElementById('selection-bar');
    bar.innerHTML = '';

    // Country chips
    const selected = State.get('selectedCountries');
    selected.forEach((code, i) => {
        const chip = document.createElement('div');
        const chipType = _territoryChipType(code);
        chip.className = `sel-chip sel-chip-territory sel-chip-${chipType.className}`;
        const color = CAT_COLORS[i % CAT_COLORS.length];
        const countryName = DataLoader.getCountryName(code);
        const countryLabel = shortEntityLabel(countryName);
        if (countryName !== countryLabel) chip.title = countryName;
        chip.innerHTML = `
            <span class="sel-chip-color" style="background:${color}"></span>
            <span class="sel-chip-kind">${chipType.label}</span>
            <span>${countryLabel}</span>
            <span class="sel-chip-remove" data-code="${code}">&times;</span>
        `;
        chip.querySelector('.sel-chip-remove').addEventListener('click', () => {
            State.removeCountry(code);
        });
        bar.appendChild(chip);
    });

    // Item chips (specific items can be multi-selected in trend facets)
    const selectedItems = _getSelectedItems();
    const cropCategory = State.get('cropCategory');
    if (selectedItems.length > 0) {
        selectedItems.forEach(itemLabel => {
            const chip = document.createElement('div');
            chip.className = 'sel-chip sel-chip-product';
            const displayLabel = shortItemLabel(itemLabel);
            if (displayLabel !== itemLabel) chip.title = itemLabel;
            chip.innerHTML = `
                <span class="sel-chip-color" style="background:var(--c-accent)"></span>
                <span class="sel-chip-kind">${_itemChipKindLabel()}</span>
                <span>${displayLabel}</span>
                <span class="sel-chip-remove">&times;</span>
            `;
            chip.querySelector('.sel-chip-remove').addEventListener('click', () => {
                _setSelectedItems(selectedItems.filter(item => item !== itemLabel));
                _buildSelectionBar();
                _updateQueryBarLabels(DataLoader.getMetadata());
                _buildRPOptions();
                _buildRPProducts();
                _updateCurrentView();
            });
            bar.appendChild(chip);
        });
    } else if (cropCategory !== 'all') {
        const chip = document.createElement('div');
        chip.className = 'sel-chip sel-chip-product';
        chip.innerHTML = `
            <span class="sel-chip-color" style="background:var(--c-accent)"></span>
            <span class="sel-chip-kind">Grupo</span>
            <span>${cropCategory}</span>
            <span class="sel-chip-remove">&times;</span>
        `;
        chip.querySelector('.sel-chip-remove').addEventListener('click', () => {
            _clearSelectedItems();
            _buildSelectionBar();
            _updateQueryBarLabels(DataLoader.getMetadata());
            _buildRPOptions();
            _buildRPProducts();
            _updateCurrentView();
        });
        bar.appendChild(chip);
    }

    const selectedPartners = _getSelectedPartners();
    if (_isBilateralIndicator() && selectedPartners.length > 0) {
        selectedPartners.forEach(partnerName => {
            const chip = document.createElement('div');
            chip.className = 'sel-chip sel-chip-partner';
            const displayLabel = shortEntityLabel(partnerName);
            if (displayLabel !== partnerName) chip.title = partnerName;
            chip.innerHTML = `
                <span class="sel-chip-color" style="background:#8B5E3C"></span>
                <span class="sel-chip-kind">Socio</span>
                <span>${displayLabel}</span>
                <span class="sel-chip-remove">&times;</span>
            `;
            chip.querySelector('.sel-chip-remove').addEventListener('click', () => {
                _setSelectedPartners(selectedPartners.filter(partner => partner !== partnerName));
                _buildSelectionBar();
                _buildRPPartners();
                _updateCurrentView();
            });
            bar.appendChild(chip);
        });
    }

    // Rebuild view buttons (availability may have changed when selection changes)
    _buildTopViews();

    // Rebuild right panel territories (NOT options - avoid cascade loop)
    _buildRPTerritories();
    _buildRPPartners();

    // Several option groups depend on selection count: trend layout pills and
    // map metrics such as "% de America Latina".
    if (State.get('activeView') === 'trend' || State.get('activeView') === 'map') {
        _buildRPOptions();
    }

    // Only update views after init is complete (avoid premature render with 0-size containers)
    if (_initDone) {
        _updateCurrentView();
    }
}

function _territoryChipType(code) {
    if (code === 'latin_america') return { label: 'LatAm', className: 'latam' };
    if (REGIONS[code]) return { label: 'Región', className: 'region' };
    if (State.get('geoLevel') === 'subnational') return { label: 'Subnac.', className: 'subnational' };
    return { label: 'País', className: 'country' };
}

/* -----------------------------------------------
   Right Panel
   ----------------------------------------------- */
function _buildRightPanel(meta) {
    // Delegated click handler — survives any re-render of section content
    // and any change of inner DOM. The previous per-header binding worked at
    // init but the user reported the PRODUCTOS / USOS DEL SUELO header
    // refusing to collapse in landuse/bilateral, which only makes sense if
    // the listener was somehow lost or shadowed. Delegation makes that
    // impossible: there's a single handler on the panel, no matter what.
    const panel = document.getElementById('right-panel');
    if (panel && !panel.dataset.collapseBound) {
        panel.dataset.collapseBound = '1';
        panel.addEventListener('click', (e) => {
            const header = e.target.closest('.rp-section-header');
            if (!header || !panel.contains(header)) return;
            const section = header.closest('.rp-section');
            if (!section) return;
            e.stopPropagation();
            section.classList.toggle('collapsed');
            _focusMobileRightPanelSection(section);
            _syncRightPanelState();
            window.dispatchEvent(new Event('resize'));
        });
    }
    document.getElementById('rp-options')?.classList.remove('collapsed');

    _buildRPOptions(meta);
    _buildRPProducts();
    _buildRPPartners();
    _buildRPTerritories();
}

function _initRightPanelResize() {
    const panel = document.getElementById('right-panel');
    const handle = document.getElementById('right-panel-resizer');
    if (!panel || !handle) return;

    const clamp = value => Math.max(300, Math.min(Math.round(window.innerWidth * 0.48), 520, value));
    const saved = Number(localStorage.getItem('latamRightPanelWidth'));
    if (Number.isFinite(saved)) {
        panel.style.setProperty('--right-panel-w', clamp(saved) + 'px');
    }

    let startX = 0;
    let startWidth = 0;
    const onMove = event => {
        const nextWidth = clamp(startWidth + (startX - event.clientX));
        panel.style.setProperty('--right-panel-w', nextWidth + 'px');
        window.dispatchEvent(new Event('resize'));
    };
    const onUp = () => {
        handle.classList.remove('dragging');
        document.body.classList.remove('resizing-right-panel');
        localStorage.setItem('latamRightPanelWidth', Math.round(panel.getBoundingClientRect().width));
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
    };

    handle.addEventListener('pointerdown', event => {
        if (panel.classList.contains('hidden')) return;
        startX = event.clientX;
        startWidth = panel.getBoundingClientRect().width;
        handle.classList.add('dragging');
        document.body.classList.add('resizing-right-panel');
        handle.setPointerCapture?.(event.pointerId);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
        event.preventDefault();
    });

    window.addEventListener('resize', () => {
        if (panel.classList.contains('hidden')) return;
        const width = clamp(panel.getBoundingClientRect().width);
        panel.style.setProperty('--right-panel-w', width + 'px');
    });
}

function _setRightPanelOpen(open, { prepareMobile = true, resizeDelay = 250 } = {}) {
    const panel = document.getElementById('right-panel');
    const toggle = document.getElementById('btn-toggle-panel');
    if (!panel) return;

    panel.classList.toggle('hidden', !open);
    document.body.classList.toggle('right-panel-hidden', !open);
    toggle?.classList.toggle('active', open);
    toggle?.setAttribute('aria-label', open ? 'Cerrar opciones' : 'Abrir opciones');
    toggle?.setAttribute('aria-expanded', String(open));
    if (open && prepareMobile) _prepareMobileRightPanelOpen();
    setTimeout(() => window.dispatchEvent(new Event('resize')), resizeDelay);
}

function _initResponsivePanels() {
    const panel = document.getElementById('right-panel');
    const toggle = document.getElementById('btn-toggle-panel');
    if (!panel || !toggle) return;

    const mq = window.matchMedia('(max-width: 760px)');
    const apply = () => {
        if (mq.matches) {
            _setRightPanelOpen(false, { prepareMobile: false, resizeDelay: 120 });
        } else {
            _setRightPanelOpen(true, { prepareMobile: false, resizeDelay: 120 });
        }
    };

    apply();
    mq.addEventListener?.('change', apply);
}

function _initMobileRightPanelDismiss() {
    const panel = document.getElementById('right-panel');
    if (!panel || panel.dataset.mobileDismissBound) return;
    panel.dataset.mobileDismissBound = '1';

    let startY = 0;
    let lastY = 0;
    let dragging = false;

    const resetDrag = () => {
        dragging = false;
        startY = 0;
        lastY = 0;
        panel.classList.remove('dragging-down');
        panel.style.removeProperty('--panel-drag-y');
    };

    panel.addEventListener('pointerdown', event => {
        if (!_isMobileRightPanel() || panel.classList.contains('hidden')) return;
        const rect = panel.getBoundingClientRect();
        const localY = event.clientY - rect.top;
        if (localY > 58) return;
        dragging = true;
        startY = event.clientY;
        lastY = event.clientY;
        panel.classList.add('dragging-down');
        panel.setPointerCapture?.(event.pointerId);
    });

    panel.addEventListener('pointermove', event => {
        if (!dragging) return;
        lastY = event.clientY;
        const dy = Math.max(0, event.clientY - startY);
        if (dy > 3) event.preventDefault();
        panel.style.setProperty('--panel-drag-y', `${Math.min(dy, 140)}px`);
    });

    const finishDrag = () => {
        if (!dragging) return;
        const dy = Math.max(0, lastY - startY);
        resetDrag();
        if (dy > 54) _setRightPanelOpen(false);
    };

    panel.addEventListener('pointerup', finishDrag);
    panel.addEventListener('pointercancel', resetDrag);
}

function _isMobileRightPanel() {
    return window.matchMedia?.('(max-width: 760px)').matches || window.innerWidth <= 760;
}

function _prepareMobileRightPanelOpen() {
    if (!_isMobileRightPanel()) return;
    document.getElementById('rp-options')?.classList.remove('collapsed');
    document.getElementById('rp-territories')?.classList.remove('collapsed');
    document.getElementById('rp-products')?.classList.add('collapsed');
    document.getElementById('rp-partners')?.classList.add('collapsed');
    _syncRightPanelState();
    if (viewId === 'trend') {
        _updateYearRangeFromData();
        updateTimeline();
    }
}

function _focusMobileRightPanelSection(section) {
    if (!_isMobileRightPanel() || !section || section.classList.contains('collapsed')) return;
    const options = document.getElementById('rp-options');
    const products = document.getElementById('rp-products');
    const partners = document.getElementById('rp-partners');
    const territories = document.getElementById('rp-territories');

    if (section.id === 'rp-options') {
        products?.classList.add('collapsed');
        partners?.classList.add('collapsed');
        territories?.classList.remove('collapsed');
    } else {
        options?.classList.add('collapsed');
        [products, partners, territories].forEach(el => {
            if (el && el !== section) el.classList.add('collapsed');
        });
    }
}

function _buildRPOptions(meta) {
    if (!meta) meta = DataLoader.getMetadata();
    const body = document.getElementById('rp-options-body');
    if (!body) return;
    body.innerHTML = '';
    body.scrollTop = 0;

    const view = State.get('activeView');
    const catId = State.get('activeCategory');
    const cat = meta.categories.find(c => c.id === catId);
    const geoLevel = State.get('geoLevel');
    const selected = State.get('selectedCountries');
    const hasItems = ['agriculture', 'trade', 'livestock', 'landuse', 'labor'].includes(catId);
    let activeInd = _getActiveIndicator(meta);
    if (!activeInd && cat?.indicatorGroups?.length) {
        const firstInd = cat.indicatorGroups.flatMap(ig => ig.indicators || []).find(ind => ind.enabled);
        if (firstInd) {
            State.set('activeIndicator', firstInd.id);
            activeInd = firstInd;
            _updateQueryBarLabels(meta);
        }
    }
    const isBilateralIndicator = activeInd?.id?.startsWith('bilateral_');

    // -- Indicator selector --
    const activeUnit = State.get('activeUnit');
    const isEnergy = activeUnit === 'GJ';

    // Auto-switch indicator if current one doesn't support GJ
    if (isEnergy && cat && cat.unitToggle) {
        const activeInd = State.get('activeIndicator');
        let found = false;
        for (const ig of (cat.indicatorGroups || [])) {
            for (const ind of ig.indicators) {
                if (ind.id === activeInd && ind.dataFieldGJ) found = true;
            }
        }
        if (!found) {
            // Switch to first indicator that has GJ
            let switched = false;
            for (const ig of (cat.indicatorGroups || [])) {
                for (const ind of ig.indicators) {
                    if (ind.enabled && ind.dataFieldGJ) {
                        State.set('activeIndicator', ind.id);
                        _updateQueryBarLabels(meta);
                        switched = true;
                        break;
                    }
                }
                if (switched) break;
            }
        }
    }

    if (cat && cat.indicatorGroups) {
        // Count total enabled indicators
        const allInds = cat.indicatorGroups.flatMap(ig => ig.indicators.filter(i => i.enabled));

        const group = _createRPGroup('Indicador');
        group.classList.add('rp-group-wide');

        // Comercio direct/bilateral are different modes; keep them visually split.
        // Other categories are single-indicator choices, so a select is clearer
        // than a checkbox-looking list.
        if (catId === 'trade') {
            group.appendChild(_createTradeIndicatorSelector(cat, meta));
        } else if (catId === 'footprints') {
            group.appendChild(_createFootprintIndicatorControls(meta));
        } else {
            const indicatorOpts = [];
            cat.indicatorGroups.forEach(ig => {
                ig.indicators.forEach(ind => {
                    if (!ind.enabled) return;
                    const noGJ = isEnergy && cat.unitToggle && !ind.dataFieldGJ;
                    const noTreemapYield = view === 'treemap' && ind.id === 'yield';
                    indicatorOpts.push({
                        id: ind.id,
                        label: _indicatorDisplayLabel(cat, ig, ind),
                        disabled: noGJ || noTreemapYield,
                    });
                });
            });
            group.appendChild(_createRPSelect(indicatorOpts, State.get('activeIndicator'), val => {
                State.set('activeIndicator', val);
                _updateQueryBarLabels(meta);
                _buildRPOptions(meta);
                _updateCurrentView();
            }));
        }
        body.appendChild(group);
    }

    // -- Unit toggle / display - visible for categories with unitToggle (not bilateral view) --
    if (cat && cat.unitToggle && cat.unitOptions && view !== 'bilateral') {
        const curInd = cat.indicatorGroups?.flatMap(ig => ig.indicators).find(i => i.id === State.get('activeIndicator'));
        if (curInd && curInd.dataFieldGJ) {
            // Indicator supports energy toggle - adapt labels to indicator type
            const currentUnit = State.get('activeUnit') || cat.unitOptions[0].id;
            const isYield = curInd.dataField === 'yield';
            const unitOpts = isYield
                ? [{ id: 'toneladas', label: 't/ha' }, { id: 'GJ', label: 'GJ/ha' }]
                : cat.unitOptions;
            const group = _createRPGroup('Unidad de medida');
            group.classList.add('rp-group-wide', 'rp-measure-group');
            const pills = _createRPPills(unitOpts, currentUnit, val => {
                State.set('activeUnit', val);
                _updateQueryBarLabels(meta);
                _buildRPOptions(meta);
                _updateAllViews();
            });
            group.appendChild(pills);
            body.appendChild(group);
        } else {
            // Indicator doesn't support GJ - no toggle needed, just reset unit
            if (State.get('activeUnit') === 'GJ') {
                State.set('activeUnit', cat.unitOptions[0].id);
            }
        }
    }

    // -- Scale pills (Linear | Log) - only for map and trend --
    const canUseLogScale = (view === 'map' || view === 'trend') && _canUseLogScale(meta);
    if (canUseLogScale) {
        const group = _createRPGroup(view === 'trend' ? 'Escala del eje' : 'Escala de color');
        group.classList.add('rp-group-wide', 'rp-scale-group');
        const pills = _createRPPills([
            { id: 'linear', label: 'Lineal' },
            { id: 'log', label: 'Logarítmica' }
        ], State.get('scaleType'), val => {
            State.set('scaleType', val);
            _updateCurrentView();
        });
        group.appendChild(pills);
        body.appendChild(group);
    } else if (State.get('scaleType') === 'log') {
        State.set('scaleType', 'linear');
    }

    // -- Chart type pills (Líneas | Área apilada) - only for trend view --
    // Stacked area only makes sense with multiple series, so hide the toggle
    // when the user has 0/1 country selected and there's no multi-region default.
    const selectedItemCount = _getSelectedItems().length;
    const trendHasSubnationalSeries = geoLevel === 'subnational' && selected.length > 0;
    const trendHasMultipleSeries = selected.length >= 2
        || selectedItemCount >= 2
        || geoLevel === 'region'
        || catId === 'landuse'
        || trendHasSubnationalSeries;
    if (view === 'trend' && !isBilateralIndicator && trendHasMultipleSeries && _canUseStackedTrend(activeInd)) {
        const group = _createRPGroup('Tipo de gráfico');
        const currentType = State.get('chartType') || 'lines';
        const pills = _createRPPills([
            { id: 'lines', label: 'Líneas', icon: '<svg viewBox="0 0 20 16" aria-hidden="true"><polyline points="2 13 6 9 9 11 13 5 18 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
            { id: 'stacked', label: 'Área', icon: '<svg viewBox="0 0 20 16" aria-hidden="true"><path d="M2 13 6 9 9 11 13 5 18 6v8H2z" fill="currentColor" opacity=".78"/></svg>' }
        ], currentType, val => {
            State.set('chartType', val);
            _updateCurrentView();
        });
        group.appendChild(pills);
        body.appendChild(group);
    } else if (view === 'trend' && State.get('chartType') === 'stacked') {
        // Reset back to lines when stacked is no longer offered
        State.set('chartType', 'lines');
    }

    // -- Layout pills (Superpuesto | Facetas) - only for trend view --
    if (view === 'trend' && !isBilateralIndicator) {
        const currentLayout = State.get('chartLayout') || 'overlay';
        const layoutOpts = [{ id: 'overlay', label: 'Junto', title: 'Todas las series en un solo panel' }];
        if (selected.length > 1) {
            layoutOpts.push({ id: 'facet-country', label: 'Territorios', title: 'Un panel por territorio' });
        }
        if (hasItems) {
            const facetLabel = ITEM_FACET_LABEL[catId] || 'producto';
            layoutOpts.push({ id: 'facet-product', label: _titleCase(facetLabel), title: `Un panel por ${facetLabel}` });
        }
        const validIds = layoutOpts.map(o => o.id);
        if (!validIds.includes(currentLayout)) State.set('chartLayout', 'overlay');

        if (layoutOpts.length > 1) {
            const group = _createRPGroup('Diseño');
            const pills = _createRPPills(layoutOpts, validIds.includes(currentLayout) ? currentLayout : 'overlay', val => {
                State.set('chartLayout', val);
                _buildRPOptions(meta);
                _updateCurrentView();
            });
            group.appendChild(pills);
            body.appendChild(group);
        }

        const effectiveLayout = validIds.includes(currentLayout) ? currentLayout : 'overlay';
        if (effectiveLayout !== 'overlay') {
            const yGroup = _createRPGroup('Eje Y');
            const currentYMode = State.get('facetYMode') || 'shared';
            yGroup.appendChild(_createRPPills([
                { id: 'shared', label: 'Compartido' },
                { id: 'free', label: 'Libre por panel' },
            ], currentYMode, val => {
                State.set('facetYMode', val);
                _updateCurrentView();
            }));
            body.appendChild(yGroup);
        } else if ((State.get('facetYMode') || 'shared') !== 'shared') {
            State.set('facetYMode', 'shared');
        }
    } else if (view === 'trend' && isBilateralIndicator) {
        if (State.get('chartType') === 'stacked') State.set('chartType', 'lines');
        if ((State.get('chartLayout') || 'overlay') !== 'overlay') State.set('chartLayout', 'overlay');
        if ((State.get('facetYMode') || 'shared') !== 'shared') State.set('facetYMode', 'shared');
    }

    const showTrendAnalysis = (view === 'trend' || (view === 'map' && State.get('splitMode')))
        && !isBilateralIndicator
        && (State.get('chartType') || 'lines') !== 'stacked';
    if (showTrendAnalysis) {
        const group = _createRPGroup('Análisis');
        group.classList.add('rp-group-wide', 'rp-analysis-group');

        group.appendChild(_createRPOptionRow('Media móvil', _createRPPills([
            { id: 'none', label: 'No', shortLabel: '-' },
            { id: '5', label: '5 años', shortLabel: '5' },
            { id: '10', label: '10 años', shortLabel: '10' },
            { id: '20', label: '20 años', shortLabel: '20' },
        ], State.get('trendMA') || 'none', val => {
            State.set('trendMA', val);
            _updateCurrentView();
        }, 'rp-pills-compact')));

        group.appendChild(_createRPOptionRow('Tendencia', _createRPPills([
            { id: 'off', label: 'No' },
            { id: 'on', label: 'Sí', shortLabel: '↗', title: 'Mostrar línea de tendencia' },
        ], State.get('trendShowLine') ? 'on' : 'off', val => {
            State.set('trendShowLine', val === 'on');
            _updateCurrentView();
        }, 'rp-pills-compact rp-pills-binary')));

        group.appendChild(_createRPOptionRow('Break', _createRPPills([
            { id: 'off', label: 'No' },
            { id: 'on', label: 'Sí', shortLabel: 'ϟ', title: 'Mostrar breaks estructurales' },
        ], State.get('trendShowBreaks') ? 'on' : 'off', val => {
            State.set('trendShowBreaks', val === 'on');
            _updateCurrentView();
        }, 'rp-pills-compact rp-pills-binary')));

        body.appendChild(group);
    }

    // -- Map comparison (1 Mapa | 2 Mapas) - only for map view --
    if (view === 'map') {
        const group = _createRPGroup('Vista');
        group.classList.add('rp-group-wide');
        const canSplit = window.innerWidth >= 960;
        const activeLayout = State.get('splitMode') && canSplit
            ? 'split'
            : (State.get('compareMode') ? 'dual' : 'single');
        const pills = _createRPPills([
            { id: 'single', label: '1 mapa', shortLabel: '1', icon: '<svg viewBox="0 0 20 16" aria-hidden="true"><rect x="3" y="3" width="14" height="10" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>' },
            { id: 'dual', label: '2 mapas', shortLabel: '2', icon: '<svg viewBox="0 0 20 16" aria-hidden="true"><rect x="2" y="3" width="7" height="10" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="11" y="3" width="7" height="10" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>' },
            { id: 'split', label: 'Mapa + serie', shortLabel: 'Serie', disabled: !canSplit, title: canSplit ? 'Mapa + serie' : 'Disponible desde pantalla mediana', icon: '<svg viewBox="0 0 20 16" aria-hidden="true"><rect x="2" y="3" width="7" height="10" fill="none" stroke="currentColor" stroke-width="1.35"/><path d="M11 12l2-3 2 1 3-5" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/></svg>' }
        ], activeLayout, val => {
            if (val === 'single') {
                State.set('compareMode', false);
                State.set('splitMode', false);
            } else if (val === 'dual') {
                State.set('splitMode', false);
                State.set('compareMode', true);
                if (State.get('startYear') === State.get('currentYear')) {
                    const range = State.get('yearRange');
                    State.set('startYear', range[0]);
                }
            } else if (val === 'split') {
                State.set('compareMode', false);
                State.set('splitMode', true);
            }
            _updateCurrentView();
        }, 'rp-pills-compact');
        group.appendChild(pills);
        body.appendChild(group);
    }

    // -- Axis mode - only for views that support it (not treemap, not bilateral) --
    // pct_territory only makes sense when category has items AND a specific item is selected
    // index only makes sense for trend (time series)
    const showMetric = view !== 'treemap' && view !== 'bilateral' && !isBilateralIndicator;
    if (showMetric) {
        const hasSpecificItem = hasItems && _getSelectedItems().length > 0;

        let metricOpts = [{ id: 'absolute', label: 'Valor absoluto', shortLabel: 'Absoluto' }];
        const supportsRelativeMetrics = _canUseRelativeMetric(activeInd);
        const supportsIndexMetric = _canUseIndexMetric(activeInd);
        if (hasSpecificItem && supportsRelativeMetrics) {
            metricOpts.push({ id: 'pct_territory', label: '% del territorio', shortLabel: '% terr.' });
        }
        if (supportsRelativeMetrics) {
            metricOpts.push({ id: 'pct_total', label: '% de la región', shortLabel: '% AL' });
        }
        if (view === 'trend' && supportsIndexMetric && geoLevel !== 'subnational') {
            metricOpts.push({ id: 'index', label: 'Índice 100' });
        }
        const isBalanceIndicator = _isBalanceIndicator(activeInd);
        const isLatamAggregate = geoLevel === 'country' && selected.length === 0;
        const isSubnationalAggregate = geoLevel === 'subnational' && selected.length === 0;
        const pctTotalLabel = geoLevel === 'subnational'
            ? '% del país'
            : (hasSpecificItem ? '% del producto en AL' : '% de América Latina');
        const pctTotalShortLabel = geoLevel === 'subnational'
            ? '% país'
            : (hasSpecificItem ? '% prod.' : '% AL');
        metricOpts = metricOpts
            .filter(opt => !(isBalanceIndicator && (opt.id === 'pct_territory' || opt.id === 'pct_total' || opt.id === 'index')))
            .filter(opt => !((isLatamAggregate || isSubnationalAggregate) && opt.id === 'pct_total'))
            .map(opt => opt.id === 'pct_total' ? { ...opt, label: pctTotalLabel, shortLabel: pctTotalShortLabel } : opt);

        const validModes = metricOpts.map(o => o.id);
        if (!validModes.includes(State.get('axisMode'))) {
            State.set('axisMode', 'absolute');
        }
        if (metricOpts.length > 1) {
        const group = _createRPGroup('Métrica');
        group.classList.add('rp-group-wide', 'rp-metric-group');
        const pills = _createRPPills(metricOpts, State.get('axisMode'), val => {
            State.set('axisMode', val);
            _buildRPOptions(meta);
            _updateCurrentView();
        }, 'rp-pills-compact');
        group.appendChild(pills);
        body.appendChild(group);
        }
    } else {
        // Treemap and bilateral always use absolute values
        if (State.get('axisMode') !== 'absolute') {
            State.set('axisMode', 'absolute');
        }
    }

    // -- Top N (for ranking / treemap) --
    if (view === 'ranking' || view === 'treemap') {
        const group = _createRPGroup('Elementos');
        const cur = String(State.get('rankingTopN') || 10);
        // Top 50 was rarely useful and crowded the chart - keep just 10 / 20.
        const validCur = ['10', '20'].includes(cur) ? cur : '10';
        if (cur !== validCur) State.set('rankingTopN', Number(validCur));
        const pills = _createRPPills([
            { id: '10', label: 'Top 10' },
            { id: '20', label: 'Top 20' }
        ], validCur, val => {
            State.set('rankingTopN', Number(val));
            _updateCurrentView();
        });
        group.appendChild(pills);
        body.appendChild(group);
    }

    // -- Ranking mode: by country vs by product --
    if (view === 'ranking' && hasItems) {
        const group = _createRPGroup('Modo de ranking');
        const pills = _createRPPills([
            { id: 'byCountry', label: 'Por país' },
            { id: 'byProduct', label: 'Por producto' }
        ], State.get('rankingMode') || 'byCountry', val => {
            State.set('rankingMode', val);
            _updateCurrentView();
        });
        group.appendChild(pills);
        body.appendChild(group);
    }
    _syncRightPanelState();
}

function _buildRPProducts() {
    const section = document.getElementById('rp-products');
    const headerEl = document.getElementById('rp-products-header');
    const listEl = document.getElementById('rp-product-list');
    const searchEl = document.getElementById('rp-product-search');
    if (!section || !listEl) return;

    const catId = State.get('activeCategory');
    const labels = ITEM_PICKER_LABELS[catId];
    // Show/hide section based on category
    const show = !!labels;
    section.style.display = show ? '' : 'none';
    if (!show) {
        _syncRightPanelState();
        return;
    }

    // Update header text
    if (headerEl) headerEl.textContent = labels.header;
    if (searchEl) searchEl.placeholder = labels.search;
    if (searchEl?.parentElement) searchEl.parentElement.style.display = '';

    listEl.innerHTML = '';
    listEl.className = 'rp-list';

    let selectedItems = _getSelectedItems();
    let selectedItemSet = new Set(selectedItems);
    let currentItem = selectedItems.length === 1 ? selectedItems[0] : 'all';
    let currentCat = State.get('cropCategory');
    const year = State.get('currentYear');
    const geoLevel = State.get('geoLevel');

    // "All" option
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    const isAll = selectedItems.length === 0 && currentCat === 'all';
    allBtn.className = 'picker-item' + (isAll ? ' selected' : '');
    allBtn.innerHTML = `<span class="picker-check">${isAll ? '&#10003;' : ''}</span><span>${labels.all}</span>`;
    allBtn.addEventListener('click', () => {
        _clearSelectedItems();
        _buildSelectionBar();
        _updateQueryBarLabels(DataLoader.getMetadata());
        _buildRPOptions();
        _updateCurrentView();
        _buildRPProducts();
    });
    listEl.appendChild(allBtn);

    // Top items FIRST (most useful - individual crops/products)
    const code = State.get('selectedCountries').length > 0
        ? State.get('selectedCountries')[0]
        : 'latin_america';
    const effectiveGeo = code === 'latin_america' ? 'region' : geoLevel === 'region' ? 'region' : 'country';
    const dataField = _getCurrentDataField();
    const pickerData = _getProductPickerData(code, year, dataField, effectiveGeo);
    const items = pickerData.items;
    const itemNames = pickerData.itemNames;
    const valueByName = new Map(items.map(item => [item.name, item.value]));
    const searchableItems = [];
    const seenSearchItems = new Set();
    const addSearchItem = (name, value = null, itemCode = name) => {
        if (!name || seenSearchItems.has(name)) return;
        seenSearchItems.add(name);
        searchableItems.push({ code: itemCode || name, name, value });
    };
    items.forEach(item => addSearchItem(item.name, item.value, item.code));
    itemNames.forEach(name => addSearchItem(name, valueByName.get(name), name));

    if (pickerData.isBilateral && selectedItems.some(item => !seenSearchItems.has(item))) {
        _clearSelectedItems();
        selectedItems = [];
        selectedItemSet = new Set();
        currentItem = 'all';
        currentCat = 'all';
        _buildSelectionBar();
        _updateQueryBarLabels(DataLoader.getMetadata());
        allBtn.className = 'picker-item selected';
        allBtn.innerHTML = `<span class="picker-check">&#10003;</span><span>${labels.all}</span>`;
    }

    const visibleTopNames = new Set(items.slice(0, 20).map(item => item.name));
    const hiddenSelectedItems = selectedItems.filter(item => !visibleTopNames.has(item));
    if (hiddenSelectedItems.length > 0) {
        const selectedTitle = document.createElement('div');
        selectedTitle.className = 'picker-region-title';
        selectedTitle.textContent = 'Seleccionado';
        listEl.appendChild(selectedTitle);

        hiddenSelectedItems.forEach(itemName => {
            const selectedValue = valueByName.get(itemName);
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'picker-item selected';
            const displayName = shortItemLabel(itemName);
            if (displayName !== itemName) item.title = itemName;
            item.innerHTML = `
                <span class="picker-check">&#10003;</span>
                <span>${displayName}</span>
                ${Number.isFinite(selectedValue) ? `<span style="color:var(--c-text-3);font-size:10px;margin-left:auto">${fmt(selectedValue)}</span>` : ''}
            `;
            item.addEventListener('click', () => {
                _toggleSelectedItem(itemName);
                _buildSelectionBar();
                _updateQueryBarLabels(DataLoader.getMetadata());
                _buildRPOptions();
                _updateCurrentView();
                _buildRPProducts();
            });
            listEl.appendChild(item);
        });
    }

    // In LABOR the topItems list (Olivar, Uva, etc.) and the Categorías list
    // collapsed to the same thing — the source already gives us aggregated
    // categories. Showing both was confusing, so we hide the topItems block
    // and keep only the aggregated category list below.
    if (items.length > 0 && catId !== 'labor') {
        const itemTitle = document.createElement('div');
        itemTitle.className = 'picker-region-title';
        itemTitle.textContent = _topItemsHeader(catId);
        listEl.appendChild(itemTitle);

        items.slice(0, 20).forEach(topItem => {
            const item = document.createElement('button');
            item.type = 'button';
            const isActive = selectedItemSet.has(topItem.name);
            item.className = 'picker-item' + (isActive ? ' selected' : '');
            const displayName = shortItemLabel(topItem.name);
            if (displayName !== topItem.name) item.title = topItem.name;
            item.innerHTML = `
                <span class="picker-check">${isActive ? '&#10003;' : ''}</span>
                <span>${displayName}</span>
                <span style="color:var(--c-text-3);font-size:10px;margin-left:auto">${fmt(topItem.value)}</span>
            `;
            item.addEventListener('click', () => {
                _toggleSelectedItem(topItem.name);
                _buildSelectionBar();
                _updateQueryBarLabels(DataLoader.getMetadata());
                _buildRPOptions();
                _updateCurrentView();
                _buildRPProducts();
            });
            listEl.appendChild(item);
        });
    }

    // Categories SECOND (aggregate groups)
    const categories = DataLoader.getCategories ? DataLoader.getCategories() : [];
    if (categories.length > 0) {
        const catTitle = document.createElement('div');
        catTitle.className = 'picker-region-title';
        catTitle.style.marginTop = '8px';
        catTitle.textContent = 'Categorías';
        listEl.appendChild(catTitle);

        // In LABOR the Categorías are the breakdown — there's no separate
        // "tipos" list. We treat the picks like topItems: multi-select toggle
        // so the user can stack several categories in trend view (Olivar +
        // Uva + Cereales as overlaid or stacked areas).
        const laborMultiSelect = catId === 'labor';
        categories.forEach(cat => {
            const item = document.createElement('button');
            item.type = 'button';
            const isActive = laborMultiSelect
                ? selectedItemSet.has(cat)
                : (currentCat === cat && currentItem === 'all');
            item.className = 'picker-item' + (isActive ? ' selected' : '');
            item.innerHTML = `<span class="picker-check">${isActive ? '&#10003;' : ''}</span><span>${cat}</span>`;
            item.addEventListener('click', () => {
                if (laborMultiSelect) {
                    _toggleSelectedItem(cat);
                } else {
                    State.set('selectedItems', []);
                    State.set('cropCategory', cat);
                    State.set('cropItem', 'all');
                }
                _buildSelectionBar();
                _updateQueryBarLabels(DataLoader.getMetadata());
                _buildRPOptions();
                _updateCurrentView();
                _buildRPProducts();
            });
            listEl.appendChild(item);
        });
    }

    // Search filter - replace handler to avoid duplicates
    if (searchEl) {
        const newSearch = searchEl.cloneNode(true);
        newSearch.value = '';
        searchEl.parentNode.replaceChild(newSearch, searchEl);
        newSearch.addEventListener('input', () => {
            const q = newSearch.value.trim().toLowerCase();
            if (!q) {
                _buildRPProducts();
                return;
            }

            const matches = searchableItems
                .filter(item => item.name.toLowerCase().includes(q))
                .sort((a, b) => {
                    const av = Number.isFinite(a.value) ? a.value : -Infinity;
                    const bv = Number.isFinite(b.value) ? b.value : -Infinity;
                    if (bv !== av) return bv - av;
                    return a.name.localeCompare(b.name);
                })
                .slice(0, 80);

            listEl.innerHTML = '';
            listEl.appendChild(allBtn);

            if (matches.length > 0) {
                const itemTitle = document.createElement('div');
                itemTitle.className = 'picker-region-title';
                itemTitle.textContent = 'Resultados';
                listEl.appendChild(itemTitle);
            }

            matches.forEach(topItem => {
                const item = document.createElement('button');
                item.type = 'button';
                const isActive = selectedItemSet.has(topItem.name);
                item.className = 'picker-item' + (isActive ? ' selected' : '');
                const displayName = shortItemLabel(topItem.name);
                if (displayName !== topItem.name) item.title = topItem.name;
                item.innerHTML = `
                    <span class="picker-check">${isActive ? '&#10003;' : ''}</span>
                    <span>${displayName}</span>
                    ${Number.isFinite(topItem.value) ? `<span style="color:var(--c-text-3);font-size:10px;margin-left:auto">${fmt(topItem.value)}</span>` : ''}
                `;
                item.addEventListener('click', () => {
                    _toggleSelectedItem(topItem.name);
                    _buildSelectionBar();
                    _updateQueryBarLabels(DataLoader.getMetadata());
                    _buildRPOptions();
                    _updateCurrentView();
                    _buildRPProducts();
                });
                listEl.appendChild(item);
            });

            if (matches.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'picker-empty';
                empty.textContent = 'Sin resultados';
                listEl.appendChild(empty);
            }
        });
    }
    _syncRightPanelState();
}

function _getProductPickerData(code, year, dataField, effectiveGeo) {
    const catId = State.get('activeCategory');
    const rankingField = catId === 'livestock' ? 'lu' : dataField;

    if (catId === 'trade' && _isBilateralIndicator() && DataLoader.isBilateralLoaded?.()) {
        return _getBilateralProductPickerData(year);
    }

    let items = DataLoader.getItemRanking
        ? DataLoader.getItemRanking(code, year, rankingField, effectiveGeo)
        : [];
    const itemNames = _collectAvailableItemNames(code, rankingField, effectiveGeo);

    if (items.length === 0 && itemNames.length > 0) {
        items = _rankItemNamesByLatestValue(itemNames, code, rankingField, effectiveGeo);
    }

    return { items, itemNames, isBilateral: false };
}

function _getBilateralProductPickerData(year) {
    const { code, geo, element } = _getBilateralProductContext();
    const years = DataLoader.getBilateralYears ? DataLoader.getBilateralYears() : [];
    const yIdx = _closestYearIndex(years, year);
    const rawItems = DataLoader.getBilateralItems(code, element, geo) || {};
    const items = Object.entries(rawItems)
        .map(([name, series]) => {
            const partners = DataLoader.getBilateralItemPartners(code, element, name, geo) || {};
            const hasPartners = Object.values(partners).some(arr =>
                Array.isArray(arr) && arr.some(v => v != null && v > 0)
            );
            if (!hasPartners) return null;
            const currentValue = Array.isArray(series) && yIdx >= 0 ? series[yIdx] : null;
            const fallbackValue = Array.isArray(series)
                ? Math.max(0, ...series.filter(v => v != null && Number.isFinite(v)))
                : null;
            const value = currentValue != null && currentValue > 0 ? currentValue : fallbackValue;
            return { code: name, name, value: Number.isFinite(value) ? value : null };
        })
        .filter(Boolean)
        .sort((a, b) => {
            const av = Number.isFinite(a.value) ? a.value : -Infinity;
            const bv = Number.isFinite(b.value) ? b.value : -Infinity;
            if (bv !== av) return bv - av;
            return a.name.localeCompare(b.name);
        });

    return { items, itemNames: items.map(item => item.name), isBilateral: true };
}

function _getBilateralProductContext() {
    const selected = State.get('selectedCountries') || [];
    const geoLevel = State.get('geoLevel');
    const activeIndicator = State.get('activeIndicator');
    const element = activeIndicator === 'bilateral_imports' ? 'import' : 'export';

    if (geoLevel === 'region' && selected.length > 0 && REGIONS[selected[0]]) {
        return { code: selected[0], geo: 'region', element };
    }
    if (selected.length > 0 && COUNTRIES[selected[0]]) {
        return { code: selected[0], geo: 'country', element };
    }
    return { code: 'latin_america', geo: 'region', element };
}

function _buildRPPartners() {
    const section = document.getElementById('rp-partners');
    const listEl = document.getElementById('rp-partner-list');
    const searchEl = document.getElementById('rp-partner-search');
    if (!section || !listEl) return;

    const show = State.get('activeCategory') === 'trade' && _isBilateralIndicator();
    section.style.display = show ? '' : 'none';
    if (!show) {
        _syncRightPanelState();
        return;
    }

    listEl.innerHTML = '';
    listEl.className = 'rp-list';

    if (!DataLoader.isBilateralLoaded?.()) {
        const empty = document.createElement('div');
        empty.className = 'picker-empty';
        empty.textContent = 'Cargando socios...';
        listEl.appendChild(empty);
        DataLoader.loadBilateral?.().then(() => {
            _buildRPPartners();
            _updateCurrentView();
        });
        _syncRightPanelState();
        return;
    }

    const selectedPartners = _getSelectedPartners();
    const selectedPartnerSet = new Set(selectedPartners);
    const partnerData = _getBilateralPartnerPickerData();
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'picker-item' + (selectedPartners.length === 0 ? ' selected' : '');
    allBtn.innerHTML = `<span class="picker-check">${selectedPartners.length === 0 ? '&#10003;' : ''}</span><span>Top socios</span>`;
    allBtn.addEventListener('click', () => {
        _clearSelectedPartners();
        _buildSelectionBar();
        _buildRPPartners();
        _updateCurrentView();
    });
    listEl.appendChild(allBtn);

    const visibleTopNames = new Set(partnerData.slice(0, 20).map(item => item.name));
    const hiddenSelectedPartners = selectedPartners.filter(partner => !visibleTopNames.has(partner));
    if (hiddenSelectedPartners.length > 0) {
        const selectedTitle = document.createElement('div');
        selectedTitle.className = 'picker-region-title';
        selectedTitle.textContent = 'Seleccionado';
        listEl.appendChild(selectedTitle);
        hiddenSelectedPartners.forEach(partnerName => {
            listEl.appendChild(_createPartnerPickerItem(partnerName, null, true));
        });
    }

    const title = document.createElement('div');
    title.className = 'picker-region-title';
    title.textContent = 'Top socios';
    listEl.appendChild(title);
    partnerData.slice(0, 20).forEach(partner => {
        listEl.appendChild(_createPartnerPickerItem(
            partner.name,
            partner.value,
            selectedPartnerSet.has(partner.name)
        ));
    });

    if (searchEl) {
        const newSearch = searchEl.cloneNode(true);
        newSearch.value = '';
        searchEl.parentNode.replaceChild(newSearch, searchEl);
        newSearch.addEventListener('input', () => {
            const q = newSearch.value.trim().toLowerCase();
            if (!q) {
                _buildRPPartners();
                return;
            }
            const matches = partnerData
                .filter(partner => partner.name.toLowerCase().includes(q))
                .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
                .slice(0, 80);
            listEl.innerHTML = '';
            listEl.appendChild(allBtn);
            const resultTitle = document.createElement('div');
            resultTitle.className = 'picker-region-title';
            resultTitle.textContent = matches.length ? 'Resultados' : 'Sin resultados';
            listEl.appendChild(resultTitle);
            matches.forEach(partner => {
                listEl.appendChild(_createPartnerPickerItem(
                    partner.name,
                    partner.value,
                    selectedPartnerSet.has(partner.name)
                ));
            });
        });
    }
    _syncRightPanelState();
}

function _createPartnerPickerItem(name, value, isSelected) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'picker-item' + (isSelected ? ' selected' : '');
    const displayName = shortEntityLabel(name);
    if (displayName !== name) item.title = name;
    item.innerHTML = `
        <span class="picker-check">${isSelected ? '&#10003;' : ''}</span>
        <span>${displayName}</span>
        ${Number.isFinite(value) ? `<span style="color:var(--c-text-3);font-size:10px;margin-left:auto">${fmt(value)}</span>` : ''}
    `;
    item.addEventListener('click', () => {
        _toggleSelectedPartner(name);
        _buildSelectionBar();
        _buildRPPartners();
        _updateCurrentView();
    });
    return item;
}

function _getBilateralPartnerPickerData() {
    const { code, geo, element } = _getBilateralProductContext();
    const years = DataLoader.getBilateralYears ? DataLoader.getBilateralYears() : [];
    const yIdx = _closestYearIndex(years, State.get('currentYear'));
    const productNames = _getSelectedItems();
    const valueByPartner = new Map();

    const addSeriesMap = (partners = {}) => {
        Object.entries(partners).forEach(([name, series]) => {
            if (name === 'Resto' || !Array.isArray(series)) return;
            const current = yIdx >= 0 ? series[yIdx] : null;
            const fallback = Math.max(0, ...series.filter(v => v != null && Number.isFinite(v)));
            const value = current != null && current > 0 ? current : fallback;
            if (!Number.isFinite(value) || value <= 0) return;
            valueByPartner.set(name, (valueByPartner.get(name) || 0) + value);
        });
    };

    if (productNames.length > 0) {
        productNames.forEach(itemName => {
            addSeriesMap(DataLoader.getBilateralItemPartners(code, element, itemName, geo) || {});
        });
    } else {
        addSeriesMap(DataLoader.getBilateralPartners(code, element, geo) || {});
    }

    return [...valueByPartner.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

function _closestYearIndex(years, year) {
    if (!Array.isArray(years) || years.length === 0) return -1;
    const clamped = Math.max(years[0], Math.min(years[years.length - 1], year));
    return years.indexOf(clamped);
}

function _rankItemNamesByLatestValue(itemNames, code, dataField, effectiveGeo) {
    const currentYear = State.get('currentYear');
    return itemNames
        .map(name => {
            const series = DataLoader.getItemTimeSeries
                ? DataLoader.getItemTimeSeries(code, name, dataField, effectiveGeo)
                : [];
            const current = series.find(d => d.year === currentYear && d.value != null);
            const latest = [...series].reverse().find(d => d.value != null && Number.isFinite(d.value));
            const value = current?.value ?? latest?.value ?? null;
            return { code: name, name, value };
        })
        .filter(item => Number.isFinite(item.value))
        .sort((a, b) => b.value - a.value);
}

function _topItemsHeader(catId) {
    if (catId === 'livestock') return 'Top especies';
    if (catId === 'landuse') return 'Top usos';
    if (catId === 'labor') return 'Top tipos';
    return 'Top productos';
}

function _itemChipKindLabel() {
    const facet = ITEM_FACET_LABEL[State.get('activeCategory')] || 'producto';
    if (facet === 'especie') return 'Especie';
    if (facet === 'uso') return 'Uso';
    if (facet === 'tipo') return 'Tipo';
    return 'Producto';
}

function _collectAvailableItemNames(code, dataField, effectiveGeo) {
    if (!DataLoader.getItemNames) return [];

    const names = new Set();
    const addFrom = (entityCode, geoLevel) => {
        (DataLoader.getItemNames(entityCode, dataField, geoLevel) || []).forEach(name => {
            if (name) names.add(name);
        });
    };

    addFrom(code, effectiveGeo);

    // Comercio needs the full loaded product catalogue, not only the current
    // territory's visible top products.
    if (State.get('activeCategory') === 'trade') {
        (DataLoader.getCountryCodes ? DataLoader.getCountryCodes() : Object.keys(COUNTRIES)).forEach(iso3 => {
            addFrom(iso3, 'country');
        });
        ['latin_america', ...Object.keys(REGIONS)].forEach(regionId => {
            addFrom(regionId, 'region');
        });
    }

    return [...names];
}

function _buildRPTerritories() {
    const levelPillsEl = document.getElementById('rp-level-pills');
    const listEl = document.getElementById('rp-territory-list');
    const searchEl = document.getElementById('rp-territory-search');
    if (!listEl) return;

    const activeView = State.get('activeView');
    const bilateralMode = activeView === 'bilateral' || State.get('activeIndicator')?.startsWith('bilateral_');
    // Hide search box in map view (countries selected by clicking map)
    const searchParent = searchEl?.parentElement;
    if (searchParent) searchParent.style.display = (activeView === 'map' || activeView === 'bilateral') ? 'none' : '';

    // -- Level pills --
    if (levelPillsEl) {
        levelPillsEl.innerHTML = '';
        levelPillsEl.className = 'rp-level-pills';

        const geoLevel = State.get('geoLevel');
        const activeCategory = State.get('activeCategory');
        const subnationalSupported = activeCategory === 'agriculture' || activeCategory === 'landuse';
        const isBilateral = bilateralMode;

        const levels = [
            { id: 'country', label: 'Países' },
            { id: 'region', label: 'Regiones' },
            { id: 'subnational', label: 'Subnacional' },
        ];

        levels.forEach(lv => {
            const pill = document.createElement('button');
            pill.className = 'rp-level-pill';
            if (lv.id === geoLevel) pill.classList.add('active');
            if (lv.id === 'subnational' && (!subnationalSupported || isBilateral)) {
                pill.disabled = true;
                pill.title = isBilateral ? 'No disponible en modo bilateral' : 'Disponible para Cultivos y Uso del suelo';
            }
            pill.textContent = lv.label;

            pill.addEventListener('click', () => {
                if (pill.disabled) return;
                // Clicking a level pill always behaves as a "reset to that level":
                // clear any selection (so the map shows the full picture) and
                // force a re-render even if we're already on that level.
                const target = lv.id;
                const cur = State.get('geoLevel');
                const hadSelection = State.get('selectedCountries').length > 0;

                if (target !== cur) {
                    // _onGeoLevelChange will clear countries + update views
                    State.set('geoLevel', target);
                } else if (hadSelection) {
                    State.clearCountries();
                } else {
                    _updateCurrentView();
                }
                _buildRPTerritories();
            });
            levelPillsEl.appendChild(pill);
        });
    }

    // -- Territory list --
    listEl.innerHTML = '';
    listEl.className = 'rp-list';

    const selected = State.get('selectedCountries');
    const geoLevel = State.get('geoLevel');
    if (bilateralMode && selected.length > 1) {
        State.setCountries([selected[0]]);
        return;
    }

    if (activeView === 'map' && !bilateralMode) {
        const note = document.createElement('div');
        note.className = 'territory-map-note';
        const modeLabel = geoLevel === 'region'
            ? 'regiones'
            : geoLevel === 'subnational'
                ? 'unidades subnacionales'
                : 'países';
        note.innerHTML = `
            <strong>${modeLabel}</strong>
            <span>En mapa, usa estos tres botones para cambiar el nivel y selecciona territorios directamente sobre el mapa.</span>
        `;
        listEl.appendChild(note);
        _syncRightPanelState();
        return;
    }

    if (geoLevel === 'subnational') {
        // Show all countries; where admin1 data are missing, the map falls
        // back to the national value for that country.
        const indicator = _getCurrentDataField();
        const subCountries = DataLoader.getSubnationalCountries(indicator);
        const allCountries = DataLoader.getCountryCodes ? DataLoader.getCountryCodes() : Object.keys(COUNTRIES);
        if (subCountries.length === 0) {
            const note = document.createElement('div');
            note.style.cssText = 'padding:8px 14px;color:#A89888;font-size:11px;';
            note.textContent = 'Sin desglose subnacional para este indicador: se muestran valores nacionales.';
            listEl.appendChild(note);
        }

        const title = document.createElement('div');
        title.className = 'picker-region-title';
        title.textContent = activeView === 'trend' ? 'Países con unidades subnacionales' : 'Países';
        listEl.appendChild(title);

        const visibleCountries = activeView === 'trend'
            ? allCountries.filter(iso3 => subCountries.includes(iso3))
            : allCountries;
        if (activeView === 'trend' && visibleCountries.length === 0) {
            const note = document.createElement('div');
            note.className = 'territory-map-note';
            note.innerHTML = '<strong>Sin desglose</strong><span>No hay series subnacionales para este indicador.</span>';
            listEl.appendChild(note);
        }

        visibleCountries.forEach(iso3 => {
            const isSelected = selected.includes(iso3);
            const hasSub = subCountries.includes(iso3);
            const admin1Names = hasSub ? DataLoader.getAdmin1Names(iso3).sort((a, b) => a.localeCompare(b)) : [];

            if (activeView === 'trend' && hasSub) {
                const details = document.createElement('details');
                details.className = 'subnational-country' + (isSelected ? ' selected' : '');
                if (isSelected) details.open = true;
                details.innerHTML = `
                    <summary>
                        <span class="subnational-country-name">${DataLoader.getCountryName(iso3)}</span>
                        <span class="subnational-count">${admin1Names.length} uds</span>
                    </summary>
                    <div class="subnational-actions">
                        <button type="button" class="subnational-action${isSelected ? ' active' : ''}" data-action="all">Todos</button>
                        <button type="button" class="subnational-action" data-action="clear">Borrar</button>
                    </div>
                    <div class="subnational-admin-list">
                        ${admin1Names.map(name => `<span class="subnational-admin-item">${name}</span>`).join('')}
                    </div>
                `;
                details.querySelector('[data-action="all"]')?.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    State.setCountries([iso3]);
                    _buildRPTerritories();
                    _updateCurrentView();
                });
                details.querySelector('[data-action="clear"]')?.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (isSelected) State.clearCountries();
                    else _buildRPTerritories();
                    _updateCurrentView();
                });
                listEl.appendChild(details);
            } else {
                const item = document.createElement('div');
                item.className = 'picker-item' + (isSelected ? ' selected' : '');
                item.innerHTML = `
                    <span class="picker-check">${isSelected ? '&#10003;' : ''}</span>
                    <span>${DataLoader.getCountryName(iso3)}</span>
                    <span style="color:#A89888;font-size:11px;margin-left:auto">${hasSub ? `${admin1Names.length} uds` : 'nacional'}</span>
                `;
                item.addEventListener('click', () => {
                    State.setCountries(isSelected ? [] : [iso3]);
                    _buildRPTerritories();
                });
                listEl.appendChild(item);
            }
        });
    } else if (geoLevel === 'country') {
        const allCountryCodes = Object.values(REGIONS).flatMap(reg => reg.countries);
        _appendTerritoryActions(listEl, [
            {
                label: 'Seleccionar todos',
                active: selected.length === allCountryCodes.length,
                onClick: () => {
                    if (bilateralMode) State.clearCountries();
                    else State.setCountries(allCountryCodes);
                    _buildRPTerritories();
                    if (bilateralMode) _updateCurrentView();
                },
            },
            {
                label: 'Limpiar',
                active: selected.length === 0,
                onClick: () => {
                    State.clearCountries();
                    _buildRPTerritories();
                    _updateCurrentView();
                },
            },
        ]);

        if (bilateralMode) {
            const actionButtons = listEl.querySelectorAll('.territory-actions button');
            if (actionButtons.length > 1) actionButtons[1].remove();
        }

        // Group countries by region
        for (const [regId, reg] of Object.entries(REGIONS)) {
            const title = document.createElement('div');
            title.className = 'picker-region-title region-shortcut';
            title.innerHTML = `<span>${reg.label}</span><button type="button">Ver región</button>`;
            title.querySelector('button').addEventListener('click', (event) => {
                event.stopPropagation();
                State.set('geoLevel', 'region');
                State.setCountries([regId]);
                _buildRPTerritories();
                _updateCurrentView();
            });
            listEl.appendChild(title);

            reg.countries.forEach(iso3 => {
                const item = document.createElement('div');
                const isSelected = selected.includes(iso3);
                item.className = 'picker-item' + (isSelected ? ' selected' : '');
                item.innerHTML = `
                    <span class="picker-check">${isSelected ? '&#10003;' : ''}</span>
                    <span>${DataLoader.getCountryName(iso3)}</span>
                `;
                item.addEventListener('click', () => {
                    if (bilateralMode) {
                        if (isSelected && selected.length === 1) State.clearCountries();
                        else State.setCountries([iso3]);
                    } else if (selected.includes('latin_america')) {
                        State.setCountries([iso3]);
                    } else {
                        State.toggleCountry(iso3);
                    }
                    // toggleCountry triggers _buildSelectionBar via subscription,
                    // which calls _updateCurrentView. Rebuild territory list too.
                    _buildRPTerritories();
                    if (bilateralMode) _updateCurrentView();
                });
                listEl.appendChild(item);
            });
        }
    } else if (geoLevel === 'region') {
        const allRegionIds = Object.keys(REGIONS);
        const allRegionsSelected = selected.length === 0
            || (selected.length === allRegionIds.length && allRegionIds.every(id => selected.includes(id)));
        const actions = [];
        if (activeView === 'trend') {
            actions.push({
                label: 'Toda América Latina',
                active: selected.length === 1 && selected[0] === 'latin_america',
                onClick: () => {
                    State.setCountries(['latin_america']);
                    _buildRPTerritories();
                    _updateCurrentView();
                },
            });
        }
        actions.push({
            label: 'Seleccionar todas',
            active: allRegionsSelected,
            onClick: () => {
                State.setCountries(allRegionIds);
                _buildRPTerritories();
                _updateCurrentView();
            },
        });
        _appendTerritoryActions(listEl, actions);

        // Show regions
        for (const [regId, reg] of Object.entries(REGIONS)) {
            const item = document.createElement('div');
            const isSelected = selected.includes(regId);
            item.className = 'picker-item' + (isSelected ? ' selected' : '');
            item.innerHTML = `
                <span class="picker-check">${isSelected ? '&#10003;' : ''}</span>
                <span>${reg.label}</span>
            `;
            item.addEventListener('click', () => {
                if (selected.includes(regId)) {
                    State.removeCountry(regId);
                } else if (selected.includes('latin_america')) {
                    State.setCountries([regId]);
                } else {
                    if (bilateralMode) State.setCountries([regId]);
                    else State.addCountry(regId);
                }
                _buildRPTerritories();
                if (bilateralMode) _updateCurrentView();
            });
            listEl.appendChild(item);
        }
    }

    // Search filter
    if (searchEl) {
        const newSearch = searchEl.cloneNode(true);
        searchEl.parentNode.replaceChild(newSearch, searchEl);
        newSearch.addEventListener('input', () => {
            const q = newSearch.value.toLowerCase();
            listEl.querySelectorAll('.picker-item, .subnational-country').forEach(item => {
                const name = item.textContent.toLowerCase();
                item.style.display = name.includes(q) ? '' : 'none';
            });
        });
    }
    _syncRightPanelState();
}

function _appendTerritoryActions(listEl, actions) {
    const row = document.createElement('div');
    row.className = 'territory-actions';
    actions.forEach(action => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'territory-action' + (action.active ? ' active' : '');
        btn.textContent = action.label;
        btn.addEventListener('click', action.onClick);
        row.appendChild(btn);
    });
    listEl.appendChild(row);
}

function _createTradeIndicatorSelector(cat, meta) {
    const grid = document.createElement('div');
    grid.className = 'trade-indicator-grid';
    (cat.indicatorGroups || []).forEach(ig => {
        const enabled = (ig.indicators || []).filter(ind => ind.enabled);
        if (!enabled.length) return;
        const card = document.createElement('div');
        const groupActive = enabled.some(ind => ind.id === State.get('activeIndicator'));
        card.className = 'trade-indicator-card' + (groupActive ? ' active' : '');
        card.innerHTML = `<div class="trade-indicator-title">${ig.label}</div>`;
        enabled.forEach(ind => {
            const isActive = ind.id === State.get('activeIndicator');
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'trade-indicator-option' + (isActive ? ' selected' : '');
            item.innerHTML = `<span class="picker-check">${isActive ? '&#10003;' : ''}</span><span>${ind.label}</span>`;
            item.addEventListener('click', () => {
                State.set('activeIndicator', ind.id);
                _updateQueryBarLabels(meta);
                _buildRPOptions(meta);
            });
            card.appendChild(item);
        });
        grid.appendChild(card);
    });
    return grid;
}

function _footprintIndicatorParts(indicatorId = State.get('activeIndicator')) {
    const [dimension, flow] = String(indicatorId || '').split('_');
    return {
        dimension: FOOTPRINT_DIMENSIONS.some(d => d.id === dimension) ? dimension : 'land',
        flow: FOOTPRINT_FLOWS.some(f => f.id === flow) ? flow : 'footprint',
    };
}

function _setFootprintIndicator(dimension, flow, meta) {
    State.set('activeIndicator', `${dimension}_${flow}`);
    _updateQueryBarLabels(meta);
    _buildRPOptions(meta);
    _updateCurrentView();
}

function _createFootprintIndicatorControls(meta) {
    const wrap = document.createElement('div');
    wrap.className = 'rp-footprint-controls';
    const parts = _footprintIndicatorParts();

    wrap.appendChild(_createRPOptionRow('Dimensión', _createRPPills(
        FOOTPRINT_DIMENSIONS,
        parts.dimension,
        dimension => _setFootprintIndicator(dimension, parts.flow, meta),
        'rp-pills-compact'
    )));

    wrap.appendChild(_createRPOptionRow('Flujo', _createRPPills(
        FOOTPRINT_FLOWS,
        parts.flow,
        flow => _setFootprintIndicator(parts.dimension, flow, meta),
        'rp-pills-compact'
    )));

    return wrap;
}

function _createRPGroup(title) {
    const group = document.createElement('div');
    group.className = 'rp-group';
    const titleEl = document.createElement('div');
    titleEl.className = 'rp-group-title';
    titleEl.textContent = title;
    group.appendChild(titleEl);
    return group;
}

function _createRPOptionRow(label, control) {
    const row = document.createElement('div');
    row.className = 'rp-option-row';
    const labelEl = document.createElement('div');
    labelEl.className = 'rp-option-label';
    labelEl.textContent = label;
    row.appendChild(labelEl);
    row.appendChild(control);
    return row;
}

function _getActiveIndicator(meta) {
    const cat = meta?.categories?.find(c => c.id === State.get('activeCategory'));
    if (!cat) return null;
    for (const group of (cat.indicatorGroups || [])) {
        for (const ind of group.indicators || []) {
            if (ind.id === State.get('activeIndicator')) return ind;
        }
    }
    return null;
}

function _canUseLogScale(meta) {
    const ind = _getActiveIndicator(meta);
    const axisMode = State.get('axisMode');
    if (!ind) return false;
    if (axisMode === 'pct_total' || axisMode === 'pct_territory' || axisMode === 'index') return false;
    const unit = String(ind.unit || '').toLowerCase();
    const id = String(ind.id || '').toLowerCase();
    if (unit.includes('%') || id.includes('share')) return false;
    if (unit.includes('Índice') || unit.includes('indice') || unit === '0-2' || unit === '0/1') return false;
    if (['land_gini', 'gini_disp', 'gini_mkt', 'reform_intensity', 'reform_binary'].includes(id)) return false;
    if (_isNonAdditiveIndicator(ind)) return false;
    return true;
}

function _isNonAdditiveIndicator(ind) {
    if (!ind) return false;
    if (_isBalanceIndicator(ind)) return true;

    const unit = String(ind.unit || '').toLowerCase();
    const id = String(ind.id || '').toLowerCase();
    const field = String(ind.dataField || '').toLowerCase();
    const text = `${id} ${field}`;

    // Only block stacking for indicators where summing is *mathematically*
    // meaningless: shares/percentages and pure indices. For everything else
    // (yields, intensities, per-capita, etc.) we let the user choose — even
    // if stacking is unusual, the toggle should appear so the user can
    // explore the data without surprises.
    if (unit.includes('%')) return true;
    if (unit === 'index100' || unit.includes('índice') || unit.includes('indice')) return true;
    if (unit === '0-2' || unit === '0/1') return true;
    if (/\b(gini|share)\b/.test(text)) return true;
    return false;
}

function _canUseRelativeMetric(ind) {
    return !!ind && !_isNonAdditiveIndicator(ind);
}

function _canUseIndexMetric(ind) {
    return !!ind && !_isNonAdditiveIndicator(ind);
}

function _canUseStackedTrend(ind) {
    const axisMode = State.get('axisMode') || 'absolute';
    return !!ind && axisMode !== 'index' && !_isNonAdditiveIndicator(ind);
}

function _isBalanceIndicator(ind) {
    if (!ind) return false;
    return ind.id?.includes('balance') || ind.dataField?.includes('balance');
}

function _createRPPills(options, activeId, onChange, className = '') {
    const wrap = document.createElement('div');
    wrap.className = 'rp-pills' + (className ? ` ${className}` : '');
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rp-pill' + (String(opt.id) === String(activeId) ? ' active' : '');
        btn.dataset.value = opt.id;
        btn.disabled = !!opt.disabled;
        btn.title = opt.title || opt.label;
        btn.setAttribute('aria-label', opt.label);
        const label = opt.shortLabel || opt.label;
        btn.innerHTML = `${opt.icon ? `<span class="rp-pill-icon">${opt.icon}</span>` : ''}<span>${_escapeHtml(label)}</span>`;
        btn.addEventListener('click', () => {
            if (btn.disabled || String(opt.id) === String(activeId)) return;
            wrap.querySelectorAll('.rp-pill').forEach(el => el.classList.remove('active'));
            btn.classList.add('active');
            onChange(opt.id);
        });
        wrap.appendChild(btn);
    });
    return wrap;
}

function _createRPSelect(options, activeId, onChange) {
    const select = document.createElement('select');
    select.className = 'rp-select';
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.id;
        option.textContent = opt.label;
        option.disabled = !!opt.disabled;
        if (opt.title) option.title = opt.title;
        select.appendChild(option);
    });
    select.value = activeId;
    if (select.value !== String(activeId)) {
        const firstEnabled = options.find(opt => !opt.disabled);
        if (firstEnabled) select.value = firstEnabled.id;
    }
    select.addEventListener('change', () => onChange(select.value));
    return select;
}

function _getCurrentDataField() {
    const meta = DataLoader.getMetadata();
    const cat = meta.categories.find(c => c.id === State.get('activeCategory'));
    if (!cat) return 'production';
    const activeUnit = State.get('activeUnit');
    for (const group of (cat.indicatorGroups || [])) {
        for (const ind of group.indicators) {
            if (ind.id === State.get('activeIndicator')) {
                if (activeUnit === 'GJ' && ind.dataFieldGJ) return ind.dataFieldGJ;
                return ind.dataField;
            }
        }
    }
    return 'production';
}

function _mapUnitToIndicator(unit) {
    // Map unit to the matching indicator using metadata unitMap
    const meta = DataLoader.getMetadata();
    const cat = meta.categories.find(c => c.id === State.get('activeCategory'));
    if (!cat || !cat.unitMap) return;

    const unitInfo = cat.unitMap[unit];
    if (!unitInfo) return;

    // Find matching indicator by dataField
    for (const group of (cat.indicatorGroups || [])) {
        for (const ind of group.indicators) {
            if (ind.dataField === unitInfo.dataField) {
                State.set('activeIndicator', ind.id);
                document.querySelectorAll('.ind-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.indicator === ind.id);
                });
                _updateCurrentView();
                return;
            }
        }
    }
}

/* -----------------------------------------------
   Year range helper - restricts timeline to actual data bounds
   ----------------------------------------------- */
function _visibleTrendYearRange(dataField) {
    if (State.get('activeView') !== 'trend') return null;
    const selected = State.get('selectedCountries') || [];
    if (!selected.length || !DataLoader.getTimeSeries) return null;

    const geoLevel = State.get('geoLevel') || 'country';
    const values = [];
    selected.forEach(code => {
        const seriesGeo = geoLevel === 'country' && (code === 'latin_america' || REGIONS[code])
            ? 'region'
            : geoLevel;
        const series = DataLoader.getTimeSeries(code, dataField, seriesGeo) || [];
        series.forEach(d => {
            const year = Number(d?.year);
            const value = Number(d?.value);
            if (Number.isFinite(year) && d?.value != null && Number.isFinite(value)) values.push(year);
        });
    });

    if (!values.length) return null;
    const start = Math.min(...values);
    const end = Math.max(...values);
    return end > start ? [start, end] : null;
}

function _updateYearRangeFromData() {
    const dataField = _getCurrentDataField();
    const effectiveRange = _visibleTrendYearRange(dataField) || DataLoader.getEffectiveYearRange(dataField);
    if (effectiveRange) {
        State.set('yearRange', effectiveRange);
        // Clamp currentYear to the effective range
        const cur = State.get('currentYear');
        if (cur < effectiveRange[0]) State.set('currentYear', effectiveRange[0]);
        if (cur > effectiveRange[1]) State.set('currentYear', effectiveRange[1]);
    } else {
        // Fallback: use full category year range
        const years = DataLoader.getYears();
        if (years && years.length > 0) {
            State.set('yearRange', [years[0], years[years.length - 1]]);
            const cur = State.get('currentYear');
            if (cur > years[years.length - 1]) State.set('currentYear', years[years.length - 1]);
        }
    }
}

/* -----------------------------------------------
   Event handlers
   ----------------------------------------------- */
async function _onCategoryChange(meta) {
    const catId = State.get('activeCategory');
    const changeSeq = ++_categoryChangeSeq;
    const hadCompareMode = State.get('compareMode');
    const catLabel = document.getElementById('category-label');
    const cat = meta.categories.find(c => c.id === catId);
    if (catLabel && cat) catLabel.textContent = cat.label;

    // Block intermediate view updates while we load data and update state
    _categoryChanging = true;

    try {
        hideTooltip();
        _clearMapLegend();

        // Reset cross-category state before any rebuild can happen. Otherwise
        // a category can inherit impossible combinations such as Sugar cane + GJ.
        _clearSelectedItems();
        State.set('axisMode', 'absolute');
        State.set('scaleType', 'linear');
        State.set('chartType', 'lines');
        State.set('chartLayout', 'overlay');
        State.set('compareMode', false);
        State.set('activeUnit', cat?.unitOptions?.[0]?.id || cat?.defaultUnit || 'toneladas');
        if (State.get('selectedCountries').length > 0) State.clearCountries();

        // Subnational/fallback mode is supported for crops and land use.
        if (!['agriculture', 'landuse'].includes(catId) && State.get('geoLevel') === 'subnational') {
            State.set('geoLevel', 'country');
        }

        // Set default indicator immediately so labels/options belong to the new category.
        if (cat && cat.indicatorGroups && cat.indicatorGroups.length > 0) {
            const firstInd = cat.indicatorGroups[0].indicators.find(i => i.enabled);
            if (firstInd) State.set('activeIndicator', firstInd.id);
        }

        _updateQueryBarLabels(meta);
        _buildIndicatorPanel(meta);
        _buildSelectionBar();
        _buildRPOptions(meta);
        _buildRPProducts();
        _buildRPPartners();
        _buildRPTerritories();

        // Always ensure category data is loaded before final data-dependent panels.
        const loaded = await DataLoader.loadCategory(catId);
        if (!loaded) console.warn(`[CATEGORY] No data loaded for ${catId}`);

        // Bail out if the user switched again while we were loading
        if (State.get('activeCategory') !== catId || changeSeq !== _categoryChangeSeq) return;

        // Set default indicator for this category (before year range calc so field is known)
        if (cat && cat.indicatorGroups && cat.indicatorGroups.length > 0) {
            const firstInd = cat.indicatorGroups[0].indicators.find(i => i.enabled);
            if (firstInd) State.set('activeIndicator', firstInd.id);
        }

        // Update year range based on actual data availability for the current indicator
        _updateYearRangeFromData();
        const effectiveRange = State.get('yearRange');
        if (effectiveRange) {
            State.set('startYear', effectiveRange[0]);
            if (hadCompareMode) State.set('currentYear', effectiveRange[1]);
        }

        // Reset item selection and unit when category changes
        _clearSelectedItems();
        State.set('activeUnit', cat?.unitOptions?.[0]?.id || cat?.defaultUnit || 'toneladas');

        // Subnational/fallback mode is supported for crops and land use.
        if (!['agriculture', 'landuse'].includes(catId) && State.get('geoLevel') === 'subnational') {
            State.set('geoLevel', 'country');
        }

        // Update view tabs for this category
        _buildTopViews();

        _updateSidebarActiveState();

        _buildIndicatorPanel(meta);
        _buildSelectionBar();
        _buildRPOptions(meta);
        _buildRPProducts();
        _buildRPTerritories();
    } catch (err) {
        console.error(`[CATEGORY] Failed to switch to ${catId}:`, err);
    } finally {
        // Unblock view updates
        _categoryChanging = false;
    }

    // Final check: only update views if this is still the active category
    if (State.get('activeCategory') === catId && changeSeq === _categoryChangeSeq) {
        updateTimeline();
        _updateAllViews();
    }
}

function _onIndicatorChange() {
    _updateQueryBarLabels(DataLoader.getMetadata());
    _clearMapLegend();
    if (_categoryChanging) return;
    const ind = State.get('activeIndicator');
    const isBilateral = ind?.startsWith('bilateral_');
    const enteringBilateral = isBilateral && State.get('activeView') !== 'bilateral';
    if (!isBilateral && _getSelectedPartners().length > 0) _clearSelectedPartners();

    // Update year range for the new indicator's actual data availability
    _updateYearRangeFromData();

    if (isBilateral) {
        if (enteringBilateral) document.getElementById('rp-options')?.classList.remove('collapsed');
        if (enteringBilateral && State.get('selectedCountries').length > 0) {
            State.clearCountries();
        }
        // Clamp year to bilateral range (1961-2023)
        const bYears = DataLoader.getBilateralYears();
        if (bYears.length > 0) {
            const cur = State.get('currentYear');
            if (cur < bYears[0]) State.set('currentYear', bYears[0]);
            if (cur > bYears[bYears.length - 1]) State.set('currentYear', bYears[bYears.length - 1]);
            State.set('yearRange', [bYears[0], bYears[bYears.length - 1]]);
        }
        if (State.get('activeView') !== 'bilateral') {
            State.set('activeView', 'bilateral');
            _buildTopViews();
        } else {
            _updateCurrentView();
        }
    } else if (!isBilateral && State.get('activeView') === 'bilateral') {
        _clearSelectedPartners();
        State.set('activeView', 'map');
        _buildTopViews();
    } else {
        _updateCurrentView();
    }
    _buildRPOptions();
    _buildRPProducts();
    _buildRPPartners();
    _buildRPTerritories();
    updateTimeline();
}

function _onYearChange(year) {
    document.getElementById('tl-year').textContent = year;
    document.getElementById('map-year').textContent = year;
    const bYear = document.getElementById('bilateral-year');
    if (bYear) bYear.textContent = year;
    if (_isBilateralIndicator()) _buildRPPartners();
    _updateCurrentView();
}

async function _onGeoLevelChange() {
    const geoLevel = State.get('geoLevel');
    State.clearCountries();

    // Lazy-load subnational data when first entering subnational mode
    if (geoLevel === 'subnational' && !DataLoader.isSubnationalLoaded()) {
        await DataLoader.loadSubnational();
    }

    // Rebuild view buttons (availability changes by geo level)
    _buildTopViews();
    // Some right-panel options depend on geoLevel (subnational pill, métrica
    // suboptions). Rebuild them so the user sees a fresh, consistent panel.
    _buildRPOptions();
    _buildRPPartners();
    _buildRPTerritories();
    _updateAllViews();

    // Force re-render after DOM reflow for subnational (timing safety net)
    if (geoLevel === 'subnational') {
        requestAnimationFrame(() => _updateAllViews());
    }
}

function _updateCurrentView() {
    if (_categoryChanging) return;
    const view = State.get('activeView');
    switch (view) {
        case 'map': updateMapView(); break;
        case 'trend': updateTrendView(); break;
        case 'treemap': updateTreemapView(); break;
        case 'ranking': updateRankingView(); break;
        case 'table': updateTableView(); break;
        case 'bilateral': updateBilateralView(); break;
        case 'country': updateCountryProfileView(); break;
    }
    // Keep the paired trend chart in sync when split layout is on
    if (view === 'map' && _isSplitActive()) updateTrendView();
}

function _updateAllViews() {
    if (_categoryChanging) return;   // defer until category switch completes
    updateTimeline();
    _updateCurrentView();
}

/* -----------------------------------------------
   Download export
   ----------------------------------------------- */

function _getDownloadContext() {
    const meta = DataLoader.getMetadata();
    const category = meta.categories.find(c => c.id === State.get('activeCategory'));
    const indicator = _getActiveIndicatorMeta(meta);
    const indicatorGroup = _getActiveIndicatorGroupMeta(meta);
    const indicatorLabel = indicator
        ? _indicatorDisplayLabel(category, indicatorGroup, indicator)
        : '';
    return {
        meta,
        category,
        catId: category?.id || State.get('activeCategory'),
        indicator,
        indicatorGroup,
        indicatorLabel,
        dataField: _getCurrentDataField(),
        view: State.get('activeView'),
        year: State.get('currentYear'),
        yearRange: State.get('yearRange'),
        geoLevel: State.get('geoLevel'),
        selected: State.get('selectedCountries') || [],
        items: _getSelectedItems(),
        item: State.get('cropItem'),
        itemCategory: State.get('cropCategory'),
    };
}

function _buildExportCSV(ctx = _getDownloadContext()) {
    if (ctx.view === 'bilateral') return _buildBilateralExportCSV(ctx);
    return _buildSeriesExportCSV(ctx);
}

function _buildSeriesExportCSV(ctx) {
    const entities = _seriesExportEntities(ctx);
    const cropItems = Array.isArray(ctx.items) && ctx.items.length > 0
        ? ctx.items
        : (ctx.item && ctx.item !== 'all' ? [ctx.item] : []);
    const rows = [[
        'category_id',
        'category_label',
        'indicator_id',
        'indicator_label',
        'data_field',
        'unit',
        'metric_requested',
        'metric_exported',
        'vista',
        'geo_level',
        'territorio_codigo',
        'territorio',
        'item',
        'anio',
        'valor',
        'fuente',
        'metodo',
        'dataset_fuente',
        'confianza',
        'estado_trazabilidad',
        'nota_trazabilidad',
        'metadatos_observacion_json',
    ]];

    const addSeriesRows = (entity, itemName = null) => {
        const data = itemName
            ? (DataLoader.getOriginalItemTimeSeries?.(entity.code, itemName, ctx.dataField, entity.geo)
                || DataLoader.getItemTimeSeries(entity.code, itemName, ctx.dataField, entity.geo))
            : _originalEntityTimeSeries(entity, ctx);
        const obsMeta = _observationMetaByYear(entity, ctx);
        const itemLabel = itemName
            || (ctx.itemCategory && ctx.itemCategory !== 'all' ? ctx.itemCategory : 'total');
        data.forEach(point => {
            if (!Number.isFinite(point.value)) return;
            const provenance = _rowProvenance(ctx, obsMeta.get(point.year));
            rows.push([
                ctx.catId,
                ctx.category?.label || ctx.catId,
                ctx.indicator?.id || '',
                ctx.indicatorLabel,
                ctx.dataField,
                _downloadUnitLabel(ctx),
                _axisModeLabel(State.get('axisMode')),
                'original_absolute_value',
                _viewLabel(ctx.view),
                entity.geo,
                entity.code,
                entity.name,
                itemLabel,
                point.year,
                point.value,
                provenance.source,
                provenance.method,
                provenance.sourceDataset,
                provenance.confidence,
                provenance.status,
                provenance.note,
                provenance.rawJson,
            ]);
        });
    };

    entities.forEach(entity => {
        if (cropItems.length > 0) cropItems.forEach(itemName => addSeriesRows(entity, itemName));
        else addSeriesRows(entity);
    });

    return {
        filename: _downloadBaseName(ctx) + '_data.csv',
        text: rows.map(row => row.map(_csvCell).join(',')).join('\n') + '\n',
    };
}

function _buildRankingExportCSV(ctx) {
    const ranking = DataLoader.getRanking(ctx.year, ctx.dataField, ctx.geoLevel);
    const rows = [['territorio', 'valor', 'indicador', 'anio', 'categoria', 'vista']];
    ranking.forEach(r => {
        rows.push([r.name, r.value ?? '', ctx.indicatorLabel, ctx.year, ctx.category.label, _viewLabel(ctx.view)]);
    });
    return {
        filename: _downloadBaseName(ctx) + '.csv',
        text: rows.map(row => row.map(_csvCell).join(',')).join('\n') + '\n',
    };
}

function _buildTrendExportCSV(ctx) {
    const entities = _trendExportEntities(ctx);
    const cropItems = Array.isArray(ctx.items) && ctx.items.length > 0
        ? ctx.items
        : (ctx.item && ctx.item !== 'all' ? [ctx.item] : []);
    const series = cropItems.length > 0
        ? entities.flatMap(entity => cropItems.map(itemName => ({
            ...entity,
            name: `${entity.name} - ${itemName}`,
            data: DataLoader.getItemTimeSeries(entity.code, itemName, ctx.dataField, entity.geo),
        })))
        : entities.map(entity => ({
            ...entity,
            data: DataLoader.getTimeSeries(entity.code, ctx.dataField, entity.geo),
        }));
    const yearSet = new Set();
    series.forEach(s => s.data.forEach(d => {
        if (!ctx.yearRange || (d.year >= ctx.yearRange[0] && d.year <= ctx.yearRange[1])) yearSet.add(d.year);
    }));
    const years = [...yearSet].sort((a, b) => a - b);
    const rows = [['anio', ...series.map(s => s.name)]];
    years.forEach(year => {
        rows.push([year, ...series.map(s => {
            const point = s.data.find(d => d.year === year);
            return point?.value ?? '';
        })]);
    });
    return {
        filename: _downloadBaseName(ctx) + '_serie.csv',
        text: rows.map(row => row.map(_csvCell).join(',')).join('\n') + '\n',
    };
}

function _buildBilateralExportCSV(ctx) {
    const { code, geo, element } = _getBilateralProductContext();
    const years = DataLoader.getBilateralYears();
    const cropItems = Array.isArray(ctx.items) && ctx.items.length > 0
        ? ctx.items
        : (ctx.item && ctx.item !== 'all' ? [ctx.item] : []);
    const cropItem = cropItems.length === 1 ? cropItems[0] : null;
    const partners = cropItem
        ? DataLoader.getBilateralItemPartners(code, element, cropItem, geo)
        : DataLoader.getBilateralPartners(code, element, geo);
    const provenance = _rowProvenance(ctx, null);
    const rows = [[
        'category_id',
        'category_label',
        'indicator_id',
        'indicator_label',
        'data_field',
        'unit',
        'metric_requested',
        'metric_exported',
        'vista',
        'entidad_codigo',
        'entidad',
        'geo_level',
        'socio',
        'flujo',
        'producto',
        'anio',
        'valor_toneladas',
        'fuente',
        'metodo',
        'dataset_fuente',
        'confianza',
        'estado_trazabilidad',
        'nota_trazabilidad',
        'metadatos_observacion_json',
    ]];
    Object.entries(partners || {}).forEach(([name, arr]) => {
        if (!Array.isArray(arr)) return;
        arr.forEach((value, i) => {
            if (value == null || !Number.isFinite(value) || value <= 0) return;
            rows.push([
                ctx.catId,
                ctx.category?.label || ctx.catId,
                ctx.indicator?.id || '',
                ctx.indicatorLabel,
                ctx.dataField,
                'toneladas',
                _axisModeLabel(State.get('axisMode')),
                'original_absolute_value',
                _viewLabel(ctx.view),
                code,
                DataLoader.getCountryName(code),
                geo,
                name,
                element === 'export' ? 'exportaciones' : 'importaciones',
                cropItem || 'todos',
                years[i],
                value,
                provenance.source,
                provenance.method,
                provenance.sourceDataset,
                provenance.confidence,
                provenance.status,
                provenance.note,
                provenance.rawJson,
            ]);
        });
    });
    return {
        filename: _downloadBaseName(ctx) + '_data.csv',
        text: rows.map(row => row.map(_csvCell).join(',')).join('\n') + '\n',
    };
}

function _seriesExportEntities(ctx) {
    if (ctx.view === 'trend') return _trendExportEntities(ctx);

    const selected = Array.isArray(ctx.selected) ? ctx.selected : [];
    if (ctx.geoLevel === 'subnational') {
        const countries = selected.length > 0
            ? selected
            : (DataLoader.getSubnationalCountries?.(ctx.dataField) || []);
        return countries.flatMap(iso3 => (DataLoader.getAdmin1Names?.(iso3) || []).map(adminName => ({
            code: `${iso3}::${adminName}`,
            countryCode: iso3,
            adminName,
            geo: 'subnational',
            name: `${adminName}, ${DataLoader.getCountryName(iso3)}`,
        })));
    }

    if (selected.length > 0) {
        return selected.map(code => ({
            code,
            geo: REGIONS[code] || code === 'latin_america' ? 'region' : 'country',
            name: DataLoader.getCountryName(code),
        }));
    }

    if (ctx.geoLevel === 'region') {
        return Object.entries(REGIONS).map(([code, reg]) => ({
            code,
            geo: 'region',
            name: reg.label,
        }));
    }

    const countryCodes = DataLoader.getCountryCodes ? DataLoader.getCountryCodes() : Object.keys(COUNTRIES);
    return [
        { code: 'latin_america', geo: 'region', name: DataLoader.getCountryName('latin_america') },
        ...countryCodes.map(code => ({ code, geo: 'country', name: DataLoader.getCountryName(code) })),
    ];
}

function _trendExportEntities(ctx) {
    if (ctx.geoLevel === 'subnational' && ctx.selected.length > 0) {
        const iso3 = ctx.selected[0];
        return (DataLoader.getAdmin1Names?.(iso3) || []).map(adminName => ({
            code: `${iso3}::${adminName}`,
            countryCode: iso3,
            adminName,
            geo: 'subnational',
            name: `${adminName}, ${DataLoader.getCountryName(iso3)}`,
        }));
    }
    if (ctx.selected.length > 0) {
        return ctx.selected.map(code => ({
            code,
            geo: REGIONS[code] || code === 'latin_america' ? 'region' : 'country',
            name: DataLoader.getCountryName(code),
        }));
    }
    if (ctx.geoLevel === 'region') {
        return Object.keys(REGIONS).map(code => ({ code, geo: 'region', name: REGIONS[code].label }));
    }
    return [{ code: 'latin_america', geo: 'region', name: 'América Latina' }];
}

function _originalEntityTimeSeries(entity, ctx) {
    if (entity.geo === 'subnational') {
        return DataLoader.getOriginalSubnationalTimeSeries?.(entity.countryCode, entity.adminName, ctx.dataField)
            || DataLoader.getSubnationalTimeSeries?.(entity.countryCode, entity.adminName, ctx.dataField)
            || [];
    }
    return DataLoader.getOriginalTimeSeries?.(entity.code, ctx.dataField, entity.geo)
        || DataLoader.getTimeSeries(entity.code, ctx.dataField, entity.geo);
}

function _exportMetadataStrings(ctx) {
    const info = CATEGORY_SOURCE_INFO[ctx.catId] || {};
    const datasetMeta = DataLoader.getDatasetMetadata?.(ctx.catId);
    const detected = _metadataSourceLines(datasetMeta, ctx.indicator?.dataField).join(' | ');
    return {
        sources: [info.sources, detected].filter(Boolean).join(' | '),
        method: info.method || '',
        availability: info.availability || '',
    };
}

function _observationMetaByYear(entity, ctx) {
    const map = new Map();
    if (entity.geo === 'subnational') return map;
    const points = DataLoader.getObservationPoints?.(entity.code, ctx.dataField, entity.geo) || [];
    points.forEach(point => {
        const raw = { ...point };
        map.set(point.year, {
            source: point.source || point.source_label || point.reference || point.source_dataset || '',
            method: point.method || point.method_value || point.estimation_method || '',
            sourceDataset: point.source_dataset || point.dataset || '',
            confidence: point.confidence || '',
            rawJson: JSON.stringify(raw),
        });
    });
    return map;
}

function _rowProvenance(ctx, pointMeta = null) {
    if (pointMeta && (pointMeta.source || pointMeta.method || pointMeta.sourceDataset)) {
        return {
            source: pointMeta.source || '',
            method: pointMeta.method || '',
            sourceDataset: pointMeta.sourceDataset || '',
            confidence: pointMeta.confidence || '',
            status: 'observation_metadata_in_viewer_json',
            note: 'This row has observation-level source/method metadata in the viewer JSON.',
            rawJson: pointMeta.rawJson || '',
        };
    }

    const datasetMeta = DataLoader.getDatasetMetadata?.(ctx.catId);
    const sourceCounts = datasetMeta?.sources?.[ctx.dataField];
    if (sourceCounts && Object.keys(sourceCounts).length > 0) {
        return {
            source: Object.keys(sourceCounts).join(' | '),
            method: datasetMeta?.aggregation || '',
            sourceDataset: datasetMeta?.source_csv || '',
            confidence: '',
            status: 'dataset_metadata_only',
            note: 'The viewer JSON provides dataset-level provenance for this variable, not source/method per individual row.',
            rawJson: JSON.stringify({ sources: sourceCounts, source_csv: datasetMeta?.source_csv || null }),
        };
    }

    return {
        source: '',
        method: '',
        sourceDataset: '',
        confidence: '',
        status: 'not_available_in_viewer_json',
        note: 'Observation-level source/method is not present in the current browser JSON. Use the long research database or forthcoming Zenodo package for full row provenance.',
        rawJson: '',
    };
}

function _downloadUnitLabel(ctx) {
    if (ctx.indicator?.unit) return ctx.indicator.unit;
    const unit = State.get('activeUnit');
    return unit && unit !== 'default' ? unit : ctx.dataField;
}

function _axisModeLabel(mode) {
    if (mode === 'pct_territory') return '% del territorio';
    if (mode === 'pct_total') return '% de America Latina';
    if (mode === 'index') return 'Indice 100';
    return 'Valor absoluto';
}

function _downloadDataPackage() {
    const ctx = _getDownloadContext();
    const csv = _buildExportCSV(ctx);
    const readme = _buildDownloadReadme(ctx, csv);
    const baseName = _downloadBaseName(ctx);
    const zip = _makeZip([
        { name: csv.filename, text: csv.text },
        { name: `${baseName}_README.txt`, text: readme },
    ]);
    _downloadBlob(`${baseName}.zip`, zip, 'application/zip');
}

function _exportCSV() {
    _downloadDataPackage();
}

function _buildDownloadReadme(ctx, csv) {
    const today = new Date().toISOString();
    const info = CATEGORY_SOURCE_INFO[ctx.catId] || {};
    const citation = DATASET_CITATIONS[ctx.catId] || DATASET_CITATIONS.default;
    const datasetMeta = DataLoader.getDatasetMetadata?.(ctx.catId);
    const sourceLines = _metadataSourceLines(datasetMeta, ctx.dataField);
    const nRows = Math.max(0, csv.text.trim().split('\n').length - 1);
    return [
        'README',
        '======',
        '',
        `File: ${csv.filename}`,
        `Created: ${today}`,
        `Viewer: Atlas Agrario de América Latina`,
        `Selection: ${ctx.category?.label || ctx.catId} / ${ctx.indicatorLabel}`,
        `View: ${_viewLabel(ctx.view)}`,
        `Geographic level: ${ctx.geoLevel}`,
        `Year range in viewer: ${Array.isArray(ctx.yearRange) ? ctx.yearRange.join('-') : 'not set'}`,
        `Rows: ${nRows}`,
        '',
        'Important',
        '---------',
        'The CSV exports original absolute values for the current selection. It does not export derived display metrics such as index=100 or percentages, even if those are active on screen.',
        'Row-level source and estimation metadata are included only when they exist in the current browser JSON. When they are not present, estado_trazabilidad says so explicitly instead of repeating a generic source as if it were row provenance.',
        '',
        'Suggested citation',
        '------------------',
        citation,
        '',
        'Sources and method summary',
        '--------------------------',
        info.sources || 'Source summary not yet documented in viewer metadata.',
        '',
        info.method || 'Method summary not yet documented in viewer metadata.',
        '',
        info.availability || 'Observation-level provenance availability is not fully documented for this module.',
        '',
        sourceLines.length ? 'Detected metadata:\n' + sourceLines.map(line => `- ${line}`).join('\n') : 'Detected metadata: none in the current browser JSON.',
        '',
        'Zenodo / data paper',
        '-------------------',
        'Zenodo record and data paper: forthcoming DOI.',
        '',
        'Columns',
        '-------',
        'category_id: internal module id.',
        'category_label: module name shown in the viewer.',
        'indicator_id: internal indicator id.',
        'indicator_label: indicator label shown in the viewer.',
        'data_field: variable name used in the JSON.',
        'unit: original measurement unit of value.',
        'metric_requested: metric active in the UI when the download was made.',
        'metric_exported: always original_absolute_value.',
        'vista: active view in the viewer.',
        'geo_level: country, region, subnational, or partner flow level.',
        'territorio_codigo / entidad_codigo: territory code.',
        'territorio / entidad: territory label.',
        'item / producto: selected crop, land-use class, livestock species, labour category, or total.',
        'socio: trade partner when exporting bilateral data.',
        'flujo: exportaciones/importaciones when exporting bilateral data.',
        'anio: calendar year.',
        'valor / valor_toneladas: numeric value in original units.',
        'fuente: row-level source when present; otherwise dataset-level source or blank.',
        'metodo: row-level estimation/observation method when present; otherwise dataset-level method or blank.',
        'dataset_fuente: source dataset or source file when available.',
        'confianza: confidence flag when available.',
        'estado_trazabilidad: whether provenance is row-level, dataset-level only, or absent from the viewer JSON.',
        'nota_trazabilidad: human-readable provenance note.',
        'metadatos_observacion_json: raw observation metadata when available.',
        '',
    ].join('\n');
}

function _sourceInfoHTML(ctx) {
    const info = CATEGORY_SOURCE_INFO[ctx.catId] || {};
    const datasetMeta = DataLoader.getDatasetMetadata?.(ctx.catId);
    const sources = _metadataSourceLines(datasetMeta, ctx.indicator?.dataField);
    return `
        <div class="download-summary">
          <div><b>${_html(ctx.category.label)}</b> - ${_html(ctx.indicatorLabel)}</div>
          <div>${_html(info.sources || 'Fuentes detalladas pendientes de documentar en metadata.')}</div>
        </div>
        <div class="download-section-title">Método</div>
        <p>${_html(info.method || 'Método pendiente de documentar para este módulo.')}</p>
        <div class="download-section-title">Disponibilidad en el visor</div>
        <p>${_html(info.availability || 'El visor exporta los valores agregados visibles; la trazabilidad fila-a-fila depende de la base larga original.')}</p>
        ${sources.length ? `<div class="download-section-title">Metadatos detectados</div><ul>${sources.map(line => `<li>${_html(line)}</li>`).join('')}</ul>` : ''}
    `;
}

function _sourceInfoText(ctx) {
    const info = CATEGORY_SOURCE_INFO[ctx.catId] || {};
    const datasetMeta = DataLoader.getDatasetMetadata?.(ctx.catId);
    const sources = _metadataSourceLines(datasetMeta, ctx.indicator?.dataField);
    return [
        `${ctx.category.label} - ${ctx.indicatorLabel}`,
        '',
        'Fuentes:',
        info.sources || 'Fuentes detalladas pendientes de documentar en metadata.',
        '',
        'Método:',
        info.method || 'Método pendiente de documentar para este módulo.',
        '',
        'Disponibilidad en el visor:',
        info.availability || 'El visor exporta los valores agregados visibles; la trazabilidad fila-a-fila depende de la base larga original.',
        '',
        sources.length ? 'Metadatos detectados:\n' + sources.map(line => `- ${line}`).join('\n') : 'Metadatos detectados: no hay source/method por indicador en el JSON actual.',
    ].join('\n');
}

function _metadataSourceLines(datasetMeta, dataField) {
    const lines = [];
    const sourceCounts = datasetMeta?.sources?.[dataField];
    if (sourceCounts) {
        Object.entries(sourceCounts).forEach(([source, count]) => {
            lines.push(`${source}: ${count} observaciones`);
        });
    }
    if (datasetMeta?.aggregation) lines.push(`Agregación: ${datasetMeta.aggregation}`);
    if (datasetMeta?.observations) lines.push(`Observaciones: ${datasetMeta.observations}`);
    return lines;
}

function _citationHTML(ctx) {
    return `
        <div class="download-summary">
          <div><b>Cita sugerida del visor</b></div>
          <div>Atlas Agrario de América Latina, módulo ${_html(ctx.category.label)}, indicador ${_html(ctx.indicatorLabel)}.</div>
        </div>
        <pre class="download-preview">${_html(_citationText(ctx))}</pre>
    `;
}

function _citationText(ctx) {
    const today = new Date().toISOString().slice(0, 10);
    return [
        `Atlas Agrario de América Latina. Módulo: ${ctx.category.label}. Indicador: ${ctx.indicatorLabel}. Consulta: ${today}.`,
        '',
        'Créditos y fuentes principales:',
        (CATEGORY_SOURCE_INFO[ctx.catId]?.sources || 'Fuentes detalladas pendientes de documentar.'),
        '',
        'Para módulos socioecon-micos, citar además las fuentes externas correspondientes: Frankema (2010), Deininger y Olinto (2000), SWIID/Solt y Albertus (2015), según el indicador usado.',
    ].join('\n');
}

function _downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    _downloadBlob(filename, blob);
}

function _downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function _makeZip(files) {
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const now = _zipDateTime(new Date());

    files.forEach(file => {
        const name = encoder.encode(file.name);
        const data = encoder.encode('\ufeff' + file.text);
        const crc = _crc32(data);
        const local = _zipHeader(30, [
            [0x04034b50, 4], [20, 2], [0x0800, 2], [0, 2], [now.time, 2], [now.date, 2],
            [crc, 4], [data.length, 4], [data.length, 4], [name.length, 2], [0, 2],
        ]);
        chunks.push(local, name, data);

        const centralHeader = _zipHeader(46, [
            [0x02014b50, 4], [20, 2], [20, 2], [0x0800, 2], [0, 2], [now.time, 2], [now.date, 2],
            [crc, 4], [data.length, 4], [data.length, 4], [name.length, 2], [0, 2],
            [0, 2], [0, 2], [0, 2], [0, 4], [offset, 4],
        ]);
        central.push(centralHeader, name);
        offset += local.length + name.length + data.length;
    });

    const centralOffset = offset;
    const centralSize = central.reduce((sum, part) => sum + part.length, 0);
    const end = _zipHeader(22, [
        [0x06054b50, 4], [0, 2], [0, 2], [files.length, 2], [files.length, 2],
        [centralSize, 4], [centralOffset, 4], [0, 2],
    ]);
    return new Blob([...chunks, ...central, end], { type: 'application/zip' });
}

function _zipHeader(size, fields) {
    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    let at = 0;
    fields.forEach(([value, bytes]) => {
        if (bytes === 2) view.setUint16(at, value & 0xffff, true);
        else view.setUint32(at, value >>> 0, true);
        at += bytes;
    });
    return new Uint8Array(buffer);
}

function _zipDateTime(date) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const year = Math.max(1980, date.getFullYear());
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, date: dosDate };
}

let _crcTable = null;
function _crc32(bytes) {
    if (!_crcTable) {
        _crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
            _crcTable[n] = c >>> 0;
        }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = _crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function _downloadBaseName(ctx) {
    const range = Array.isArray(ctx.yearRange) ? `${ctx.yearRange[0]}_${ctx.yearRange[1]}` : 'serie';
    const bits = ['atlas_agrario', ctx.catId, ctx.indicator?.id || 'indicador', ctx.view, range];
    return bits.join('_').replace(/[^a-z0-9_]+/gi, '_').toLowerCase();
}

function _csvCell(value) {
    const str = value == null ? '' : String(value);
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function _html(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
}

function _viewLabel(viewId) {
    return VIEWS.find(v => v.id === viewId)?.label || viewId;
}

function _getActiveIndicatorMeta(meta) {
    const cat = meta.categories.find(c => c.id === State.get('activeCategory'));
    if (!cat) return null;
    for (const group of (cat.indicatorGroups || [])) {
        for (const ind of group.indicators) {
            if (ind.id === State.get('activeIndicator')) return ind;
        }
    }
    return null;
}

function _getActiveIndicatorGroupMeta(meta) {
    const cat = meta.categories.find(c => c.id === State.get('activeCategory'));
    if (!cat) return null;
    for (const group of (cat.indicatorGroups || [])) {
        if ((group.indicators || []).some(ind => ind.id === State.get('activeIndicator'))) return group;
    }
    return null;
}

/* -----------------------------------------------
   Fullscreen
   ----------------------------------------------- */
function _toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}



