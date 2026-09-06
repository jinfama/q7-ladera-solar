/* provenance-panel.js — "Como trabajamos": one long series, cell by cell, saying out loud
   which years are observed and which are estimated, with what method and from what source.

   The point of this panel is not decoration. Historians question these series precisely where
   the sources are thin, so the honest answer is to draw the thin parts differently and let the
   reader click any year to see where the number came from.

   Convention (shared with the `series-visor` skill and the Minerva evidence atlas):
     - observed  -> filled dot on a solid stroke
     - estimated -> hollow track, dashed stroke, coloured by estimation method
     - no data   -> gap, never a straight line pretending continuity

   Self-contained on purpose: each viewer is its own repository, so this file is copied rather
   than shared. It needs only d3 v7, already loaded globally by the page.

   Data contract: data/provenance/<id>.json as produced by
   docs/visores_2026-09/tools/build_provenance.py
     { id, label, unit, territory, years[], values[], flag[], method[], source[],
       confidence[], note[], donors[], cobertura{} }
*/

const FLAG_OBS = 'original';
const FLAG_EST = 'estimado';
const FLAG_NONE = 'sin_dato';

// Canonical vocabulary of the data-provenance skill. An unknown method still renders,
// in grey, labelled with its raw name — hiding it would defeat the purpose of the panel.
const METHODS = {
    observed:                  { label: 'Observado en la fuente',                 color: '#1a4d2e' },
    linear_interpolation:      { label: 'Interpolación lineal entre observaciones', color: '#c77b30' },
    extrapolation:             { label: 'Extrapolación',                          color: '#a83232' },
    growth_proxy:              { label: 'Proxy de crecimiento',                   color: '#7570b3' },
    distributed_from_aggregate:{ label: 'Reparto desde un agregado',              color: '#2b7a8c' },
    manual_correction:         { label: 'Corrección manual documentada',          color: '#8a6d3b' },
    missing:                   { label: 'Sin dato',                               color: '#9aa0a6' },

    // Methods the Spanish agricultural pipeline uses that are not in the data-provenance
    // vocabulary. They are labelled here so a reader understands the chart, and they are ALSO
    // listed as non-canonical in index.json so they can be reconciled upstream. Naming them
    // properly on screen and flagging them in the metadata are different jobs.
    derived:                   { label: 'Derivado de otras dos series',           color: '#4a7c9b' },
    carry_forward:             { label: 'Último valor arrastrado hacia delante',  color: '#b5893f' },
    carry_backward:            { label: 'Primer valor arrastrado hacia atrás',    color: '#96733a' },
    benchmark_distribution:    { label: 'Reparto desde un año de referencia',     color: '#2b7a8c' },
    scaled_from_national:      { label: 'Escalado desde el total nacional',       color: '#5c8a6b' },
    scaled_carry_backward:     { label: 'Escalado y arrastrado hacia atrás',      color: '#7d9a6e' },
    structural_zero:           { label: 'Cero estructural (el cultivo no existía)', color: '#6b675f' },
    derived_from_area_prod:    { label: 'Derivado de superficie y producción',    color: '#4a7c9b' },
};

const CONFIDENCE = { high: 'alta', medium: 'media', low: 'baja' };

