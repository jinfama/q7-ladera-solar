/* map-view.js - Choropleth map of Latin America */

import State from '../state.js?v=20260522-mobile-ui18';
import DataLoader from '../data-loader.js?v=20260522-mobile-ui18';
import { SEQ_COLORS, fmtUnit, COUNTRIES, REGIONS } from '../utils.js?v=20260522-mobile-ui18';
import { showTooltip, hideTooltip } from '../components/tooltip.js';

let _svg, _g, _projection, _path, _colorFn;
let _svg1, _g1, _svg2, _g2, _zoom, _yearOverride, _yearLabelId = 'map-year';
let _width = 0, _height = 0;
let _features = [];
let _ro;
let _lastGeoLevel = 'country';  // track to detect subnational transitions
let _resettingZoom = false;

function _showMapLoading(msg) {
    const c = document.getElementById('map-container');
    if (!c) return;
    let el = c.querySelector('.map-loading');
    if (!el) {
        el = document.createElement('div');
        el.className = 'map-loading';
        c.appendChild(el);
    }
    el.textContent = msg || 'Cargando…';
    el.style.display = '';
}
function _hideMapLoading() {
    const el = document.querySelector('#map-container .map-loading');
    if (el) el.style.display = 'none';
}

export function initMapView() {
    _svg1 = d3.select('#map-svg');
    _g1 = _svg1.append('g');
    
    _svg2 = d3.select('#map-svg-2');
    _g2 = _svg2.append('g');

    _zoom = d3.zoom()
        .scaleExtent([0.5, 8])
        .on('zoom', (e) => {
            if (_resettingZoom) return;
            _g1.attr('transform', e.transform);
            _g2.attr('transform', e.transform);
        });
        
    _svg1.call(_zoom);
    _svg2.call(_zoom);

    document.getElementById('btn-close-compare')?.addEventListener('click', () => {
        State.set('compareMode', false);
        document.getElementById('map-container-2').style.display = 'none';
        _resize();
        updateMapView();
    });

    let _roTimer;
    const container = document.getElementById('panel-map');
    _ro = new ResizeObserver(() => {
        clearTimeout(_roTimer);
        _roTimer = setTimeout(() => { _resize(); updateMapView(); }, 100);
    });
    _ro.observe(container);
}

function _resize() {
    const container = document.getElementById('map-container');
    if (!container) return;
    _width = container.clientWidth;
    _height = container.clientHeight;

    if (_svg1) _svg1.attr('viewBox', `0 0 ${_width} ${_height}`);
    if (_svg2) _svg2.attr('viewBox', `0 0 ${_width} ${_height}`);

    // Use fitExtent to auto-fit all of Latin America in the viewport
    const geo = DataLoader.getGeo();
    if (geo) {
        const mobile = window.innerWidth <= 760;
        const padX = mobile ? 28 : 20;
        const padTop = mobile ? 16 : 20;
        const padBottom = mobile ? 46 : 20;
        _projection = d3.geoMercator()
            .fitExtent([[padX, padTop], [_width - padX, _height - padBottom]], geo);
    } else {
        // Fallback before geo is loaded
        _projection = d3.geoMercator()
            .center([-72, -12])
            .scale(Math.min(_width, _height) * 0.42)
            .translate([_width / 2, _height / 2]);
    }

    _path = d3.geoPath(_projection);
    _resetZoomTransform();
}

function _resetZoomTransform() {
    if (!_zoom || !_svg1 || !_svg2) return;
    _resettingZoom = true;
    _g1.attr('transform', null);
    _g2.attr('transform', null);
    _svg1.call(_zoom.transform, d3.zoomIdentity);
    _svg2.call(_zoom.transform, d3.zoomIdentity);
    _resettingZoom = false;
}


export function updateMapView() {
    if (State.get('activeView') !== 'map') return;
    
    const compare = State.get('compareMode');
    const c2 = document.getElementById('map-container-2');
    if (c2) c2.style.display = compare ? '' : 'none';

    // Resize to account for showing/hiding second pane
    _resize();

    if (compare) {
        const startYear = State.get('startYear');
        const currentYear = State.get('currentYear');
        const leftYear = Math.min(startYear, currentYear);
        const rightYear = Math.max(startYear, currentYear);

        // In compare mode the older year is always on the left.
        _svg = _svg1; _g = _g1; _yearOverride = leftYear; _yearLabelId = 'map-year';
        _doUpdate();

        _svg = _svg2; _g = _g2; _yearOverride = rightYear; _yearLabelId = 'map-year-2';
        _doUpdate();
    } else {
        _svg = _svg1; _g = _g1; _yearOverride = null; _yearLabelId = 'map-year';
        _doUpdate();
    }

    _svg = _svg1; _g = _g1; _yearOverride = null; _yearLabelId = 'map-year';
}

function _doUpdate() {

    if (!_svg || !_width) {
        _resize();
        if (!_width) {
            console.log('[MAP] No width yet, skipping render. svg:', !!_svg);
            return;
        }
    }

    const geoLevel = State.get('geoLevel');

    if (geoLevel === 'subnational') {
        _renderSubnational();
    } else if (geoLevel === 'region') {
        _renderRegionLevel();
    } else {
        // Country level: always a choropleth of all 19 LATAM countries.
        // (The previous "no selection ? render LATAM as a single block" path
        // confused users who picked "Países" expecting to see countries coloured.)
        _renderCountryLevel();
    }
}

