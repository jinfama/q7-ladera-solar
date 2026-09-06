/* tooltip.js — Shared tooltip.
 *
 * The views bind mousemove/mouseleave only, which on a finger means no value can
 * be read from the map at all (INFORME.md 4.1, point 2). Rather than rewrite
 * every handler, a tap is replayed here as a synthetic mousemove once the view
 * has settled, and while that replayed card is on screen hide() is a no-op so
 * the compatibility mouseleave cannot wipe it. On a coarse pointer the card is
 * anchored above the timeline instead of following the cursor, so it is never
 * clipped by the right edge, and it carries its own close button.
 */

let _el;
let _touch = false;    // true only while a replayed (finger) event is handled
let _pinned = false;   // a finger card is on screen and must survive mouseleave
let _pending = null;   // pointerdown position, to tell a tap from a pan

const TAP_SLOP = 12;     // px of movement still counted as a tap, not a drag
const REPLAY_DELAY = 90; // ms: let the click-driven re-render settle first

export function initTooltip() {
    _el = document.getElementById('tooltip');
    _bindTouch();
}

export function showTooltip(event, data) {
    if (!_el) return;

    if (data) {
        let html = '';
        if (data.title) html += `<div class="tooltip-title">${data.title}</div>`;
        if (data.value != null && data.value !== '') html += `<div class="tooltip-value">${data.value}</div>`;
        if (data.sub) html += `<div class="tooltip-sub">${data.sub}</div>`;
        _el.innerHTML = html;
    }

    if (_touch) {
        if (!_el.querySelector('.tooltip-close')) {
            _el.insertAdjacentHTML('beforeend',
                '<button type="button" class="tooltip-close" aria-label="Cerrar">&times;</button>');
        }
        _el.classList.add('tooltip-touch', 'visible');
        _el.style.left = '';
        _el.style.top = '';
        _pinned = true;
        return;
    }
    _el.classList.remove('tooltip-touch');

    // Position near cursor
    const x = event.clientX || event.pageX || 0;
    const y = event.clientY || event.pageY || 0;
    const pad = 12;
    const elW = _el.offsetWidth;
    const elH = _el.offsetHeight;

    let left = x + pad;
    let top = y + pad;

    if (left + elW > window.innerWidth - pad) left = x - elW - pad;
    if (top + elH > window.innerHeight - pad) top = y - elH - pad;

    _el.style.left = left + 'px';
    _el.style.top = top + 'px';
    _el.classList.add('visible');
}

export function hideTooltip(force) {
    if (_pinned && !force) return;
    _pinned = false;
    if (_el) _el.classList.remove('visible');
}

function _bindTouch() {
    document.addEventListener('pointerdown', ev => {
        if (ev.pointerType === 'mouse') return;
        if (ev.target.closest && ev.target.closest('.tooltip')) return;
        hideTooltip(true);
        _pending = { x: ev.clientX, y: ev.clientY };
    }, { capture: true, passive: true });

    document.addEventListener('pointerup', ev => {
        if (ev.pointerType === 'mouse' || !_pending) return;
        const start = _pending;
        _pending = null;
        if (Math.abs(ev.clientX - start.x) > TAP_SLOP ||
            Math.abs(ev.clientY - start.y) > TAP_SLOP) return;   // pan or pinch
        const { clientX, clientY } = ev;
        setTimeout(() => _replay(clientX, clientY), REPLAY_DELAY);
    }, { capture: true, passive: true });

    document.addEventListener('pointercancel', () => { _pending = null; },
                              { capture: true, passive: true });

    document.addEventListener('click', ev => {
        if (ev.target.closest && ev.target.closest('.tooltip-close')) {
            ev.preventDefault();
            ev.stopPropagation();
            hideTooltip(true);
        }
    }, true);
}

function _replay(x, y) {
    const target = document.elementFromPoint(x, y);
    if (!target || !target.closest || !target.closest('svg')) return;
    _touch = true;
    try {
        const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
        target.dispatchEvent(new MouseEvent('mouseover', opts));
        target.dispatchEvent(new MouseEvent('mousemove', opts));
        target.dispatchEvent(new MouseEvent('mouseenter', opts));
    } finally {
        _touch = false;
    }
}
