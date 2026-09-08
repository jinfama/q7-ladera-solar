# web_latam — Atlas Agrario de América Latina

> Protocolo comun de agentes: ver `../../AGENTS.md`. Plan de URLs beta: `../../docs/BETA_VISORS.md`.

## Descripción
Visor interactivo de producción agrícola, comercio, ganadería, uso del suelo y empleo
en América Latina desde 1900. Portada: un globo pintado al fresco con esos datos.
Destino: `agrolatam.github.io`

## Estructura
```
index.html              ← Portada V7 (globo al fresco) → CTA a visor.html
visor.html              ← La aplicación
portada/                ← Kit de la portada (latam.js, latam-topo.js, world-110m.js), sin fetch
css/styles.css          ← Estilos (45K)
js/                     ← Módulos ES6
├── app.js              ← Controlador principal (57K)
├── data-loader.js      ← Carga de datos (56K)
├── state.js            ← Gestión de estado pub/sub
├── utils.js            ← Utilidades
├── components/         ← timeline, tooltip, territory-picker
└── views/              ← map, trend, treemap, ranking, bilateral, table
data/                   ← JSONs de datos (10.7 MB)
├── agriculture.json    ← 3.0 MB
├── trade.json          ← 2.4 MB
├── subnational.json    ← 2.4 MB
├── livestock.json      ← 1.1 MB
├── bilateral.json      ← 1.1 MB
├── employment.json     ← 184K
├── landuse.json        ← 63K
├── metadata.json       ← Definiciones de categorías, indicadores, unidades
├── *.topo.json         ← Topología para mapas
└── textures/earth.png  ← Textura del globo 3D (1.6 MB)
build/                  ← NO DESPLEGAR. 10 scripts Python de conversión CSV→JSON.
_server.py              ← NO DESPLEGAR. Servidor local.
patch*.py, test.py, etc ← NO DESPLEGAR. Scripts de desarrollo.
*.txt                   ← NO DESPLEGAR. Archivos de referencia.
```

## Stack
- HTML5 + CSS + JS vanilla (módulos ES6 nativos, sin bundler)
- D3.js v7 + TopoJSON + Three.js (CDN)
- Fuentes: **Archivo** (texto) y **Archivo Black** (titulares), en UNA sola hoja de
  Google Fonts. Inter sigue en la hoja y en la pila como reserva. No añadir peticiones.
- Datos pre-generados con Python desde CSVs de investigación

## Reglas para agentes

### Paleta del chrome — la de la portada (regla: «la paleta del interior es la de la portada»)
La portada es `index.html` (V7, 8-IX-2026: un globo pintado al fresco, centrado en América
Latina; kit en `portada/latam.js`, `portada/latam-topo.js`, `portada/world-110m.js`). Sus
tokens (`:root` de `index.html`) son literalmente los del visor (`:root` de `css/styles.css`).
Gama de fresco: cal → ocre → sinopia apagada → sombra. Desde la V7 **no hay cochinilla
saturada ni marrón chocolate**: Juan pidió «menos rojo y marrón» y así se afinó.

| portada V7     | visor                                   | valor     |
|----------------|-----------------------------------------|-----------|
| `--cal`        | `--c-bg-s`                              | `#EDE2C7` |
| `--cal-2`      | `--c-bg`, `--c-on-ink`, `--c-sb-active` | `#F4EBD6` |
| `--cal-3`      | `--c-surface`                           | `#FBF7EC` |
| `--ink`        | `--c-text`                              | `#231A15` |
| `--ink-2`      | `--c-text-2`, `--c-blue`                | `#54443A` |
| `--ink-3`      | `--c-text-3`                            | `#746048` |
| `--sombra`     | `--c-sb-bg` (barra lateral, tooltip)    | `#3B3330` |
| `--sinopia`    | `--c-accent` (barras de estado)         | `#A9583B` |
| `--sinopia-2`  | `--c-primary` (botones, activo, foco)   | `#86493A` |
| `--sinopia-3`  | `--c-primary-dark`, `--c-accent-red`    | `#6E3A2E` |
| `--ocre`       | `--c-sb-accent`                         | `#CFA95E` |
| —              | `--c-accent-lt` (sinopia aclarada)      | `#D9A98C` |
| —              | `--c-accent-orange` (ocre tostado)      | `#9B5F3C` |

Contrastes medidos (`C:/Work/scratch/ephemeral/visores_2026-09/portadas_v7/latam/palette_check.py`):
primario sobre cal 5.4:1 y cal sobre primario 5.9:1; `--c-text-3` 5.0:1; cal al 84 % sobre
sombra 6.8:1; `--c-accent-lt` sobre sombra 5.5:1 (se usa en `.tooltip-value`). **La sinopia
(`--c-accent`) no vale como color de TEXTO**: sobre cal da 3.9:1; para texto activo va
`--c-primary`.

