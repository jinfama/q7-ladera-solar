/* utils.js — Formatters, color scales, constants */

/* ═══════════════════════════════════════════════
   Country metadata
   ═══════════════════════════════════════════════ */
export const COUNTRIES = {
    ARG: { name: 'Argentina', region: 'southern_cone' },
    BOL: { name: 'Bolivia', region: 'andean' },
    BRA: { name: 'Brasil', region: 'brazil' },
    CHL: { name: 'Chile', region: 'southern_cone' },
    COL: { name: 'Colombia', region: 'andean' },
    CRI: { name: 'Costa Rica', region: 'central_caribbean' },
    CUB: { name: 'Cuba', region: 'central_caribbean' },
    DOM: { name: 'Rep. Dominicana', region: 'central_caribbean' },
    ECU: { name: 'Ecuador', region: 'andean' },
    SLV: { name: 'El Salvador', region: 'central_caribbean' },
    GTM: { name: 'Guatemala', region: 'central_caribbean' },
    HTI: { name: 'Haití', region: 'central_caribbean' },
    HND: { name: 'Honduras', region: 'central_caribbean' },
    MEX: { name: 'México', region: 'mexico' },
    NIC: { name: 'Nicaragua', region: 'central_caribbean' },
    PAN: { name: 'Panamá', region: 'central_caribbean' },
    PRY: { name: 'Paraguay', region: 'southern_cone' },
    PER: { name: 'Perú', region: 'andean' },
    PRI: { name: 'Puerto Rico', region: 'central_caribbean' },
    URY: { name: 'Uruguay', region: 'southern_cone' },
    VEN: { name: 'Venezuela', region: 'andean' },
};

export const REGIONS = {
    mexico: { label: 'México', countries: ['MEX'] },
    central_caribbean: { label: 'Centroamérica y Caribe', countries: ['GTM','SLV','HND','NIC','CRI','PAN','CUB','DOM','HTI','PRI'] },
    andean: { label: 'Andina', countries: ['COL','VEN','ECU','PER','BOL'] },
    brazil: { label: 'Brasil', countries: ['BRA'] },
    southern_cone: { label: 'Cono Sur', countries: ['ARG','CHL','URY','PRY'] },
};

/* ═══════════════════════════════════════════════
   Paleta de fresco (2026-09-08, V7): la de la portada index.html.
   Regla de la casa: la paleta del interior es la de la portada. Las
   escalas de datos son la MISMA familia que el chrome —cal, ocre,
   sinopia apagada, sombra— pero no son tokens: son codificaciones
   de datos y se cambian solo con su leyenda (_legendValueAt).
   ═══════════════════════════════════════════════ */

// Sequential: cal → ocre → sinopia apagada → sombra (9 steps; L* 93 → 21,
// cada escalón ≥ 8 L*, así que ocho celdas de leyenda se separan a simple vista)
export const SEQ_COLORS = [
    '#F4EBD6', '#EBDDB3', '#DEC58A', '#CFA95E',
    '#BD8A47', '#AA6B3F', '#93503A', '#733B2F', '#4E2C24'
];

// Diverging: azul-verde de cal (verdigris) → cal → sinopia apagada
export const DIV_COLORS = [
    '#2F5A50', '#4F7B6E', '#7FA396', '#B5CBC0',
    '#EDE2C7',
    '#D6A98A', '#B8785A', '#93503A', '#6E3A2E'
];

