/* timeline.js - Year slider with play/pause controls */

import State from '../state.js?v=20260522-mobile-ui18';

let _track, _fill, _handleFrom, _handleTo;
let _trackRect;
let _dragging = null; // 'from' | 'to' | null
let _playInterval = null;
const SPEED_OPTIONS = [
    { label: '1x', ms: 400 },
    { label: '2x', ms: 200 },
    { label: '4x', ms: 100 },
    { label: '8x', ms: 50 },
];
let _speedIdx = 2; // default 4x
let _speedPopup = null;

export function initTimeline() {
    _track = document.getElementById('tl-track');
    _fill = document.getElementById('tl-range-fill');
    _handleFrom = document.getElementById('tl-handle-from');
    _handleTo = document.getElementById('tl-handle-to');

    if (!_track) return;

    // Play button
    const playBtn = document.getElementById('tl-play');
    playBtn.addEventListener('click', _togglePlay);

    // Speed button - opens a popup with speed options
    const speedBtn = document.getElementById('tl-speed');
    speedBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _toggleSpeedPopup(speedBtn);
    });

    // Year inputs
    const startInput = document.getElementById('tl-year-start');
    const endInput = document.getElementById('tl-year-end');
    const range = State.get('yearRange');
    startInput.value = range[0];
    endInput.value = range[1];

    startInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') startInput.blur();
    });
    endInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') endInput.blur();
    });

    startInput.addEventListener('change', () => {
        const val = parseInt(startInput.value);
        if (!isNaN(val)) {
            const range = State.get('yearRange');
            const newStart = Math.min(val, range[1] - 1);
            State.set('yearRange', [newStart, range[1]]);
            // Clamp currentYear to new range
            const cur = State.get('currentYear');
            if (cur < newStart) State.set('currentYear', newStart);
            updateTimeline();
        }
    });

    endInput.addEventListener('change', () => {
        const val = parseInt(endInput.value);
        if (!isNaN(val)) {
            const range = State.get('yearRange');
            const newEnd = Math.max(val, range[0] + 1);
            State.set('yearRange', [range[0], newEnd]);
            // Clamp currentYear to new range
            const cur = State.get('currentYear');
            if (cur > newEnd) State.set('currentYear', newEnd);
            updateTimeline();
        }
    });

    // Pointer events make the same timeline work with mouse, pen, and touch.
    _handleFrom.addEventListener('pointerdown', (e) => _startDrag(e, 'from'));
    _handleTo.addEventListener('pointerdown', (e) => _startDrag(e, 'to'));

    window.addEventListener('pointermove', _onDrag);
    window.addEventListener('pointerup', _endDrag);
    window.addEventListener('pointercancel', _endDrag);

    _track.addEventListener('pointerdown', (e) => {
        if (e.target === _handleFrom || e.target === _handleTo) return;
        const year = _pixelToYear(e.clientX);
        State.set('currentYear', year);
        updateTimeline();
        e.preventDefault();
    });

    updateTimeline();
}

export function updateTimeline() {
    if (!_track) return;

    _trackRect = _track.getBoundingClientRect();
    const range = State.get('yearRange');
    const year = State.get('currentYear');
    const compare = State.get('compareMode');
    const startYear = State.get('startYear');

    // FROM handle: only visible/draggable in compare mode
    const fromYear = compare ? Math.max(range[0], Math.min(range[1], startYear)) : range[0];
    const labelFromYear = compare ? Math.min(fromYear, year) : fromYear;
    const labelToYear = compare ? Math.max(fromYear, year) : year;
    const fromPct = _yearToPct(fromYear, range);
    const toPct = _yearToPct(year, range);

    _handleFrom.style.left = fromPct + '%';
    _handleFrom.style.display = compare ? '' : 'none';
    _handleTo.style.left = toPct + '%';

    // Fill between the two handles (only visible in compare mode)
    const leftPct = Math.min(fromPct, toPct);
    const widthPct = Math.abs(toPct - fromPct);
    _fill.style.left = leftPct + '%';
    _fill.style.width = compare ? widthPct + '%' : '0%';

    document.getElementById('tl-label-from').textContent = labelFromYear;
    document.getElementById('tl-label-to').textContent = labelToYear;
    document.getElementById('tl-year').textContent = compare ? `${labelFromYear} - ${labelToYear}` : year;

    document.getElementById('tl-year-start').value = range[0];
    document.getElementById('tl-year-end').value = range[1];
}

function _yearToPct(year, range) {
    if (!range) range = State.get('yearRange');
    const [y0, y1] = range;
    return ((year - y0) / (y1 - y0)) * 100;
}

