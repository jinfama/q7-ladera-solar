/* landing.js - Three.js realistic globe ? zoom to LATAM ? retro map ? app.
   Blue Marble Earth texture, smooth camera zoom, clean transition.

   The landing supports two portadas, swappable from the top-right corner:
     mode-globo    — original 3D Earth + zoom + retro map (default).
     mode-paisaje  — agrarian-landscape painting with CSS-animated smoke,
                     clouds and river shimmer (no globe).
   Mode preference persists in localStorage. The custom LATAM cursor is
   initialised in both modes; the Three.js globe is initialised lazily only
   when the user is actually on globo. */

import * as THREE from 'three';

let _width, _height;
let _scene, _camera, _renderer, _globe, _animFrame;
let _dataReady = false;
let _dataPromise = null;
let _appStarting = false;
let _mode = 'globo';
let _globeInited = false;
let _zoomStarted = false;
const LANDING_MODE_KEY = 'latam.landing.mode';
const VALID_MODES = ['globo','paisaje'];

/* -----------------------------------------------
   Particles - floating grain/seed shapes
   ----------------------------------------------- */
let _pCanvas, _pCtx, _particles = [], _pRaf = null;
let _mouse = { x: -9999, y: -9999 };
const NUM_P = 14, MOUSE_R = 160;
let _cursorEl = null;
let _cursorRaf = null;
let _cursorVisible = false;
let _cursorTarget = { x: innerWidth / 2, y: innerHeight / 2 };
let _cursorPos = { x: innerWidth / 2, y: innerHeight / 2 };
let _cursorPrev = { x: innerWidth / 2, y: innerHeight / 2 };
let _cursorAngle = 180;