// Categorical: los pigmentos que caben en la cal — ocre, sinopia, azurita,
// verdigris, sombra, tierra verde, malva de cal — a ≥ 3:1 sobre el papel de cal
export const CAT_COLORS = [
    '#A67A2E', // ocre tostado (el ocre claro no llega a 3:1 como línea sobre cal)
    '#93503A', // sinopia apagada
    '#4F6E86', // azurita
    '#5E8C82', // verdigris
    '#4E2C24', // sombra
    '#B8794F', // ocre tostado
    '#7A6B8F', // malva de cal
    '#6E7F45', // tierra verde
    '#9C6A55', // sinopia clara
    '#2F5A50', // verdigris oscuro
    '#A67C52', // siena clara
    '#8F6B7A', // malva oscura
    '#7E796C', // gris de cal
    '#6B4A3A', // sombra tostada
    '#3E5A78', // azurita oscura
    '#556B3A', // tierra verde oscura
    '#B45A4A', // sinopia viva
    '#7D5A2A', // ocre de sombra
    '#5A7A8A', // pizarra
    '#8E5568', // rosa de sombra
];

// Treemap category colors (11 crop categories), same family
export const CATEGORY_COLORS = {
    'Beverages':        '#6B4A3A',
    'Cereals':          '#CFA95E',
    'Fibre Crops':      '#6E7F45',
    'Fruits':           '#93503A',
    'Legumes':          '#5E8C82',
    'Oilseeds':         '#B8794F',
    'Other':            '#9A968A',
    'Roots & Tubers':   '#7A6B8F',
    'Sugar Crops':      '#4F6E86',
    'Tobacco':          '#4E2C24',
    'Vegetables':       '#3F6E63',
};

/* «Sin dato»: la trama de puntos, no un beige plano que se confundía con el
   centro de la escala divergente. Cada SVG lleva su propio <pattern> porque una
   referencia a un patrón definido en un SVG oculto no siempre se pinta. */
export function ensureNoDataPattern(svgSel, id) {
    if (svgSel.select('#' + id).empty()) {
        const p = svgSel.insert('defs', ':first-child').append('pattern')
            .attr('id', id).attr('patternUnits', 'userSpaceOnUse')
            .attr('width', 6).attr('height', 6);
        p.append('rect').attr('width', 6).attr('height', 6).attr('fill', '#EFE6D0');
        p.append('circle').attr('cx', 3).attr('cy', 3).attr('r', 0.9).attr('fill', 'rgba(84,68,58,.55)');
    }
    return `url(#${id})`;
}

/* ═══════════════════════════════════════════════
   Color scale builders
   ═══════════════════════════════════════════════ */

export function buildSequentialScale(domain) {
    return d3.scaleQuantize()
        .domain(domain)
        .range(SEQ_COLORS);
}

export function buildLogScale(domain) {
    const [min, max] = domain;
    const safeMin = min > 0 ? min : 1;
    return d3.scaleLog()
        .domain([safeMin, max])
        .range([SEQ_COLORS[0], SEQ_COLORS[SEQ_COLORS.length - 1]])
        .interpolate(d3.interpolateRgb)
        .clamp(true);
}

export function buildDivergingScale(domain) {
    const [min, max] = domain;
    const mid = (min + max) / 2;
    return d3.scaleDiverging()
        .domain([min, mid, max])
        .interpolator(d3.interpolateRgbBasis(DIV_COLORS));
}

/* ═══════════════════════════════════════════════
   Formatters
   ═══════════════════════════════════════════════ */

export function fmt(v, decimals = 0) {
    if (v == null || isNaN(v)) return '—';
    const abs = Math.abs(v);
    if (abs >= 1e9) return (v / 1e9).toFixed(1) + ' B';
    if (abs >= 1e6) return (v / 1e6).toFixed(1) + ' M';
    if (abs >= 1e4) return (v / 1e3).toFixed(1) + ' K';
    if (decimals > 0) return v.toFixed(decimals);
    return Math.round(v).toLocaleString('es-ES');
}

export function fmtPct(v) {
    if (v == null || isNaN(v)) return '—';
    return v.toFixed(1) + '%';
}

