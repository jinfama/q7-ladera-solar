/* bilateral-view.js - World map with bilateral trade flow arcs */

import State from '../state.js?v=20260522-mobile-ui18';
import DataLoader from '../data-loader.js?v=20260522-mobile-ui18';
import { COUNTRIES, REGIONS, SEQ_COLORS, fmt } from '../utils.js?v=20260522-mobile-ui18';
import { showTooltip, hideTooltip } from '../components/tooltip.js';

/* -----------------------------------------------
   Module state
   ----------------------------------------------- */
let _svg, _g, _gWorld, _gArcs, _gLabels;
let _projection, _path;
let _worldTopo = null;
let _worldGeo  = null;
let _loadPromise = null;
let _width = 0, _height = 0;
let _zoom;
let _ro;
let _topN = 5;  // configurable: 5 or 10 (data file caps at 10 partners)

/* Map from bilateral partner names (FAO) ? world-110m TopoJSON names */
const PARTNER_TO_GEO = {
    'China, mainland':                          'China',
    'China, Taiwan Province of':                'Taiwan',
    'Netherlands (Kingdom of the)':             'Netherlands',
    'Russian Federation':                       'Russia',
    'United Kingdom of Great Britain and Northern Ireland': 'United Kingdom',
    'Bolivia (Plurinational State of)':         'Bolivia',
    'Venezuela (Bolivarian Republic of)':       'Venezuela',
    'Iran (Islamic Republic of)':               'Iran',
    'Republic of Korea':                        'South Korea',
    'Dominican Republic':                       'Dominican Rep.',
    'Türkiye':                                  'Turkey',
    'Viet Nam':                                 'Vietnam',
    'Belgium-Luxembourg':                       'Belgium',
    'USSR':                                     'Russia',
};

/* ISO3 ? world-110m name for LATAM countries */
const ISO3_TO_GEO = {
    ARG: 'Argentina', BOL: 'Bolivia', BRA: 'Brazil', CHL: 'Chile',
    COL: 'Colombia', CRI: 'Costa Rica', CUB: 'Cuba', DOM: 'Dominican Rep.',
    ECU: 'Ecuador', SLV: 'El Salvador', GTM: 'Guatemala', HTI: 'Haiti',
    HND: 'Honduras', MEX: 'Mexico', NIC: 'Nicaragua', PAN: 'Panama',
    PRY: 'Paraguay', PER: 'Peru', PRI: 'Puerto Rico', URY: 'Uruguay',
    VEN: 'Venezuela',
};

/* LATAM ISO3 set for highlight */
const LATAM_ISO3 = new Set(Object.keys(COUNTRIES));

/* -----------------------------------------------
   World TopoJSON loading
   ----------------------------------------------- */
async function _loadWorld() {
    if (_worldTopo) return;
    if (_loadPromise) return _loadPromise;
    _loadPromise = (async () => {
        try {
            const resp = await fetch('data/world-110m.json?v=20260522-mobile-ui18');
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            _worldTopo = await resp.json();
            _worldGeo = topojson.feature(_worldTopo, _worldTopo.objects.countries);
            console.log('[BILATERAL] World topo loaded:', _worldGeo.features.length, 'countries');
        } catch (err) {
            console.error('[BILATERAL] Failed to load world topo:', err);
            _loadPromise = null;
        }
    })();
    return _loadPromise;
}

/* -----------------------------------------------
   Helpers
   ----------------------------------------------- */

/** Resolve FAO partner name to a GeoJSON feature from world-110m */
function _findFeatureByPartner(partnerName) {
    if (!_worldGeo) return null;
    const geoName = PARTNER_TO_GEO[partnerName] || partnerName;
    return _worldGeo.features.find(f => f.properties.name === geoName) || null;
}

/** Find feature for a LATAM country ISO3 */
function _findFeatureByISO3(iso3) {
    if (!_worldGeo) return null;
    const geoName = ISO3_TO_GEO[iso3];
    if (!geoName) return null;
    return _worldGeo.features.find(f => f.properties.name === geoName) || null;
}

/** Check if a GeoJSON feature name is a LATAM country */
function _isLatam(featureName) {
    return Object.values(ISO3_TO_GEO).includes(featureName);
}