function _initParticles() {
    _pCanvas = document.getElementById('landing-particles');
    if (!_pCanvas) return;
    _pCtx = _pCanvas.getContext('2d');
    _resizeP();
    for (let i = 0; i < NUM_P; i++) _particles.push(_mkGrain(true));
    const el = document.getElementById('landing');
    el.addEventListener('mousemove', e => { _mouse.x = e.clientX; _mouse.y = e.clientY; });
    el.addEventListener('mouseleave', () => { _mouse.x = -9999; _mouse.y = -9999; });
    _pLoop();
}
function _resizeP() {
    if (!_pCanvas) return;
    const dpr = devicePixelRatio || 1;
    _pCanvas.width = _width * dpr; _pCanvas.height = _height * dpr;
    _pCanvas.style.width = _width + 'px'; _pCanvas.style.height = _height + 'px';
    _pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function _mkGrain(ry) {
    const sz = 12 + Math.random() * 18, t = Math.random();
    return { x: Math.random()*(_width||800), y: ry ? Math.random()*(_height||600) : -sz*2,
        size: sz, angle: Math.random()*Math.PI*2, spin: (Math.random()-.5)*.004,
        vx: (Math.random()-.5)*.12, vy: .06+Math.random()*.1,
        opacity: .12+Math.random()*.15, phase: Math.random()*Math.PI*2,
        sway: .15+Math.random()*.25, type: t<.4?'wheat':t<.7?'corn':'coffee' };
}
function _pLoop() { _pUpd(); _pDrw(); _pRaf = requestAnimationFrame(_pLoop); }
function _pUpd() {
    for (const p of _particles) {
        p.x += p.vx + Math.sin(p.phase)*p.sway*.2; p.y += p.vy;
        p.angle += p.spin; p.phase += .004;
        const dx=p.x-_mouse.x, dy=p.y-_mouse.y, d=Math.sqrt(dx*dx+dy*dy);
        if(d<MOUSE_R&&d>0){const f=(1-d/MOUSE_R)*.4;p.x+=dx/d*f;p.y+=dy/d*f;}
        if(p.y>_height+p.size*3||p.x<-p.size*4||p.x>_width+p.size*4){Object.assign(p,_mkGrain(false));p.x=Math.random()*_width;}
    }
}
function _pDrw() {
    _pCtx.clearRect(0,0,_width,_height);
    for (const p of _particles) {
        _pCtx.save(); _pCtx.globalAlpha=p.opacity;
        _pCtx.translate(p.x,p.y); _pCtx.rotate(p.angle);
        if(p.type==='wheat'){_pCtx.beginPath();_pCtx.ellipse(0,0,p.size*.2,p.size*.8,0,0,Math.PI*2);_pCtx.fillStyle='rgba(196,145,62,0.6)';_pCtx.fill();_pCtx.beginPath();_pCtx.moveTo(0,-p.size*.8);_pCtx.lineTo(0,-p.size*1.2);_pCtx.strokeStyle='rgba(196,145,62,0.3)';_pCtx.lineWidth=.5;_pCtx.stroke();}
        else if(p.type==='corn'){const r=p.size*.3;_pCtx.beginPath();_pCtx.moveTo(0,-r*1.5);_pCtx.bezierCurveTo(r,-r*.5,r,r,0,r*1.2);_pCtx.bezierCurveTo(-r,r,-r,-r*.5,0,-r*1.5);_pCtx.fillStyle='rgba(196,145,62,0.5)';_pCtx.fill();}
        else{const r=p.size*.25;_pCtx.beginPath();_pCtx.arc(0,0,r,0,Math.PI*2);_pCtx.fillStyle='rgba(139,94,60,0.5)';_pCtx.fill();_pCtx.beginPath();_pCtx.moveTo(0,-r*.7);_pCtx.bezierCurveTo(r*.3,0,-r*.3,0,0,r*.7);_pCtx.strokeStyle='rgba(100,60,30,0.4)';_pCtx.lineWidth=.5;_pCtx.stroke();}
        _pCtx.restore();
    }
}
function _destroyP() { if(_pRaf)cancelAnimationFrame(_pRaf); _particles=[]; }

/* -----------------------------------------------
   Landing cursor - inverted LATAM silhouette
   ----------------------------------------------- */
function _initLatamCursor() {
    const landing = document.getElementById('landing');
    _cursorEl = document.getElementById('landing-cursor');
    const canUseCursor = matchMedia('(pointer: fine)').matches
        && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!landing || !_cursorEl || !canUseCursor) return;

    _cursorEl.innerHTML = '';
    fetch('data/latam.topo.json?v=20260522-mobile-ui18')
        .then(r => r.json())
        .then(topo => {
            if (!_cursorEl || !document.body.contains(_cursorEl)) return;
            const geo = topojson.feature(topo, topo.objects.countries);
            const width = 54;
            const height = 82;
            const proj = d3.geoMercator().fitExtent([[6, 5], [width - 6, height - 8]], geo);
            const path = d3.geoPath(proj);
            const borders = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);

            const svg = d3.select(_cursorEl)
                .append('svg')
                .attr('viewBox', `0 0 ${width} ${height}`)
                .attr('aria-hidden', 'true');

            svg.append('ellipse')
                .attr('class', 'latam-cursor-halo')
                .attr('cx', width / 2)
                .attr('cy', height / 2)
                .attr('rx', 22)
                .attr('ry', 35);

            const g = svg.append('g')
                .attr('transform', `translate(${width / 2} ${height / 2}) rotate(180) translate(${-width / 2} ${-height / 2})`);

            g.selectAll('path.latam-cursor-land')
                .data(geo.features)
                .join('path')
                .attr('class', 'latam-cursor-land')
                .attr('d', path);

            g.append('path')
                .datum(borders)
                .attr('class', 'latam-cursor-border')
                .attr('d', path);

            svg.append('circle')
                .attr('class', 'latam-cursor-pin')
                .attr('cx', width / 2)
                .attr('cy', height / 2)
                .attr('r', 2.2);

            landing.classList.add('latam-cursor-ready');
            _cursorLoop();
        })
        .catch(e => console.warn('LATAM cursor failed:', e));

    landing.addEventListener('pointerenter', _onCursorEnter);
    landing.addEventListener('pointermove', _onCursorMove);
    landing.addEventListener('pointerleave', _onCursorLeave);
    landing.addEventListener('pointerdown', _onCursorDown);
    landing.addEventListener('pointerup', _onCursorUp);
}

function _onCursorEnter(event) {
    _cursorVisible = true;
    _onCursorMove(event);
    if (_cursorEl) _cursorEl.classList.add('visible');
}

function _onCursorMove(event) {
    _cursorVisible = true;
    if (_cursorEl) _cursorEl.classList.add('visible');
    _cursorTarget.x = event.clientX;
    _cursorTarget.y = event.clientY;
}

function _onCursorLeave() {
    _cursorVisible = false;
    if (_cursorEl) _cursorEl.classList.remove('visible', 'pressed');
}

function _onCursorDown() {
    if (_cursorEl) _cursorEl.classList.add('pressed');
}

