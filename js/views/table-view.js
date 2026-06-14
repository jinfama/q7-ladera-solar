/* table-view.js - Sortable data table */

import State from '../state.js?v=20260522-mobile-ui18';
import DataLoader from '../data-loader.js?v=20260522-mobile-ui18';
import { fmtUnit } from '../utils.js?v=20260522-mobile-ui18';

let _container;
let _sortCol = 'value';
let _sortAsc = false;

export function initTableView() {
    _container = document.getElementById('table-container');
}

export function updateTableView() {
    if (!_container || State.get('activeView') !== 'table') return;
    _container.innerHTML = '';

    const year = State.get('currentYear');
    const geoLevel = State.get('geoLevel');
    const dataField = _getDataField();
    const unit = _getUnit();
    const indicatorLabel = _getActiveIndicatorLabel();

    let ranking;
    const selected = State.get('selectedCountries');
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

    // Sort
    const sorted = [...ranking].sort((a, b) => {
        let cmp;
        if (_sortCol === 'name') cmp = a.name.localeCompare(b.name);
        else if (_sortCol === 'rank') cmp = a.rank - b.rank;
        else cmp = (a.value || 0) - (b.value || 0);
        return _sortAsc ? cmp : -cmp;
    });

    const table = document.createElement('table');
    table.className = 'data-table';

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const nameLabel = geoLevel === 'subnational' ? 'Provincia / Estado'
        : geoLevel === 'region' ? 'Región' : 'País';
    const columns = [
        { id: 'rank', label: '#' },
        { id: 'name', label: nameLabel },
        { id: 'value', label: `${indicatorLabel} (${unit})` },
    ];

    columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col.label;
        th.style.cursor = 'pointer';
        if (_sortCol === col.id) {
            th.textContent += _sortAsc ? ' ▲' : ' ▼';
        }
        th.addEventListener('click', () => {
            if (_sortCol === col.id) _sortAsc = !_sortAsc;
            else { _sortCol = col.id; _sortAsc = col.id === 'name'; }
            updateTableView();
        });
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');

    sorted.forEach(entry => {
        const tr = document.createElement('tr');
        const isSelected = selected.includes(entry.code);
        if (isSelected) tr.style.fontWeight = '600';

        tr.innerHTML = `
            <td style="width:40px;text-align:right;color:#A89888">${entry.rank}</td>
            <td style="${isSelected ? 'color:#C4913E' : ''}">${entry.name}</td>
            <td style="text-align:right">${fmtUnit(entry.value, unit)}</td>
        `;

        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => State.toggleCountry(entry.code));
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    _container.appendChild(table);
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