export function fmtUnit(v, unit) {
    if (v == null || isNaN(v)) return '—';
    const unitNorm = String(unit || '').toLowerCase();
    if (unitNorm.includes('%')) return fmtPct(v);
    if (unitNorm.includes('índice') || unitNorm.includes('indice') || unitNorm === '0-2') {
        return Number(v).toFixed(2);
    }
    if (unitNorm === '0/1') return Number(v).toFixed(0);
    switch (unit) {
        case 'tonnes':
        case 'toneladas':
            return fmt(v) + ' t';
        case 'hectares':
        case 'hectáreas':
        case 'ha':
            return fmt(v) + ' ha';
        case 'GJ':
            return fmt(v) + ' GJ';
        case 'GJ/ha':
            return v.toFixed(2) + ' GJ/ha';
        case 't/ha':
        case 'tonnes_per_ha':
            return v.toFixed(2) + ' t/ha';
        case 'cabezas':
            return fmt(v) + ' cab.';
        case 'UG':
            return fmt(v) + ' UG';
        case '1000 ha':
            return fmt(v) + ' (1000 ha)';
        case 'personas':
            return fmt(v) + ' pers.';
        case 'index100':
            return v.toFixed(1);
        case 'M horas/año':
            // The "M" here means "millones" — spelling it out short avoids the
            // ambiguous "M h/año" (read as megahour/year) that nobody parses.
            return fmt(v) + ' mill. h/año';
        case 'h/año':
        case 'horas/año':
            return fmt(v) + ' h/año';
        default:
            return fmt(v);
    }
}

/* ═══════════════════════════════════════════════
   Smart axis ticks
   ═══════════════════════════════════════════════ */
const ITEM_LABEL_OVERRIDES = new Map([
    ['Maize (corn)', 'Maize'],
    ['Onions and shallots, dry (excluding dehydrated)', 'Onions'],
    ['Cantaloupes and other melons', 'Melons'],
    ['Plantains and cooking bananas', 'Plantains'],
    ['Raw cane or beet sugar (centrifugal only)', 'Raw sugar'],
    ['Groundnuts, excluding shelled', 'Groundnuts'],
    ['Natural rubber in primary forms', 'Rubber'],
    ['Seed cotton, unginned', 'Seed cotton'],
    ['Oil palm fruit', 'Oil palm'],
    ['Coffee, green', 'Coffee'],
    ['Cassava, fresh', 'Cassava'],
    ['Meat of chickens, fresh or chilled', 'Chicken meat'],
    ['Chillies and peppers, green (Capsicum spp. and Pimenta spp.)', 'Green peppers'],
    ['Agricultural land', 'Tierra agricola'],
    ['Arable land', 'Tierra arable'],
    ['Permanent crops', 'Cultivos perm.'],
    ['Forest land', 'Bosques'],
    ['Other land', 'Otros usos'],
]);

export function shortItemLabel(name = '') {
    const text = String(name || '').trim();
    if (!text) return text;
    if (ITEM_LABEL_OVERRIDES.has(text)) return ITEM_LABEL_OVERRIDES.get(text);
    if (/^Onions and shallots/i.test(text)) return 'Onions';
    if (/^Raw cane or beet sugar/i.test(text)) return 'Raw sugar';
    if (/^Cantaloupes/i.test(text)) return 'Melons';
    if (/^Groundnuts/i.test(text)) return 'Groundnuts';
    if (/^Natural rubber/i.test(text)) return 'Rubber';
    if (/^Chillies and peppers/i.test(text)) return 'Green peppers';
    if (/^Meat of chickens/i.test(text)) return 'Chicken meat';
    const withoutParen = text.replace(/\s*\([^)]*\)/g, '').trim();
    return withoutParen || text;
}

export function shortEntityLabel(name = '') {
    const text = String(name || '').trim();
    if (!text) return text;
    if (/Centroam/i.test(text) || /Central America/i.test(text)) return 'Centro y Caribe';
    if (/^Latin America$/i.test(text)) return 'America Latina';
    return text;
}