function _onCursorUp() {
    if (_cursorEl) _cursorEl.classList.remove('pressed');
}

function _cursorLoop() {
    if (!_cursorEl) return;
    _cursorPos.x += (_cursorTarget.x - _cursorPos.x) * 0.22;
    _cursorPos.y += (_cursorTarget.y - _cursorPos.y) * 0.22;
    const dx = _cursorTarget.x - _cursorPrev.x;
    const dy = _cursorTarget.y - _cursorPrev.y;
    _cursorPrev.x += dx * 0.35;
    _cursorPrev.y += dy * 0.35;

    const cx = innerWidth / 2;
    const cy = innerHeight / 2;
    const vx = _cursorTarget.x - cx;
    const vy = _cursorTarget.y - cy;
    const dist = Math.min(1, Math.hypot(vx, vy) / Math.max(1, Math.hypot(cx, cy)));
    const targetAngle = Math.atan2(vy, vx) * 180 / Math.PI + 90;
    let delta = ((targetAngle - _cursorAngle + 540) % 360) - 180;
    _cursorAngle += delta * 0.10;

    const tilt = Math.max(-18, Math.min(18, dx * 0.18));
    const rotateX = Math.max(-16, Math.min(16, -vy / Math.max(1, cy) * 14));
    const rotateY = Math.max(-18, Math.min(18, vx / Math.max(1, cx) * 16));
    const stretch = 1 + Math.min(0.09, Math.abs(dx + dy) * 0.0009) + dist * 0.025;
    _cursorEl.style.transform = `translate3d(${_cursorPos.x}px, ${_cursorPos.y}px, 0) translate(-50%, -50%) perspective(240px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotate(${_cursorAngle + tilt}deg) scale(${stretch})`;
    _cursorEl.classList.toggle('visible', _cursorVisible);
    _cursorRaf = requestAnimationFrame(_cursorLoop);
}

function _destroyLatamCursor() {
    if (_cursorRaf) cancelAnimationFrame(_cursorRaf);
    _cursorRaf = null;
    const landing = document.getElementById('landing');
    if (landing) {
        landing.classList.remove('latam-cursor-ready');
        landing.removeEventListener('pointerenter', _onCursorEnter);
        landing.removeEventListener('pointermove', _onCursorMove);
        landing.removeEventListener('pointerleave', _onCursorLeave);
        landing.removeEventListener('pointerdown', _onCursorDown);
        landing.removeEventListener('pointerup', _onCursorUp);
    }
    if (_cursorEl) _cursorEl.remove();
    _cursorEl = null;
    _cursorVisible = false;
}

/* -----------------------------------------------
   Three.js Globe - realistic Earth
   ----------------------------------------------- */
function _initGlobe() {
    const canvas = document.getElementById('landing-globe');
    if (!canvas) return;

    _scene = new THREE.Scene();
    _camera = new THREE.PerspectiveCamera(45, _width / _height, 0.1, 100);
    // Start very far away - deep space view of the whole globe
    _camera.position.set(0, 1.7, 8.8);
    _camera.lookAt(0, 0, 0);

    _renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    _renderer.setSize(_width, _height);
    _renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    _renderer.setClearColor(0x000000, 0);

    // Earth sphere
    const geo = new THREE.SphereGeometry(1, 64, 64);
    const loader = new THREE.TextureLoader();

    // Load Blue Marble texture
    const texture = loader.load('data/textures/earth.png', () => {
        _renderer.render(_scene, _camera); // render once texture is ready
    });
    texture.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.9,
        metalness: 0.05,
    });

    _globe = new THREE.Mesh(geo, mat);
    // At rotation.y=0, Three.js SphereGeometry + equirectangular texture
    // shows lon -90- (western Americas) centered on camera ? perfect start
    _globe.rotation.y = 0;
    _scene.add(_globe);

    // Subtle atmosphere glow
    const atmosGeo = new THREE.SphereGeometry(1.015, 64, 64);
    const atmosMat = new THREE.MeshBasicMaterial({
        color: 0x4488cc,
        transparent: true,
        opacity: 0.06,
        side: THREE.BackSide,
    });
    _scene.add(new THREE.Mesh(atmosGeo, atmosMat));

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    _scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(5, 3, 5);
    _scene.add(sun);

    // Start spinning
    _startRotation();
}

