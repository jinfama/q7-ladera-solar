/* trend-view.js - Multi-line time series chart with facet support */

import State from '../state.js?v=20260522-mobile-ui18';
import DataLoader from '../data-loader.js?v=20260522-mobile-ui18';
import { CAT_COLORS, REGIONS, fmt, fmtUnit, smartXTicks, shortItemLabel, shortEntityLabel } from '../utils.js?v=20260522-mobile-ui18';
import { showTooltip, hideTooltip } from '../components/tooltip.js';

let _svg, _width, _height;
const MARGIN = { top: 34, right: 46, bottom: 42, left: 65 };
const FACET_MARGIN = { top: 30, right: 16, bottom: 30, left: 56 };
const SERIES_LABEL_GAP = 13;
const OBSERVED_DOT_MAX_SHARE = 0.45;
let _ro;
let _scheduledUpdate = null;

export function initTrendView() {
    _svg = d3.select('#trend-svg');

    const container = document.getElementById('trend-chart-container');
    _ro = new ResizeObserver(() => {
        _resize();
        const panel = document.getElementById('panel-trend');
        const visible = State.get('activeView') === 'trend'
            || (panel && panel.classList.contains('active-pair'));
        if (visible) updateTrendView();
    });
    _ro.observe(container);

    State.subscribe('selectedCountries', _scheduleVisibleTrendUpdate);
    State.subscribe('selectedPartners', _scheduleVisibleTrendUpdate);
    State.subscribe('geoLevel', _scheduleVisibleTrendUpdate);
    State.subscribe('trendMA', _scheduleVisibleTrendUpdate);
    State.subscribe('trendShowLine', _scheduleVisibleTrendUpdate);
    State.subscribe('trendShowBreaks', _scheduleVisibleTrendUpdate);
}

function _isTrendVisible() {
    const panel = document.getElementById('panel-trend');
    return State.get('activeView') === 'trend'
        || (panel && panel.classList.contains('active-pair'));
}

function _trendYearRange() {
    const range = State.get('yearRange') || [];
    if (State.get('compareMode')) {
        const start = Number(State.get('startYear'));
        const end = Number(State.get('currentYear'));
        if (Number.isFinite(start) && Number.isFinite(end) && start !== end) {
            return [Math.min(start, end), Math.max(start, end)];
        }
    }
    return range;
}

function _scheduleVisibleTrendUpdate() {
    if (!_isTrendVisible()) return;
    if (_scheduledUpdate != null) cancelAnimationFrame(_scheduledUpdate);
    _scheduledUpdate = requestAnimationFrame(() => {
        _scheduledUpdate = null;
        _resize();
        updateTrendView();
    });
}

function _resize() {
    const container = document.getElementById('trend-chart-container');
    if (!container) return;
    _width = container.clientWidth;
    _height = container.clientHeight;
    // Don't set viewBox here for facets - we may need to expand
}

export function updateTrendView() {
    _resize();
    if (!_svg || !_width || !_height) return;

    if (_isBilateralIndicator()) {
        _renderBilateralOverlay();
        return;
    }

    const layout = State.get('chartLayout') || 'overlay';
    const chartType = State.get('chartType') || 'lines';

    if (chartType === 'stacked') {
        if (layout === 'facet-country') {
            _renderStackedFacetByCountry();
        } else if (layout === 'facet-product') {
            _renderStackedFacetByProduct();
        } else {
            _renderStacked();
        }
    } else {
        if (layout === 'facet-country') {
            _renderFacetByCountry();
        } else if (layout === 'facet-product') {
            _renderFacetByProduct();
        } else {
            _renderOverlay();
        }
    }
}

/* -------------------------------------------
   Gap detection: break lines at gaps > 2 years
   ------------------------------------------- */
function splitSegments(data) {
    const valid = data.filter(d => d.value != null);
    if (valid.length === 0) return [];
    const segs = [[valid[0]]];
    for (let i = 1; i < valid.length; i++) {
        if (valid[i].year - valid[i - 1].year > 2) {
            segs.push([valid[i]]);
        } else {
            segs[segs.length - 1].push(valid[i]);
        }
    }
    return segs;
}

function _trendMAWindow() {
    const value = State.get('trendMA');
    const n = Number(value);
    return Number.isFinite(n) && n >= 2 ? n : 0;
}

function _movingAverageData(data, windowSize) {
    const w = Number(windowSize);
    if (!Number.isFinite(w) || w < 2) return data;
    const half = Math.floor(w / 2);
    return data.map((d, i) => {
        const slice = data
            .slice(Math.max(0, i - half), Math.min(data.length, i + half + 1))
            .filter(p => p?.value != null && Number.isFinite(p.value));
        return {
            ...d,
            value: slice.length ? d3.mean(slice, p => p.value) : null,
        };
    });
}

function _applyTrendMovingAverage(series) {
    const windowSize = _trendMAWindow();
    if (!windowSize) return series;
    return (series || []).map(s => ({
        ...s,
        rawData: s.data,
        data: _movingAverageData(s.data || [], windowSize),
    }));
}

function _validTrendPoints(data) {
    return (data || [])
        .filter(d => d?.value != null && Number.isFinite(d.value) && Number.isFinite(d.year))
        .sort((a, b) => a.year - b.year);
}

function _linearRegression(data) {
    const pts = _validTrendPoints(data);
    if (pts.length < 3) return null;
    const n = pts.length;
    const sumX = d3.sum(pts, d => d.year);
    const sumY = d3.sum(pts, d => d.value);
    const sumXY = d3.sum(pts, d => d.year * d.value);
    const sumX2 = d3.sum(pts, d => d.year * d.year);
    const denom = n * sumX2 - sumX * sumX;
    if (!denom) return null;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept, x1: pts[0].year, x2: pts[pts.length - 1].year };
}

function _structuralBreakCandidates(data) {
    const pts = _validTrendPoints(data).filter(d => d.value !== 0);
    if (pts.length < 10) return [];
    const changes = [];
    for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const cur = pts[i];
        if (!prev.value) continue;
        const pct = (cur.value / prev.value - 1) * 100;
        if (Number.isFinite(pct)) {
            changes.push({ year: cur.year, pct, value: cur.value, abs: Math.abs(pct) });
        }
    }
    if (!changes.length) return [];
    const mean = d3.mean(changes, d => d.abs) || 0;
    const sd = d3.deviation(changes, d => d.abs) || 0;
    const picked = [];
    changes
        .filter(d => d.abs > mean + 1.5 * sd)
        .sort((a, b) => b.abs - a.abs)
        .forEach(d => {
            if (picked.length < 3 && !picked.some(p => Math.abs(p.year - d.year) < 8)) picked.push(d);
        });
    return picked.sort((a, b) => a.year - b.year);
}

function _safeY(y, value) {
    if (!Number.isFinite(value)) return null;
    if (State.get('scaleType') === 'log' && value <= 0) return null;
    const pos = y(value);
    return Number.isFinite(pos) ? pos : null;
}

function _drawTrendAnalysis(g, series, x, y, w, h, opts = {}) {
    const showLine = !!State.get('trendShowLine');
    const showBreaks = !!State.get('trendShowBreaks');
    if (!showLine && !showBreaks) return;

    const seriesList = series || [];
    const compact = !!opts.compact || w < 260;
    const maxBreaks = opts.maxBreaks ?? (compact ? 1 : (seriesList.length > 3 ? 1 : 2));
    let annotationIndex = 0;

    seriesList.forEach((s, idx) => {
        const valid = _validTrendPoints(s.data);
        if (valid.length < 3) return;

        if (showLine) {
            const reg = _linearRegression(valid);
            if (reg) {
                const y1 = _safeY(y, reg.slope * reg.x1 + reg.intercept);
                const y2 = _safeY(y, reg.slope * reg.x2 + reg.intercept);
                if (y1 != null && y2 != null) {
                    g.append('line')
                        .attr('class', 'trend-analysis-line')
                        .attr('x1', x(reg.x1))
                        .attr('x2', x(reg.x2))
                        .attr('y1', y1)
                        .attr('y2', y2)
                        .attr('stroke', s.color)
                        .attr('stroke-width', compact ? 1.3 : 1.8)
                        .attr('stroke-dasharray', '5,4')
                        .attr('stroke-linecap', 'round')
                        .attr('opacity', 0.68);
                }
            }
        }

        if (showBreaks) {
            _structuralBreakCandidates(valid).slice(0, maxBreaks).forEach(d => {
                const xPos = x(d.year);
                const yPos = _safeY(y, d.value);
                if (!Number.isFinite(xPos) || yPos == null) return;

                g.append('line')
                    .attr('class', 'trend-analysis-break-line')
                    .attr('x1', xPos)
                    .attr('x2', xPos)
                    .attr('y1', 0)
                    .attr('y2', h)
                    .attr('stroke', s.color)
                    .attr('stroke-width', compact ? 0.8 : 1)
                    .attr('stroke-dasharray', '3,3')
                    .attr('opacity', seriesList.length > 4 ? 0.32 : 0.48);

                const label = compact
                    ? `ÏŸ ${d.year}`
                    : `ÏŸ ${d.year} ${d.pct > 0 ? '+' : ''}${d.pct.toFixed(1)}%`;
                const labelY = 12 + ((annotationIndex + idx) % (compact ? 2 : 4)) * 13;
                annotationIndex += 1;
                g.append('text')
                    .attr('class', 'trend-analysis-label')
                    .attr('x', Math.min(w - 34, Math.max(34, xPos)))
                    .attr('y', labelY)
                    .attr('text-anchor', 'middle')
                    .attr('fill', s.color)
                    .text(label);
            });
        }
    });
}

function _rightLabelMargin() {
    return Math.max(88, Math.min(132, Math.round((_width || 1000) * 0.12)));
}

function _displaySeriesName(name = '') {
    return String(name || '')
        .split(/\s*-\s*/)
        .map(part => shortEntityLabel(shortItemLabel(part.trim())))
        .join(' - ');
}