function _renderCountryLevel() {
    const geo = DataLoader.getGeo();
    if (!geo) { console.warn('[MAP] No GeoJSON available'); return; }
    _hideMapLoading();

    // Force legend cache invalidation on every render
    _cachedLegendKey = '';

    // If switching back from other level, clear old elements and reset projection
    if (_lastGeoLevel === 'subnational') {
        _g.selectAll('.subnational-base').remove();
        _g.selectAll('.admin1-path').remove();
        _g.selectAll('.admin1-border-mesh').remove();
        _g.selectAll('.admin1-outline-mesh').remove();
        _svg.call(_zoom.transform, d3.zoomIdentity);
        _resize();
    }
    if (_lastGeoLevel === 'region') _g.selectAll('.region-path').remove();
    if (_lastGeoLevel === 'latam') _g.selectAll('.latam-path').remove();
    _lastGeoLevel = 'country';

    _features = geo.features;
    const year = _yearOverride !== null ? _yearOverride : State.get('currentYear');
    const indicator = _getDataField();
    const selected = State.get('selectedCountries');
    const scaleType = State.get('scaleType');

    // Rebuild projection if needed (first time geo is available)
    if (!_path || !_projection) _resize();

    // Get values for color scale (country level only - region level uses _renderRegionLevel)
    // Clone feature properties per render so compare mode tooltips do not share
    // mutable `_value` state between the current-year map and start-year map.
    const values = [];
    const renderFeatures = _features.map(f => {
        const props = f.properties || {};
        let val = null;
        if (!props._background) {
            val = DataLoader.getValue(props.iso3, year, indicator, 'country');
        }
        if (val != null && val !== 0) values.push(val);
        return {
            ...f,
            properties: {
                ...props,
                _value: val,
            },
        };
    });

    const colorDomain = _getGlobalMinMaxCached(indicator, 'country');
    _colorFn = _buildColorScale(values, scaleType, colorDomain);
    // Check if we have a diverging scale (negative values present)
    const _hasDiverging = colorDomain.gMin < 0 && colorDomain.gMax > 0;

    // --- Draw country fills (no per-path stroke - borders come from mesh) ---
    // Remove and redraw to guarantee fill/stroke always reflect current indicator
    _g.selectAll('.country-path').remove();

    _g.selectAll('.country-path')
        .data(renderFeatures, d => d.properties.iso3)
        .enter()
        .append('path')
        .attr('class', 'country-path')
        .attr('d', _path)
        .attr('fill', d => {
            if (d.properties._background) return '#DDD4C4'; // gray for non-LATAM countries
            const val = d.properties._value;
            if (val == null) return '#E8E0D4';
            if (_hasDiverging) return _colorFn(val);
            return val > 0 ? _colorFn(val) : '#E8E0D4';
        })
        .attr('stroke', d => {
            if (d.properties._background) return '#C9BDA8';
            const val = d.properties._value;
            if (val == null) return '#E8E0D4';
            if (_hasDiverging) return _colorFn(val);
            return val > 0 ? _colorFn(val) : '#E8E0D4';
        })
        .attr('stroke-width', 1.5)
        .attr('stroke-linejoin', 'round')
        .classed('selected', d => !d.properties._background && selected.includes(d.properties.iso3))
        .style('cursor', d => d.properties._background ? 'default' : 'pointer')
        .on('click', (event, d) => {
            if (d.properties._background) return;
            State.toggleCountry(d.properties.iso3);
        })
        .on('mouseenter', (event, d) => {
            if (d.properties._background) return;
            _mapTooltip(event, d.properties.name, d.properties._value, year);
        })
        .on('mousemove', (event) => showTooltip(event))
        .on('mouseleave', () => hideTooltip());

    // --- Shared borders via topojson.mesh() - clean lines, no gaps ---
    const topo = DataLoader.getTopo();
    if (topo) {
        const borders = topojson.mesh(topo, topo.objects.countries,
            (a, b) => a !== b);

        _g.selectAll('.border-mesh').remove();
        _g.append('path')
            .datum(borders)
            .attr('class', 'border-mesh')
            .attr('d', _path)
            .attr('fill', 'none')
            .attr('stroke', 'rgba(139,94,60,0.25)')
            .attr('stroke-width', 0.5)
            .attr('stroke-linejoin', 'round')
            .attr('pointer-events', 'none');

        const outline = topojson.mesh(topo, topo.objects.countries,
            (a, b) => a === b);
        _g.selectAll('.outline-mesh').remove();
        _g.append('path')
            .datum(outline)
            .attr('class', 'outline-mesh')
            .attr('d', _path)
            .attr('fill', 'none')
            .attr('stroke', 'rgba(139,94,60,0.15)')
            .attr('stroke-width', 0.3)
            .attr('stroke-linejoin', 'round')
            .attr('pointer-events', 'none');
    }

    // --- Selection highlights (drawn on top) ---
    const selData = renderFeatures.filter(f => selected.includes(f.properties.iso3));
    const selPaths = _g.selectAll('.country-selection')
        .data(selData, d => d.properties.iso3);

    selPaths.enter()
        .append('path')
        .attr('class', 'country-selection')
        .merge(selPaths)
        .attr('d', _path)
        .attr('fill', 'none')
        .attr('stroke', 'var(--c-accent)')
        .attr('stroke-width', 2)
        .attr('pointer-events', 'none');

    selPaths.exit().remove();

    document.getElementById(_yearLabelId).textContent = year;
    _updateLegend(values);
}