/** Get the set of ISO3 codes that are part of the selected entity */
function _getHighlightedISO3s(code, geo) {
    if (geo === 'country' && LATAM_ISO3.has(code)) return new Set([code]);
    if (geo === 'region' && code === 'latin_america') return new Set(Object.keys(COUNTRIES));
    if (geo === 'region' && REGIONS[code]) return new Set(REGIONS[code].countries);
    return new Set();
}

/** Get a display name for the current bilateral entity */
function _getEntityName(code, geo) {
    if (geo === 'country') return COUNTRIES[code]?.name || code;
    if (code === 'latin_america') return 'América Latina';
    if (REGIONS[code]) return REGIONS[code].label;
    return code;
}

/** Get the element (export/import) from indicator id */
function _getElement() {
    const ind = State.get('activeIndicator');
    return ind === 'bilateral_imports' ? 'import' : 'export';
}

/** Get selected code and geo level for bilateral queries.
 *  Returns { code, geo } where geo is 'country' or 'region'. */
function _getSelectedCodeAndGeo() {
    const selected = State.get('selectedCountries');
    const geoLevel = State.get('geoLevel');
    if (geoLevel === 'region' && selected.length > 0) {
        return { code: selected[0], geo: 'region' };
    } else if (selected.length > 0 && LATAM_ISO3.has(selected[0])) {
        return { code: selected[0], geo: 'country' };
    }
    return { code: 'latin_america', geo: 'region' };
}

/** Get selected LATAM country code (first selected, or null) - legacy compat */
function _getSelectedCode() {
    const { code, geo } = _getSelectedCodeAndGeo();
    return (geo === 'country' && code !== 'latin_america') ? code : null;
}

/** Generate screen-space points for a curved arc between two [lon, lat] points.
 *  Returns an array of [x, y] screen coordinates.
 *  Uses a quadratic bezier curve in screen space with upward curvature. */
function _arcScreenPoints(source, target, offset = 0) {
    if (!_projection) return [];
    const p0 = _projection(source);
    const p1 = _projection(target);
    if (!p0 || !p1) return [];

    // Control point: midpoint raised upward proportional to distance
    const mx = (p0[0] + p1[0]) / 2;
    const my = (p0[1] + p1[1]) / 2;
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const dist = Math.sqrt(dx * dx + dy * dy);
    const curvature = Math.min(dist * 0.25, 80); // max 80px curve height
    const nx = dist > 0 ? -dy / dist : 0;
    const ny = dist > 0 ? dx / dist : 0;
    const cp = [
        mx + nx * offset,
        Math.max(20, my - curvature + ny * offset),
    ]; // raise upward, keep on screen

    // Sample quadratic bezier
    const nPoints = 40;
    const pts = [];
    for (let i = 0; i <= nPoints; i++) {
        const t = i / nPoints;
        const t1 = 1 - t;
        const x = t1 * t1 * p0[0] + 2 * t1 * t * cp[0] + t * t * p1[0];
        const y = t1 * t1 * p0[1] + 2 * t1 * t * cp[1] + t * t * p1[1];
        pts.push([x, y]);
    }
    return pts;
}

// _arcGenerator removed - now using _arcScreenPoints for smooth bezier arcs

/* -----------------------------------------------
   Init / Resize
   ----------------------------------------------- */
export function initBilateralView() {
    _svg = d3.select('#bilateral-svg');
    _g = _svg.append('g');
    _gWorld = _g.append('g').attr('class', 'bilateral-world');
    _gArcs  = _g.append('g').attr('class', 'bilateral-arcs');
    _gLabels = _g.append('g').attr('class', 'bilateral-labels');

    // Arrow marker definition
    _svg.append('defs').append('marker')
        .attr('id', 'bilateral-arrow')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 10)
        .attr('refY', 5)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto-start-reverse')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#C4913E');

    _zoom = d3.zoom()
        .scaleExtent([0.8, 6])
        .on('zoom', (e) => _g.attr('transform', e.transform));
    _svg.call(_zoom);

    // Populate control bar
    _initControls();

    // Observe container resize
    let resizeTimer;
    const container = document.getElementById('panel-bilateral');
    _ro = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { _resize(); updateBilateralView(); }, 100);
    });
    _ro.observe(container);
}