export function smartXTicks(domain, pixelWidth) {
    const [raw0, raw1] = domain;
    const y0 = Math.ceil(raw0);
    const y1 = Math.floor(raw1);
    const span = y1 - y0;
    if (!Number.isFinite(span) || span <= 0) return [y0].filter(Number.isFinite);

    const maxTicks = Math.max(3, Math.floor(pixelWidth / 60));

    const steps = [1, 2, 5, 10, 20, 25, 50, 100];
    let step = steps.find(s => Math.ceil(span / s) <= maxTicks) || 100;

    const first = Math.ceil(y0 / step) * step;
    const interior = [];
    for (let y = first; y < y1; y += step) {
        if (y !== y0) interior.push(y);
    }

    const x = d3.scaleLinear().domain([y0, y1]).range([0, pixelWidth]);
    const minEndpointGap = 42;
    const filteredInterior = interior.filter(y =>
        x(y) - x(y0) >= minEndpointGap &&
        x(y1) - x(y) >= minEndpointGap
    );

    return Array.from(new Set([y0, ...filteredInterior, y1])).sort((a, b) => a - b);
}

/* ═══════════════════════════════════════════════
   Sidebar icons — bold, simple SVG paths designed to read clearly at 24-38px.
   All use viewBox 0 0 24 24 and `currentColor` so they inherit sidebar styles.
   ═══════════════════════════════════════════════ */
const OLD_CATEGORY_ICONS = {
    /* Wheat ear — central stalk with paired grains */
    agriculture: `
        <path d="M5.2 19.2h13.6" stroke="currentColor" stroke-width="1.15"/>
        <path d="M12 19V5.2" stroke="currentColor" stroke-width="1.2"/>
        <path d="M12 8.2c-1.9-.1-3.5-.9-4.7-2.5 2.1-.2 3.8.6 4.7 2.5z" stroke="currentColor" stroke-width="1.15"/>
        <path d="M12 11.2c2-.1 3.6-.9 4.8-2.6-2.2-.2-3.9.7-4.8 2.6z" stroke="currentColor" stroke-width="1.15"/>
        <path d="M8 19c.5-3.2 1.8-5.4 4-6.7 2.2 1.3 3.5 3.5 4 6.7" stroke="currentColor" stroke-width="1.15"/>
        <path d="M8.3 16.5h7.4" stroke="currentColor" stroke-width="1"/>`,

    /* Trade — globe with bidirectional arrow flow */
    trade: `
        <circle cx="12" cy="12" r="8.1" stroke="currentColor" stroke-width="1.15"/>
        <path d="M4 12h16M12 4c2 2.3 3 5 3 8s-1 5.7-3 8M12 4c-2 2.3-3 5-3 8s1 5.7 3 8" stroke="currentColor" stroke-width="1"/>
        <path d="M6.3 8.1c2.4-2 5.5-2.8 8.4-2M17.7 15.9c-2.4 2-5.5 2.8-8.4 2" stroke="currentColor" stroke-width="1.1"/>
        <path d="M6.4 8.1H4.6V6.3M17.6 15.9h1.8v1.8" stroke="currentColor" stroke-width="1.1"/>`,

    /* Landuse — divided land parcels (grid of plots, hierarchy of fill) */
    landuse: `
        <path d="M4.8 7.1 9.6 5l4.8 2.1 4.8-2.1v12l-4.8 2.1-4.8-2.1-4.8 2.1v-12z" stroke="currentColor" stroke-width="1.15"/>
        <path d="M9.6 5v12M14.4 7.1v12M4.8 11l4.8-2.1 4.8 2.1 4.8-2.1" stroke="currentColor" stroke-width="1"/>
        <path d="M6.5 15.6l2.1-.9M11.2 13.8l2.2.9M16 14.7l1.9-.8" stroke="currentColor" stroke-width=".95"/>`,

    /* Livestock — cow head silhouette with horns, eyes, snout */
    livestock: `
        <path d="M7.3 10.1c0-2.8 1.9-4.8 4.7-4.8s4.7 2 4.7 4.8v3.2c0 3-1.9 5.4-4.7 5.4s-4.7-2.4-4.7-5.4v-3.2z" stroke="currentColor" stroke-width="1.15"/>
        <path d="M7.5 9c-2.2-.7-3.2-2.1-3.1-4.2M16.5 9c2.2-.7 3.2-2.1 3.1-4.2" stroke="currentColor" stroke-width="1.1"/>
        <path d="M9.4 14.7c1.6.8 3.6.8 5.2 0M10 11.1h.1M14 11.1h.1" stroke="currentColor" stroke-width="1.1"/>
        <path d="M10.5 17.5v1.8M13.5 17.5v1.8" stroke="currentColor" stroke-width="1"/>`,

    /* Labor — farm worker silhouette holding a hoe */
    labor: `
        <path d="M4.8 19.2h14.4" stroke="currentColor" stroke-width="1.15"/>
        <circle cx="9.4" cy="6.4" r="1.4" stroke="currentColor" stroke-width="1.1"/>
        <path d="M9.7 8l2.2 3.1 2.5 1.1" stroke="currentColor" stroke-width="1.15"/>
        <path d="M10.8 10.4 8.7 13l-2.3 1.1M11.9 11.1l-1.2 3.3 1.2 3.1M8.7 13l-1 4.1" stroke="currentColor" stroke-width="1.15"/>
        <path d="M15.8 6.1l-1.6 11.1M14.9 6.2h3.1" stroke="currentColor" stroke-width="1.05"/>
        <path d="M6.1 17.2c3.1-.9 6.1-.9 9.2 0" stroke="currentColor" stroke-width="1"/>`,

    /* Socioeconomic inequality — Lorenz curve and reform threshold */
    socioeconomic: `
        <path d="M4.5 19.2h15M5 19V4.8" stroke="currentColor" stroke-width="1.15"/>
        <path d="M6.6 17.2 17.7 6.1" stroke="currentColor" stroke-width=".9" opacity=".65"/>
        <path d="M6.6 17.2c2.8-.2 5.1-1.1 6.8-2.7 1.6-1.5 2.8-3.9 3.7-7.1" stroke="currentColor" stroke-width="1.25"/>
        <path d="M14.2 5.4h4.1v4.1" stroke="currentColor" stroke-width="1.05"/>
        <path d="M8 12.8h2.4M8 9.9h4.9M8 7h3.2" stroke="currentColor" stroke-width="1"/>`,
};