function _layoutSeriesLabels(labels, h) {
    const items = labels
        .map(label => ({ ...label, labelY: Math.max(0, Math.min(h, label.y)) }))
        .sort((a, b) => a.labelY - b.labelY);
    if (items.length === 0) return items;

    let gap = items.length > 14 ? 10 : SERIES_LABEL_GAP;
    if (items.length > 1 && gap * (items.length - 1) > h) {
        gap = h / (items.length - 1);
    }
    for (let i = 1; i < items.length; i++) {
        items[i].labelY = Math.max(items[i].labelY, items[i - 1].labelY + gap);
    }

    const overflow = items[items.length - 1].labelY - h;
    if (overflow > 0) {
        items.forEach(item => { item.labelY -= overflow; });
    }

    items[0].labelY = Math.max(0, items[0].labelY);
    for (let i = 1; i < items.length; i++) {
        items[i].labelY = Math.max(items[i].labelY, items[i - 1].labelY + gap);
    }
    return items;
}

function _drawSeriesLabels(g, labels, w, h) {
    if (!labels.length) return;
    const laidOut = _layoutSeriesLabels(labels, h);
    laidOut.forEach(item => {
        const text = _displaySeriesName(item.text);
        const label = text.length > 17 ? text.slice(0, 16) + '\u2026' : text;
        const labelX = item.x > w - 18 ? w + 8 : item.x + 8;
        const labelY = item.labelY;

        g.append('line')
            .attr('class', 'series-label-connector')
            .attr('x1', item.x + 4)
            .attr('y1', item.y)
            .attr('x2', labelX - 3)
            .attr('y2', labelY)
            .attr('stroke', item.color)
            .attr('stroke-width', 0.8)
            .attr('stroke-opacity', 0.35);

        g.append('text')
            .attr('class', 'series-label-halo')
            .attr('x', labelX)
            .attr('y', labelY)
            .attr('dy', '0.35em')
            .attr('font-size', '11px')
            .attr('font-weight', '600')
            .attr('text-anchor', 'start')
            .attr('stroke', '#F5F0E6')
            .attr('stroke-width', 3)
            .attr('stroke-linejoin', 'round')
            .text(label);
        g.append('text')
            .attr('class', 'series-label-text')
            .attr('x', labelX)
            .attr('y', labelY)
            .attr('dy', '0.35em')
            .attr('font-size', '11px')
            .attr('fill', item.color)
            .attr('font-weight', '600')
            .attr('text-anchor', 'start')
            .text(label);
    });
}

function _truncateAxisTitle(text) {
    const value = String(text || '').trim();
    const max = window.innerWidth <= 760 ? 34 : 52;
    return value.length > max ? value.slice(0, max - 1) + '\u2026' : value;
}

function _drawYAxisTitle(g, text) {
    if (!text) return;
    g.append('text')
        .attr('class', 'trend-y-title')
        .attr('x', 0)
        .attr('y', -8)
        .attr('text-anchor', 'start')
        .attr('font-size', '12px')
        .attr('font-weight', '700')
        .attr('fill', '#7A6A5A')
        .text(_truncateAxisTitle(text));
}

function _styleXAxisTickLabels(axisG, fontSize = '12px', fill = '#7A6A5A') {
    const labels = axisG.selectAll('text')
        .style('font-size', fontSize)
        .style('fill', fill);
    const nodes = labels.nodes();
    if (nodes.length <= 1) return;
    d3.select(nodes[0]).attr('text-anchor', 'start').attr('dx', '0.15em');
    d3.select(nodes[nodes.length - 1]).attr('text-anchor', 'end').attr('dx', '-0.15em');
}

function _drawPlotBounds(g, w, h) {
    g.append('g')
        .attr('class', 'plot-bounds')
        .selectAll('line')
        .data([0, h])
        .enter()
        .append('line')
        .attr('x1', 0)
        .attr('x2', w)
        .attr('y1', d => d)
        .attr('y2', d => d)
        .attr('stroke', '#C9BDA8')
        .attr('stroke-width', 0.75)
        .attr('opacity', 0.72);
}

function _formatYAxisTick(value, unit) {
    if (!Number.isFinite(value)) return '';
    const abs = Math.abs(value);
    const unitText = String(unit || '').toLowerCase();
    if (abs > 0 && abs < 10) {
        const decimals = unitText.includes('índice') || unitText.includes('indice') ? 2 : 1;
        return d3.format(`.${decimals}f`)(value).replace(/\.?0+$/, '');
    }
    return fmt(value);
}

function _stackedYScale(yMax, h) {
    if (State.get('scaleType') === 'log' && yMax > 1) {
        return d3.scaleLog()
            .domain([1, Math.max(1.1, yMax * 1.05)])
            .range([h, 0])
            .clamp(true);
    }
    return d3.scaleLinear().domain([0, yMax * 1.05]).range([h, 0]).nice();
}

function _facetYIsFree() {
    return (State.get('facetYMode') || 'shared') === 'free';
}

function _lineYScale(data, h) {
    const vals = (data || [])
        .map(d => Number(d?.value))
        .filter(v => Number.isFinite(v));
    if (vals.length === 0) {
        return d3.scaleLinear().domain([0, 1]).range([h, 0]);
    }

    const vMin = d3.min(vals);
    const vMax = d3.max(vals);
    if (State.get('scaleType') === 'log') {
        const positives = vals.filter(v => v > 0);
        if (positives.length === 0) {
            return d3.scaleLinear().domain([0, 1]).range([h, 0]);
        }
        const minPos = Math.max(1, d3.min(positives) || 1);
        const maxPos = Math.max(minPos * 1.1, d3.max(positives) || minPos);
        return d3.scaleLog().domain([minPos, maxPos]).range([h, 0]).clamp(true);
    }

    const span = Math.max((vMax ?? 1) - (vMin ?? 0), Math.abs(vMax ?? 1) * 0.03, 0.01);
    const yPad = span * 0.1;
    const yBase = _usesTightYDomain()
        ? Math.max(0, (vMin ?? 0) - yPad)
        : Math.min(0, vMin ?? 0);
    const yTop = (vMax ?? 1) + yPad;
    return d3.scaleLinear().domain([yBase, yTop <= yBase ? yBase + 1 : yTop]).range([h, 0]).nice();
}

function _stackedYValue(y, value, h) {
    if (State.get('scaleType') === 'log' && value <= 0) return h;
    return y(value);
}

function _xDomainForRange(yearRange, data) {
    // First figure out where the data actually has values - indicators with
    // leading nulls (e.g. labour starts in 1961) shouldn't render the empty
    // years before the first real datapoint.
    const validData = (data || []).filter(d => d && d.value != null && Number.isFinite(d.value));
    const dataExtent = d3.extent(validData, d => d.year);

    if (Array.isArray(yearRange) && yearRange.length >= 2) {
        const start = Number(yearRange[0]);
        const end = Number(yearRange[1]);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            // Intersect the user's selected range with the data's true extent
            // so a global 1900-2024 timeline doesn't leave an empty strip on
            // the left when the indicator (labour, etc.) only starts later.
            const dataStart = Number.isFinite(dataExtent?.[0]) ? dataExtent[0] : start;
            return [Math.max(start, dataStart), end];
        }
    }
    if (Number.isFinite(dataExtent?.[0]) && Number.isFinite(dataExtent?.[1]) && dataExtent[1] > dataExtent[0]) return dataExtent;
    const fallback = d3.extent(data || [], d => d.year);
    if (Number.isFinite(fallback?.[0]) && Number.isFinite(fallback?.[1]) && fallback[1] > fallback[0]) return fallback;
    const year = Number(fallback?.[0]);
    return Number.isFinite(year) ? [year - 1, year + 1] : [1900, 2024];
}

function _nearestPoint(data, targetYear) {
    const valid = (data || []).filter(d => d && d.value != null && Number.isFinite(d.value) && Number.isFinite(d.year));
    if (valid.length === 0) return null;
    return valid.reduce((best, d) => {
        if (!best) return d;
        const dist = Math.abs(d.year - targetYear);
        const bestDist = Math.abs(best.year - targetYear);
        return dist < bestDist || (dist === bestDist && d.year > best.year) ? d : best;
    }, null);
}

function _nearestAvailableYear(seriesList, targetYear) {
    const years = (seriesList || [])
        .flatMap(s => (s.data || []).map(d => d?.year))
        .filter(year => Number.isFinite(year));
    if (years.length === 0) return targetYear;
    return years.reduce((best, year) => {
        const dist = Math.abs(year - targetYear);
        const bestDist = Math.abs(best - targetYear);
        return dist < bestDist || (dist === bestDist && year > best) ? year : best;
    }, years[0]);
}

function _nearestRow(rows, targetYear) {
    const valid = (rows || []).filter(row => row && Number.isFinite(row.year));
    if (valid.length === 0) return null;
    return valid.reduce((best, row) => {
        const dist = Math.abs(row.year - targetYear);
        const bestDist = Math.abs(best.year - targetYear);
        return dist < bestDist || (dist === bestDist && row.year > best.year) ? row : best;
    }, valid[0]);
}

function _attachLineHover(g, seriesList, x, y, w, h, unit, titleForYear) {
    if (!Array.isArray(seriesList) || seriesList.length === 0) return;

    const overlay = g.append('rect')
        .attr('width', w)
        .attr('height', h)
        .attr('fill', 'transparent')
        .attr('cursor', 'crosshair');

    const hoverG = g.append('g').style('display', 'none');
    const hoverLine = hoverG.append('line')
        .attr('y1', 0).attr('y2', h)
        .attr('stroke', '#1A120B')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,2')
        .attr('opacity', 0.5);

    const hoverDots = seriesList.map(s =>
        hoverG.append('circle')
            .attr('r', 3.5)
            .attr('fill', s.color)
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .attr('stroke-opacity', 0.85)
            .style('display', 'none')
    );

    overlay
        .on('mousemove', (event) => {
            const [mx] = d3.pointer(event);
            const rawYear = Math.round(x.invert(Math.max(0, Math.min(w, mx))));
            const hoverYear = _nearestAvailableYear(seriesList, rawYear);
            hoverG.style('display', null);
            hoverLine.attr('x1', x(hoverYear)).attr('x2', x(hoverYear));

            const entries = [];
            seriesList.forEach((s, i) => {
                const d = _nearestPoint(s.data, hoverYear);
                if (d && d.value != null) {
                    hoverDots[i]
                        .attr('cx', x(d.year))
                        .attr('cy', y(d.value))
                        .style('display', null);
                    const yearNote = d.year !== hoverYear ? ` (${d.year})` : '';
                    entries.push(`<span style="color:${s.color}">-</span> ${s.name}${yearNote}: <b>${fmtUnit(d.value, unit)}</b>`);
                } else {
                    hoverDots[i].style('display', 'none');
                }
            });

            if (entries.length) {
                showTooltip(event, {
                    title: titleForYear ? titleForYear(hoverYear) : `${_getActiveIndicatorLabel()} - ${hoverYear}`,
                    value: entries.join('<br>'),
                });
            }
        })
        .on('mouseleave', () => {
            hoverG.style('display', 'none');
            hideTooltip();
        });
}