let _controlsInitialized = false;

function _initControls() {
    const expSelect = document.getElementById('bc-exporter');
    const swapBtn = document.getElementById('bc-swap');

    if (!expSelect || _controlsInitialized) return;
    _controlsInitialized = true;

    expSelect.addEventListener('change', () => {
        const val = expSelect.value;
        State.clearCountries();
        if (val === 'latin_america') {
            // LATAM aggregate: no country selected, geoLevel stays as is
            State.set('geoLevel', 'country');
            State.clearCountries();
        } else if (REGIONS[val]) {
            // Region selected
            State.set('geoLevel', 'region');
            State.setCountries([val]);
        } else {
            // Individual country
            State.set('geoLevel', 'country');
            State.setCountries([val]);
        }
        updateBilateralView();
    });

    if (swapBtn) {
        swapBtn.addEventListener('click', () => {
            const current = State.get('activeIndicator');
            State.set('activeIndicator',
                current === 'bilateral_exports' ? 'bilateral_imports' : 'bilateral_exports');
        });
    }

    State.subscribe('selectedCountries', () => {
        const { code } = _getSelectedCodeAndGeo();
        if (expSelect.value !== code) expSelect.value = code;
        if (State.get('activeView') === 'bilateral') requestAnimationFrame(() => updateBilateralView());
    });
}

function _populateControls() {
    const expSelect = document.getElementById('bc-exporter');
    if (!expSelect) return;

    // Populate exporters
    if (expSelect.options.length === 0) {
        // LATAM aggregate option
        const latamOpt = document.createElement('option');
        latamOpt.value = 'latin_america';
        latamOpt.textContent = '— América Latina —';
        expSelect.appendChild(latamOpt);

        // Region options
        const regGroup = document.createElement('optgroup');
        regGroup.label = 'Regiones';
        for (const [regId, reg] of Object.entries(REGIONS)) {
            const opt = document.createElement('option');
            opt.value = regId;
            opt.textContent = reg.label;
            regGroup.appendChild(opt);
        }
        expSelect.appendChild(regGroup);

        // Country options
        const cGroup = document.createElement('optgroup');
        cGroup.label = 'Países';
        const latamCountries = Object.entries(COUNTRIES)
            .filter(([, v]) => v.region)
            .sort(([, a], [, b]) => a.name.localeCompare(b.name));
        latamCountries.forEach(([iso3, info]) => {
            const opt = document.createElement('option');
            opt.value = iso3;
            opt.textContent = info.name;
            cGroup.appendChild(opt);
        });
        expSelect.appendChild(cGroup);
    }

    // Set current selection
    const { code, geo } = _getSelectedCodeAndGeo();
    expSelect.value = code;
}

function _resize() {
    const container = document.getElementById('bilateral-container');
    if (!container) return;
    const svgNode = document.getElementById('bilateral-svg');
    const rect = svgNode?.getBoundingClientRect();
    _width = Math.round(rect?.width || container.clientWidth);
    _height = Math.round(rect?.height || container.clientHeight);
    if (_width === 0 || _height === 0) return;

    _svg.attr('viewBox', `0 0 ${_width} ${_height}`);

    const mobile = window.innerWidth <= 760;
    const padX = mobile ? 18 : 20;
    const padTop = mobile ? 34 : 20;
    const padBottom = mobile ? 14 : 20;
    _projection = d3.geoNaturalEarth1()
        .fitExtent([[padX, padTop], [_width - padX, _height - padBottom]],
            { type: 'Sphere' });
    _path = d3.geoPath(_projection);
}

/* -----------------------------------------------
   Update
   ----------------------------------------------- */
