/* export-share.js — Citable-viewer plumbing for the LATAM atlas: state in the
 * URL (permalink), a PNG of the current chart or map, and reset.
 *
 * The audit (docs/visores_2026-09/INFORME.md §4.1) lists three functions that
 * make an academic viewer citable. The CSV of the current panel already existed
 * (app.js `_downloadDataPackage`); the other two did not, and are here.
 *
 * Kept in its own module so the change is reversible: app.js calls
 * ExportShare.init() once and nothing else in it depends on this file.
 */
import State from './state.js?v=20260906f';

const ExportShare = (() => {

    /* ── which state keys travel in the URL ─────────────────────
       key -> [short name, default]. Anything at its default is left out, so a
       plain view produces a short, readable link. */
    const FIELDS = [
        ['activeCategory',   'cat',   'agriculture'],
        ['activeView',       'view',  'map'],
        ['activeIndicator',  'ind',   'production'],
        ['geoLevel',         'level', 'country'],
        ['currentYear',      'year',  null],
        ['axisMode',         'axis',  'absolute'],
        ['activeUnit',       'u',     'toneladas'],
        ['scaleType',        'sc',    'linear'],
        ['cropItem',         'item',  'all'],
        ['cropCategory',     'icat',  'all'],
        ['chartLayout',      'cl',    'overlay'],
        ['chartType',        'ct',    'lines'],
        ['trendMA',          'ma',    'none'],
        ['rankingMode',      'rm',    'byCountry'],
        ['rankingTopN',      'rn',    10],
        ['treemapLevel',     'tl',    'category'],
        ['topN',             'tn',    10],
        ['splitMode',        'split', false],
        ['compareMode',      'cmp',   false],
    ];
    const LISTS = [
        ['selectedCountries', 't'],
        ['selectedItems',     'items'],
        ['selectedPartners',  'p'],
    ];

    let _ready = false;          // stay quiet until the incoming hash is applied
    let _sourceText = () => '';
    let _titleText = () => '';

    function _enc(v) { return encodeURIComponent(String(v)); }

    function buildHash() {
        const parts = [];
        for (const [key, short, def] of FIELDS) {
            const v = State.get(key);
            if (v == null || v === def) continue;
            if (typeof v === 'boolean') { if (v) parts.push(short + '=1'); continue; }
            parts.push(short + '=' + _enc(v));
        }
        for (const [key, short] of LISTS) {
            const arr = State.get(key);
            if (Array.isArray(arr) && arr.length) {
                parts.push(short + '=' + arr.map(_enc).join(','));
            }
        }
        const yr = State.get('yearRange');
        if (Array.isArray(yr) && yr.length === 2) parts.push('yr=' + yr[0] + '-' + yr[1]);
        return parts.join('&');
    }

    function syncHash() {
        if (!_ready) return;
        const h = buildHash();
        const url = location.pathname + location.search + (h ? '#' + h : '');
        history.replaceState(null, '', url);
    }

    /* Apply a hash. Category is set first and on its own tick, because
       _onCategoryChange loads data asynchronously and would otherwise reset the
       indicator that came in the same link. */
    function applyHash(rawHash) {
        const hash = (rawHash != null ? rawHash : location.hash).replace(/^#/, '');
        if (!hash) return false;
        const params = {};
        hash.split('&').forEach(p => {
            const i = p.indexOf('=');
            if (i < 0) return;
            params[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
        });

        const order = [...FIELDS].sort((a, b) =>
            (a[1] === 'cat' ? -1 : 0) - (b[1] === 'cat' ? -1 : 0));
        for (const [key, short, def] of order) {
            if (!(short in params)) continue;
            const raw = params[short];
            let v = raw;
            if (typeof def === 'boolean') v = raw === '1' || raw === 'true';
            else if (typeof def === 'number') v = Number(raw);
            else if (short === 'year') v = parseInt(raw, 10);
            if (v === '' || (typeof v === 'number' && !Number.isFinite(v))) continue;
            State.set(key, v);
        }
        if (params.yr) {
            const m = params.yr.split('-').map(Number);
            if (m.length === 2 && m.every(Number.isFinite)) State.set('yearRange', m);
        }
        for (const [key, short] of LISTS) {
            if (!(short in params)) continue;
            const arr = params[short].split(',').filter(Boolean);
            if (key === 'selectedCountries' && State.setCountries) State.setCountries(arr);
            else State.set(key, arr);
        }
        return true;
    }

    /* ── small UI helpers ───────────────────────────────────── */

    function _flash(msg) {
        let el = document.getElementById('share-flash');
        if (!el) {
            el = document.createElement('div');
            el.id = 'share-flash';
            el.className = 'share-flash';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.classList.add('visible');
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('visible'), 2600);
    }

    function _slug(s) {
        return (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    function _baseName() {
        return ['latam', _slug(State.get('activeIndicator')),
                _slug(State.get('activeView')), String(State.get('currentYear'))]
               .filter(Boolean).join('_');
    }

    function _saveBlob(filename, blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    /* ── permalink ──────────────────────────────────────────── */

    async function copyLink() {
        syncHash();
        const url = location.href;
        try {
            await navigator.clipboard.writeText(url);
            _flash('Enlace copiado. Reproduce esta vista tal cual está.');
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = url;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); _flash('Enlace copiado.'); }
            catch (e2) { _flash('Copia el enlace de la barra del navegador.'); }
            ta.remove();
        }
    }

    /* ── reset ──────────────────────────────────────────────── */

    function reset() {
        location.replace(location.pathname + '?v=1');
    }

    /* ── PNG of the active panel ────────────────────────────── */

    let _cssText = null;
    async function _styles() {
        if (_cssText != null) return _cssText;
        try {
            const link = document.querySelector('link[href*="styles.css"]');
            const res = await fetch(link ? link.getAttribute('href') : 'css/styles.css');
            _cssText = await res.text();
        } catch (e) { _cssText = ''; }
        return _cssText;
    }

    function _biggestSvg() {
        const panel = document.querySelector('.viz-panel.active');
        if (!panel) return null;
        let best = null, bestArea = 0;
        panel.querySelectorAll('svg').forEach(svg => {
            const r = svg.getBoundingClientRect();
            if (r.width * r.height > bestArea) { bestArea = r.width * r.height; best = svg; }
        });
        return bestArea > 400 ? best : null;
    }

    /* The map legend is an HTML block outside the SVG, so a raw serialisation
       loses the colour key. Mirror it into the exported image. */
    function _legendGroup(ns, x, y, maxWidth) {
        const panel = document.querySelector('.viz-panel.active');
        if (!panel) return null;
        const el = [...panel.querySelectorAll('.map-legend')]
            .find(e => e.offsetParent !== null && e.textContent.trim());
        if (!el) return null;

        const g = document.createElementNS(ns, 'g');
        g.setAttribute('transform', `translate(${x},${y})`);
        const mk = (tag) => document.createElementNS(ns, tag);
        const label = (str, tx, ty, size, weight, fill, anchor) => {
            const t = mk('text');
            t.setAttribute('x', tx); t.setAttribute('y', ty);
            t.setAttribute('font-family', 'Archivo, Inter, Segoe UI, Helvetica, Arial, sans-serif');
            t.setAttribute('font-size', size);
            t.setAttribute('font-weight', weight);
            t.setAttribute('fill', fill);
            if (anchor) t.setAttribute('text-anchor', anchor);
            t.textContent = str;
            return t;
        };

        let cy = 0;
        const title = el.querySelector('.map-legend-title');
        if (title) {
            g.appendChild(label(title.textContent.trim().toUpperCase(), 0, 9, 9.5, 600, '#54443A'));
            cy = 16;
        }
        const cells = [...el.querySelectorAll('.map-legend-cell')];
        if (!cells.length) return cy ? g : null;
        const w = Math.min(maxWidth, 280);
        const cw = w / cells.length;
        cells.forEach((c, i) => {
            const r = mk('rect');
            r.setAttribute('x', i * cw); r.setAttribute('y', cy);
            r.setAttribute('width', cw + 0.5); r.setAttribute('height', 9);
            r.setAttribute('fill', getComputedStyle(c).backgroundColor);
            g.appendChild(r);
        });
        const ticks = [...el.querySelectorAll('.map-legend-tick')];
        ticks.forEach((sp, i) => {
            const txt = sp.textContent.trim();
            if (!txt) return;
            const px = (i / (ticks.length - 1)) * w;
            const anchor = i === 0 ? 'start' : (i === ticks.length - 1 ? 'end' : 'middle');
            g.appendChild(label(txt, px, cy + 21, 9, 400, '#746048', anchor));
        });
        return g;
    }

    function _caption() {
        const view = State.get('activeView');
        const yr = State.get('yearRange') || [];
        const period = ['map', 'ranking', 'table', 'treemap'].includes(view)
            ? String(State.get('currentYear'))
            : (yr.length === 2 ? yr[0] + '–' + yr[1] : String(State.get('currentYear')));
        return { title: _titleText(), sub: period, src: _sourceText() };
    }

    async function exportPNG() {
        const svg = _biggestSvg();
        if (!svg) {
            _flash('Esta vista no tiene un gráfico que guardar como imagen.');
            return;
        }
        const rect = svg.getBoundingClientRect();
        const w = Math.max(320, Math.round(rect.width));
        const h = Math.max(240, Math.round(rect.height));
        const PAD_TOP = 54, PAD_BOTTOM = 34;
        const ns = 'http://www.w3.org/2000/svg';

        const clone = svg.cloneNode(true);
        clone.setAttribute('xmlns', ns);
        clone.setAttribute('width', w);
        clone.setAttribute('height', h);
        if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
        const style = document.createElementNS(ns, 'style');
        style.textContent = await _styles();
        clone.insertBefore(style, clone.firstChild);

        const cap = _caption();
        const outer = document.createElementNS(ns, 'svg');
        outer.setAttribute('xmlns', ns);
        const bg = document.createElementNS(ns, 'rect');
        bg.setAttribute('width', w);
        bg.setAttribute('fill', '#F4EBD6');
        outer.appendChild(bg);

        function text(str, x, y, size, weight, fill, family) {
            const t = document.createElementNS(ns, 'text');
            t.setAttribute('x', x); t.setAttribute('y', y);
            t.setAttribute('font-family', family || 'Archivo, Inter, Segoe UI, Helvetica, Arial, sans-serif');
            t.setAttribute('font-size', size);
            t.setAttribute('font-weight', weight);
            t.setAttribute('fill', fill);
            t.textContent = str;
            return t;
        }
        outer.appendChild(text(cap.title, 18, 26, 17, 700, '#231A15',
                               'Archivo Black, Arial Black, Impact, sans-serif'));
        outer.appendChild(text(cap.sub, 18, 44, 12, 500, '#746048'));
        const rule = document.createElementNS(ns, 'rect');
        rule.setAttribute('x', 18); rule.setAttribute('y', PAD_TOP - 3);
        rule.setAttribute('width', w - 36); rule.setAttribute('height', 1);
        rule.setAttribute('fill', '#CDBB99');
        outer.appendChild(rule);

        const g = document.createElementNS(ns, 'g');
        g.setAttribute('transform', `translate(0,${PAD_TOP})`);
        g.appendChild(clone);
        outer.appendChild(g);

        const legend = _legendGroup(ns, 18, PAD_TOP + h + 4, Math.min(280, w - 36));
        const extra = legend ? 40 : 0;
        if (legend) outer.appendChild(legend);
        outer.appendChild(text(cap.src.slice(0, 170), 18, h + PAD_TOP + extra + 21, 10, 400, '#746048'));

        const totalH = h + PAD_TOP + PAD_BOTTOM + extra;
        outer.setAttribute('width', w);
        outer.setAttribute('height', totalH);
        outer.setAttribute('viewBox', `0 0 ${w} ${totalH}`);
        bg.setAttribute('height', totalH);

        const xml = new XMLSerializer().serializeToString(outer);
        const blobUrl = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
        const img = new Image();
        img.onload = () => {
            const scale = 2;
            const canvas = document.createElement('canvas');
            canvas.width = w * scale;
            canvas.height = totalH * scale;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#F4EBD6';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(blobUrl);
            canvas.toBlob(b => {
                if (!b) { _flash('No se pudo generar el PNG.'); return; }
                _saveBlob(_baseName() + '.png', b);
                _flash('PNG de la vista descargado.');
            }, 'image/png');
        };
        img.onerror = () => {
            URL.revokeObjectURL(blobUrl);
            _flash('No se pudo generar el PNG de esta vista.');
        };
        img.src = blobUrl;
    }

    /* ── wiring ─────────────────────────────────────────────── */

    function init(opts) {
        opts = opts || {};
        if (opts.sourceText) _sourceText = opts.sourceText;
        if (opts.titleText) _titleText = opts.titleText;
        const on = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        };
        on('btn-png', exportPNG);
        on('btn-link', copyLink);
        on('btn-reset', reset);

        // Keep the URL in step with the state, but only after the incoming link
        // has been applied.
        [...FIELDS.map(f => f[0]), ...LISTS.map(l => l[0]), 'yearRange']
            .forEach(k => State.subscribe(k, syncHash));
    }

    function markReady() { _ready = true; syncHash(); }

    return { init, applyHash, buildHash, syncHash, markReady, copyLink, exportPNG, reset };
})();

export default ExportShare;