function _pixelToYear(clientX) {
    if (!_trackRect) _trackRect = _track.getBoundingClientRect();
    const pct = (clientX - _trackRect.left) / _trackRect.width;
    const range = State.get('yearRange');
    const year = Math.round(range[0] + pct * (range[1] - range[0]));
    return Math.max(range[0], Math.min(range[1], year));
}

function _startDrag(e, which) {
    _dragging = which;
    _trackRect = _track.getBoundingClientRect();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
}

function _endDrag() {
    _dragging = null;
}

function _onDrag(e) {
    if (!_dragging) return;
    e.preventDefault();
    const year = _pixelToYear(e.clientX);
    const range = State.get('yearRange');

    if (_dragging === 'to') {
        const nextYear = Math.max(range[0], Math.min(range[1], year));
        if (State.get('compareMode') && nextYear < State.get('startYear')) {
            const oldStart = State.get('startYear');
            State.set('startYear', nextYear);
            State.set('currentYear', oldStart);
        } else {
            State.set('currentYear', nextYear);
        }
    } else if (_dragging === 'from') {
        // FROM handle controls the comparison start year
        const currentYear = State.get('currentYear');
        const clamped = Math.min(currentYear, Math.max(range[0], Math.min(range[1], year)));
        State.set('startYear', clamped);
        // Auto-toggle compare mode based on handle separation
        if (clamped !== currentYear) {
            State.set('compareMode', true);
        } else {
            State.set('compareMode', false);
        }
    }
    updateTimeline();
}

function _togglePlay() {
    if (State.get('isPlaying')) {
        _stopPlay();
    } else {
        _startPlay();
    }
}

function _startPlay() {
    if (_playInterval) {
        clearInterval(_playInterval);
        _playInterval = null;
    }

    const range = State.get('yearRange');
    const currentYear = State.get('currentYear');
    if (currentYear < range[0] || currentYear >= range[1]) {
        State.set('currentYear', range[0]);
    }
    updateTimeline();

    State.set('isPlaying', true);
    const playBtn = document.getElementById('tl-play');
    playBtn.classList.add('playing');
    playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

    _playInterval = setInterval(() => {
        const range = State.get('yearRange');
        const currentYear = State.get('currentYear');
        const year = Math.min(currentYear + 1, range[1]);
        State.set('currentYear', year);
        updateTimeline();

        if (year >= range[1]) {
            _stopPlay();
            return;
        }
    }, SPEED_OPTIONS[_speedIdx].ms);
}

function _stopPlay() {
    State.set('isPlaying', false);
    const playBtn = document.getElementById('tl-play');
    playBtn.classList.remove('playing');
    playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';

    if (_playInterval) {
        clearInterval(_playInterval);
        _playInterval = null;
    }
}

/* -- Speed popup ---------------------------------- */

function _toggleSpeedPopup(anchorBtn) {
    if (_speedPopup) {
        _closeSpeedPopup();
        return;
    }

    _speedPopup = document.createElement('div');
    _speedPopup.style.cssText = `
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        margin-bottom: 6px;
        display: flex;
        flex-direction: column;
        background: var(--c-bg, #F2EBE0);
        border: 1px solid var(--c-border, #C9BDA8);
        box-shadow: 0 2px 8px rgba(0,0,0,.15);
        z-index: 100;
    `;

    SPEED_OPTIONS.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.textContent = opt.label;
        const isActive = i === _speedIdx;
        btn.style.cssText = `
            padding: 4px 14px;
            border: none;
            background: ${isActive ? 'var(--c-accent, #D4A032)' : 'transparent'};
            color: ${isActive ? '#fff' : 'var(--c-text, #1A120B)'};
            font-size: 11px;
            font-weight: ${isActive ? '700' : '500'};
            cursor: pointer;
            white-space: nowrap;
            font-family: var(--ff, Inter, sans-serif);
        `;
        btn.addEventListener('mouseenter', () => {
            if (i !== _speedIdx) btn.style.background = 'var(--c-bg-s, #E8DFD0)';
        });
        btn.addEventListener('mouseleave', () => {
            if (i !== _speedIdx) btn.style.background = 'transparent';
        });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            _speedIdx = i;
            anchorBtn.textContent = opt.label;
            State.set('playSpeed', opt.ms);
            if (_playInterval) {
                _stopPlay();
                _startPlay();
            }
            _closeSpeedPopup();
        });
        _speedPopup.appendChild(btn);
    });

    // Anchor relative to the speed button's parent
    anchorBtn.style.position = 'relative';
    anchorBtn.appendChild(_speedPopup);

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', _onOutsideClick);
    }, 0);
}

function _onOutsideClick() {
    _closeSpeedPopup();
}

function _closeSpeedPopup() {
    if (_speedPopup && _speedPopup.parentNode) {
        _speedPopup.parentNode.removeChild(_speedPopup);
    }
    _speedPopup = null;
    document.removeEventListener('click', _onOutsideClick);
}