export async function updateBilateralView() {
    if (State.get('activeView') !== 'bilateral') return;

    // Populate controls (needs bilateral data loaded)
    _populateControls();

    // Hide selection bar chips in bilateral mode
    const selBar = document.getElementById('selection-bar');
    if (selBar) selBar.style.display = 'none';

    // Ensure world topo and bilateral data are loaded
    if (!_worldTopo) {
        await _loadWorld();
    }
    if (!DataLoader.isBilateralLoaded()) {
        await DataLoader.loadBilateral();
    }
    if (!_worldGeo || !_width) {
        _resize();
        if (!_worldGeo || !_width) {
            requestAnimationFrame(() => updateBilateralView());
            return;
        }
    }

    const element = _getElement();
    const { code, geo } = _getSelectedCodeAndGeo();
    const bYears = DataLoader.getBilateralYears();
    let year = State.get('currentYear');
    // Clamp to bilateral year range
    if (bYears.length > 0) {
        year = Math.max(bYears[0], Math.min(bYears[bYears.length - 1], year));
    }
    const yearIdx = bYears.indexOf(year);

    // Check if a specific product is selected
    const cropItem = State.get('cropItem');
    const hasProductFilter = cropItem && cropItem !== 'all';
    if (hasProductFilter) {
        const itemPartners = DataLoader.getBilateralItemPartners(code, element, cropItem, geo);
        const hasAnyPartner = Object.values(itemPartners).some(series =>
            Array.isArray(series) && series.some(v => v != null && v > 0)
        );
        if (!hasAnyPartner) {
            State.set('cropItem', 'all');
            State.set('cropCategory', 'all');
            updateBilateralView();
            return;
        }
    }

    // Get partner data for the selected entity (country, region, or LATAM)
    let partnerValues = {};  // partnerName ? value for this year
    if (code && yearIdx >= 0) {
        if (hasProductFilter) {
            const itemPartners = DataLoader.getBilateralItemPartners(code, element, cropItem, geo);
            Object.entries(itemPartners).forEach(([pName, series]) => {
                if (pName === 'Resto') return;
                const val = series?.[yearIdx];
                if (val != null && val > 0) partnerValues[pName] = val;
            });
        } else {
            const partners = DataLoader.getBilateralPartners(code, element, geo);
            Object.entries(partners).forEach(([pName, series]) => {
                if (pName === 'Resto') return;
                const val = series[yearIdx];
                if (val != null && val > 0) partnerValues[pName] = val;
            });
        }
    }

    // Sort partners by value descending
    const sortedPartners = Object.entries(partnerValues)
        .sort((a, b) => b[1] - a[1]);
    const selectedPartners = State.get('selectedPartners') || [];
    const chosenPartners = selectedPartners.length > 0
        ? selectedPartners
            .map(name => [name, partnerValues[name]])
            .filter(([, val]) => val != null && val > 0)
            .sort((a, b) => b[1] - a[1])
        : sortedPartners.slice(0, Math.min(_topN, sortedPartners.length));
    const topPartners = chosenPartners;

    // Build name ? value map for all partners (for coloring)
    const allValues = Object.values(partnerValues).filter(v => v > 0);

    // Color scale for partners
    const colorScale = allValues.length > 0
        ? d3.scaleLog()
            .domain([Math.max(1, d3.min(allValues)), d3.max(allValues)])
            .range([SEQ_COLORS[1], SEQ_COLORS[SEQ_COLORS.length - 1]])
            .interpolate(d3.interpolateRgb)
            .clamp(true)
        : () => '#E8E0D4';

    // -- Draw world countries (exclude Antarctica) --
    const features = _worldGeo.features.filter(f => {
        const n = f.properties.name;
        return n !== 'Antarctica' && n !== 'Fr. S. Antarctic Lands';
    });

    // Build set of highlighted ISO3 codes for the current entity
    const highlightedISO3s = _getHighlightedISO3s(code, geo);
    const _isHighlighted = (geoName) => {
        for (const iso3 of highlightedISO3s) {
            if (ISO3_TO_GEO[iso3] === geoName) return true;
        }
        return false;
    };

    _gWorld.selectAll('.bilateral-country').remove();
    _gWorld.selectAll('.bilateral-country')
        .data(features, d => d.properties.name)
        .enter()
        .append('path')
        .attr('class', 'bilateral-country')
        .attr('d', _path)
        .attr('fill', d => {
            const name = d.properties.name;
            // Highlight selected entity countries
            if (_isHighlighted(name)) return 'var(--c-accent)';
            // Other LATAM countries
            if (_isLatam(name)) return '#D4C9B8';
            // Partner countries: color by value
            const pName = _geoNameToPartner(name, partnerValues);
            if (pName && partnerValues[pName] > 0) return colorScale(partnerValues[pName]);
            return '#E8E0D4';
        })
        .attr('stroke', d => {
            const name = d.properties.name;
            if (_isHighlighted(name)) return '#8B5E3C';
            if (_isLatam(name)) return '#C4B8A4';
            return '#D4C9B8';
        })
        .attr('stroke-width', d => {
            const name = d.properties.name;
            if (_isHighlighted(name)) return 1.5;
            return 0.5;
        })
        .attr('stroke-linejoin', 'round')
        .style('cursor', d => {
            if (_isLatam(d.properties.name)) {
                // Find ISO3 for this feature
                const iso3 = Object.entries(ISO3_TO_GEO).find(([, n]) => n === d.properties.name)?.[0];
                return iso3 ? 'pointer' : 'default';
            }
            return 'default';
        })
        .on('click', (event, d) => {
            const name = d.properties.name;
            const iso3 = Object.entries(ISO3_TO_GEO).find(([, n]) => n === name)?.[0];
            if (iso3 && LATAM_ISO3.has(iso3)) {
                if (State.get('geoLevel') !== 'country') State.set('geoLevel', 'country');
                const selected = State.get('selectedCountries') || [];
                if (selected.length === 1 && selected[0] === iso3) State.clearCountries();
                else State.setCountries([iso3]);
            }
        })
        .on('mouseenter', (event, d) => {
            const name = d.properties.name;
            // Partner info
            const pName = _geoNameToPartner(name, partnerValues);
            if (pName && partnerValues[pName] > 0) {
                const partnerItems = DataLoader.getBilateralPartnerItems(
                    code, element, pName, geo);
                const elLabel = element === 'export' ? 'Exportaciones' : 'Importaciones';
                let sub = hasProductFilter
                    ? `${elLabel} - ${cropItem}`
                    : `${elLabel} ${year}`;
                if (!hasProductFilter && partnerItems.length > 0) {
                    const top3 = partnerItems.slice(0, 3)
                        .map(pi => `${pi.item}: ${fmt(pi.value)} t`).join('<br>');
                    sub += '<br>' + top3;
                }
                showTooltip(event, {
                    title: pName,
                    value: fmt(partnerValues[pName]) + ' t',
                    sub,
                });
            } else if (_isLatam(name)) {
                const iso3 = Object.entries(ISO3_TO_GEO).find(([, n]) => n === name)?.[0];
                showTooltip(event, {
                    title: COUNTRIES[iso3]?.name || name,
                    sub: 'Click para seleccionar',
                });
            }
        })
        .on('mousemove', (event) => showTooltip(event))
        .on('mouseleave', () => hideTooltip());

    // -- Draw border mesh --
    _gWorld.selectAll('.bilateral-borders').remove();
    const _antarcticNames = new Set(['Antarctica', 'Fr. S. Antarctic Lands']);
    const borders = topojson.mesh(_worldTopo, _worldTopo.objects.countries,
        (a, b) => a !== b
            && !_antarcticNames.has(a.properties.name)
            && !_antarcticNames.has(b.properties.name));
    _gWorld.append('path')
        .datum(borders)
        .attr('class', 'bilateral-borders')
        .attr('d', _path)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(139,94,60,0.15)')
        .attr('stroke-width', 0.3)
        .attr('stroke-linejoin', 'round')
        .attr('pointer-events', 'none');

    // -- Draw arc lines and labels --
    _gArcs.selectAll('*').remove();
    _gLabels.selectAll('*').remove();

    if (code && topPartners.length > 0) {
        // Determine source center for arcs
        let sourceCenter = null;
        if (geo === 'country' && LATAM_ISO3.has(code)) {
            const sourceFeature = _findFeatureByISO3(code);
            if (sourceFeature) sourceCenter = d3.geoCentroid(sourceFeature);
        } else {
            // For region/LATAM: compute centroid from constituent country features
            const isoList = [...highlightedISO3s];
            const feats = isoList.map(iso3 => _findFeatureByISO3(iso3)).filter(Boolean);
            if (feats.length > 0) {
                const fc = { type: 'FeatureCollection', features: feats };
                sourceCenter = d3.geoCentroid(fc);
            }
        }
        if (sourceCenter) {

            // Stroke width scale - keep small flows visible, but let large
            // flows read clearly instead of all ribbons looking alike.
            const maxVal = topPartners[0][1];
            const minVal = topPartners[topPartners.length - 1][1];
            const strokeScale = d3.scalePow()
                .exponent(0.75)
                .domain(minVal === maxVal ? [0, maxVal || 1] : [minVal, maxVal])
                .range([1.2, 14])
                .clamp(true);
            const sourcePx = _projection(sourceCenter);
            const labelData = [];

            topPartners.forEach(([pName, val], i) => {
                const targetFeature = _findFeatureByPartner(pName);
                if (!targetFeature) return;

                const targetCenter = d3.geoCentroid(targetFeature);

                // Generate smooth screen-space bezier arc (no geo projection fragmentation)
                const spreadOffset = (i - (topPartners.length - 1) / 2) * 11;
                const screenPts = _arcScreenPoints(sourceCenter, targetCenter, spreadOffset);
                if (screenPts.length < 3) return;

                // Build tapered shape: thin at ends, thick in middle
                const maxWidth = strokeScale(val);
                const n = screenPts.length;

                // Width profile: 0 ? max ? 0 (sine curve)
                const widths = screenPts.map((_, idx) => {
                    const t = idx / (n - 1); // 0 to 1
                    return maxWidth * Math.sin(t * Math.PI); // sine: 0?max?0
                });

                // Compute normals and offset points for top/bottom edges
                const topEdge = [];
                const bottomEdge = [];
                for (let j = 0; j < n; j++) {
                    const p = screenPts[j];
                    const w = widths[j] * 0.5;
                    // Normal direction from tangent
                    let dx, dy;
                    if (j === 0) { dx = screenPts[1][0] - p[0]; dy = screenPts[1][1] - p[1]; }
                    else if (j === n - 1) { dx = p[0] - screenPts[j - 1][0]; dy = p[1] - screenPts[j - 1][1]; }
                    else { dx = screenPts[j + 1][0] - screenPts[j - 1][0]; dy = screenPts[j + 1][1] - screenPts[j - 1][1]; }
                    const len = Math.sqrt(dx * dx + dy * dy) || 1;
                    const nx = -dy / len;
                    const ny = dx / len;
                    topEdge.push([p[0] + nx * w, p[1] + ny * w]);
                    bottomEdge.push([p[0] - nx * w, p[1] - ny * w]);
                }

                // Build SVG path: top edge forward, bottom edge backward
                let d = `M${topEdge[0][0]},${topEdge[0][1]}`;
                for (let j = 1; j < topEdge.length; j++) {
                    d += `L${topEdge[j][0]},${topEdge[j][1]}`;
                }
                for (let j = bottomEdge.length - 1; j >= 0; j--) {
                    d += `L${bottomEdge[j][0]},${bottomEdge[j][1]}`;
                }
                d += 'Z';

                // Draw tapered arc
                _gArcs.append('path')
                    .attr('d', d)
                    .attr('fill', 'var(--c-accent)')
                    .attr('fill-opacity', 0)
                    .attr('stroke', 'none')
                    .attr('pointer-events', 'none')
                    .transition()
                    .duration(800)
                    .delay(i * 60)
                    .attr('fill-opacity', 0.55);

                // Partner label at target
                const targetPx = _projection(targetCenter);
                if (targetPx) {
                    const rightEdge = targetPx[0] > _width - 120;
                    const leftEdge = targetPx[0] < 120;
                    const side = rightEdge ? -1 : leftEdge ? 1 : (targetPx[0] >= (sourcePx?.[0] || 0) ? 1 : -1);
                    labelData.push({
                        text: _shortName(pName),
                        x: Math.max(10, Math.min(_width - 10, targetPx[0] + side * 12)),
                        y: targetPx[1] - 8 + ((i % 5) - 2) * 5,
                        anchor: side > 0 ? 'start' : 'end',
                        delay: i * 60 + 400,
                    });
                }
            });
            _drawPartnerLabels(labelData);
        }
    }

    // -- Top-N selector pills --
    _renderTopNPills();

    // -- Year label --
    document.getElementById('bilateral-year').textContent = year;

    // -- Legend --
    const entityName = _getEntityName(code, geo);
    _updateLegend(entityName, element, allValues, colorScale, hasProductFilter ? cropItem : null);

    // -- Info panel --
    _updateInfoPanel(entityName, element, year,
        selectedPartners.length > 0 ? topPartners : sortedPartners,
        hasProductFilter ? cropItem : null);
}