En este muro **no hay blanco de papel**. Lo que hace de blanco es `--c-surface` (`#FBF7EC`),
cal blanqueada. No reintroducir `#fff` ni `rgba(255,255,255,…)` en el cromo.

`css/provenance.css` (sección «Cómo trabajamos») está enganchada a esos mismos tokens con
los grises originales como *fallback*. Es un fichero que se copia entre visores: si alguien
lo vuelve a copiar del original compartido, se pierde ese enganche.

### Bordes cuadrados
`border-radius: 0` en TODA la interfaz. Solo tres excepciones son admisibles —retratos
circulares de personas, puntos de datos circulares y asas de arrastre de líneas de tiempo—
y este visor solo usa la primera: `.about-avatar`. Está declarada al final de
`css/styles.css` con el porqué. **Las píldoras de 999 px no son excepción**: se cuadraron
el asa del *resizer* del panel y el tirador de la hoja móvil, y también se cuadraron los
iconos-enlace del equipo y la insignia de información, que antes eran círculos.
Comprobado en navegador: el único `border-radius` distinto de 0 en todo el DOM
(pseudoelementos incluidos) son los 4 retratos.

### Escalas de color de datos — la misma familia, pero no son tokens
Desde la V7 (8-IX-2026) las escalas de mapas y gráficos son la gama de fresco de la portada:
`SEQ_COLORS` (9 pasos, cal → ocre → sinopia apagada → sombra, L* 93 → 22, ≥ 8 L* entre
celdas de leyenda; antes acababa en negro), `DIV_COLORS` (verdigris —azul-verde de cal— ↔
cal ↔ sinopia) y `CAT_COLORS` (ocre tostado, sinopia, azurita, verdigris, sombra, tierra
verde, malva de cal…, todos ≥ 3:1 como línea sobre cal) en `js/utils.js`; `DIV_COLORS` de
cinco tonos y los neutros (`BG_FILL`, `NO_DATA_STROKE`) en `js/views/map-view.js`;
`PROFILE_COLORS` en `js/views/country-profile.js`. Los tres colores de procedencia de
`css/provenance.css` (observado `#1a4d2e`, estimado `#e0b070`, sin dato `#d6d3cc`) no se
tocaron. «Sin dato» es la **trama de puntos** (`ensureNoDataPattern` en `js/utils.js`, un
`<pattern>` por SVG porque una referencia a un patrón de un SVG oculto no siempre se pinta),
y la muestra de la leyenda la imita en CSS (`.map-legend-nodata i`). Son codificaciones de
datos elegidas por lectura y accesibilidad: **no cambiarlas al retocar el cromo**, y si
cambian, cambiar a la vez `_legendValueAt` (leyenda) y revisar `_thinLegendLabels` (calla la
etiqueta que pisa a su vecina; en la divergente se rotulan extremos y fronteras de la clase
neutra).

### Foco de teclado
Hay una regla global `:focus-visible` (cochinilla sobre cal, cal sobre tinta, cuadrada).
Si añades `outline: none` en algún sitio, deja el foco visible por otra vía.

### Lo demás
- La leyenda del mapa (`_updateLegend` en `js/views/map-view.js`) etiqueta las fronteras de
  clase invirtiendo la transformación de `_buildColorScale` con `_legendValueAt`. **Si cambia
  la escala de color, hay que cambiar también esa inversa** o la leyenda mentirá.
- `js/export-share.js`: permalink (estado en el hash), PNG de lo que se ve y reiniciar. El CSV
  del panel sigue en `app.js` (`_downloadDataPackage`). El hash de entrada se captura en
  `_initialHash` y el escritor de URL calla hasta `ExportShare.markReady()`.
- **NO modificar `build/`** ni scripts Python sin instrucción explícita
- **NO añadir frameworks ni npm** — módulos ES6 nativos
- **Idioma**: español (interfaz), inglés (código/comentarios)
- **Datos**: los JSONs en `data/` se generan desde `build/`. No editar datos manualmente.
- **5 categorías**: agriculture, trade, landuse, livestock, labor (definidas en metadata.json)
- **6 vistas**: map, trend, treemap, ranking, bilateral, table

## Estado actual
- [x] Portada V7: globo al fresco (index.html), paleta llevada al interior (8-IX-2026)
- [x] 6 vistas funcionales
- [x] 5 categorías de datos integradas
- [x] Datos subnacionales
- [x] Comercio bilateral

## Pendiente
- [ ] Crear `.gitignore` (excluir `build/`, scripts Python, `*.txt`, `_server.py`)
- [ ] Limpiar archivos de desarrollo en raíz (patch*.py, patch*.js, test.py, etc.)
- [ ] Eliminar `js/views/map-view.js.bak` (backup que no debería desplegarse)
- [ ] Revisar que funcione correctamente servido desde GitHub Pages (rutas relativas)
