/* boot.js - Arranque del atlas.

   Hasta 2026-09 la aplicacion no arrancaba sola: la ponia en marcha landing.js,
   la portada propia del visor, cuando el visitante pulsaba «Explorar el atlas».
   Esa portada se ha quitado —la entrada es ahora index.html, la portada nueva—,
   asi que el arranque vive aqui y ocurre solo.

   El orden importa: app.js se inicializa a si mismo en cuanto se importa y lo
   primero que hace es pedir DataLoader.getMetadata(). Si los datos no estan,
   aborta con «[INIT] FAIL: Metadata not loaded». De ahi que se cargue primero
   data-loader y solo despues se importe app.

   Y la version de la consulta tiene que ser LA MISMA que la que app.js usa en su
   propio import ('./data-loader.js?v=20260906f'): dos cadenas distintas son dos
   modulos distintos para el navegador, y el DataLoader que app.js mirase estaria
   vacio. Si se sube la version de data-loader.js, hay que subirla en los dos
   sitios a la vez. */

const DATA = './data-loader.js?v=20260906f';
const APP  = './app.js?v=20260906f';

function _quitaPantallaDeCarga() {
    const el = document.getElementById('boot-screen');
    if (el) el.remove();
}

function _falla(err) {
    console.error('Fallo al arrancar el atlas:', err);
    const el = document.getElementById('boot-screen');
    if (!el) return;
    el.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'loading-title';
    t.textContent = 'No se han podido cargar los datos';
    const s = document.createElement('div');
    s.className = 'loading-sub';
    s.textContent = (err && err.message) ? err.message : String(err);
    const r = document.createElement('button');
    r.className = 'loading-retry';
    r.type = 'button';
    r.textContent = 'Reintentar';
    r.addEventListener('click', () => location.reload());
    el.append(t, s, r);
}

import(DATA)
    .then(m => m.default.init())
    .then(() => import(APP))
    .then(_quitaPantallaDeCarga)
    .catch(_falla);