/* -----------------------------------------------
   Reverse lookup: geo name ? partner name
   ----------------------------------------------- */
function _geoNameToPartner(geoName, partnerValues) {
    // Direct match
    if (partnerValues[geoName]) return geoName;
    // Check reverse mapping
    for (const [pName, gName] of Object.entries(PARTNER_TO_GEO)) {
        if (gName === geoName && partnerValues[pName]) return pName;
    }
    return null;
}

/* -----------------------------------------------
   Short display name for arc labels
   ----------------------------------------------- */
function _shortName(partnerName) {
    const shorts = {
        'United States of America': 'EE.UU.',
        'United Kingdom of Great Britain and Northern Ireland': 'R. Unido',
        'Netherlands (Kingdom of the)': 'Países Bajos',
        'Russian Federation': 'Rusia',
        'China, mainland': 'China',
        'China, Taiwan Province of': 'Taiwán',
        'Republic of Korea': 'Corea',
        'Iran (Islamic Republic of)': 'Irán',
        'Bolivia (Plurinational State of)': 'Bolivia',
        'Venezuela (Bolivarian Republic of)': 'Venezuela',
        'Dominican Republic': 'Rep. Dominicana',
        'Brazil': 'Brasil',
        'Mexico': 'México',
        'Panama': 'Panamá',
        'Peru': 'Perú',
        'Haiti': 'Haití',
        'Belgium-Luxembourg': 'Bélgica',
        'Viet Nam': 'Vietnam',
        'Türkiye': 'Turquía',
    };
    return shorts[partnerName] || partnerName;
}

