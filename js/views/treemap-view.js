/* treemap-view.js - Harvard Atlas-inspired composition treemap */

import State from '../state.js?v=20260522-mobile-ui18';
import DataLoader from '../data-loader.js?v=20260522-mobile-ui18';
import { COUNTRIES, REGIONS, CATEGORY_COLORS, CAT_COLORS, fmt, fmtUnit, shortItemLabel, shortEntityLabel } from '../utils.js?v=20260522-mobile-ui18';
import { showTooltip, hideTooltip } from '../components/tooltip.js';

let _container, _chartEl;
let _width = 0, _height = 0;
let _ro;

export function initTreemapView() {
    _container = document.getElementById('treemap-container');
    _chartEl = document.getElementById('treemap-chart');

    _ro = new ResizeObserver(() => {
        _resize();
        if (State.get('activeView') === 'treemap') updateTreemapView();
    });
    _ro.observe(_chartEl);
}

function _resize() {
    if (!_chartEl) return;
    _width = _chartEl.clientWidth;
    _height = _chartEl.clientHeight;
}

function _selectedProductNames() {
    const selectedItems = State.get('selectedItems');
    if (Array.isArray(selectedItems) && selectedItems.length > 0) return selectedItems;
    const cropItem = State.get('cropItem');
    return cropItem && cropItem !== 'all' ? [cropItem] : [];
}

function _selectedPartnerNames() {
    const partners = State.get('selectedPartners');
    return Array.isArray(partners) ? partners : [];
}

function _bilateralElement() {
    return State.get('activeIndicator') === 'bilateral_imports' ? 'import' : 'export';
}

function _bilateralContext() {
    const selected = State.get('selectedCountries') || [];
    const geoLevel = State.get('geoLevel');
    if (geoLevel === 'region' && selected.length > 0 && REGIONS[selected[0]]) {
        return { code: selected[0], geo: 'region', name: DataLoader.getCountryName(selected[0]) };
    }
    if (selected.length > 0) {
        return { code: selected[0], geo: 'country', name: DataLoader.getCountryName(selected[0]) };
    }
    return { code: 'latin_america', geo: 'region', name: DataLoader.getCountryName('latin_america') };
}

function _renderBilateralComposition(year, topN) {
    if (!DataLoader.isBilateralLoaded?.()) {
        _chartEl.innerHTML = '<div style="padding:20px;color:#A89888">Cargando comercio bilateral...</div>';
        DataLoader.loadBilateral?.().then(() => updateTreemapView());
        return;
    }

    const { code, geo, name: entityName } = _bilateralContext();
    const element = _bilateralElement();
    const years = DataLoader.getBilateralYears?.() || [];
    const yearIdx = years.indexOf(Math.max(years[0], Math.min(years[years.length - 1], year)));
    const productNames = _selectedProductNames();
    const partnerNames = _selectedPartnerNames();
    const children = [];

    if (partnerNames.length > 0) {
        const valuesByProduct = new Map();
        const rawItems = DataLoader.getBilateralItems(code, element, geo) || {};
        Object.keys(rawItems).forEach(product => {
            if (productNames.length > 0 && !productNames.includes(product)) return;
            const itemPartners = DataLoader.getBilateralItemPartners(code, element, product, geo) || {};
            let value = 0;
            partnerNames.forEach(partner => {
                const series = itemPartners[partner];
                const v = Array.isArray(series) && yearIdx >= 0 ? series[yearIdx] : null;
                if (v != null && Number.isFinite(v) && v > 0) value += v;
            });
            if (value > 0) valuesByProduct.set(product, value);
        });
        [...valuesByProduct.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, topN)
            .forEach(([product, value], i) => {
                children.push({ name: shortItemLabel(product), value, color: CAT_COLORS[i % CAT_COLORS.length] });
            });
    } else if (productNames.length > 0) {
        const valuesByPartner = new Map();
        productNames.forEach(product => {
            const itemPartners = DataLoader.getBilateralItemPartners(code, element, product, geo) || {};
            Object.entries(itemPartners).forEach(([partner, series]) => {
                if (partner === 'Resto') return;
                const value = Array.isArray(series) && yearIdx >= 0 ? series[yearIdx] : null;
                if (value != null && Number.isFinite(value) && value > 0) {
                    valuesByPartner.set(partner, (valuesByPartner.get(partner) || 0) + value);
                }
            });
        });
        [...valuesByPartner.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, topN)
            .forEach(([partner, value], i) => {
                children.push({ name: shortEntityLabel(partner), value, color: CAT_COLORS[i % CAT_COLORS.length] });
            });
    } else {
        const partners = DataLoader.getBilateralPartners(code, element, geo) || {};
        Object.entries(partners)
            .map(([partner, series]) => {
                const value = Array.isArray(series) && yearIdx >= 0 ? series[yearIdx] : null;
                return { partner, value };
            })
            .filter(d => d.partner !== 'Resto' && d.value != null && Number.isFinite(d.value) && d.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, topN)
            .forEach((d, i) => {
                children.push({ name: shortEntityLabel(d.partner), value: d.value, color: CAT_COLORS[i % CAT_COLORS.length] });
            });
    }

    if (children.length === 0) {
        _chartEl.innerHTML = '<div style="padding:20px;color:#A89888">Sin composición bilateral para esta selección</div>';
        return;
    }

    _renderTreemapFromChildren(children, 'toneladas');

    const flowLabel = element === 'export' ? 'Exportaciones' : 'Importaciones';
    const header = document.getElementById('treemap-header');
    if (header) {
        let modeLabel = 'por socio';
        if (partnerNames.length > 0) modeLabel = `productos - ${partnerNames.map(shortEntityLabel).join(', ')}`;
        else if (productNames.length > 0) modeLabel = `socios - ${productNames.map(shortItemLabel).join(', ')}`;
        header.textContent = `${flowLabel} - ${shortEntityLabel(entityName)} - ${modeLabel} - ${year}`;
    }
}