const methodInfo = (m) => METHODS[m] || { label: m || 'sin especificar', color: '#9aa0a6' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtValue = (v, unit) => v == null ? '—'
    : new Intl.NumberFormat('es-ES', { maximumFractionDigits: Math.abs(v) < 10 ? 2 : 0 }).format(v)
      + (unit ? ' ' + unit : '');

const fmtYear = (y) => y < 0 ? `${Math.abs(y)} a.C.` : String(y);

/* ── one series ─────────────────────────────────────────────────────────────────────── */

function drawSeries(host, serie, opts = {}) {
    const onlyObserved = !!opts.onlyObserved;
    const N = serie.years.length;

    const points = serie.years.map((year, i) => ({
        i, year,
        value: serie.values[i],
        flag: serie.flag[i],
        method: serie.method?.[i],
        source: serie.source?.[i],
        confidence: serie.confidence?.[i],
        note: serie.note?.[i],
        donors: serie.donors?.[i] || null,
    }));

    const shown = onlyObserved ? points.filter(p => p.flag === FLAG_OBS) : points;
    const withValue = shown.filter(p => p.value != null);
    if (!withValue.length) {
        host.innerHTML = '<p class="pv-empty">Esta serie no tiene ningún valor que mostrar.</p>';
        return;
    }

    const W = 820, H = 300, M = { top: 16, right: 16, bottom: 30, left: 62 };
    const iw = W - M.left - M.right, ih = H - M.top - M.bottom;

    const x = d3.scaleLinear().domain(d3.extent(withValue, p => p.year)).range([0, iw]).nice();
    const y = d3.scaleLinear().domain([0, d3.max(withValue, p => p.value) * 1.08]).range([ih, 0]).nice();

    host.innerHTML = '';
    const svg = d3.select(host).append('svg')
        .attr('viewBox', `0 0 ${W} ${H}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .attr('role', 'img')
        .attr('aria-label',
            `${serie.label} en ${serie.territory}. ${serie.cobertura.observadas} de ` +
            `${serie.cobertura.celdas} años observados.`);
    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

    g.append('g').attr('class', 'pv-axis').attr('transform', `translate(0,${ih})`)
        .call(d3.axisBottom(x).ticks(8).tickFormat(d3.format('d')));
    g.append('g').attr('class', 'pv-axis')
        .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('~s')));

    // Segments, one per consecutive pair. A segment is solid only when BOTH ends are observed;
    // any segment touching an estimate is dashed and takes the estimate's method colour.
    // A pair whose ends are not consecutive years (a gap) is not drawn at all.
    if (!onlyObserved) {
        const segs = [];
        for (let k = 0; k < shown.length - 1; k++) {
            const a = shown[k], b = shown[k + 1];
            if (a.value == null || b.value == null) continue;
            const bothObs = a.flag === FLAG_OBS && b.flag === FLAG_OBS;
            const est = a.flag === FLAG_EST ? a : (b.flag === FLAG_EST ? b : null);
            segs.push({ a, b, solid: bothObs, color: methodInfo(est ? est.method : 'observed').color });
        }
        g.append('g').selectAll('line').data(segs).join('line')
            .attr('x1', s => x(s.a.year)).attr('y1', s => y(s.a.value))
            .attr('x2', s => x(s.b.year)).attr('y2', s => y(s.b.value))
            .attr('stroke', s => s.color)
            .attr('stroke-width', s => s.solid ? 2.2 : 1.4)
            .attr('stroke-dasharray', s => s.solid ? null : '4 3')
            .attr('opacity', s => s.solid ? 1 : 0.75);
    } else {
        g.append('path')
            .attr('fill', 'none').attr('stroke', METHODS.observed.color).attr('stroke-width', 2.2)
            .attr('d', d3.line().x(p => x(p.year)).y(p => y(p.value))(withValue));
    }

    // Observed years get a filled dot; estimates get a small hollow tick so they are visible
    // as individual decisions rather than as a smooth curve.
    const obs = withValue.filter(p => p.flag === FLAG_OBS);
    const est = withValue.filter(p => p.flag === FLAG_EST);

    g.append('g').selectAll('circle.pv-est').data(est).join('circle')
        .attr('class', 'pv-est')
        .attr('cx', p => x(p.year)).attr('cy', p => y(p.value)).attr('r', 1.6)
        .attr('fill', p => methodInfo(p.method).color).attr('opacity', 0.55);

    g.append('g').selectAll('circle.pv-obs').data(obs).join('circle')
        .attr('class', 'pv-obs')
        .attr('cx', p => x(p.year)).attr('cy', p => y(p.value)).attr('r', 4)
        .attr('fill', METHODS.observed.color).attr('stroke', '#fff').attr('stroke-width', 1.2);

    /* Hover on desktop, tap on mobile: the same nearest-year lookup drives both, so a phone
       is never left with hover as the only way to read a point. */
    const tip = ensureTip();
    const marker = g.append('line').attr('class', 'pv-marker')
        .attr('y1', 0).attr('y2', ih).attr('stroke', '#333')
        .attr('stroke-width', 1).attr('opacity', 0);

    const nearest = (px) => {
        const yr = x.invert(px);
        let best = null, bd = Infinity;
        for (const p of withValue) {
            const d = Math.abs(p.year - yr);
            if (d < bd) { bd = d; best = p; }
        }
        return best;
    };

    const show = (ev) => {
        const [px] = d3.pointer(ev, g.node());
        const p = nearest(px);
        if (!p) return;
        MARKERS.forEach(m => m !== marker && m.attr('opacity', 0));
        marker.attr('x1', x(p.year)).attr('x2', x(p.year)).attr('opacity', 0.35);
        tip.innerHTML = tipHTML(p, serie);
        tip.style.display = 'block';
        const tw = tip.offsetWidth, th = tip.offsetHeight;
        let left = ev.clientX + 14, top = ev.clientY - th - 12;
        if (left + tw > window.innerWidth - 8) left = ev.clientX - tw - 14;
        if (top < 8) top = ev.clientY + 18;
        tip.style.left = `${Math.max(8, left)}px`;
        tip.style.top = `${Math.max(8, Math.min(top, window.innerHeight - th - 8))}px`;
    };

    pruneMarkers();
    MARKERS.push(marker);
    svg.style('touch-action', 'pan-y')
        .on('pointermove', (ev) => { if (ev.pointerType !== 'touch') show(ev); })
        .on('pointerdown', show)
        // Leaving one chart must not hide a tooltip another chart just opened, so the
        // dismissal is handled once, globally, by installDismiss().
        .on('pointerleave', (ev) => { if (ev.pointerType !== 'touch') hideAll(); });
    installDismiss();
}

/* The tooltip is a single shared element, so dismissal has to be global. Registering it per
   panel meant every other panel's listener fired on the same tap and hid the tooltip the
   panel under the finger had just opened -- and redrawing a chart leaked one more listener
   each time the "only observed years" toggle was flipped. */
const MARKERS = [];
let dismissInstalled = false;

/** Drop markers whose chart was replaced by a redraw, so the toggle cannot leak them. */
function pruneMarkers() {
    for (let i = MARKERS.length - 1; i >= 0; i--) {
        const n = MARKERS[i].node();
        if (!n || !n.isConnected) MARKERS.splice(i, 1);
    }
}

function hideAll() {
    const t = document.getElementById('pv-tip');
    if (t) t.style.display = 'none';
    pruneMarkers();
    MARKERS.forEach(m => m.attr('opacity', 0));
}

function installDismiss() {
    if (dismissInstalled) return;
    dismissInstalled = true;
    document.addEventListener('pointerdown', (ev) => {
        if (!ev.target.closest?.('.pv-chart, .pv-matrix-scroll')) hideAll();
    }, { passive: true, capture: true });
    window.addEventListener('scroll', hideAll, { passive: true, capture: true });
}

function tipHTML(p, serie) {
    const mi = methodInfo(p.method);
    const rows = [];
    rows.push(`<div class="pv-tip-h">${esc(fmtYear(p.year))} · ${esc(serie.territory)}</div>`);
    rows.push(`<div class="pv-tip-v">${esc(fmtValue(p.value, serie.unit))}</div>`);
    const chip = p.flag === FLAG_OBS ? 'Observado' : p.flag === FLAG_EST ? 'Estimado' : 'Sin dato';
    rows.push(`<div class="pv-chip" style="background:${mi.color}">${chip}</div>`);
    rows.push(`<dl class="pv-tip-dl">`);
    rows.push(`<dt>Método</dt><dd>${esc(mi.label)}</dd>`);
    if (p.source) rows.push(`<dt>Fuente</dt><dd>${esc(p.source)}</dd>`);
    if (p.confidence) rows.push(`<dt>Confianza</dt><dd>${esc(CONFIDENCE[p.confidence] || p.confidence)}</dd>`);
    if (p.donors && p.donors.length === 2) {
        rows.push(`<dt>Interpolado entre</dt><dd>${esc(fmtYear(p.donors[0]))} y ${esc(fmtYear(p.donors[1]))}</dd>`);
    }
    rows.push(`</dl>`);
    if (p.note) rows.push(`<div class="pv-tip-note">${esc(p.note)}</div>`);
    return rows.join('');
}

function ensureTip() {
    let t = document.getElementById('pv-tip');
    if (!t) {
        t = document.createElement('div');
        t.id = 'pv-tip';
        t.className = 'pv-tip';
        document.body.appendChild(t);
    }
    return t;
}

/* ── coverage bar + legend + download ───────────────────────────────────────────────── */

const pct = (v) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(v);

function coverageBar(c) {
    const total = c.celdas || 1;
    const seg = (n, cls, label) => n
        ? `<span class="pv-bar-seg ${cls}" style="width:${(100 * n / total).toFixed(2)}%" title="${label}: ${n}"></span>`
        : '';
    return `
      <div class="pv-bar" role="img" aria-label="${c.observadas} de ${c.celdas} años observados">
        ${seg(c.observadas, 'obs', 'Observado')}
        ${seg(c.estimadas, 'est', 'Estimado')}
        ${seg(c.sin_dato, 'nod', 'Sin dato')}
      </div>
      <p class="pv-bar-cap">
        <b>${pct(c.pct_observado)} %</b> de los años son dato observado
        (${c.observadas} de ${c.celdas}); ${c.estimadas} estimados${c.sin_dato ? `, ${c.sin_dato} sin dato` : ''}.
      </p>`;
}

function legend(serie) {
    const used = [...new Set(serie.method.filter(Boolean))];
    return `<ul class="pv-legend">` + used.map(m => {
        const mi = methodInfo(m);
        return `<li><span class="pv-sw" style="background:${mi.color}"></span>${esc(mi.label)}</li>`;
    }).join('') + `</ul>`;
}

function toCSV(serie) {
    const head = ['year', 'value', 'unit', 'territory', 'flag', 'method', 'source',
                  'confidence', 'donor_year_prev', 'donor_year_next', 'note'];
    const q = (v) => {
        const s = v == null ? '' : String(v);
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [head.join(',')];
    for (let i = 0; i < serie.years.length; i++) {
        lines.push([
            serie.years[i], serie.values[i] ?? '', serie.unit ?? '', serie.territory,
            serie.flag[i], serie.method?.[i] ?? '', serie.source?.[i] ?? '',
            serie.confidence?.[i] ?? '',
            serie.donors?.[i]?.[0] ?? '', serie.donors?.[i]?.[1] ?? '',
            serie.note?.[i] ?? '',
        ].map(q).join(','));
    }
    return '﻿' + lines.join('\r\n');
}

function download(name, text, mime = 'text/csv;charset=utf-8') {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── coverage matrix (territory x year) ─────────────────────────────────────────────── */

function drawCoverage(host, cov) {
    const COLORS = { 0: '#e8e6e1', 1: '#1a4d2e', 2: '#e0b070' };
    // Row pitch has to clear the 9.5 px label or the names overlap each other. A fixed 7 px
    // only works when there are so many rows that the labels are decoration anyway; with the
    // 76 country x crop rows of this atlas they are the point, so the rows get room.
    // (Divergence from the copied kit -- worth pushing back into web_andalusia.)
    const cw = 9, chh = cov.territories.length > 200 ? 7 : 12, labelW = 138;
    const W = labelW + cov.years.length * cw, H = cov.territories.length * chh + 26;

    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'pv-matrix-scroll';   // owns its horizontal scroll; the page never does
    host.appendChild(wrap);

    const svg = d3.select(wrap).append('svg')
        .attr('width', W).attr('height', H)
        .attr('role', 'img')
        .attr('aria-label', `Cobertura por territorio y año de ${cov.label}`);

    svg.append('g').selectAll('text').data(cov.territories).join('text')
        .attr('x', labelW - 6).attr('y', (_, i) => 26 + i * chh + chh - 1.5)
        .attr('text-anchor', 'end').attr('class', 'pv-mx-label')
        .text(t => (cov.labels?.[t] || t).slice(0, 22));

    const step = Math.max(1, Math.round(cov.years.length / 12));
    svg.append('g').selectAll('text').data(cov.years.filter((_, i) => i % step === 0)).join('text')
        .attr('x', yv => labelW + cov.years.indexOf(yv) * cw)
        .attr('y', 14).attr('class', 'pv-mx-label')
        .text(yv => yv);

    const cells = [];
    cov.grid.forEach((row, r) => row.forEach((v, c) => cells.push({ r, c, v })));
    const tip = ensureTip();
    svg.append('g').selectAll('rect').data(cells).join('rect')
        .attr('x', d => labelW + d.c * cw).attr('y', d => 26 + d.r * chh)
        .attr('width', cw - 1).attr('height', chh - 1)
        .attr('fill', d => COLORS[d.v])
        .on('pointerdown pointermove', (ev, d) => {
            const t = cov.territories[d.r];
            tip.innerHTML =
                `<div class="pv-tip-h">${esc(cov.labels?.[t] || t)} · ${esc(cov.years[d.c])}</div>` +
                `<div class="pv-tip-v">${esc({ 0: 'Sin dato', 1: 'Observado', 2: 'Estimado' }[d.v])}</div>`;
            tip.style.display = 'block';
            tip.style.left = `${Math.min(ev.clientX + 12, window.innerWidth - tip.offsetWidth - 8)}px`;
            tip.style.top = `${Math.max(8, ev.clientY - tip.offsetHeight - 10)}px`;
        })
        .on('pointerleave', (ev) => { if (ev.pointerType !== 'touch') hideAll(); });

    const note = document.createElement('p');
    note.className = 'pv-bar-cap';
    note.innerHTML =
        `<span class="pv-sw" style="background:${COLORS[1]}"></span>observado ` +
        `<span class="pv-sw" style="background:${COLORS[2]}"></span>estimado ` +
        `<span class="pv-sw" style="background:${COLORS[0]}"></span>sin dato` +
        (cov.year_step > 1 ? ` · un año de cada ${cov.year_step}` : '') +
        (cov.nota_truncado ? ` · ${esc(cov.nota_truncado)}` : '');
    host.appendChild(note);
}

/* ── public API ─────────────────────────────────────────────────────────────────────── */

const ProvenancePanel = {
    METHODS,

    /** Render one series panel into `host`, with its coverage bar, legend, toggle and download. */
    renderSeries(host, serie, opts = {}) {
        host.innerHTML = `
          <div class="pv-panel">
            <header class="pv-head">
              <h3>${esc(serie.territory)}</h3>
              <p class="pv-sub">${esc(serie.label)}${serie.unit ? ` · ${esc(serie.unit)}` : ''} ·
                 ${esc(fmtYear(serie.years[0]))}–${esc(fmtYear(serie.years[serie.years.length - 1]))}</p>
            </header>
            ${coverageBar(serie.cobertura)}
            <div class="pv-chart"></div>
            ${legend(serie)}
            <div class="pv-actions">
              <label class="pv-toggle">
                <input type="checkbox" ${opts.onlyObserved ? 'checked' : ''}> Ver solo los años observados
              </label>
              <button type="button" class="pv-dl">Descargar esta serie (CSV con procedencia)</button>
            </div>
          </div>`;

        const chart = host.querySelector('.pv-chart');
        let onlyObserved = !!opts.onlyObserved;
        drawSeries(chart, serie, { onlyObserved });

        host.querySelector('.pv-toggle input').addEventListener('change', (e) => {
            onlyObserved = e.target.checked;
            drawSeries(chart, serie, { onlyObserved });
        });
        host.querySelector('.pv-dl').addEventListener('click', () => {
            download(`${serie.id}.csv`, toCSV(serie));
        });
    },

    /** Render the territory x year coverage matrix. */
    renderCoverage(host, cov) { drawCoverage(host, cov); },

    /** Fetch the catalogue written by build_provenance.py. */
    async load(base = 'data/provenance') {
        const index = await fetch(`${base}/index.json`).then(r => r.json());
        const series = await Promise.all(
            index.series.map(s => fetch(`${base}/${s.file}`).then(r => r.json())));
        const coverage = index.coverage
            ? await fetch(`${base}/${index.coverage}`).then(r => r.json())
            : null;
        return { index, series, coverage };
    },
};

export default ProvenancePanel;