function _drawPartnerLabels(labels) {
    const mobile = window.innerWidth <= 760;
    const groups = d3.group(labels, d => d.anchor);
    for (const groupLabels of groups.values()) {
        groupLabels.sort((a, b) => a.y - b.y);
        const minY = mobile ? 42 : 24;
        const maxY = Math.max(minY, _height - (mobile ? 16 : 24));
        const gap = mobile ? 13 : 15;
        const fontSize = mobile ? '10px' : '11px';
        const halo = mobile ? 3 : 4;
        for (let i = 0; i < groupLabels.length; i++) {
            groupLabels[i].y = Math.max(minY, Math.min(maxY, groupLabels[i].y));
            if (i > 0) groupLabels[i].y = Math.max(groupLabels[i].y, groupLabels[i - 1].y + gap);
        }
        const overflow = groupLabels[groupLabels.length - 1]?.y - maxY;
        if (overflow > 0) groupLabels.forEach(label => { label.y -= overflow; });
        groupLabels.forEach(label => {
            const g = _gLabels.append('g')
                .attr('opacity', 0)
                .attr('pointer-events', 'none');
            g.append('text')
                .attr('x', label.x)
                .attr('y', label.y)
                .attr('text-anchor', label.anchor)
                .attr('font-size', fontSize)
                .attr('font-weight', '800')
                .attr('stroke', '#F5F0E6')
                .attr('stroke-width', halo)
                .attr('stroke-linejoin', 'round')
                .text(label.text);
            g.append('text')
                .attr('x', label.x)
                .attr('y', label.y)
                .attr('text-anchor', label.anchor)
                .attr('font-size', fontSize)
                .attr('font-weight', '800')
                .attr('fill', '#2D1B0E')
                .text(label.text);
            g.transition()
                .duration(400)
                .delay(label.delay)
                .attr('opacity', 0.94);
        });
    }
}