function _itemSeries(item, dataField) {
    if (!item || typeof item !== 'object') return null;
    return item[dataField] || item.values || item.production || null;
}

function _itemYearIndexWithData(items, yi, dataField) {
    if (!Array.isArray(items) || yi == null || yi < 0) return yi;
    const hasValueAt = idx => items.some(item => {
        const series = _itemSeries(item, dataField);
        const value = Array.isArray(series) ? series[idx] : null;
        return value != null && Number.isFinite(value) && value > 0;
    });
    if (hasValueAt(yi)) return yi;
    for (let idx = yi - 1; idx >= 0; idx--) {
        if (hasValueAt(idx)) return idx;
    }
    return yi;
}

function _seriesPointAtOrBefore(series, year) {
    if (!Array.isArray(series) || !series.length) return null;
    return [...series].reverse().find(d => d.year <= year && d.value != null && Number.isFinite(d.value)) || null;
}

function _yearFromIndex(yi, fallbackYear) {
    const years = DataLoader.getYears ? DataLoader.getYears() : [];
    return years[yi] || fallbackYear;
}

export function updateTreemapView() {
    if (State.get('activeView') !== 'treemap') return;

    // Always re-measure in case panel just became visible
    _resize();
    if (!_chartEl || !_width) return;

    _chartEl.innerHTML = '';

    const year = State.get('currentYear');
    const selected = State.get('selectedCountries');
    const geoLevel = State.get('geoLevel');
    const topN = State.get('rankingTopN') || State.get('topN') || 10;
    const dataField = _getDataField();
    const unit = _getUnit();

    const indicator = State.get('activeIndicator');
    const subKey = indicator?.startsWith('import') ? 'imports' : indicator?.startsWith('export') ? 'exports' : null;

    if (indicator?.startsWith('bilateral_')) {
        _renderBilateralComposition(year, topN);
        return;
    }

    // Subnational: show admin1 units as treemap cells (production by province)
    if (geoLevel === 'subnational' && selected.length > 0) {
        const iso3 = selected[0];
        const subRanking = DataLoader.getSubnationalRanking(year, dataField, iso3);
        if (subRanking.length > 0) {
            const subItems = subRanking.slice(0, topN).map(r => ({
                name: r.name,
                [dataField]: null,
                _directValue: r.value,
            }));
            const yi = 0;
            _renderTreemap(subItems, yi, dataField, unit, topN, DataLoader.getCountryName(iso3), true);
        } else {
            _chartEl.innerHTML = '<div style="padding:20px;color:#A89888">Sin datos subnacionales para este año</div>';
        }
        const header = document.getElementById('treemap-header');
        if (header) {
            header.textContent = `${DataLoader.getCountryName(iso3)} - subnacional - ${year} - ${_getActiveIndicatorLabel()}`;
        }
        return;
    }

    // -- When a specific item is selected, show composition by the active
    // territory level. This avoids the confusing case where selected regions
    // were ignored and the chart jumped back to all countries.
    const cropItem = State.get('cropItem');
    if (cropItem && cropItem !== 'all') {
        const selectedEntities = selected.length > 0
            ? selected.map(code => ({
                code,
                geo: (geoLevel === 'region' || REGIONS[code] || code === 'latin_america') ? 'region' : 'country',
            }))
            : (geoLevel === 'region'
                ? Object.keys(REGIONS).map(code => ({ code, geo: 'region' }))
                : Object.keys(COUNTRIES).map(code => ({ code, geo: 'country' })));

        const entries = [];
        let usedYear = null;
        selectedEntities.forEach(({ code, geo }) => {
            const series = DataLoader.getItemTimeSeries(code, cropItem, dataField, geo);
            const point = _seriesPointAtOrBefore(series, year);
            const val = point?.value;
            if (val != null && val > 0) {
                usedYear = usedYear == null ? point.year : Math.min(usedYear, point.year);
                entries.push({
                    name: DataLoader.getCountryName(code) || code,
                    value: val,
                });
            }
        });
        entries.sort((a, b) => b.value - a.value);

        if (entries.length > 0) {
            const topEntries = selected.length > 0 ? entries : entries.slice(0, topN);
            const topTotal = topEntries.reduce((s, e) => s + e.value, 0);
            const grandTotal = entries.reduce((s, e) => s + e.value, 0);
            const otrosVal = grandTotal - topTotal;

            const children = topEntries.map((e, i) => ({
                name: e.name,
                value: e.value,
                color: CAT_COLORS[i % CAT_COLORS.length],
            }));
            if (selected.length === 0 && otrosVal > 0) {
                children.push({ name: 'Otros', value: otrosVal, color: '#C9BDA8' });
            }

            _renderTreemapFromChildren(children, unit);

            const header = document.getElementById('treemap-header');
            if (header) {
                const levelLabel = geoLevel === 'region' ? 'región' : 'país';
                const scopeLabel = selected.length > 0 ? 'territorios seleccionados' : levelLabel;
                header.textContent = `${cropItem} - composición por ${scopeLabel} - ${usedYear || year} - ${_getActiveIndicatorLabel()}`;
            }
        } else {
            _chartEl.innerHTML = '<div style="padding:20px;color:#A89888">Sin datos para esta selección</div>';
        }
        return;
    }

    // Multiple countries selected: render faceted treemaps (one per country)
    if (selected.length > 1) {
        const yi = DataLoader.yearIndex(year);
        const cols = selected.length <= 2 ? 2 : selected.length <= 4 ? 2 : 3;
        const rows = Math.ceil(selected.length / cols);
        const cellW = Math.floor(_width / cols);
        const cellH = Math.floor(_height / rows);

        selected.forEach((code, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);

            const facetGeo = (geoLevel === 'region' || REGIONS[code]) ? 'region' : 'country';
            const items = DataLoader.getTopItems(code, facetGeo, subKey);
            if (!items || items.length === 0) return;

            const wrapper = document.createElement('div');
            wrapper.style.position = 'absolute';
            wrapper.style.left = (col * cellW) + 'px';
            wrapper.style.top = (row * cellH) + 'px';
            wrapper.style.width = cellW + 'px';
            wrapper.style.height = cellH + 'px';
            wrapper.style.boxSizing = 'border-box';
            wrapper.style.borderRight = col < cols - 1 ? '1px solid #E8E0D4' : 'none';
            wrapper.style.borderBottom = row < rows - 1 ? '1px solid #E8E0D4' : 'none';

            // Facet title
            const title = document.createElement('div');
            const entityName = DataLoader.getCountryName(code) || code;
            title.textContent = entityName;
            title.style.cssText = 'text-align:center;font-size:11px;font-weight:600;color:#7A6A5A;padding:2px 0;height:18px;line-height:18px;';
            wrapper.appendChild(title);

            // Inner chart area
            const inner = document.createElement('div');
            inner.style.position = 'relative';
            inner.style.width = '100%';
            inner.style.height = (cellH - 20) + 'px';
            wrapper.appendChild(inner);
            _chartEl.appendChild(wrapper);

            // Render treemap into inner container. If the item breakdown ends
            // earlier than the total series, fall back to the latest item year.
            const facetYi = _itemYearIndexWithData(items, yi, dataField);
            _renderTreemapInto(inner, items, facetYi, dataField, unit, topN, cellW, cellH - 20);
        });

        const header = document.getElementById('treemap-header');
        if (header) {
            header.textContent = `${selected.length} territorios - ${year} - ${_getActiveIndicatorLabel()}`;
        }
        return;
    }

    // Single country or no selection: show one treemap
    let code;
    if (selected.length > 0) {
        code = selected[0];
    } else {
        code = 'latin_america';
    }

    const effectiveGeo = (code === 'latin_america' || geoLevel === 'region') ? 'region' : 'country';
    const items = DataLoader.getTopItems(code, effectiveGeo, subKey);
    const yi = DataLoader.yearIndex(year);

    if (!items || items.length === 0) {
        const regionItems = DataLoader.getTopItems('latin_america', 'region', subKey);
        if (!regionItems || regionItems.length === 0) {
            _chartEl.innerHTML = '<div style="padding:20px;color:#A89888">Sin datos de composición disponibles</div>';
            return;
        }
        const fallbackYi = _itemYearIndexWithData(regionItems, yi, dataField);
        _renderTreemap(regionItems, fallbackYi, dataField, unit, topN, 'América Latina');
        return;
    }

    const entityName = geoLevel === 'region'
        ? (DataLoader.getCountryName(code) || code)
        : DataLoader.getCountryName(code);

    const effectiveYi = _itemYearIndexWithData(items, yi, dataField);
    const displayYear = _yearFromIndex(effectiveYi, year);
    _renderTreemap(items, effectiveYi, dataField, unit, topN, entityName);

    const header = document.getElementById('treemap-header');
    if (header) {
        header.textContent = `${entityName} - ${displayYear} - ${_getActiveIndicatorLabel()}`;
    }
}