function _renderLatamLevel() {
    const topo = DataLoader.getTopo();
    const geo = DataLoader.getGeo();
    if (!topo || !geo) { console.warn('[MAP] No topo/geo for LATAM render'); return; }

    _cachedLegendKey = '';

    if (_lastGeoLevel === 'subnational') {
        _g.selectAll('.subnational-base').remove();
        _g.selectAll('.admin1-path').remove();
        _g.selectAll('.admin1-border-mesh').remove();
        _g.selectAll('.admin1-outline-mesh').remove();
        _svg.call(_zoom.transform, d3.zoomIdentity);
        _resize();
    }
    if (_lastGeoLevel === 'region') {
        _g.selectAll('.region-path').remove();
    }
    _lastGeoLevel = 'latam';

    if (!_path || !_projection) _resize();

    const year = _yearOverride !== null ? _yearOverride : State.get('currentYear');
    const indicator = _getDataField();

    // Merge ALL LATAM countries into one shape
    const latamIso3 = new Set(Object.keys(COUNTRIES));
    const latamGeoms = topo.objects.countries.geometries.filter(g =>
        latamIso3.has(g.properties?.iso3)
    );
    const mergedLatam = topojson.merge(topo, latamGeoms);
    const val = DataLoader.getValue('latin_america', year, indicator, 'region');

    const bgFeatures = geo.features.filter(f => f.properties._background);

    // Color: use a single warm tone for the aggregate
    const fillColor = val != null && val > 0 ? '#D0A840' : '#E8E0D4';

    // Clear previous elements
    _g.selectAll('.country-path').remove();
    _g.selectAll('.region-path').remove();
    _g.selectAll('.latam-path').remove();
    _g.selectAll('.border-mesh').remove();
    _g.selectAll('.outline-mesh').remove();
    _g.selectAll('.country-selection').remove();

    // Background countries
    _g.selectAll('.country-path')
        .data(bgFeatures, d => d.properties.iso3 || d.properties.name)
        .enter()
        .append('path')
        .attr('class', 'country-path')
        .attr('d', _path)
        .attr('fill', '#DDD4C4')
        .attr('stroke', '#C9BDA8')
        .attr('stroke-width', 1.5)
        .attr('stroke-linejoin', 'round')
        .style('cursor', 'default');

    // Single LATAM shape
    const latamFeature = { type: 'Feature', geometry: mergedLatam, properties: { _value: val } };
    _g.append('path')
        .datum(latamFeature)
        .attr('class', 'latam-path')
        .attr('d', _path)
        .attr('fill', fillColor)
        .attr('stroke', fillColor)
        .attr('stroke-width', 1.5)
        .attr('stroke-linejoin', 'round')
        .style('cursor', 'default')
        .on('mouseenter', (event) => _mapTooltip(event, 'América Latina', val, year))
        .on('mousemove', (event) => showTooltip(event))
        .on('mouseleave', () => hideTooltip());

    // Outer outline
    const outline = topojson.mesh(topo, topo.objects.countries, (a, b) => a === b);
    _g.append('path')
        .datum(outline)
        .attr('class', 'outline-mesh')
        .attr('d', _path)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(139,94,60,0.2)')
        .attr('stroke-width', 0.4)
        .attr('stroke-linejoin', 'round')
        .attr('pointer-events', 'none');

    document.getElementById(_yearLabelId).textContent = year;

    // Simple legend for single value
    const legend = document.getElementById('map-legend');
    if (legend) {
        const unit = _getUnit();
        const indicatorLabel = _getActiveIndicatorLabel();
        legend.innerHTML = `
            <div class="map-legend-title">${indicatorLabel} (${unit})</div>
            <div style="font-size:18px;font-weight:700;color:#7A6A5A;margin-top:4px">${fmtUnit(val, unit)}</div>
            <div style="font-size:10px;color:#A89888;margin-top:2px">América Latina - ${year}</div>
        `;
    }
}

