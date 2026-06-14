/* ranking-view.js - Horizontal bar chart ranking countries OR items */

import State from '../state.js?v=20260522-mobile-ui18';
import DataLoader from '../data-loader.js?v=20260522-mobile-ui18';
import { SEQ_COLORS, CAT_COLORS, fmt, fmtUnit } from '../utils.js?v=20260522-mobile-ui18';
import { showTooltip, hideTooltip } from '../components/tooltip.js';

let _container;

export function initRankingView() {
    _container = document.getElementById('ranking-container');
}

export function updateRankingView() {
    if (!_container || State.get('activeView') !== 'ranking') return;
    _container.innerHTML = '';

    const year = State.get('currentYear');
    const geoLevel = State.get('geoLevel');
    const dataField = _getDataField();
    const unit = _getUnit();
    const topN = State.get('rankingTopN');
    const selected = State.get('selectedCountries');
    const rankingMode = State.get('rankingMode') || 'byCountry';

    // Determine which ranking mode to use
    const catId = State.get('activeCategory');
    const hasItems = ['agriculture', 'trade', 'livestock', 'labor'].includes(catId);

    if (rankingMode === 'byProduct' && hasItems) {
        _renderItemRanking(year, dataField, unit, topN, geoLevel, selected);
    } else {
        _renderEntityRanking(year, dataField, unit, topN, geoLevel, selected);
    }
}

/** -- Mode 1: Rank entities (countries/regions/admin1) by a single indicator -- */
function _renderEntityRanking(year, dataField, unit, topN, geoLevel, selected) {
    let ranking;
    if (geoLevel === 'subnational') {
        const activeIso = selected.length > 0 ? selected[0] : null;
        ranking = DataLoader.getSubnationalRanking(year, dataField, activeIso);
    } else {
        ranking = DataLoader.getRanking(year, dataField, geoLevel);
    }

    if (ranking.length === 0) {
        _container.innerHTML = '<div style="padding:20px;color:#A89888">Sin datos para este año</div>';
        return;
    }

    const maxVal = ranking[0].value;
    const displayRanking = ranking.slice(0, topN);

    // Title
    const title = document.createElement('div');
    title.style.cssText = 'font-size:12px;font-weight:600;color:#7A6A5A;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px';
    const levelLabel = geoLevel === 'subnational'
        ? (selected.length > 0 ? DataLoader.getCountryName(selected[0]) + ' - subnacional' : 'Subnacional')
        : '';
    title.textContent = `${_getActiveIndicatorLabel()} ${levelLabel ? '(' + levelLabel + ')' : ''} - ${year}`;
    _container.appendChild(title);

    displayRanking.forEach((entry, i) => {
        const row = document.createElement('div');
        row.className = 'ranking-bar-row';

        const pct = maxVal > 0 ? (entry.value / maxVal) * 100 : 0;
        const colorIdx = Math.min(Math.floor(pct / 12), SEQ_COLORS.length - 1);
        const color = SEQ_COLORS[Math.max(2, colorIdx)];
        const isSelected = selected.includes(entry.code) || (entry.iso3 && selected.includes(entry.iso3));

        row.innerHTML = `
            <span class="ranking-rank">${entry.rank}</span>
            <span class="ranking-name" style="${isSelected ? 'font-weight:700;color:#C4913E' : ''}">${entry.name}</span>
            <div class="ranking-bar-track">
                <div class="ranking-bar-fill" style="width:${pct}%;background:${color}"></div>
                <span class="ranking-bar-value">${fmtUnit(entry.value, unit)}</span>
            </div>
        `;

        if (geoLevel !== 'subnational') {
            row.style.cursor = 'pointer';
            row.addEventListener('click', () => State.toggleCountry(entry.code));
        }
        row.addEventListener('mousemove', event => {
            showTooltip(event, {
                title: `${entry.name} · ${year}`,
                value: `<b>${fmtUnit(entry.value, unit)}</b>`,
                sub: _getActiveIndicatorLabel(),
            });
        });
        row.addEventListener('mouseleave', () => hideTooltip());

        _container.appendChild(row);
    });
}

/** -- Mode 2: Rank items (products/species) within selected entities -- */
function _renderItemRanking(year, dataField, unit, topN, geoLevel, selected) {
    // If no selection, show for entire LATAM region
    const effectiveCodes = selected.length > 0 ? selected : ['latin_america'];
    const effectiveGeo = selected.length > 0 ? geoLevel : 'region';

    // If multiple countries selected, show side-by-side per country
    effectiveCodes.forEach((code, cIdx) => {
        const ranking = DataLoader.getItemRanking(code, year, dataField, effectiveGeo === 'region' ? 'region' : 'country');

        if (ranking.length === 0) return;

        const displayRanking = ranking.slice(0, topN);
        const maxVal = displayRanking[0]?.value || 1;

        // Title per entity
        const title = document.createElement('div');
        title.style.cssText = 'font-size:12px;font-weight:600;color:#7A6A5A;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px';
        if (effectiveCodes.length > 1 && cIdx > 0) title.style.marginTop = '16px';
        const entityName = DataLoader.getCountryName(code);
        title.textContent = `${entityName} - ${_getActiveIndicatorLabel()} - ${year}`;
        _container.appendChild(title);

        displayRanking.forEach((entry, i) => {
            const row = document.createElement('div');
            row.className = 'ranking-bar-row';

            const pct = maxVal > 0 ? (entry.value / maxVal) * 100 : 0;
            const color = CAT_COLORS[i % CAT_COLORS.length];

            row.innerHTML = `
                <span class="ranking-rank">${entry.rank}</span>
                <span class="ranking-name">${entry.name}</span>
                <div class="ranking-bar-track">
                    <div class="ranking-bar-fill" style="width:${pct}%;background:${color}"></div>
                    <span class="ranking-bar-value">${fmtUnit(entry.value, unit)}</span>
                </div>
            `;
            row.addEventListener('mousemove', event => {
                showTooltip(event, {
                    title: `${entry.name} · ${year}`,
                    value: `<b>${fmtUnit(entry.value, unit)}</b>`,
                    sub: DataLoader.getCountryName(code),
                });
            });
            row.addEventListener('mouseleave', () => hideTooltip());

            _container.appendChild(row);
        });
    });

    if (_container.children.length === 0) {
        _container.innerHTML = '<div style="padding:20px;color:#A89888">Sin datos de productos para esta selección</div>';
    }
}

function _getDataField() {
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

function _getUnit() {
    const mode = State.get('axisMode');
    if (mode === 'index') return 'index100';
    if (mode === 'pct_total' || mode === 'pct_territory') return '%';

    const activeUnit = State.get('activeUnit');
    const meta = DataLoader.getMetadata();
    const cat = meta.categories.find(c => c.id === State.get('activeCategory'));
    if (!cat) return '';
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