function _attachStackedHover(g, seriesList, stacked, dataByYear, x, y, w, h, unit, titleForYear) {
    if (!Array.isArray(seriesList) || !Array.isArray(stacked) || !Array.isArray(dataByYear)) return;

    const overlay = g.append('rect')
        .attr('width', w)
        .attr('height', h)
        .attr('fill', 'transparent')
        .attr('cursor', 'crosshair');

    const hoverG = g.append('g').style('display', 'none');
    const hoverLine = hoverG.append('line')
        .attr('y1', 0).attr('y2', h)
        .attr('stroke', '#1A120B')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,2')
        .attr('opacity', 0.5);

    const hoverDots = seriesList.map(s =>
        hoverG.append('circle')
            .attr('r', 3.5)
            .attr('fill', s.color)
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .attr('stroke-opacity', 0.85)
            .style('display', 'none')
    );

    overlay
        .on('mousemove', event => {
            const [mx] = d3.pointer(event);
            const rawYear = Math.round(x.invert(Math.max(0, Math.min(w, mx))));
            const row = _nearestRow(dataByYear, rawYear);
            if (!row) return;
            const year = row.year;
            hoverG.style('display', null);
            hoverLine.attr('x1', x(year)).attr('x2', x(year));

            const entries = [];
            stacked.forEach((layer, i) => {
                const pt = layer.find(d => d.data.year === year);
                const val = row[seriesList[i]?.code];
                if (pt && val != null) {
                    hoverDots[i]
                        .attr('cx', x(year))
                        .attr('cy', y(pt[1]))
                        .style('display', null);
                    entries.push(`<span style="color:${seriesList[i].color}">-</span> ${seriesList[i].name}: ${fmtUnit(val, unit)}`);
                } else {
                    hoverDots[i].style('display', 'none');
                }
            });
            const total = seriesList.reduce((sum, s) => sum + (row[s.code] || 0), 0);
            entries.push(`Total: ${fmtUnit(total, unit)}`);
            showTooltip(event, {
                title: titleForYear ? titleForYear(year) : `${_getActiveIndicatorLabel()} - ${year}`,
                value: entries.join('<br>'),
            });
        })
        .on('mouseleave', () => {
            hoverG.style('display', 'none');
            hideTooltip();
        });
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

function _selectedProductItems(topItems) {
    const names = _selectedProductNames();
    if (names.length === 0) return topItems;
    return names.map(name => {
        const found = topItems.find(item => item.name === name || item.code === name);
        return found || { code: name, name, value: null };
    });
}

function _drawMiniLegend(g, series, w, maxRows = 4) {
    if (!Array.isArray(series) || series.length <= 1) return;
    const rows = series.slice(0, maxRows);
    const legend = g.append('g')
        .attr('class', 'mini-legend mini-legend-top-left')
        .attr('transform', 'translate(8, 14)')
        .attr('pointer-events', 'none');
    const legendH = rows.length * 12 + (series.length > maxRows ? 13 : 2);
    legend.append('rect')
        .attr('x', -4)
        .attr('y', -10)
        .attr('width', 92)
        .attr('height', legendH + 10)
        .attr('fill', '#F5F0E6')
        .attr('fill-opacity', 0.80)
        .attr('stroke', '#E3D8C7')
        .attr('stroke-width', 0.5);
    rows.forEach((s, i) => {
        const row = legend.append('g').attr('transform', `translate(0, ${i * 12})`);
        row.append('line')
            .attr('x1', 0).attr('x2', 12)
            .attr('y1', 0).attr('y2', 0)
            .attr('stroke', s.color)
            .attr('stroke-width', 2);
        row.append('text')
            .attr('x', 17)
            .attr('y', 3)
            .attr('font-size', '9px')
            .attr('fill', '#7A6A5A')
            .text(_truncateFacetLabel(s.name, 13));
    });
    if (series.length > maxRows) {
        legend.append('text')
            .attr('x', 17)
            .attr('y', rows.length * 12 + 3)
            .attr('font-size', '9px')
            .attr('fill', '#A89888')
            .text(`+${series.length - maxRows}`);
    }
}

function _isBilateralIndicator() {
    return State.get('activeIndicator')?.startsWith('bilateral_');
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

function _bilateralPartnerRanking(code, geo, element, productNames, yearIdx) {
    const values = new Map();
    const addPartners = partners => {
        Object.entries(partners || {}).forEach(([name, series]) => {
            if (name === 'Resto' || !Array.isArray(series)) return;
            const value = yearIdx >= 0 ? series[yearIdx] : null;
            if (value != null && Number.isFinite(value) && value > 0) {
                values.set(name, (values.get(name) || 0) + value);
            }
        });
    };

    if (productNames.length > 0) {
        productNames.forEach(product => {
            addPartners(DataLoader.getBilateralItemPartners(code, element, product, geo) || {});
        });
    } else {
        addPartners(DataLoader.getBilateralPartners(code, element, geo) || {});
    }

    return [...values.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

function _bilateralSeriesData(partnerName, code, geo, element, productName, years, yearRange) {
    let raw;
    if (productName) {
        raw = DataLoader.getBilateralItemPartners(code, element, productName, geo)?.[partnerName];
    } else {
        raw = DataLoader.getBilateralPartners(code, element, geo)?.[partnerName];
    }
    if (!Array.isArray(raw)) return [];
    return years.map((year, i) => ({ year, value: raw[i] }))
        .filter(d => d.year >= yearRange[0] && d.year <= yearRange[1])
        .filter(d => d.value != null && Number.isFinite(d.value) && d.value > 0);
}

function _buildBilateralTrendSeries() {
    const { code, geo } = _bilateralContext();
    const element = _bilateralElement();
    const years = DataLoader.getBilateralYears?.() || [];
    const yearRange = _trendYearRange() || [years[0], years[years.length - 1]];
    const currentYear = State.get('currentYear');
    const yearIdx = years.indexOf(Math.max(years[0], Math.min(years[years.length - 1], currentYear)));
    const productNames = _selectedProductNames();
    const selectedPartners = _selectedPartnerNames();
    const topPartners = selectedPartners.length > 0
        ? selectedPartners
        : _bilateralPartnerRanking(code, geo, element, productNames, yearIdx)
            .slice(0, 5)
            .map(d => d.name);

    const series = [];
    topPartners.forEach((partnerName, partnerIdx) => {
        const products = productNames.length > 0 ? productNames : [null];
        products.forEach((productName, productIdx) => {
            const data = _bilateralSeriesData(partnerName, code, geo, element, productName, years, yearRange);
            if (data.length === 0) return;
            const name = productName
                ? `${shortEntityLabel(partnerName)} - ${shortItemLabel(productName)}`
                : shortEntityLabel(partnerName);
            series.push({
                code: `${partnerName}__${productName || 'total'}`,
                name,
                geoLevel: 'partner',
                color: CAT_COLORS[(partnerIdx + productIdx) % CAT_COLORS.length],
                data,
                partnerName,
                productName,
            });
        });
    });
    return series;
}

function _renderBilateralOverlay() {
    _svg.style('height', null);
    _svg.attr('viewBox', `0 0 ${_width} ${_height}`);
    _svg.selectAll('*').remove();

    const emptyEl = document.getElementById('trend-empty');
    if (emptyEl) emptyEl.style.display = 'none';

    if (!DataLoader.isBilateralLoaded?.()) {
        if (emptyEl) {
            emptyEl.textContent = 'Cargando comercio bilateral...';
            emptyEl.style.display = '';
        }
        DataLoader.loadBilateral?.().then(() => updateTrendView());
        return;
    }

    const { name: entityName } = _bilateralContext();
    const element = _bilateralElement();
    const flowLabel = element === 'export' ? 'Exportaciones' : 'Importaciones';
    const allSeries = _buildBilateralTrendSeries();
    const allData = allSeries.flatMap(s => s.data);
    if (allData.length === 0) {
        if (emptyEl) {
            emptyEl.textContent = 'Sin series de socios para esta selección';
            emptyEl.style.display = '';
        }
        return;
    }

    const margin = { ...MARGIN, right: _rightLabelMargin() };
    const w = _width - margin.left - margin.right;
    const h = _height - margin.top - margin.bottom;
    const g = _svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const xDomain = _xDomainForRange(_trendYearRange(), allData);
    const yMax = d3.max(allData, d => d.value) || 1;
    const yPad = Math.max(yMax * 0.08, 1);
    const x = d3.scaleLinear().domain(xDomain).range([0, w]);
    const y = d3.scaleLinear().domain([0, yMax + yPad]).range([h, 0]).nice();

    const xAxisG = g.append('g')
        .attr('transform', `translate(0,${h})`)
        .call(d3.axisBottom(x).tickValues(smartXTicks(xDomain, w)).tickFormat(d3.format('d')));
    _styleXAxisTickLabels(xAxisG, '12px', '#7A6A5A');

    g.append('g')
        .call(d3.axisLeft(y).ticks(6).tickFormat(d => _formatYAxisTick(d, 'toneladas')))
        .selectAll('text')
        .style('font-size', '12px')
        .style('fill', '#7A6A5A');

    g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(y).ticks(6).tickSize(-w).tickFormat(''))
        .selectAll('line')
        .style('stroke', '#E8E0D4')
        .style('stroke-width', 0.5);
    g.selectAll('.grid .domain').remove();
    _drawPlotBounds(g, w, h);

    const line = d3.line()
        .defined(d => d.value != null)
        .x(d => x(d.year))
        .y(d => y(d.value))
        .curve(d3.curveMonotoneX);

    const isPlaying = State.get('isPlaying');
    const currentYear = State.get('currentYear');
    const labels = [];

    allSeries.forEach(series => {
        const dataPast = series.data.filter(d => d.year <= currentYear);
        const dataFuture = series.data.filter(d => d.year > currentYear);
        splitSegments(dataPast).forEach(seg => {
            if (seg.length === 1) {
                g.append('circle')
                    .attr('cx', x(seg[0].year))
                    .attr('cy', y(seg[0].value))
                    .attr('r', 2.5)
                    .attr('fill', series.color);
            } else {
                g.append('path')
                    .datum(seg)
                    .attr('fill', 'none')
                    .attr('stroke', series.color)
                    .attr('stroke-width', allSeries.length > 4 ? 2.4 : 3)
                    .attr('stroke-opacity', allSeries.length > 3 ? 0.76 : 0.9)
                    .attr('d', line);
            }
        });

        if (!isPlaying && dataFuture.length > 0) {
            const bridge = dataPast.length > 0 ? [dataPast[dataPast.length - 1], ...dataFuture] : dataFuture;
            splitSegments(bridge).forEach(seg => {
                if (seg.length > 1) {
                    g.append('path')
                        .datum(seg)
                        .attr('fill', 'none')
                        .attr('stroke', series.color)
                        .attr('stroke-width', 1.6)
                        .attr('stroke-opacity', 0.25)
                        .attr('stroke-dasharray', '4,3')
                        .attr('d', line);
                }
            });
        }

        const curPoint = dataPast.filter(d => d.value != null).slice(-1)[0];
        if (curPoint) {
            g.append('circle')
                .attr('cx', x(curPoint.year))
                .attr('cy', y(curPoint.value))
                .attr('r', 5)
                .attr('fill', series.color)
                .attr('stroke', '#fff')
                .attr('stroke-width', 2);
        }

        const labelPoint = (isPlaying ? dataPast : series.data).filter(d => d.value != null).slice(-1)[0];
        if (labelPoint) {
            labels.push({ text: series.name, color: series.color, x: x(labelPoint.year), y: y(labelPoint.value) });
        }
    });
    _drawSeriesLabels(g, labels, w, h);

    if (currentYear >= xDomain[0] && currentYear <= xDomain[1]) {
        g.append('line')
            .attr('x1', x(currentYear))
            .attr('x2', x(currentYear))
            .attr('y1', 0)
            .attr('y2', h)
            .attr('stroke', '#C4913E')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '4,3')
            .attr('opacity', 0.6);
    }

    const productNames = _selectedProductNames();
    const productText = productNames.length === 1 ? ` - ${shortItemLabel(productNames[0])}`
        : productNames.length > 1 ? ` - ${productNames.length} productos` : '';
    g.append('text')
        .attr('x', 0)
        .attr('y', -4)
        .attr('font-size', '11px')
        .attr('font-weight', '700')
        .attr('fill', '#7A4A22')
        .text(`${flowLabel} - ${shortEntityLabel(entityName)}${productText} - socios`);

    _drawYAxisTitle(g, 'Toneladas');

    _attachLineHover(
        g,
        allSeries,
        x,
        y,
        w,
        h,
        'toneladas',
        year => `${flowLabel} - ${entityName} - ${year}`
    );
}

function _productFacetEntities(selected, geoLevel) {
    if (selected.length > 0) {
        return selected.map((code, i) => ({
            code,
            geo: code === 'latin_america' ? 'region' : geoLevel,
            name: shortEntityLabel(DataLoader.getCountryName(code)),
            color: CAT_COLORS[i % CAT_COLORS.length],
        }));
    }
    return [{
        code: 'latin_america',
        geo: 'region',
        name: shortEntityLabel(DataLoader.getCountryName('latin_america')),
        color: CAT_COLORS[0],
    }];
}

function _productFacetTitle(entities, itemCount, stacked = false) {
    const entityLabel = entities.length > 1 ? `${entities.length} territorios` : (entities[0]?.name || DataLoader.getCountryName('latin_america'));
    return `${entityLabel} \u2014 ${_getActiveIndicatorLabel()} \u2014 ${itemCount} ${_itemPluralName()}${stacked ? ' (apilado)' : ''}`;
}

function _truncateFacetLabel(text, max = 22) {
    const label = _displaySeriesName(text);
    return label && label.length > max ? label.slice(0, max - 2) + '\u2026' : label;
}

function _itemPluralName() {
    const catId = State.get('activeCategory');
    if (catId === 'landuse') return 'usos';
    if (catId === 'livestock') return 'especies';
    return 'productos';
}

function _defaultLanduseStackItems(code, geoLevel, indicator) {
    const preferred = ['Agricultural land', 'Forest land', 'Other land'];
    const available = new Set(DataLoader.getItemNames?.(code, indicator, geoLevel) || []);
    const items = preferred.filter(name => available.has(name));
    if (items.length > 0) return items;
    return DataLoader.getItemRanking(code, State.get('currentYear'), indicator, geoLevel)
        .map(item => item.name)
        .filter(name => preferred.includes(name));
}

function _obsoleteSelectedProductItems(topItems) {
    const cropItem = State.get('cropItem');
    if (!cropItem || cropItem === 'all') return topItems;
    const found = topItems.find(item => item.name === cropItem || item.code === cropItem);
    return found ? [found] : [{ code: cropItem, name: cropItem, value: null }];
}

/* -------------------------------------------
   Overlay mode (original behavior)
   ------------------------------------------- */
function _renderOverlay() {
    _svg.style('height', null);  // reset to flex sizing
    _svg.attr('viewBox', `0 0 ${_width} ${_height}`);
    _svg.selectAll('*').remove();

    const selected = State.get('selectedCountries');
    const geoLevel = State.get('geoLevel');
    const indicator = _getDataField();
    const unit = _getUnit();
    const yearRange = _trendYearRange();

    const emptyEl = document.getElementById('trend-empty');
    if (emptyEl) emptyEl.style.display = 'none';

    // Defaults when nothing selected:
    // - LATAM: show latin_america aggregate
    // - Regions: show all 5 regions
    // - Countries: show top 5 by current indicator
    // - Subnational: need a country selected
    let effectiveSelected;
    if (selected.length > 0) {
        effectiveSelected = selected;
    } else if (geoLevel === 'region') {
        effectiveSelected = ['mexico', 'central_caribbean', 'andean', 'brazil', 'southern_cone'];
    } else if (geoLevel === 'subnational') {
        if (emptyEl) {
            emptyEl.textContent = 'Selecciona un país para ver sus unidades subnacionales';
            emptyEl.style.display = '';
        }
        return;
    } else {
        effectiveSelected = ['latin_america'];
    }

    const margin = { ...MARGIN, right: _rightLabelMargin() };
    const w = _width - margin.left - margin.right;
    const h = _height - margin.top - margin.bottom;
    const g = _svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Get data
    let allSeries;
    if (geoLevel === 'subnational' && effectiveSelected.length > 0) {
        // Show top admin1 units for the selected country
        const iso3 = effectiveSelected[0];
        const adminNames = DataLoader.getAdmin1Names(iso3);
        // Get latest-year ranking to pick top units
        const year = State.get('currentYear');
        const subRanking = DataLoader.getSubnationalRanking(year, indicator, iso3);
        const topAdmins = subRanking.slice(0, 8);
        allSeries = topAdmins.map((entry, i) => ({
            code: entry.adminName,
            name: entry.adminName,
            geoLevel: 'subnational',
            color: CAT_COLORS[i % CAT_COLORS.length],
            data: DataLoader.getSubnationalTimeSeries(iso3, entry.adminName, indicator)
                .filter(d => d.year >= yearRange[0] && d.year <= yearRange[1]),
        }));
    } else {
        const productNames = _selectedProductNames();
        if (productNames.length > 0) {
            allSeries = effectiveSelected.flatMap((code, entityIdx) => {
                const seriesGeoLevel = geoLevel === 'country' && code === 'latin_america' ? 'region' : geoLevel;
                const entityName = shortEntityLabel(DataLoader.getCountryName(code));
                return productNames.map((itemName, itemIdx) => ({
                    code: `${code}__${itemName}`,
                    name: effectiveSelected.length > 1 ? `${entityName} - ${shortItemLabel(itemName)}` : shortItemLabel(itemName),
                    geoLevel: seriesGeoLevel,
                    color: productNames.length > 1 ? CAT_COLORS[itemIdx % CAT_COLORS.length] : CAT_COLORS[entityIdx % CAT_COLORS.length],
                    data: DataLoader.getItemTimeSeries(code, itemName, indicator, seriesGeoLevel)
                        .filter(d => d.year >= yearRange[0] && d.year <= yearRange[1]),
                }));
            });
        } else {
            allSeries = effectiveSelected.map((code, i) => {
            const seriesGeoLevel = geoLevel === 'country' && code === 'latin_america' ? 'region' : geoLevel;
            return {
                code,
                name: shortEntityLabel(DataLoader.getCountryName(code)),
                geoLevel: seriesGeoLevel,
                color: CAT_COLORS[i % CAT_COLORS.length],
                data: DataLoader.getTimeSeries(code, indicator, seriesGeoLevel)
                    .filter(d => d.year >= yearRange[0] && d.year <= yearRange[1]),
            };
        });
        }
    }

    const plotSeries = _applyTrendMovingAverage(allSeries);

    // Scales
    const allData = plotSeries.flatMap(s => s.data);
    if (allData.length === 0) return;

    const xDomain = _xDomainForRange(yearRange, allData);
    const yMin = d3.min(allData, d => d.value) ?? 0;
    const yMax = d3.max(allData, d => d.value) || 1;
    const yPad = Math.max((yMax - yMin) * 0.1, Math.abs(yMax) * 0.03, 0.01);
    const yBase = _usesTightYDomain()
        ? Math.max(0, yMin - yPad)
        : 0;

    const x = d3.scaleLinear().domain(xDomain).range([0, w]);
    const y = State.get('scaleType') === 'log'
        ? d3.scaleLog().domain([Math.max(1, d3.min(allData, d => d.value) || 1), yMax]).range([h, 0]).clamp(true)
        : d3.scaleLinear().domain([yBase, yMax + yPad]).range([h, 0]).nice();

    // X axis
    const xTicks = smartXTicks(xDomain, w);
    const xAxisG = g.append('g')
        .attr('transform', `translate(0,${h})`)
        .call(d3.axisBottom(x).tickValues(xTicks).tickFormat(d3.format('d')));
    _styleXAxisTickLabels(xAxisG, '12px', '#7A6A5A');

    // Y axis
    g.append('g')
        .call(d3.axisLeft(y).ticks(6).tickFormat(d => _formatYAxisTick(d, unit)))
        .selectAll('text')
        .style('font-size', '12px')
        .style('fill', '#7A6A5A');

    // Grid
    g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(y).ticks(6).tickSize(-w).tickFormat(''))
        .selectAll('line')
        .style('stroke', '#E8E0D4')
        .style('stroke-width', 0.5);
    g.selectAll('.grid .domain').remove();
    _drawPlotBounds(g, w, h);

    // Lines (curveMonotoneX + gap handling)
    const line = d3.line()
        .defined(d => d.value != null)
        .x(d => x(d.year))
        .y(d => y(d.value))
        .curve(d3.curveMonotoneX);

    const isPlaying = State.get('isPlaying');
    const currentYear = State.get('currentYear');
    const labels = [];

    plotSeries.forEach(s => {
        if (s.data.length === 0) return;

        // When playing timelapse: only show data up to currentYear
        // When not playing: show all data, with faint future and bold past
        const dataPast = s.data.filter(d => d.year <= currentYear);
        const dataFuture = s.data.filter(d => d.year > currentYear);

        const lineWidth = allSeries.length > 4 ? 2.5 : 3;
        const lineAlpha = allSeries.length > 3 ? 0.75 : 0.9;

        // Draw past (bold)
        const segsPast = splitSegments(dataPast);
        segsPast.forEach(seg => {
            if (seg.length === 1) {
                g.append('circle')
                    .attr('cx', x(seg[0].year))
                    .attr('cy', y(seg[0].value))
                    .attr('r', 2.5)
                    .attr('fill', s.color);
            } else {
                g.append('path')
                    .datum(seg)
                    .attr('fill', 'none')
                    .attr('stroke', s.color)
                    .attr('stroke-width', lineWidth)
                    .attr('stroke-opacity', lineAlpha)
                    .attr('d', line);
            }
        });

        // Draw future (faded) - only when NOT playing
        if (!isPlaying && dataFuture.length > 0) {
            // Connect last past point to first future point
            const bridge = dataPast.length > 0 ? [dataPast[dataPast.length - 1], ...dataFuture] : dataFuture;
            const segsFuture = splitSegments(bridge);
            segsFuture.forEach(seg => {
                if (seg.length > 1) {
                    g.append('path')
                        .datum(seg)
                        .attr('fill', 'none')
                        .attr('stroke', s.color)
                        .attr('stroke-width', lineWidth * 0.6)
                        .attr('stroke-opacity', 0.25)
                        .attr('stroke-dasharray', '4,3')
                        .attr('d', line);
                }
            });
        }

        const observed = (DataLoader.getObservationPoints?.(s.code, indicator, s.geoLevel) || [])
            .filter(d => d.year >= yearRange[0] && d.year <= yearRange[1])
            .filter(d => !isPlaying || d.year <= currentYear);
        const showObservedDots = s.geoLevel === 'country'
            && allSeries.length <= 3
            && observed.length > 0
            && observed.length <= Math.max(6, s.data.length * OBSERVED_DOT_MAX_SHARE);
        if (showObservedDots) {
            g.selectAll(null)
                .data(observed)
                .enter()
                .append('circle')
                .attr('class', 'observed-point')
                .attr('cx', d => x(d.year))
                .attr('cy', d => y(d.value))
                .attr('r', 3.1)
                .attr('fill', '#F5F0E6')
                .attr('stroke', s.color)
                .attr('stroke-width', 1.6)
                .attr('opacity', 0.95);
        }

        // Current year dot (prominent)
        const curPoint = dataPast.filter(d => d.value != null).slice(-1)[0];
        if (curPoint) {
            g.append('circle')
                .attr('cx', x(curPoint.year))
                .attr('cy', y(curPoint.value))
                .attr('r', 5)
                .attr('fill', s.color)
                .attr('stroke', '#fff')
                .attr('stroke-width', 2);
        }

        const labelData = isPlaying ? dataPast : s.data;
        const labelPoint = labelData.filter(d => d.value != null).slice(-1)[0];
        if (labelPoint) {
            labels.push({
                text: s.name || s.code,
                color: s.color,
                x: x(labelPoint.year),
                y: y(labelPoint.value),
            });
        }
    });

    _drawTrendAnalysis(g, plotSeries, x, y, w, h);
    _drawSeriesLabels(g, labels, w, h);

    // Current year dashed line (reuse currentYear from above)
    if (currentYear >= xDomain[0] && currentYear <= xDomain[1]) {
        g.append('line')
            .attr('x1', x(currentYear))
            .attr('x2', x(currentYear))
            .attr('y1', 0)
            .attr('y2', h)
            .attr('stroke', '#C4913E')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '4,3')
            .attr('opacity', 0.6);
    }

    _drawYAxisTitle(g, _getActiveIndicatorLabel() + (unit ? ` (${unit})` : ''));

    const cropItem = State.get('cropItem');
    const cropLabel = cropItem !== 'all' ? `${cropItem} - ` : '';
    const indLabel = _getActiveIndicatorLabel();
    _attachLineHover(
        g,
        plotSeries,
        x,
        y,
        w,
        h,
        unit,
        year => `${cropLabel}${indLabel} - ${year}`
    );
}