function _renderRegionLevel() {
    const topo = DataLoader.getTopo();
    const geo = DataLoader.getGeo();
    if (!topo || !geo) { console.warn('[MAP] No topo/geo for region render'); return; }

    // Force legend cache invalidation
    _cachedLegendKey = '';

    // If switching back from other level, clear old elements
    if (_lastGeoLevel === 'subnational') {
        _g.selectAll('.subnational-base').remove();
        _g.selectAll('.admin1-path').remove();
        _g.selectAll('.admin1-border-mesh').remove();
        _g.selectAll('.admin1-outline-mesh').remove();
        _svg.call(_zoom.transform, d3.zoomIdentity);
        _resize();
    }
    if (_lastGeoLevel === 'latam') _g.selectAll('.latam-path').remove();
    _lastGeoLevel = 'region';

    if (!_path || !_projection) _resize();

    const year = _yearOverride !== null ? _yearOverride : State.get('currentYear');
    const indicator = _getDataField();
    const selected = State.get('selectedCountries');
    const scaleType = State.get('scaleType');

    // Build merged region features using topojson.merge
    const topoGeometries = topo.objects.countries.geometries;
    const regionFeatures = [];
    const values = [];

    for (const [regionId, regionInfo] of Object.entries(REGIONS)) {
        const regionIso3Set = new Set(regionInfo.countries);
        const regionGeoms = topoGeometries.filter(g =>
            regionIso3Set.has(g.properties?.iso3)
        );

        if (regionGeoms.length === 0) continue;

        // Merge all country geometries in this region into one shape
        const merged = topojson.merge(topo, regionGeoms);

        // Get region data value
        const val = DataLoader.getValue(regionId, year, indicator, 'region');

        regionFeatures.push({
            type: 'Feature',
            geometry: merged,
            properties: {
                regionId,
                label: regionInfo.label,
                countries: regionInfo.countries,
                _value: val,
            }
        });

        if (val != null && val !== 0) values.push(val);
    }

    // Also draw background countries (non-LATAM)
    const bgFeatures = geo.features.filter(f => f.properties._background);

    const colorDomain = _getGlobalMinMaxCached(indicator, 'region');
    _colorFn = _buildColorScale(values, scaleType, colorDomain);
    const _hasDiverging = colorDomain.gMin < 0 && colorDomain.gMax > 0;

    // Clear previous elements
    _g.selectAll('.country-path').remove();
    _g.selectAll('.region-path').remove();
    _g.selectAll('.border-mesh').remove();
    _g.selectAll('.outline-mesh').remove();
    _g.selectAll('.country-selection').remove();

    // Draw background countries
    _g.selectAll('.country-path')
        .data(bgFeatures, d => d.properties.iso3 || d.properties.name)
        .enter()
        .append('path')
        .attr('class', 'country-path')
        .attr('d', _path)
        .attr('fill', '#DDD4C4')
        .attr('stroke', '#C9BDA8')
        .attr('stroke-width', 1.5)
        .attr('stroke-linejoin', 'round')
        .style('cursor', 'default');

    // Draw merged region shapes
    _g.selectAll('.region-path')
        .data(regionFeatures, d => d.properties.regionId)
        .enter()
        .append('path')
        .attr('class', 'region-path')
        .attr('d', _path)
        .attr('fill', d => {
            const val = d.properties._value;
            if (val == null) return '#E8E0D4';
            if (_hasDiverging) return _colorFn(val);
            return val > 0 ? _colorFn(val) : '#E8E0D4';
        })
        .attr('stroke', d => {
            const val = d.properties._value;
            if (val == null) return '#E8E0D4';
            if (_hasDiverging) return _colorFn(val);
            return val > 0 ? _colorFn(val) : '#E8E0D4';
        })
        .attr('stroke-width', 1.5)
        .attr('stroke-linejoin', 'round')
        .classed('selected', d => selected.includes(d.properties.regionId))
        .style('cursor', 'pointer')
        .on('click', (event, d) => {
            State.toggleCountry(d.properties.regionId);
        })
        .on('mouseenter', (event, d) => _mapTooltip(event, d.properties.label, d.properties._value, year))
        .on('mousemove', (event) => showTooltip(event))
        .on('mouseleave', () => hideTooltip());

    // Region borders (between regions)
    // Use topojson.mesh with a filter that checks if two adjacent geometries
    // belong to different regions
    const regionOfGeo = {};
    for (const [regionId, regionInfo] of Object.entries(REGIONS)) {
        for (const iso3 of regionInfo.countries) {
            regionOfGeo[iso3] = regionId;
        }
    }

    const regionBorders = topojson.mesh(topo, topo.objects.countries,
        (a, b) => a !== b && regionOfGeo[a.properties?.iso3] !== regionOfGeo[b.properties?.iso3]);

    _g.append('path')
        .datum(regionBorders)
        .attr('class', 'border-mesh')
        .attr('d', _path)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(139,94,60,0.35)')
        .attr('stroke-width', 1)
        .attr('stroke-linejoin', 'round')
        .attr('pointer-events', 'none');

    // Outer outline
    const outline = topojson.mesh(topo, topo.objects.countries,
        (a, b) => a === b);
    _g.append('path')
        .datum(outline)
        .attr('class', 'outline-mesh')
        .attr('d', _path)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(139,94,60,0.15)')
        .attr('stroke-width', 0.3)
        .attr('stroke-linejoin', 'round')
        .attr('pointer-events', 'none');

    // Selection highlights
    const selRegions = regionFeatures.filter(f => selected.includes(f.properties.regionId));
    _g.selectAll('.country-selection')
        .data(selRegions, d => d.properties.regionId)
        .enter()
        .append('path')
        .attr('class', 'country-selection')
        .attr('d', _path)
        .attr('fill', 'none')
        .attr('stroke', 'var(--c-accent)')
        .attr('stroke-width', 2)
        .attr('pointer-events', 'none');

    document.getElementById(_yearLabelId).textContent = year;
    _updateLegend(values);
}