function _renderTreemap(items, yi, dataField, unit, topN, title, directValues = false) {
    // Build hierarchy data
    const children = [];
    // Collect ALL items to compute grand total for "Otros"
    const allValues = [];
    items.forEach((item, i) => {
        let value;
        if (directValues && item._directValue != null) {
            value = item._directValue;
        } else {
            const series = _itemSeries(item, dataField);
            value = series ? series[yi] : null;
        }
        if (value != null && value > 0) {
            allValues.push({ name: item.name, value, idx: i });
        }
    });

    // Take top N and compute "Otros"
    const topItems = allValues.slice(0, topN);
    topItems.forEach((item, i) => {
        children.push({
            name: item.name,
            value: item.value,
            color: CAT_COLORS[i % CAT_COLORS.length],
        });
    });

    const grandTotal = allValues.reduce((s, v) => s + v.value, 0);
    const topTotal = topItems.reduce((s, v) => s + v.value, 0);
    const otrosVal = grandTotal - topTotal;
    if (otrosVal > 0) {
        children.push({ name: 'Otros', value: otrosVal, color: '#C9BDA8' });
    }

    if (children.length === 0) {
        _chartEl.innerHTML = '<div style="padding:20px;color:#A89888">Sin datos para este año</div>';
        return;
    }

    _renderTreemapFromChildren(children, unit);
}