/* -------------------------------------------
   Facet by Country - one small chart per selected country
   ------------------------------------------- */
function _renderFacetByCountry() {
    _svg.selectAll('*').remove();
    const emptyEl = document.getElementById('trend-empty');
    if (emptyEl) emptyEl.style.display = 'none';

    const selected = State.get('selectedCountries');
    const geoLevel = State.get('geoLevel');
    const indicator = _getDataField();
    const unit = _getUnit();
    const yearRange = _trendYearRange();

    if (selected.length < 2) {
        // Fall back to overlay - facet needs =2 countries
        _renderOverlay();
        return;
    }

    // Grid layout
    const nPanels = selected.length;
    const cols = nPanels <= 2 ? 2 : nPanels <= 4 ? 2 : 3;
    const rows = Math.ceil(nPanels / cols);
    const panelW = Math.floor(_width / cols);
    const panelH = Math.floor(Math.max(180, _height / rows));
    const totalH = rows * panelH;

    _svg.attr('viewBox', `0 0 ${_width} ${totalH}`);
    _svg.style('height', totalH + 'px');

    // Collect all data first for shared y-scale. If products are selected,
    // each country panel shows one line per product instead of a hidden sum.
    const productNames = _selectedProductNames();
    const panels = selected.map((code, countryIdx) => {
        const countryName = shortEntityLabel(DataLoader.getCountryName(code));
        const countryColor = CAT_COLORS[countryIdx % CAT_COLORS.length];
        const series = productNames.length > 0
            ? productNames.map((itemName, itemIdx) => ({
                code: `${code}__${itemName}`,
                name: shortItemLabel(itemName),
                color: CAT_COLORS[itemIdx % CAT_COLORS.length],
                data: DataLoader.getItemTimeSeries(code, itemName, indicator, geoLevel)
                    .filter(d => d.year >= yearRange[0] && d.year <= yearRange[1]),
            }))
            : [{
                code,
                name: countryName,
                color: countryColor,
                data: DataLoader.getTimeSeries(code, indicator, geoLevel)
                    .filter(d => d.year >= yearRange[0] && d.year <= yearRange[1]),
            }];
        return { code, name: countryName, color: countryColor, series };
    });

    const plotPanels = panels.map(panel => ({
        ...panel,
        series: _applyTrendMovingAverage(panel.series),
    }));
    const allData = plotPanels.flatMap(panel => panel.series.flatMap(s => s.data));
    if (allData.length === 0) return;

    const xDomain = _xDomainForRange(yearRange, allData);
    plotPanels.forEach((panel, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const offsetX = col * panelW;
        const offsetY = row * panelH;

        const fm = FACET_MARGIN;
        const w = panelW - fm.left - fm.right;
        const h = panelH - fm.top - fm.bottom;

        const g = _svg.append('g').attr('transform', `translate(${offsetX + fm.left},${offsetY + fm.top})`);

        // Panel title
        g.append('text')
            .attr('x', w / 2).attr('y', -6)
            .attr('text-anchor', 'middle')
            .attr('font-size', '11px')
            .attr('font-weight', '600')
            .attr('fill', panel.color)
            .text(panel.name);

        // Shared or free scales
        const x = d3.scaleLinear().domain(xDomain).range([0, w]);
        const yData = _facetYIsFree() ? panel.series.flatMap(s => s.data) : allData;
        const y = _lineYScale(yData, h);

        _drawFacetAxes(g, x, y, w, h, xDomain, unit);

        // Line (curveMonotoneX + gap handling)
        const line = d3.line().defined(d => d.value != null).x(d => x(d.year)).y(d => y(d.value)).curve(d3.curveMonotoneX);
        panel.series.forEach(s => {
            const segs = splitSegments(s.data);
            segs.forEach(seg => {
                if (seg.length === 1) {
                    g.append('circle').attr('cx', x(seg[0].year)).attr('cy', y(seg[0].value)).attr('r', 2).attr('fill', s.color);
                } else {
                    g.append('path').datum(seg).attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', 2).attr('stroke-opacity', 0.82).attr('d', line);
                }
            });
        });
        _drawTrendAnalysis(g, panel.series, x, y, w, h, { compact: true, maxBreaks: 1 });
        _drawMiniLegend(g, panel.series, w, 4);

        // Current year marker
        _drawCurrentYearLine(g, x, h, xDomain);

        // Panel border
        g.append('rect').attr('width', w).attr('height', h)
            .attr('fill', 'none').attr('stroke', '#E8E0D4').attr('stroke-width', 0.5);
        _attachLineHover(
            g,
            panel.series,
            x,
            y,
            w,
            h,
            unit,
            year => `${panel.name} - ${_getActiveIndicatorLabel()} - ${year}`
        );
    });
}