/* -----------------------------------------------
   Top-N pill selector
   ----------------------------------------------- */
function _renderTopNPills() {
    const container = document.getElementById('bilateral-container');
    if (!container) return;

    // Create once, then just update active state
    let wrapper = container.querySelector('.bilateral-topn');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'bilateral-topn';
        wrapper.innerHTML = `
            <span class="bilateral-topn-label">Socios</span>
            <div class="tt-pills">
                <button class="tt-pill" data-n="5">5</button>
                <button class="tt-pill" data-n="10">10</button>
            </div>
        `;
        container.appendChild(wrapper);

        // Click handler (delegated)
        wrapper.addEventListener('click', (e) => {
            const btn = e.target.closest('.tt-pill');
            if (!btn) return;
            const n = parseInt(btn.dataset.n, 10);
            if (n === _topN) return;
            _topN = n;
            updateBilateralView();
        });
    }

    // Update active state
    wrapper.querySelectorAll('.tt-pill').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.n, 10) === _topN);
    });
}

/* -----------------------------------------------
   Legend
   ----------------------------------------------- */
function _updateLegend(entityName, element, values, colorScale, productFilter) {
    const legend = document.getElementById('bilateral-legend');
    if (!legend) return;

    if (!entityName || values.length === 0) {
        const label = element === 'export' ? 'Exportaciones' : 'Importaciones';
        const productLabel = productFilter ? ` - ${productFilter}` : '';
        legend.innerHTML = `
            <div class="map-legend-title">${entityName ? `${label} de ${entityName}${productLabel}` : 'Comercio bilateral'}</div>
            <div style="font-size:12px;color:var(--c-text-3)">Sin socios con dato en este a&ntilde;o</div>
        `;
        return;
    }

    const label = element === 'export' ? 'Exportaciones' : 'Importaciones';
    const productLabel = productFilter ? ` - ${productFilter}` : '';
    const legendColors = SEQ_COLORS.slice(1);
    const min = Math.max(1, d3.min(values));
    const max = d3.max(values);

    legend.innerHTML = `
        <div class="map-legend-title">${label} de ${entityName}${productLabel}</div>
        <div class="map-legend-bar">
            ${legendColors.map(c => `<div class="map-legend-cell" style="background:${c}"></div>`).join('')}
        </div>
        <div class="map-legend-labels">
            <span>${fmt(min)} t</span>
            <span>${fmt(max)} t</span>
        </div>
    `;
}