function _renderSubnational() {
    if (!DataLoader.isSubnationalLoaded()) {
        // Clear stale country paths so user doesn't see old data
        _g.selectAll('.country-path').remove();
        _g.selectAll('.subnational-base').remove();
        _g.selectAll('.border-mesh').remove();
        _g.selectAll('.outline-mesh').remove();
        _g.selectAll('.country-selection').remove();
        _showMapLoading('Cargando datos subnacionales-');
        return;
    }
    _hideMapLoading();

    _lastGeoLevel = 'subnational';
    _cachedLegendKey = ''; // Force legend refresh

    // Clear country-level elements and reset zoom
    _svg.call(_zoom.transform, d3.zoomIdentity);
    _g.selectAll('.country-path').remove();
    _g.selectAll('.subnational-base').remove();
    _g.selectAll('.border-mesh').remove();
    _g.selectAll('.outline-mesh').remove();
    _g.selectAll('.country-selection').remove();

    const year = _yearOverride !== null ? _yearOverride : State.get('currentYear');
    const indicator = _getDataField();
    const selected = State.get('selectedCountries');
    const scaleType = State.get('scaleType');
    const unit = _getUnit();

    // Determine which countries can actually be drawn at admin1 level for
    // this indicator. If data or geometry are missing, draw the national
    // value instead so countries never disappear.
    const subCountries = DataLoader.getSubnationalCountries(indicator);
    const allSubGeo = DataLoader.getSubnationalGeo(null);
    const topoCountries = new Set((allSubGeo?.features || []).map(f => f.properties.iso3));
    const drawableSubCountries = new Set(subCountries.filter(iso3 => topoCountries.has(iso3)));
    const selectedIso = selected.length > 0 ? selected[0] : null;
    const activeIso = selectedIso && drawableSubCountries.has(selectedIso) ? selectedIso : null;
    const selectedNationalOnly = selectedIso && !activeIso ? selectedIso : null;

    // Get admin1 geo features. With no selected country, show all available
    // subnational units; with a selected drawable country, show that country
    // in detail and leave the rest as national fallback.
    const adminFeatures = (allSubGeo?.features || []).filter(f => {
        const iso3 = f.properties.iso3;
        if (!drawableSubCountries.has(iso3)) return false;
        if (activeIso) return iso3 === activeIso;
        if (selectedNationalOnly) return false;
        return true;
    });
    const subGeo = { type: 'FeatureCollection', features: adminFeatures };
    const adminFeatureCountries = new Set(adminFeatures.map(f => f.properties.iso3));
    console.log('[MAP-SUB] activeIso:', activeIso, 'features:', adminFeatures.length);

    // Get country-level GeoJSON for countries WITHOUT drawn admin1 data
    const countryGeo = DataLoader.getGeo();
    const nonSubFeatures = countryGeo
        ? countryGeo.features.filter(f => {
            const iso3 = f.properties.iso3;
            if (activeIso) return false;
            if (selectedNationalOnly) return iso3 === selectedNationalOnly;
            return !adminFeatureCountries.has(iso3);
        })
        : [];

    // If no admin1 features and no fallback country features, bail out
    const hasAdmin1 = subGeo && subGeo.features.length > 0;
    if (!hasAdmin1 && nonSubFeatures.length === 0) {
        console.warn('[MAP-SUB] No features to draw');
        _g.selectAll('.admin1-path').remove();
        _g.selectAll('.admin1-border-mesh').remove();
        _g.selectAll('.admin1-outline-mesh').remove();
        document.getElementById('map-year').textContent = year;
        return;
    }

    // Fit projection to the layer we actually draw. When a country is shown at
    // admin1 level, do not include the coarser national polygon: those sources
    // do not always share the same coastline and the national outline can peek
    // out below the subnational layer.
    const allFeatures = [
        ...(hasAdmin1 ? subGeo.features : []),
        ...nonSubFeatures,
    ];
    const combinedGeo = { type: 'FeatureCollection', features: allFeatures };
    const mobile = window.innerWidth <= 760;
    const padX = mobile ? 28 : 20;
    const padTop = mobile ? 16 : 20;
    const padBottom = mobile ? 46 : 20;
    _projection = d3.geoMercator()
        .fitExtent([[padX, padTop], [_width - padX, _height - padBottom]], combinedGeo);
    _path = d3.geoPath(_projection);
    _resetZoomTransform();

    // Compute values for admin1 features. Clone features per render so compare
    // mode does not share mutable `_value` between both map panels.
    const values = [];
    let adminRenderFeatures = [];
    if (hasAdmin1) {
        adminRenderFeatures = subGeo.features.map(f => {
            const props = f.properties || {};
            const iso3 = props.iso3;
            const adminName = props.admin_name;
            const val = DataLoader.getSubnationalValue(iso3, adminName, year, indicator);
            if (val != null && val !== 0) values.push(val);
            return {
                ...f,
                properties: {
                    ...props,
                    _value: val,
                },
            };
        });
    }

    // Compute values for non-subnational country features
    const nonSubRenderFeatures = nonSubFeatures.map(f => {
        const props = f.properties || {};
        const iso3 = props.iso3;
        const val = DataLoader.getValue(iso3, year, indicator, 'country');
        if (val != null && val !== 0) values.push(val);
        return {
            ...f,
            properties: {
                ...props,
                _value: val,
            },
        };
    });

    console.log('[MAP-SUB] year:', year, 'indicator:', indicator,
        'admin1 values:', hasAdmin1 ? subGeo.features.length : 0,
        'country fallback:', nonSubFeatures.length,
        'non-null values:', values.length);

    const colorDomain = _getGlobalMinMaxCached(indicator, 'subnational');
    _colorFn = _buildColorScale(values, scaleType, colorDomain);
    const _hasDivergingSub = colorDomain.gMin < 0 && colorDomain.gMax > 0;

    // --- No national base under admin1: avoid doubled/misaligned geometries.
    _g.selectAll('.subnational-base').remove();

    // --- Draw country-level fills for countries WITHOUT admin1 data ---
    _g.selectAll('.country-path').remove();

    if (nonSubFeatures.length > 0) {
        _g.selectAll('.country-path')
            .data(nonSubRenderFeatures, d => d.properties.iso3)
            .enter()
            .append('path')
            .attr('class', 'country-path')
            .attr('d', _path)
            .attr('fill', d => {
                const val = d.properties._value;
                if (val == null) return '#E8E0D4';
                if (_hasDivergingSub) return _colorFn(val);
                return val > 0 ? _colorFn(val) : '#E8E0D4';
            })
            // Thin neutral stroke (not fill-coloured) so dark-coloured
            // countries don't get a half-pixel halo on coastlines, while
            // still keeping a visible boundary against the page background.
            .attr('stroke', 'rgba(139,94,60,0.35)')
            .attr('stroke-width', 0.6)
            .attr('stroke-linejoin', 'round')
            .style('cursor', 'pointer')
            .on('click', (event, d) => {
                State.toggleCountry(d.properties.iso3);
            })
            .on('mouseenter', (event, d) => {
                const countryName = d.properties.name || DataLoader.getCountryName(d.properties.iso3);
                _mapTooltip(event, countryName + ' (nacional)', d.properties._value, year);
            })
            .on('mousemove', (event) => showTooltip(event))
            .on('mouseleave', () => hideTooltip());
    }

    // --- Draw admin1 fills ---
    _g.selectAll('.admin1-path').remove();
    _g.selectAll('.admin1-border-mesh').remove();
    _g.selectAll('.admin1-outline-mesh').remove();

    if (hasAdmin1) {
        _g.selectAll('.admin1-path')
            .data(adminRenderFeatures, d => `${d.properties.iso3}::${d.properties.admin_name}`)
            .enter()
            .append('path')
            .attr('class', 'admin1-path')
            .attr('d', _path)
            .attr('fill', d => {
                const val = d.properties._value;
                if (val == null) return '#E8E0D4';
                if (_hasDivergingSub) return _colorFn(val);
                return val > 0 ? _colorFn(val) : '#E8E0D4';
            })
            // Borders are drawn separately by admin1-border-mesh and
            // admin1-outline-mesh below. Painting a 1.5px stroke in the fill
            // colour here leaked half a pixel beyond the polygon edge and
            // produced a dark halo around dark-coloured states on the coast.
            .attr('stroke', 'none')
            .style('cursor', 'pointer')
            .on('click', (event, d) => {
                const iso3 = d.properties.iso3;
                if (!selected.includes(iso3)) {
                    State.addCountry(iso3);
                }
            })
            .on('mouseenter', (event, d) => {
                const countryName = DataLoader.getCountryName(d.properties.iso3);
                _mapTooltip(event, `${d.properties.admin_name} (${countryName})`, d.properties._value, year);
            })
            .on('mousemove', (event) => showTooltip(event))
            .on('mouseleave', () => hideTooltip());
    }

    // --- Borders for country-level features (non-subnational countries) ---
    const topo = DataLoader.getTopo();
    if (topo && nonSubFeatures.length > 0) {
        // Draw borders only between the non-subnational countries
        const nonSubIsos = new Set(nonSubFeatures.map(f => f.properties.iso3));
        const borders = topojson.mesh(topo, topo.objects.countries,
            (a, b) => a !== b && nonSubIsos.has(a.properties.iso3) && nonSubIsos.has(b.properties.iso3));
        _g.selectAll('.border-mesh').remove();
        _g.append('path')
            .datum(borders)
            .attr('class', 'border-mesh')
            .attr('d', _path)
            .attr('fill', 'none')
            .attr('stroke', 'rgba(139,94,60,0.25)')
            .attr('stroke-width', 0.5)
            .attr('stroke-linejoin', 'round')
            .attr('pointer-events', 'none');
    }

    // --- Admin1 borders using topojson.mesh ---
    const subTopo = DataLoader.getSubnationalTopo();
    if (subTopo && hasAdmin1) {
        const borders = topojson.mesh(subTopo, subTopo.objects.admin1,
            (a, b) => a !== b
                && adminFeatureCountries.has(a.properties.iso3)
                && adminFeatureCountries.has(b.properties.iso3));
        _g.append('path')
            .datum(borders)
            .attr('class', 'admin1-border-mesh')
            .attr('d', _path)
            .attr('fill', 'none')
            .attr('stroke', 'rgba(139,94,60,0.3)')
            .attr('stroke-width', 0.5)
            .attr('stroke-linejoin', 'round')
            .attr('pointer-events', 'none');

        const outline = topojson.mesh(subTopo, subTopo.objects.admin1,
            (a, b) => a === b && adminFeatureCountries.has(a.properties.iso3));
        _g.append('path')
            .datum(outline)
            .attr('class', 'admin1-outline-mesh')
            .attr('d', _path)
            .attr('fill', 'none')
            .attr('stroke', 'rgba(139,94,60,0.5)')
            .attr('stroke-width', 1)
            .attr('stroke-linejoin', 'round')
            .attr('pointer-events', 'none');
    }

    document.getElementById(_yearLabelId).textContent = year;
    _updateLegend(values);
}