/* -------------------------------------------
   Facet by Product - one small chart per top item within a country
   ------------------------------------------- */
function _renderFacetByProduct() {
    _svg.selectAll('*').remove();
    const emptyEl = document.getElementById('trend-empty');
    if (emptyEl) emptyEl.style.display = 'none';

    const selected = State.get('selectedCountries');
    const geoLevel = State.get('geoLevel');
    const indicator = _getDataField();
    const unit = _getUnit();
    const yearRange = _trendYearRange();
    const topN = State.get('rankingTopN') || 10;

    const entities = _productFacetEntities(selected, geoLevel);
    const baseEntity = entities[0];

    // Get available items
    const year = State.get('currentYear');
    const itemRanking = DataLoader.getItemRanking(baseEntity.code, year, indicator, baseEntity.geo);
    const topItems = _selectedProductItems(itemRanking.slice(0, topN));

    if (topItems.length === 0) {
        if (emptyEl) {
            emptyEl.textContent = 'No hay datos de productos para esta selección';
            emptyEl.style.display = '';
        }
        return;
    }

    // Grid layout
    const nPanels = topItems.length;
    const cols = nPanels <= 2 ? 2 : nPanels <= 4 ? 2 : nPanels <= 9 ? 3 : 4;
    const rows = Math.ceil(nPanels / cols);
    const panelW = Math.floor(_width / cols);
    const panelH = Math.floor(Math.max(140, _height / rows));
    const titleBand = 28;
    const totalH = titleBand + rows * panelH;

    _svg.attr('viewBox', `0 0 ${_width} ${totalH}`);
    _svg.style('height', totalH + 'px');

    // Fetch all item time series
    const panels = topItems.map((item, itemIdx) => ({
        itemName: item.name,
        itemLabel: shortItemLabel(item.name),
        color: CAT_COLORS[itemIdx % CAT_COLORS.length],
        series: entities.map((entity, i) => ({
            ...entity,
            color: entity.color || CAT_COLORS[i % CAT_COLORS.length],
            data: DataLoader.getItemTimeSeries(entity.code, item.name, indicator, entity.geo)
                .filter(d => d.year >= yearRange[0] && d.year <= yearRange[1]),
        })),
    }));

    // Shared y-scale across all facets
    const plotPanels = panels.map(panel => ({
        ...panel,
        series: _applyTrendMovingAverage(panel.series),
    }));
    const allData = plotPanels.flatMap(panel => panel.series.flatMap(s => s.data));
    if (allData.length === 0) return;

    const xDomain = _xDomainForRange(yearRange, allData);
    const entityName = entities.length > 1 ? `${entities.length} territorios` : entities[0].name;

    plotPanels.forEach((panel, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const offsetX = col * panelW;
        const offsetY = titleBand + row * panelH;

        const fm = { ...FACET_MARGIN, top: 24 };
        const w = panelW - fm.left - fm.right;
        const h = panelH - fm.top - fm.bottom;

        const g = _svg.append('g').attr('transform', `translate(${offsetX + fm.left},${offsetY + fm.top})`);

        // Panel title (truncate long product names)
        const label = panel.itemLabel.length > 22 ? `${panel.itemLabel.slice(0, 20)}...` : panel.itemLabel;
        g.append('text')
            .attr('x', w / 2).attr('y', -8)
            .attr('text-anchor', 'middle')
            .attr('font-size', '11px')
            .attr('font-weight', '600')
            .attr('fill', panel.color)
            .text(label);

        // Shared or free scales
        const x = d3.scaleLinear().domain(xDomain).range([0, w]);
        const yData = _facetYIsFree() ? panel.series.flatMap(s => s.data) : allData;
        const y = _lineYScale(yData, h);

        _drawFacetAxes(g, x, y, w, h, xDomain, unit);

        // Line (curveMonotoneX + gap handling)
        const line = d3.line().defined(d => d.value != null).x(d => x(d.year)).y(d => y(d.value)).curve(d3.curveMonotoneX);
        panel.series.forEach(series => {
            if (series.data.length === 0) return;
            splitSegments(series.data).forEach(seg => {
                if (seg.length === 1) {
                    g.append('circle')
                        .attr('cx', x(seg[0].year))
                        .attr('cy', y(seg[0].value))
                        .attr('r', 2)
                        .attr('fill', series.color);
                } else {
                    g.append('path')
                        .datum(seg)
                        .attr('fill', 'none')
                        .attr('stroke', series.color)
                        .attr('stroke-width', 2)
                        .attr('stroke-opacity', 0.82)
                        .attr('d', line);
                }
            });
        });
        _drawTrendAnalysis(g, panel.series, x, y, w, h, { compact: true, maxBreaks: 1 });

        if (panel.series.length > 1 && panel.series.length <= 4) _drawMiniLegend(g, panel.series, w, 4);

        _drawCurrentYearLine(g, x, h, xDomain);

        // Panel border
        g.append('rect').attr('width', w).attr('height', h)
            .attr('fill', 'none').attr('stroke', '#E8E0D4').attr('stroke-width', 0.5);
        _attachLineHover(
            g,
            panel.series,
            x,
            y,
            w,
            h,
            unit,
            year => `${panel.itemLabel} - ${entityName} - ${year}`
        );
    });

    // Overall title
    _svg.append('text')
        .attr('x', _width / 2).attr('y', 13)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px')
        .attr('fill', '#7A6A5A')
        .attr('font-weight', '600')
        .text(`${entityName} - ${_getActiveIndicatorLabel()} - Top ${topItems.length} ${_itemPluralName()}`);
}