/**
 * Render a treemap from pre-built children array into the main _chartEl.
 */
function _renderTreemapFromChildren(children, unit) {
    if (children.length === 0) {
        _chartEl.innerHTML = '<div style="padding:20px;color:#A89888">Sin datos para este año</div>';
        return;
    }

    // D3 treemap layout
    const root = d3.hierarchy({ children })
        .sum(d => d.value)
        .sort((a, b) => b.value - a.value);

    d3.treemap()
        .size([_width, _height])
        .padding(2)
        .round(true)(root);

    // Render cells
    root.leaves().forEach(leaf => {
        const d = leaf.data;
        const x0 = leaf.x0;
        const y0 = leaf.y0;
        const w = leaf.x1 - leaf.x0;
        const h = leaf.y1 - leaf.y0;

        const cell = document.createElement('div');
        cell.className = 'treemap-cell';
        cell.style.left = x0 + 'px';
        cell.style.top = y0 + 'px';
        cell.style.width = w + 'px';
        cell.style.height = h + 'px';
        cell.style.background = d.color;

        // Label (only if cell is large enough)
        if (w > 40 && h > 24) {
            const label = document.createElement('div');
            label.className = 'treemap-label';
            // Truncate long names for small cells
            const maxChars = Math.max(8, Math.floor(w / 6));
            const displayName = d.name.length > maxChars && w < 120
                ? d.name.substring(0, maxChars) + '-'
                : d.name;
            label.textContent = displayName;
            label.title = d.name;
            cell.appendChild(label);

            if (h > 38) {
                const val = document.createElement('div');
                val.className = 'treemap-value';
                val.textContent = fmtUnit(d.value, unit);
                cell.appendChild(val);
            }
        }

        // Tooltip on hover
        cell.addEventListener('mouseenter', (event) => {
            showTooltip(event, {
                title: d.name,
                value: fmtUnit(d.value, unit),
                sub: `${((d.value / root.value) * 100).toFixed(1)}% del total`,
            });
        });
        cell.addEventListener('mousemove', (event) => showTooltip(event));
        cell.addEventListener('mouseleave', () => hideTooltip());

        _chartEl.appendChild(cell);
    });
}