// Diverging palette: blood red (deficit) ? beige neutral ? forest green (surplus)
const DIV_COLORS = ['#8B2500', '#C4613E', '#E8E0D4', '#6B8E6B', '#2D5A2D'];

function _buildColorScale(values, scaleType, domain = null) {
    if (values.length === 0) return () => SEQ_COLORS[0];

    const vMin = domain ? domain.gMin : d3.min(values);
    const vMax = domain ? domain.gMax : d3.max(values);
    if (!Number.isFinite(vMin) || !Number.isFinite(vMax) || vMin === vMax) {
        return () => SEQ_COLORS[Math.min(SEQ_COLORS.length - 1, 2)];
    }

    // Detect if values span both negative and positive (e.g. trade balance)
    if (vMin < 0 && vMax > 0) {
        // Use a diverging scale: reds for negative, greens for positive
        const absMax = Math.max(Math.abs(vMin), Math.abs(vMax));
        return d3.scaleDiverging()
            .domain([-absMax, 0, absMax])
            .interpolator(t => {
                // t goes from 0 (min) to 1 (max), with 0.5 = zero
                // Map to our DIV_COLORS palette
                const i = t * (DIV_COLORS.length - 1);
                const lo = Math.floor(i);
                const hi = Math.min(lo + 1, DIV_COLORS.length - 1);
                const frac = i - lo;
                return d3.interpolateRgb(DIV_COLORS[lo], DIV_COLORS[hi])(frac);
            });
    }

    // Create interpolator that follows ALL palette colors (avoids grey midtones)
    const seqInterp = d3.interpolateRgbBasis(SEQ_COLORS);

    if (scaleType === 'log') {
        const positiveValues = values.filter(v => v > 0);
        const safeMin = Math.max(1, domain ? vMin : d3.min(positiveValues));
        const logScale = d3.scaleLog()
            .domain([safeMin, Math.max(safeMin, vMax)])
            .range([0, 1])
            .clamp(true);
        return v => seqInterp(logScale(v));
    }
    // Use scalePow(0.4) for better distribution - expands low values, compresses highs
    const sqrtMin = Math.max(0, d3.min(values));
    const sqrtMax = d3.max(values);
    const powScale = d3.scalePow()
        .exponent(0.4) // more aggressive than sqrt (0.5)
        .domain([sqrtMin, sqrtMax])
        .range([0, 1])
        .clamp(true);
    return v => seqInterp(powScale(v));
}