/* -----------------------------------------------
   Info panel (top partners list)
   ----------------------------------------------- */
function _updateInfoPanel(entityName, element, year, sortedPartners, productFilter) {
    const panel = document.getElementById('bilateral-info');
    if (!panel) return;

    if (!entityName || sortedPartners.length === 0) {
        panel.style.display = '';
        const label = element === 'export' ? 'Destinos' : 'Orígenes';
        const productLabel = productFilter ? ` - ${productFilter}` : '';
        panel.innerHTML = `
            <div class="bilateral-info-title">${label}${entityName ? ` - ${entityName}` : ''}${productLabel} (${year})</div>
            <div class="bilateral-empty">Sin datos de socios para la selección.</div>
        `;
        return;
    }

    panel.style.display = '';
    const label = element === 'export' ? 'Destinos' : 'Orígenes';
    const productLabel = productFilter ? ` - ${productFilter}` : '';
    const top = sortedPartners.slice(0, _topN);

    const maxVal = top[0]?.[1] || 1;

    let rows = top.map(([pName, val], i) => {
        const pct = (val / maxVal * 100).toFixed(0);
        return `
            <div class="bilateral-rank-row">
                <span class="bilateral-rank-num">${i + 1}</span>
                <span class="bilateral-rank-name">${_shortName(pName)}</span>
                <div class="bilateral-rank-bar-bg">
                    <div class="bilateral-rank-bar" style="width:${pct}%"></div>
                </div>
                <span class="bilateral-rank-val">${fmt(val)} t</span>
            </div>`;
    }).join('');

    panel.innerHTML = `
        <div class="bilateral-info-title">${label} - ${entityName}${productLabel} (${year})</div>
        ${rows}
    `;
}

/* -----------------------------------------------
   Exports
   ----------------------------------------------- */
export { _loadWorld as loadWorldTopo };