/**
 * Render a treemap into a specific container element (used for faceted multi-country view).
 */
function _renderTreemapInto(container, items, yi, dataField, unit, topN, w, h) {
    const children = [];
    // Collect ALL item values to compute "Otros"
    const allValues = [];
    items.forEach((item, i) => {
        const series = _itemSeries(item, dataField);
        const value = series ? series[yi] : null;
        if (value != null && value > 0) {
            allValues.push({ name: item.name, value, idx: i });
        }
    });

    const topItems = allValues.slice(0, topN);
    topItems.forEach((item, i) => {
        children.push({
            name: item.name,
            value: item.value,
            color: CAT_COLORS[i % CAT_COLORS.length],
        });
    });

    const grandTotal = allValues.reduce((s, v) => s + v.value, 0);
    const topTotal = topItems.reduce((s, v) => s + v.value, 0);
    const otrosVal = grandTotal - topTotal;
    if (otrosVal > 0) {
        children.push({ name: 'Otros', value: otrosVal, color: '#C9BDA8' });
    }

    if (children.length === 0) {
        container.innerHTML = '<div style="padding:10px;color:#A89888;font-size:11px">Sin datos</div>';
        return;
    }

    const root = d3.hierarchy({ children })
        .sum(d => d.value)
        .sort((a, b) => b.value - a.value);

    d3.treemap()
        .size([w, h])
        .padding(2)
        .round(true)(root);

    root.leaves().forEach(leaf => {
        const d = leaf.data;
        const x0 = leaf.x0;
        const y0 = leaf.y0;
        const cw = leaf.x1 - leaf.x0;
        const ch = leaf.y1 - leaf.y0;

        const cell = document.createElement('div');
        cell.className = 'treemap-cell';
        cell.style.left = x0 + 'px';
        cell.style.top = y0 + 'px';
        cell.style.width = cw + 'px';
        cell.style.height = ch + 'px';
        cell.style.background = d.color;

        if (cw > 36 && ch > 20) {
            const label = document.createElement('div');
            label.className = 'treemap-label';
            const maxChars = Math.max(6, Math.floor(cw / 7));
            const displayName = d.name.length > maxChars && cw < 100
                ? d.name.substring(0, maxChars) + '\u2026'
                : d.name;
            label.textContent = displayName;
            label.title = d.name;
            cell.appendChild(label);

            if (ch > 34) {
                const val = document.createElement('div');
                val.className = 'treemap-value';
                val.textContent = fmtUnit(d.value, unit);
                cell.appendChild(val);
            }
        }

        cell.addEventListener('mouseenter', (event) => {
            showTooltip(event, {
                title: d.name,
                value: fmtUnit(d.value, unit),
                sub: `${((d.value / root.value) * 100).toFixed(1)}% del total`,
            });
        });
        cell.addEventListener('mousemove', (event) => showTooltip(event));
        cell.addEventListener('mouseleave', () => hideTooltip());

        container.appendChild(cell);
    });
}

function _getDataField() {
    const meta = DataLoader.getMetadata();
    const cat = meta.categories.find(c => c.id === State.get('activeCategory'));
    if (!cat) return 'production';
    for (const group of (cat.indicatorGroups || [])) {
        for (const ind of group.indicators) {
            if (ind.id === State.get('activeIndicator')) return ind.dataField;
        }
    }
    return 'production';
}

function _getUnit() {
    const meta = DataLoader.getMetadata();
    const cat = meta.categories.find(c => c.id === State.get('activeCategory'));
    if (!cat) return '';
    for (const group of (cat.indicatorGroups || [])) {
        for (const ind of group.indicators) {
            if (ind.id === State.get('activeIndicator')) return ind.unit;
        }
    }
    return '';
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