/* -------------------------------------------
   Stacked Area mode (overlay - stacks countries or single-country products)
   ------------------------------------------- */
function _renderStacked() {
    _svg.style('height', null);
    _svg.attr('viewBox', `0 0 ${_width} ${_height}`);
    _svg.selectAll('*').remove();

    const selected = State.get('selectedCountries');
    const geoLevel = State.get('geoLevel');
    const indicator = _getDataField();
    const unit = _getUnit();
    const yearRange = _trendYearRange();

    const emptyEl = document.getElementById('trend-empty');
    if (emptyEl) emptyEl.style.display = 'none';

    let effectiveSelected;
    if (selected.length > 0) {
        effectiveSelected = selected;
    } else if (geoLevel === 'region') {
        effectiveSelected = ['mexico', 'central_caribbean', 'andean', 'brazil', 'southern_cone'];
    } else if (geoLevel === 'subnational') {
        if (emptyEl) { emptyEl.textContent = 'Selecciona un país'; emptyEl.style.display = ''; }
        return;
    } else {
        effectiveSelected = ['latin_america'];
    }

    const margin = { ...MARGIN, right: _rightLabelMargin() };
    const w = _width - margin.left - margin.right;
    const h = _height - margin.top - margin.bottom;
    const g = _svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Build series
    let allSeries;
    if (geoLevel === 'subnational' && effectiveSelected.length > 0) {
        const iso3 = effectiveSelected[0];
        const year = State.get('currentYear');
        const subRanking = DataLoader.getSubnationalRanking(year, indicator, iso3);
        const topAdmins = subRanking.slice(0, 8);
        allSeries = topAdmins.map((entry, i) => ({
            code: entry.adminName,
            name: entry.adminName,
            color: CAT_COLORS[i % CAT_COLORS.length],
            data: DataLoader.getSubnationalTimeSeries(iso3, entry.adminName, indicator)
                .filter(d => d.year >= yearRange[0] && d.year <= yearRange[1]),
        }));
    } else {
        let productNames = _selectedProductNames();
        if (productNames.length === 0 && State.get('activeCategory') === 'landuse') {
            const baseCode = effectiveSelected[0] || 'latin_america';
            const baseGeo = baseCode === 'latin_america' ? 'region' : geoLevel;
            productNames = _defaultLanduseStackItems(baseCode, baseGeo, indicator);
        }
        if (productNames.length > 0) {
            allSeries = effectiveSelected.flatMap((code, entityIdx) => {
                const seriesGeoLevel = geoLevel === 'country' && code === 'latin_america' ? 'region' : geoLevel;
                const entityName = shortEntityLabel(DataLoader.getCountryName(code));
                return productNames.map((itemName, itemIdx) => ({
                    code: `${code}__${itemName}`,
                    name: effectiveSelected.length > 1 ? `${entityName} - ${shortItemLabel(itemName)}` : shortItemLabel(itemName),
                    color: productNames.length > 1 ? CAT_COLORS[itemIdx % CAT_COLORS.length] : CAT_COLORS[entityIdx % CAT_COLORS.length],
                    data: DataLoader.getItemTimeSeries(code, itemName, indicator, seriesGeoLevel)
                        .filter(d => d.year >= yearRange[0] && d.year <= yearRange[1]),
                }));
            });
        } else {
            allSeries = effectiveSelected.map((code, i) => ({
                code,
                name: shortEntityLabel(DataLoader.getCountryName(code)),
                color: CAT_COLORS[i % CAT_COLORS.length],
                data: DataLoader.getTimeSeries(code, indicator, geoLevel === 'country' && code === 'latin_america' ? 'region' : geoLevel)
                    .filter(d => d.year >= yearRange[0] && d.year <= yearRange[1]),
            }));
        }
    }

    const allData = allSeries.flatMap(s => s.data);
    if (allData.length === 0) return;

    // Build tabular data: one row per year, columns = series keys
    const seriesNames = allSeries.map(s => s.code);
    const yearSet = new Set();
    allSeries.forEach(s => s.data.forEach(d => yearSet.add(d.year)));
    const years = Array.from(yearSet).sort((a, b) => a - b);

    const dataByYear = years.map(year => {
        const row = { year };
        allSeries.forEach(s => {
            const pt = s.data.find(d => d.year === year);
            row[s.code] = pt ? pt.value : 0;
        });
        return row;
    });

    // D3 stack
    const stack = d3.stack().keys(seriesNames).value((d, key) => d[key] || 0).offset(d3.stackOffsetNone);
    const stacked = stack(dataByYear);

    const xDomain = _xDomainForRange(yearRange, years.map(year => ({ year })));
    const yMax = d3.max(stacked, layer => d3.max(layer, d => d[1])) || 1;

    const x = d3.scaleLinear().domain(xDomain).range([0, w]);
    const y = _stackedYScale(yMax, h);

    // X axis
    const xTicks = smartXTicks(xDomain, w);
    const xAxisG = g.append('g')
        .attr('transform', `translate(0,${h})`)
        .call(d3.axisBottom(x).tickValues(xTicks).tickFormat(d3.format('d')));
    _styleXAxisTickLabels(xAxisG, '12px', '#7A6A5A');

    // Y axis
    g.append('g')
        .call(d3.axisLeft(y).ticks(6).tickFormat(d => _formatYAxisTick(d, unit)))
        .selectAll('text')
        .style('font-size', '12px')
        .style('fill', '#7A6A5A');

    // Grid
    g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(y).ticks(6).tickSize(-w).tickFormat(''))
        .selectAll('line')
        .style('stroke', '#E8E0D4')
        .style('stroke-width', 0.5);
    g.selectAll('.grid .domain').remove();
    _drawPlotBounds(g, w, h);

    // Area generator (curveMonotoneX for smoother stacked areas)
    const area = d3.area()
        .x(d => x(d.data.year))
        .y0(d => _stackedYValue(y, d[0], h))
        .y1(d => _stackedYValue(y, d[1], h))
        .curve(d3.curveMonotoneX);

    // Draw stacked areas
    stacked.forEach((layer, i) => {
        g.append('path')
            .datum(layer)
            .attr('fill', allSeries[i].color)
            .attr('fill-opacity', 0.7)
            .attr('stroke', allSeries[i].color)
            .attr('stroke-width', 0.5)
            .attr('d', area);
    });

    // Current year line
    const currentYear = State.get('currentYear');
    if (currentYear >= xDomain[0] && currentYear <= xDomain[1]) {
        g.append('line')
            .attr('x1', x(currentYear)).attr('x2', x(currentYear))
            .attr('y1', 0).attr('y2', h)
            .attr('stroke', '#C4913E')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '4,3')
            .attr('opacity', 0.6);
    }

    _drawYAxisTitle(g, _getActiveIndicatorLabel() + (unit ? ` (${unit})` : ''));

    // End labels, aligned with the right side like line charts.
    _drawStackedEndLabels(g, allSeries, stacked, x, y, w, h, currentYear);

    // Hover overlay - Maddison-style: dashed line + colored dots at top of each layer
    const overlay = g.append('rect')
        .attr('width', w).attr('height', h)
        .attr('fill', 'transparent')
        .attr('cursor', 'crosshair');

    const hoverG = g.append('g').style('display', 'none');
    const hoverLine = hoverG.append('line')
        .attr('y1', 0).attr('y2', h)
        .attr('stroke', '#1A120B')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,2')
        .attr('opacity', 0.5);

    // One dot per stacked layer (at the top edge of each area)
    const hoverDots = allSeries.map(s =>
        hoverG.append('circle')
            .attr('r', 3.5)
            .attr('fill', s.color)
            .attr('stroke', '#fff')
            .attr('stroke-width', 2).attr('stroke-opacity', 0.8)
            .style('display', 'none')
    );

    overlay
        .on('mousemove', (event) => {
            const [mx] = d3.pointer(event);
            const rawYear = Math.round(x.invert(Math.max(0, Math.min(w, mx))));
            const row = _nearestRow(dataByYear, rawYear);
            if (!row) return;
            const year = row.year;
            hoverG.style('display', null);
            hoverLine.attr('x1', x(year)).attr('x2', x(year));

            const entries = [];
            stacked.forEach((layer, i) => {
                const pt = layer.find(d => d.data.year === year);
                const val = row[allSeries[i].code];
                if (pt && val) {
                    hoverDots[i]
                        .attr('cx', x(year))
                        .attr('cy', y(pt[1]))
                        .style('display', null);
                    entries.push(`${allSeries[i].name}: ${fmtUnit(val, unit)}`);
                } else {
                    hoverDots[i].style('display', 'none');
                }
            });
            const total = allSeries.reduce((sum, s) => sum + (row[s.code] || 0), 0);
            entries.push(`Total: ${fmtUnit(total, unit)}`);

            const cropItem2 = State.get('cropItem');
            const cropLabel2 = cropItem2 !== 'all' ? `${cropItem2} - ` : '';
            showTooltip(event, { title: `${cropLabel2}${_getActiveIndicatorLabel()} - ${year}`, value: entries.join('<br>') });
        })
        .on('mouseleave', () => {
            hoverG.style('display', 'none');
            hideTooltip();
        });
}