function _startRotation() {
    function frame() {
        if (!_globe) return;
        _globe.rotation.y += 0.001;
        _camera.lookAt(0, 0, 0);
        _renderer.render(_scene, _camera);
        _animFrame = requestAnimationFrame(frame);
    }
    _animFrame = requestAnimationFrame(frame);
}

function _resizeGlobe() {
    if (!_renderer || !_camera) return;
    _camera.aspect = _width / _height;
    _camera.updateProjectionMatrix();
    _renderer.setSize(_width, _height);
}

function _getTargetMapFrame() {
    const root = getComputedStyle(document.documentElement);
    const px = (varName, fallback) => {
        const raw = parseFloat(root.getPropertyValue(varName));
        return Number.isFinite(raw) ? raw : fallback;
    };

    const sidebarW = px('--sidebar-w', 44);
    const queryH = px('--query-bar-h', 36);
    const timelineH = px('--timeline-h', 36);
    const footerH = px('--footer-h', 28);

    const x0 = sidebarW + 16;
    const y0 = queryH + 12;
    const x1 = _width - 16;
    const y1 = _height - (timelineH + footerH) - 12;

    return {
        x0,
        y0,
        x1,
        y1,
        cx: (x0 + x1) / 2,
        cy: (y0 + y1) / 2,
    };
}

/* -----------------------------------------------
   Zoom to Latin America
   ----------------------------------------------- */
function _zoomToLatam() {
    return new Promise(resolve => {
        if (_animFrame) cancelAnimationFrame(_animFrame);

        // -- Normalize current globe rotation to [-pi, pi] --
        let startRotY = _globe.rotation.y % (2 * Math.PI);
        if (startRotY > Math.PI) startRotY -= 2 * Math.PI;
        if (startRotY < -Math.PI) startRotY += 2 * Math.PI;
        _globe.rotation.y = startRotY;           // snap to normalized value

        const startRotX = _globe.rotation.x;

        // Target tuned to end centered on LATAM before handoff to map panel
        const targetLon = -76.6;
        const targetLat = -16.4;
        // On this texture orientation: rotY=0 centers lon -90, and positive rotY moves view westward.
        // Invert sign to move center eastward toward LATAM core.
        const targetRotY = -((targetLon + 90) * Math.PI) / 180;
        const targetRotX = -targetLat * Math.PI / 180; // Removing the 0.82 modifier to match exact lat

        // Shortest angular path - avoid spinning the long way around
        let deltaRotY = targetRotY - startRotY;
        if (deltaRotY > Math.PI) deltaRotY -= 2 * Math.PI;
        if (deltaRotY < -Math.PI) deltaRotY += 2 * Math.PI;

        // -- Camera: descend from deep space into LATAM --
        const frame = _getTargetMapFrame();
        const dyNorm = (frame.cy - (_height / 2)) / _height;

        const camStartX = _camera.position.x;
        const camStartY = _camera.position.y;
        const camStartZ = _camera.position.z;
        const camEndX = 0;
        const camEndY = -0.12 - (dyNorm * 0.8);
        const camEndZ = 1.9;

        const duration = 4600;
        const t0 = performance.now();

        function animate(now) {
            const t = Math.min(1, (now - t0) / duration);
            // Cubic ease in-out
            const ease = t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;

            // Globe rotation (shortest path)
            _globe.rotation.y = startRotY + deltaRotY * ease;
            _globe.rotation.x = startRotX + (targetRotX - startRotX) * ease;

            // Camera descends from above and zooms in
            _camera.position.x = camStartX + (camEndX - camStartX) * ease;
            _camera.position.y = camStartY + (camEndY - camStartY) * ease;
            _camera.position.z = camStartZ + (camEndZ - camStartZ) * ease;

            // Camera follows final map frame center
            const lookX = 0;
            const lookY = -0.05 + (camEndY * 0.4) * ease;
            _camera.lookAt(lookX, lookY, 0);

            _renderer.render(_scene, _camera);

            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                // Zoom complete - fade out globe, show retro map
                _fadeOutGlobe().then(() => {
                    _showRetroMap();
                    setTimeout(resolve, 800);
                });
            }
        }
        requestAnimationFrame(animate);
    });
}

/* Fade out the Three.js canvas smoothly */
function _fadeOutGlobe() {
    return new Promise(resolve => {
        const canvas = document.getElementById('landing-globe');
        if (!canvas) { resolve(); return; }
        canvas.style.transition = 'opacity 1s ease';
        canvas.style.opacity = '0';
        setTimeout(() => {
            // Stop rendering, clean up Three.js
            if (_renderer) {
                _renderer.dispose();
                _renderer = null;
            }
            resolve();
        }, 1000);
    });
}