function _getGlobalMinMax(indicator, geoLevel) {
    const data = DataLoader;
    const years = data.getYears();
    if (!years || !years.length) return { gMin: 0, gMax: 1 };

    let gMin = Infinity, gMax = -Infinity;

    if (geoLevel === 'subnational') {
        const subGeo = data.getSubnationalGeo(null);
        if (subGeo) {
            const subYears = data.getYears();
            subYears.forEach(y => {
                subGeo.features.forEach(f => {
                    const val = data.getSubnationalValue(f.properties.iso3, f.properties.admin_name, y, indicator);
                    if (val != null && val !== 0) {
                        if (val < gMin) gMin = val;
                        if (val > gMax) gMax = val;
                    }
                });
            });
        }

        // National fallback countries are part of subnational mode, especially
        // for land-use indicators that have no admin1 breakdown in the web JSON.
        const geo = data.getGeo();
        if (geo) {
            years.forEach(y => {
                geo.features.forEach(f => {
                    const iso3 = f.properties.iso3;
                    const val = data.getValue(iso3, y, indicator, 'country');
                    if (val != null && val !== 0) {
                        if (val < gMin) gMin = val;
                        if (val > gMax) gMax = val;
                    }
                });
            });
        }
    } else if (geoLevel === 'region') {
        const regionIds = Object.keys(REGIONS);
        years.forEach(y => {
            regionIds.forEach(regionId => {
                const val = data.getValue(regionId, y, indicator, 'region');
                if (val != null && val !== 0) {
                    if (val < gMin) gMin = val;
                    if (val > gMax) gMax = val;
                }
            });
        });
    } else {
        const geo = data.getGeo();
        if (geo) {
            years.forEach(y => {
                geo.features.forEach(f => {
                    const iso3 = f.properties.iso3;
                    const val = data.getValue(iso3, y, indicator, 'country');
                    if (val != null && val !== 0) {
                        if (val < gMin) gMin = val;
                        if (val > gMax) gMax = val;
                    }
                });
            });
        }
    }

    if (!Number.isFinite(gMin) || !Number.isFinite(gMax)) return { gMin: 0, gMax: 1 };
    return { gMin, gMax };
}

let _cachedLegendKey = '';
let _cachedGlobalMinMax = { gMin: 0, gMax: 1 };