/* ═══════════════════════════════════════════════
   View definitions
   ═══════════════════════════════════════════════ */
export const CATEGORY_ICONS = {
    landuse: `
        <path d="M4.2 6.6 9.4 4.4l5.2 2.2 5.2-2.2v13.3l-5.2 2.2-5.2-2.2-5.2 2.2V6.6z" stroke="currentColor" stroke-width="1.65"/>
        <path d="M9.4 4.4v13.3M14.6 6.6v13.3" stroke="currentColor" stroke-width="1.45"/>
        <path d="M5.9 10.1c1.5-.7 2.7-.7 4.1 0 1.5.7 2.7.7 4.1 0 1.4-.7 2.6-.7 4 0" stroke="currentColor" stroke-width="1.25"/>
        <path d="M5.9 14.4c1.5-.7 2.7-.7 4.1 0 1.5.7 2.7.7 4.1 0 1.4-.7 2.6-.7 4 0" stroke="currentColor" stroke-width="1.25"/>`,

    agriculture: `
        <path d="M12 21V5" stroke="currentColor" stroke-width="1.8"/>
        <path d="M12 8.5c-2.6 0-4.7-1.5-5.8-4 2.9-.1 5 1.4 5.8 4z" stroke="currentColor" stroke-width="1.55"/>
        <path d="M12 12c2.7-.1 4.8-1.6 6-4.1-3-.1-5.2 1.4-6 4.1z" stroke="currentColor" stroke-width="1.55"/>
        <path d="M12 15.4c-2.6 0-4.6-1.4-5.9-3.9 2.9-.1 5.1 1.3 5.9 3.9z" stroke="currentColor" stroke-width="1.55"/>
        <path d="M12 18.7c2.5-.1 4.4-1.4 5.7-3.7-2.8-.1-4.9 1.2-5.7 3.7z" stroke="currentColor" stroke-width="1.55"/>`,

    livestock: `
        <path d="M7.2 9.4c0-2.7 1.9-4.7 4.8-4.7s4.8 2 4.8 4.7v4.1c0 3.2-2 5.7-4.8 5.7s-4.8-2.5-4.8-5.7V9.4z" stroke="currentColor" stroke-width="1.8"/>
        <path d="M7.7 8.2C5.4 7.6 4.1 6 4 3.8M16.3 8.2c2.3-.6 3.6-2.2 3.7-4.4" stroke="currentColor" stroke-width="1.65"/>
        <path d="M10 12h.01M14 12h.01M10.2 15.8c1.1.7 2.5.7 3.6 0" stroke="currentColor" stroke-width="1.8"/>`,

    trade: `
        <path d="M4.2 7.4h7.3v5.8H4.2V7.4zM12.5 10.9h7.3v5.8h-7.3v-5.8z" stroke="currentColor" stroke-width="1.65"/>
        <path d="M6.2 10.3h3.2M14.5 13.8h3.2" stroke="currentColor" stroke-width="1.25"/>
        <path d="M7.5 6.1c1.1-1.3 2.8-2.1 4.7-2.1 2 0 3.7.8 4.8 2.2" stroke="currentColor" stroke-width="1.45"/>
        <path d="m16.7 3.9.6 2.6-2.7.2" stroke="currentColor" stroke-width="1.45"/>
        <path d="M16.5 18c-1.1 1.3-2.8 2.1-4.7 2.1-2 0-3.7-.8-4.8-2.2" stroke="currentColor" stroke-width="1.45"/>
        <path d="m7.3 20.1-.6-2.6 2.7-.2" stroke="currentColor" stroke-width="1.45"/>`,

    labor: `
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.8"/>
        <circle cx="9.5" cy="7" r="3.5" stroke="currentColor" stroke-width="1.8"/>
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" stroke-width="1.8"/>`,

    footprints: `
        <path d="M8.4 5.1c1.1-.3 2.4.4 2.8 1.8.5 1.8-.2 4.3-1.7 4.7-1.4.4-3.1-1.3-3.6-3.1-.4-1.5.5-3.1 2.5-3.4z" stroke="currentColor" stroke-width="1.7"/>
        <path d="M15.9 12.3c1.1-.3 2.4.4 2.8 1.8.5 1.8-.2 4.3-1.7 4.7-1.4.4-3.1-1.3-3.6-3.1-.4-1.5.5-3.1 2.5-3.4z" stroke="currentColor" stroke-width="1.7"/>
        <path d="M6.4 3.2h.01M9.1 2.6h.01M11.4 4.2h.01M13.8 10.4h.01M16.5 9.8h.01M18.9 11.4h.01" stroke="currentColor" stroke-width="1.9"/>`,

    socioeconomic: `
        <path d="M12 3v18M5 7h14M6 7l-3 6h6L6 7zM18 7l-3 6h6l-3-6z" stroke="currentColor" stroke-width="1.8"/>
        <path d="M7 21h10" stroke="currentColor" stroke-width="1.8"/>`,
};

export const VIEWS = [
    { id: 'map', label: 'Mapa' },
    { id: 'bilateral', label: 'Mapa mundial', hidden: true },
    { id: 'trend', label: 'Tendencias' },
    { id: 'country', label: 'Perfil país' },
    { id: 'treemap', label: 'Composición' },
    { id: 'ranking', label: 'Ranking' },
    { id: 'table', label: 'Tabla' },
];