/* -------------------------------------------
   Stacked Area - Facet by Country
   ------------------------------------------- */
function _renderStackedFacetByCountry() {
    _svg.selectAll('*').remove();
    const emptyEl = document.getElementById('trend-empty');
    if (emptyEl) emptyEl.style.display = 'none';

    const selected = State.get('selectedCountries');
    const geoLevel = State.get('geoLevel');
    const indicator = _getDataField();
    const unit = _getUnit();
    const yearRange = _trendYearRange();
    const topN = State.get('rankingTopN') || 10;

    if (selected.length < 2) {
        _renderStacked();
        return;
    }

    // Grid layout
    const nPanels = selected.length;
    const cols = nPanels <= 2 ? 2 : nPanels <= 4 ? 2 : 3;
    const rows = Math.ceil(nPanels / cols);
    const panelW = Math.floor(_width / cols);
    const panelH = Math.floor(Math.max(180, _height / rows));
    const totalH = rows * panelH;

    _svg.attr('viewBox', `0 0 ${_width} ${totalH}`);
    _svg.style('height', totalH + 'px');

    // For each country, get top products and render stacked area
    const year = State.get('currentYear');

    // Collect all data to determine shared y-scale
    const panelData = selected.map((code, cIdx) => {
        const effectiveGeo = geoLevel;
        const itemRanking = DataLoader.getItemRanking(code, year, indicator, effectiveGeo);
        const topItems = _selectedProductItems(itemRanking.slice(0, topN));

        const itemSeries = topItems.map((item, i) => ({
            code: item.name,
            name: shortItemLabel(item.name),
            color: CAT_COLORS[i % CAT_COLORS.length],
            data: DataLoader.getItemTimeSeries(code, item.name, indicator, effectiveGeo)
                .filter(d => d.year >= yearRange[0] && d.year <= yearRange[1]),
        }));

        // Build tabular data
        const yearSet = new Set();
        itemSeries.forEach(s => s.data.forEach(d => yearSet.add(d.year)));
        const years = Array.from(yearSet).sort((a, b) => a - b);
        const seriesNames = itemSeries.map(s => s.code);

        const dataByYear = years.map(yr => {
            const row = { year: yr };
            itemSeries.forEach(s => {
                const pt = s.data.find(d => d.year === yr);
                row[s.code] = pt ? pt.value : 0;
            });
            return row;
        });

        let stacked = [];
        let stackMax = 0;
        if (seriesNames.length > 0 && dataByYear.length > 0) {
            const stack = d3.stack().keys(seriesNames).value((d, key) => d[key] || 0).offset(d3.stackOffsetNone);
            stacked = stack(dataByYear);
            stackMax = d3.max(stacked, layer => d3.max(layer, d => d[1])) || 0;
        }

        return {
            code,
            name: shortEntityLabel(DataLoader.getCountryName(code)),
            color: CAT_COLORS[cIdx % CAT_COLORS.length],
            itemSeries,
            dataByYear,
            stacked,
            stackMax,
            years,
        };
    });

    const allData = panelData.flatMap(p => p.dataByYear);
    if (allData.length === 0) return;

    const xDomain = _xDomainForRange(yearRange, allData);
    const yMax = d3.max(panelData, p => p.stackMax) || 1;

    panelData.forEach((panel, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const offsetX = col * panelW;
        const offsetY = row * panelH;

        const fm = FACET_MARGIN;
        const w = panelW - fm.left - fm.right;
        const h = panelH - fm.top - fm.bottom;

        const g = _svg.append('g').attr('transform', `translate(${offsetX + fm.left},${offsetY + fm.top})`);

        // Panel title
        g.append('text')
            .attr('x', w / 2).attr('y', -6)
            .attr('text-anchor', 'middle')
            .attr('font-size', '11px')
            .attr('font-weight', '600')
            .attr('fill', panel.color)
            .text(panel.name);

        const x = d3.scaleLinear().domain(xDomain).range([0, w]);
        const y = _stackedYScale(_facetYIsFree() ? panel.stackMax : yMax, h);

        _drawFacetAxes(g, x, y, w, h, xDomain, unit);

        // Area generator
        const area = d3.area()
            .x(d => x(d.data.year))
            .y0(d => _stackedYValue(y, d[0], h))
            .y1(d => _stackedYValue(y, d[1], h));

        panel.stacked.forEach((layer, i) => {
            g.append('path')
                .datum(layer)
                .attr('fill', panel.itemSeries[i].color)
                .attr('fill-opacity', 0.7)
                .attr('stroke', panel.itemSeries[i].color)
                .attr('stroke-width', 0.3)
                .attr('d', area);
        });
        _drawMiniLegend(g, panel.itemSeries, w, 4);

        _drawCurrentYearLine(g, x, h, xDomain);

        // Panel border
        g.append('rect').attr('width', w).attr('height', h)
            .attr('fill', 'none').attr('stroke', '#E8E0D4').attr('stroke-width', 0.5);

        _attachStackedHover(
            g,
            panel.itemSeries,
            panel.stacked,
            panel.dataByYear,
            x, y, w, h, unit,
            yr => `${panel.name} - ${_getActiveIndicatorLabel()} - ${yr}`
        );
    });
}

/* -------------------------------------------
   Stacked Area - Facet by Product (stacked countries per product)
   ------------------------------------------- */