function _getGlobalMinMaxCached(indicatorField, geoLevel) {
    const scaleType = State.get('scaleType');
    const axisMode = State.get('axisMode');
    const activeUnit = State.get('activeUnit');
    const cacheKey = `${indicatorField}|${State.get('activeCategory')}|${geoLevel}|${scaleType}|${axisMode}|${activeUnit}`;

    if (cacheKey !== _cachedLegendKey) {
        _cachedGlobalMinMax = _getGlobalMinMax(indicatorField, geoLevel);
        _cachedLegendKey = cacheKey;
    }

    return _cachedGlobalMinMax;
}

function _updateLegend(values) {
    const legend = document.getElementById('map-legend');
    if (!legend || values.length === 0) {
        if (legend) legend.innerHTML = '';
        return;
    }

    const indicatorField = _getDataField();
    const indicatorLabel = _getActiveIndicatorLabel();
    const unit = _getUnit();
    const geoLevel = State.get('geoLevel');
    const scaleType = State.get('scaleType');
    const axisMode = State.get('axisMode');
    const activeUnit = State.get('activeUnit');

    // Cache global min/max - recompute only when indicator/category/geoLevel/mode/unit changes
    const cacheKey = `${indicatorField}|${State.get('activeCategory')}|${geoLevel}|${scaleType}|${axisMode}|${activeUnit}`;
    if (cacheKey !== _cachedLegendKey) {
        _cachedGlobalMinMax = _getGlobalMinMax(indicatorField, geoLevel);
        _cachedLegendKey = cacheKey;
    }

    const { gMin, gMax } = _cachedGlobalMinMax;

    // Detect diverging scenario (negative + positive values)
    const isDiverging = gMin < 0 && gMax > 0;
    const legendColors = isDiverging ? DIV_COLORS : SEQ_COLORS.slice(1);

    const unitLabel = unit && unit !== 'index100' ? ` (${unit})` : '';
    const scaleLabel = State.get('scaleType') === 'log' ? ' - log' : '';
    legend.innerHTML = `
        <div class="map-legend-title">${indicatorLabel}${unitLabel}${scaleLabel}</div>
        <div class="map-legend-bar">
            ${legendColors.map(c => `<div class="map-legend-cell" style="background:${c}"></div>`).join('')}
        </div>
        <div class="map-legend-labels">
            <span>${fmtUnit(gMin, unit)}</span>
            ${isDiverging ? '<span>0</span>' : ''}
            <span>${fmtUnit(gMax, unit)}</span>
        </div>
    `;
}

function _getDataField() {
    const meta = DataLoader.getMetadata();
    const cat = meta.categories.find(c => c.id === State.get('activeCategory'));
    if (!cat) return 'production';
    const activeUnit = State.get('activeUnit');
    for (const group of (cat.indicatorGroups || [])) {
        for (const ind of group.indicators) {
            if (ind.id === State.get('activeIndicator')) {
                // Use GJ variant if unit toggle is set to GJ and indicator has it
                if (activeUnit === 'GJ' && ind.dataFieldGJ) return ind.dataFieldGJ;
                return ind.dataField;
            }
        }
    }
    return 'production';
}

function _getUnit() {
    const mode = State.get('axisMode');
    if (mode === 'index') return 'index100';
    if (mode === 'pct_total' || mode === 'pct_territory') return '%';

    const activeUnit = State.get('activeUnit');
    const meta = DataLoader.getMetadata();
    const cat = meta.categories.find(c => c.id === State.get('activeCategory'));
    if (!cat) return 'toneladas';
    for (const group of (cat.indicatorGroups || [])) {
        for (const ind of group.indicators) {
            if (ind.id === State.get('activeIndicator')) {
                if (activeUnit === 'GJ' && ind.dataFieldGJ) {
                    return ind.dataField === 'yield' ? 'GJ/ha' : 'GJ';
                }
                return ind.unit;
            }
        }
    }
    return 'toneladas';
}

function _getActiveIndicatorLabel() {
    const meta = DataLoader.getMetadata();
    const cat = meta.categories.find(c => c.id === State.get('activeCategory'));
    if (!cat) return '';
    for (const group of (cat.indicatorGroups || [])) {
        for (const ind of group.indicators) {
            if (ind.id === State.get('activeIndicator')) return ind.label;
        }
    }
    return '';
}

function _getActiveCategoryLabel() {
    const meta = DataLoader.getMetadata();
    const cat = meta.categories.find(c => c.id === State.get('activeCategory'));
    return cat ? cat.label : '';
}

/** Build a complete tooltip for the map - always shows territory, value+unit, indicator, crop, category, year */
function _mapTooltip(event, entityName, val, year) {
    const unit = _getUnit();
    const indicatorLabel = _getActiveIndicatorLabel();
    const categoryLabel = _getActiveCategoryLabel();
    const cropItem = State.get('cropItem');
    const cropLabel = cropItem && cropItem !== 'all' ? cropItem : '';

    // Sub line: Category - Indicator - Crop - Year
    const parts = [categoryLabel, indicatorLabel];
    if (cropLabel) parts.push(cropLabel);
    const sub = parts.join(' - ') + ` - ${year}`;

    showTooltip(event, {
        title: entityName,
        value: fmtUnit(val, unit),
        sub,
    });
}