/* -----------------------------------------------
   Retro map overlay - D3 SVG smooth borders
   Shows on clean dark background after globe fades out
   ----------------------------------------------- */
function _showRetroMap() {
    const el = document.getElementById('landing-retro-map');
    if (!el) return;
    el.innerHTML = '';

    fetch('data/latam.topo.json?v=20260522-mobile-ui18')
        .then(r => r.json())
        .then(topo => {
            // Convert TopoJSON ? GeoJSON for fills & centroids
            const geo = topojson.feature(topo, topo.objects.countries);

            const svg = d3.select(el).append('svg')
                .attr('width', _width).attr('height', _height);

            // Fit exactly into the same frame where the app map will appear
            const frame = _getTargetMapFrame();
            const proj = d3.geoMercator()
                .fitExtent([[frame.x0, frame.y0], [frame.x1, frame.y1]], geo);
            const path = d3.geoPath(proj);

            // Country fills (no per-path stroke)
            svg.selectAll('path.retro-fill').data(geo.features).join('path')
                .attr('class', 'retro-fill')
                .attr('d', path)
                .attr('fill', 'rgba(196,145,62,0.02)')
                .attr('stroke', 'none')
                .transition().duration(1500).ease(d3.easeCubicOut)
                .attr('fill', 'rgba(196,145,62,0.05)');

            // Shared borders via topojson.mesh - gap-free
            const borders = topojson.mesh(topo, topo.objects.countries,
                (a, b) => a !== b);
            svg.append('path')
                .datum(borders)
                .attr('d', path)
                .attr('fill', 'none')
                .attr('stroke', 'rgba(196,145,62,0)')
                .attr('stroke-width', 0.5)
                .attr('stroke-linejoin', 'round')
                .transition().duration(1500).ease(d3.easeCubicOut)
                .attr('stroke', 'rgba(196,145,62,0.30)');

            svg.selectAll('text')
                .data(geo.features.filter(f => {
                    const c = path.centroid(f);
                    return c[0] > 0 && c[1] > 0 && !isNaN(c[0]);
                }))
                .join('text')
                .attr('x', d => path.centroid(d)[0])
                .attr('y', d => path.centroid(d)[1])
                .attr('text-anchor', 'middle')
                .attr('font-family', "'Inter',sans-serif")
                .attr('font-size', '7px')
                .attr('font-weight', '400')
                .attr('letter-spacing', '1.5px')
                .attr('fill', 'rgba(196,145,62,0)')
                .text(d => d.properties.iso3)
                .transition().delay(800).duration(1000)
                .attr('fill', 'rgba(196,145,62,0.18)');

            el.classList.add('visible');
        })
        .catch(e => console.warn('Retro map failed:', e));
}

/* -----------------------------------------------
   Mode switching
   The paisaje cover is purely CSS — no JS init needed when switching to it.
   Only the globe carries init/animation cost, so we lazy-spin it up the
   first time the user lands on (or switches to) globo.
   ----------------------------------------------- */
