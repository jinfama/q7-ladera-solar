/* tooltip.js — Hover tooltip component */

let _el;

export function initTooltip() {
    _el = document.getElementById('tooltip');
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

export function hideTooltip() {
    if (_el) _el.classList.remove('visible');
}