function _renderStackedFacetByProduct() {
    _svg.selectAll('*').remove();
    const emptyEl = document.getElementById('trend-empty');
    if (emptyEl) emptyEl.style.display = 'none';

    const selected = State.get('selectedCountries');
    const geoLevel = State.get('geoLevel');
    const indicator = _getDataField();
    const unit = _getUnit();
    const yearRange = _trendYearRange();
    const topN = State.get('rankingTopN') || 10;

    const code = selected.length > 0 ? selected[0] : 'latin_america';
    const effectiveGeo = selected.length > 0 ? geoLevel : 'region';

    const year = State.get('currentYear');
    const itemRanking = DataLoader.getItemRanking(code, year, indicator, effectiveGeo);
    const topItems = _selectedProductItems(itemRanking.slice(0, topN));

    if (topItems.length === 0) {
        if (emptyEl) {
            emptyEl.textContent = 'No hay datos de productos para esta selección';
            emptyEl.style.display = '';
        }
        return;
    }

    // Grid layout
    const nPanels = topItems.length;
    const cols = nPanels <= 2 ? 2 : nPanels <= 4 ? 2 : nPanels <= 9 ? 3 : 4;
    const rows = Math.ceil(nPanels / cols);
    const panelW = Math.floor(_width / cols);
    const panelH = Math.floor(Math.max(140, _height / rows));
    const titleBand = 28;
    const totalH = titleBand + rows * panelH;

    _svg.attr('viewBox', `0 0 ${_width} ${totalH}`);
    _svg.style('height', totalH + 'px');

    // For each product facet, show stacked area by countries (if multiple selected)
    const stackEntities = selected.length > 1 ? selected : [code];

    const panelDataArr = topItems.map((item, iIdx) => {
        const entitySeries = stackEntities.map((eCode, i) => ({
            code: eCode,
            name: shortEntityLabel(DataLoader.getCountryName(eCode)),
            color: CAT_COLORS[i % CAT_COLORS.length],
            data: DataLoader.getItemTimeSeries(eCode, item.name, indicator, eCode === 'latin_america' ? 'region' : geoLevel)
                .filter(d => d.year >= yearRange[0] && d.year <= yearRange[1]),
        }));

        const yearSet = new Set();
        entitySeries.forEach(s => s.data.forEach(d => yearSet.add(d.year)));
        const years = Array.from(yearSet).sort((a, b) => a - b);
        const seriesNames = entitySeries.map(s => s.code);

        const dataByYear = years.map(yr => {
            const row = { year: yr };
            entitySeries.forEach(s => {
                const pt = s.data.find(d => d.year === yr);
                row[s.code] = pt ? pt.value : 0;
            });
            return row;
        });

        let stacked = [];
        let stackMax = 0;
        if (seriesNames.length > 0 && dataByYear.length > 0) {
            const stack = d3.stack().keys(seriesNames).value((d, key) => d[key] || 0).offset(d3.stackOffsetNone);
            stacked = stack(dataByYear);
            stackMax = d3.max(stacked, layer => d3.max(layer, d => d[1])) || 0;
        }

        return {
            itemName: item.name,
            itemLabel: shortItemLabel(item.name),
            color: CAT_COLORS[iIdx % CAT_COLORS.length],
            entitySeries,
            dataByYear,
            stacked,
            stackMax,
            years,
        };
    });

    const allData = panelDataArr.flatMap(p => p.dataByYear);
    if (allData.length === 0) return;

    const xDomain = _xDomainForRange(yearRange, allData);
    const yMax = d3.max(panelDataArr, p => p.stackMax) || 1;

    const entityName = stackEntities.length > 1
        ? `${stackEntities.length} territorios`
        : shortEntityLabel(DataLoader.getCountryName(code));

    panelDataArr.forEach((panel, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const offsetX = col * panelW;
        const offsetY = titleBand + row * panelH;

        const fm = { ...FACET_MARGIN, top: 24 };
        const w = panelW - fm.left - fm.right;
        const h = panelH - fm.top - fm.bottom;

        const g = _svg.append('g').attr('transform', `translate(${offsetX + fm.left},${offsetY + fm.top})`);

        // Panel title
        const label = panel.itemLabel.length > 22 ? panel.itemLabel.slice(0, 20) + '\u2026' : panel.itemLabel;
        g.append('text')
            .attr('x', w / 2).attr('y', -5)
            .attr('text-anchor', 'middle')
            .attr('font-size', '11px')
            .attr('font-weight', '600')
            .attr('fill', panel.color)
            .text(label);

        const x = d3.scaleLinear().domain(xDomain).range([0, w]);
        const y = _stackedYScale(_facetYIsFree() ? panel.stackMax : yMax, h);

        _drawFacetAxes(g, x, y, w, h, xDomain, unit);

        // Area generator
        const area = d3.area()
            .x(d => x(d.data.year))
            .y0(d => _stackedYValue(y, d[0], h))
            .y1(d => _stackedYValue(y, d[1], h));

        panel.stacked.forEach((layer, i) => {
            g.append('path')
                .datum(layer)
                .attr('fill', panel.entitySeries[i].color)
                .attr('fill-opacity', 0.7)
                .attr('stroke', panel.entitySeries[i].color)
                .attr('stroke-width', 0.3)
                .attr('d', area);
        });
        _drawMiniLegend(g, panel.entitySeries, w, 4);

        _drawCurrentYearLine(g, x, h, xDomain);

        g.append('rect').attr('width', w).attr('height', h)
            .attr('fill', 'none').attr('stroke', '#E8E0D4').attr('stroke-width', 0.5);

        _attachStackedHover(
            g,
            panel.entitySeries,
            panel.stacked,
            panel.dataByYear,
            x, y, w, h, unit,
            yr => `${panel.itemLabel} - ${entityName} - ${yr}`
        );
    });

    // Overall title
    _svg.append('text')
        .attr('x', _width / 2).attr('y', 13)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px')
        .attr('fill', '#7A6A5A')
        .attr('font-weight', '600')
        .text(`${entityName} \u2014 ${_getActiveIndicatorLabel()} \u2014 Top ${topItems.length} ${_itemPluralName()} (apilado)`);
}

/* -------------------------------------------
   Stacked legend helper
   ------------------------------------------- */
function _drawStackedEndLabels(g, allSeries, stacked, x, y, w, h, currentYear) {
    const labels = [];
    stacked.forEach((layer, i) => {
        const visible = layer.filter(d => d && d.data && d[1] > d[0]);
        if (visible.length === 0) return;
        const past = visible.filter(d => d.data.year <= currentYear);
        const pt = (past.length ? past : visible)[(past.length ? past : visible).length - 1];
        if (!pt) return;
        labels.push({
            text: allSeries[i]?.name || allSeries[i]?.code || '',
            color: allSeries[i]?.color || CAT_COLORS[i % CAT_COLORS.length],
            x: x(pt.data.year),
            y: _stackedYValue(y, pt[1], h),
        });
    });
    _drawSeriesLabels(g, labels, w, h);
}

function _drawStackedLegend(g, allSeries, chartWidth) {
    const legendG = g.append('g').attr('transform', `translate(${chartWidth - 10}, 4)`);
    allSeries.forEach((s, i) => {
        const row = legendG.append('g').attr('transform', `translate(0, ${i * 16})`);
        row.append('rect')
            .attr('x', -allSeries.length * 0) // right-align
            .attr('width', 10).attr('height', 10)
            .attr('fill', s.color)
            .attr('fill-opacity', 0.8);
        const labelText = _truncateFacetLabel(s.name, 18);
        row.append('text')
            .attr('x', -6)
            .attr('y', 9)
            .attr('text-anchor', 'end')
            .attr('font-size', '9px')
            .attr('fill', '#7A6A5A')
            .text(labelText);
    });
}

/* -------------------------------------------
   Shared facet helpers
   ------------------------------------------- */
function _drawFacetAxes(g, x, y, w, h, xDomain, unit = '') {
    // X axis (simplified)
    const xTicks = smartXTicks(xDomain, w);
    const xAxisG = g.append('g')
        .attr('transform', `translate(0,${h})`)
        .call(d3.axisBottom(x).tickValues(xTicks).tickFormat(d3.format('d')).tickSize(3));
    _styleXAxisTickLabels(xAxisG, '10px', '#A89888');

    // Y axis (simplified)
    g.append('g')
        .call(d3.axisLeft(y).ticks(4).tickFormat(d => _formatYAxisTick(d, unit)).tickSize(3))
        .selectAll('text')
        .style('font-size', '10px')
        .style('fill', '#A89888');

    // Light grid
    g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(y).ticks(4).tickSize(-w).tickFormat(''))
        .selectAll('line')
        .style('stroke', '#E8E0D4')
        .style('stroke-width', 0.3);
    g.selectAll('.grid .domain').remove();
    _drawPlotBounds(g, w, h);
}

function _drawCurrentYearLine(g, x, h, xDomain) {
    const currentYear = State.get('currentYear');
    if (currentYear >= xDomain[0] && currentYear <= xDomain[1]) {
        g.append('line')
            .attr('x1', x(currentYear)).attr('x2', x(currentYear))
            .attr('y1', 0).attr('y2', h)
            .attr('stroke', '#C4913E')
            .attr('stroke-width', 0.8)
            .attr('stroke-dasharray', '3,2')
            .attr('opacity', 0.5);
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

function _getActiveIndicatorMeta() {
    const meta = DataLoader.getMetadata();
    const cat = meta.categories.find(c => c.id === State.get('activeCategory'));
    if (!cat) return null;
    for (const group of (cat.indicatorGroups || [])) {
        for (const ind of group.indicators || []) {
            if (ind.id === State.get('activeIndicator')) return ind;
        }
    }
    return null;
}

function _usesTightYDomain() {
    const mode = State.get('axisMode') || 'absolute';
    if (mode === 'index' || mode === 'pct_total' || mode === 'pct_territory') return true;

    const ind = _getActiveIndicatorMeta();
    if (!ind) return false;
    const unit = String(ind.unit || '').toLowerCase();
    const id = String(ind.id || '').toLowerCase();
    const field = String(ind.dataField || '').toLowerCase();
    const text = `${id} ${field}`;

    if (unit.includes('%') || unit.includes('índice') || unit.includes('indice')) return true;
    if (unit === '0-2' || unit === '0/1' || unit.includes('/')) return true;
    return /(gini|share|yield|intensity|binary|ratio|rate|_pc\b)/.test(text);
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