function _readSavedMode() {
    const urlMode = new URLSearchParams(location.search).get('portada');
    if (urlMode && VALID_MODES.includes(urlMode)) return urlMode;
    if (window.matchMedia?.('(max-width: 760px)').matches) return 'globo';
    try {
        const saved = localStorage.getItem(LANDING_MODE_KEY);
        if (saved && VALID_MODES.includes(saved)) return saved;
    } catch(_){}
    return 'globo';
}
function _applyMode(mode, opts = {}) {
    if (!VALID_MODES.includes(mode)) mode = 'globo';
    _mode = mode;
    const landing = document.getElementById('landing');
    if (!landing) return;
    landing.classList.remove('mode-globo','mode-paisaje');
    landing.classList.add('mode-' + mode);

    document.querySelectorAll('#landing-switcher button[data-mode]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    try { localStorage.setItem(LANDING_MODE_KEY, mode); } catch(_){}

    if (mode === 'globo') {
        if (!_globeInited) {
            _initGlobe();
            _globeInited = true;
        }
        if (_dataReady && !_zoomStarted && !opts.skipZoom) {
            _zoomStarted = true;
            _zoomToLatam().then(_showCTA);
        }
    } else if (mode === 'paisaje') {
        if (_dataReady) _showCTA();
    }
}

/* -----------------------------------------------
   Init
   ----------------------------------------------- */
(async function main() {
    _width = innerWidth; _height = innerHeight;

    const bar = document.querySelector('.landing-bar');
    let prog = 0;
    const tick = n => { prog = Math.min(prog+n, 100); if(bar) bar.style.width = prog+'%'; };

    // Decide which portada to render — URL ?portada=… wins over localStorage
    const initialMode = _readSavedMode();
    const landing = document.getElementById('landing');
    if (landing) {
        landing.classList.remove('mode-globo','mode-paisaje');
        landing.classList.add('mode-' + initialMode);
    }
    _mode = initialMode;

    // Reflect initial mode on switcher buttons
    document.querySelectorAll('#landing-switcher button[data-mode]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === initialMode);
    });

    // The custom LATAM cursor is part of the landing's identity — it should
    // appear in both modes, not only over the globe.
    _initLatamCursor();

    // Globe is expensive — only spin it up when needed
    if (initialMode === 'globo') {
        _initGlobe();
        _globeInited = true;
    }
    tick(15);

    window.addEventListener('resize', () => {
        _width = innerWidth; _height = innerHeight;
        if (_globeInited) _resizeGlobe();
    });

    // Data
    const dataP = import('./data-loader.js?v=20260522-mobile-ui18')
        .then(m => m.default.init())
        .then(() => { _dataReady = true; tick(85); })
        .catch(e => { console.error('Data load failed:', e); _dataReady = true; tick(85); });
    _dataPromise = dataP;

    const autoEnter = new URLSearchParams(location.search).has('v')
        && new URLSearchParams(location.search).get('landing') !== '1';

    if (autoEnter) {
        dataP.finally(() => _enterApp());
    } else {
        const ctaFallback = setTimeout(_showCTA, 3200);
        dataP.then(() => {
            // Only the globo portada runs the zoom-to-LATAM animation; in mural
            // and sendas the cover is already painted, so we can reveal the CTA
            // immediately once data is ready.
            if (_mode === 'globo') {
                _zoomStarted = true;
                return _zoomToLatam();
            }
        })
        .catch(e => console.warn('Landing animation skipped:', e))
        .then(() => {
            clearTimeout(ctaFallback);
            _showCTA();
        });
    }

    // Switcher click handlers — instantly swap the portada
    document.querySelectorAll('#landing-switcher button[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => _applyMode(btn.dataset.mode));
    });

    document.getElementById('landing-cta').addEventListener('click', _enterApp);
    document.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const cta = document.getElementById('landing-cta');
            if (cta && cta.style.display !== 'none') _enterApp();
        }
    });
})();

function _showCTA() {
    const cta = document.getElementById('landing-cta');
    const prog = document.getElementById('landing-progress');
    if (prog) prog.style.display = 'none';
    if (cta) {
        cta.style.display = '';
        cta.offsetHeight;
        cta.style.opacity = '1';
    }
}

function _enterApp() {
    if (_appStarting) return;
    if (!_dataReady && _dataPromise) {
        _appStarting = true;
        _dataPromise.finally(() => {
            _appStarting = false;
            _enterApp();
        });
        return;
    }

    const landing = document.getElementById('landing');
    if (!landing) return;
    _appStarting = true;

    if (_animFrame) cancelAnimationFrame(_animFrame);
    _destroyP();
    _destroyLatamCursor();

    import('./app.js?v=20260522-mobile-ui18').then(mod => {
        console.log('App module loaded');
        landing.classList.add('hidden');
        setTimeout(() => landing.remove(), 800);
    }).catch(err => {
        console.error('Failed to load app:', err);
        _appStarting = false;
        landing.classList.remove('hidden');
        landing.innerHTML = `<div style="color:#F5F0E6;text-align:center;padding:40px;max-width:600px;margin:auto">
            <h2 style="font-weight:300;letter-spacing:2px;margin-bottom:16px">Error al cargar</h2>
            <p style="color:#A89888;font-size:13px;margin-bottom:8px">${err.message}</p>
            <p style="color:#C4913E;font-size:11px;letter-spacing:1px">Abre la consola (F12) para ver detalles</p>
            <button onclick="location.reload()" style="margin-top:24px;padding:10px 24px;background:transparent;color:#E8C874;border:1px solid rgba(232,200,116,0.4);cursor:pointer;font-size:11px;letter-spacing:2px;text-transform:uppercase">Reintentar</button>
        </div>`;
    });
}




