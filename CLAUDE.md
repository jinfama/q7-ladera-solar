# web_latam — Atlas Agrario de América Latina

> Protocolo comun de agentes: ver `../../AGENTS.md`. Plan de URLs beta: `../../docs/BETA_VISORS.md`.

## Descripción
Visor interactivo de producción agrícola, comercio, ganadería, uso del suelo y empleo
en América Latina desde 1900. Landing animada con globo 3D.
Destino: `agrolatam.github.io`

## Estructura
```
index.html              ← Entrada principal (landing + app)
css/styles.css          ← Estilos (45K)
js/                     ← Módulos ES6
├── app.js              ← Controlador principal (57K)
├── data-loader.js      ← Carga de datos (56K)
├── landing.js          ← Landing animada con globo 3D
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

### Paleta del chrome — portada de referencia
El visor sigue la portada aprobada
`07_temp/portadas_visores_2026-09/latam/V5_costa-al-fresco.html` («Costa al fresco»):
un fresco de gama corta, tierras desaturadas por la cal. Los tokens viven en `:root`
de `css/styles.css` y son literalmente los de la portada:

| portada V5     | visor                      | valor     |
|----------------|----------------------------|-----------|
| `--cal`        | `--c-bg-s`                 | `#EDE2C7` |
| —              | `--c-bg` (fondo de página) | `#F4EBD6` |
| —              | `--c-surface`              | `#FBF7EC` |
| `--ink`        | `--c-text`, `--c-sb-bg`    | `#231A15` |
| `--ink-2`      | `--c-text-2`, `--c-blue`   | `#54443A` |
| `--ink-3`      | `--c-text-3`               | `#746048` |
| `--cochinilla` | `--c-primary`              | `#9A2B2B` |
| `--sinopia`    | `--c-accent`               | `#B5502F` |
| —              | `--c-accent-lt`            | `#C67C5D` |

Dos tokens se apartan de la portada, y los dos por CONTRASTE MEDIDO, no por gusto:
- `--c-text-3` es `#746048` y no el `#7E6B57` de la portada: sobre esta cal, `#7E6B57`
  da 4.29:1 y el texto normal necesita 4.5. Con `#746048` da 5.04:1.
- `--c-accent-lt` (`#C67C5D`, sinopia aclarada con cal) existe porque la sinopia pura
  sobre tinta se queda en 3.43:1. Se usa en `.tooltip-value`. **La sinopia no vale como
  color de TEXTO**: sobre cal da 4.26:1. Para texto activo va cochinilla.

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

### Escalas de color de datos — NO son parte de la paleta
Están en `js/utils.js` (`SEQ_COLORS`, `CAT_COLORS`), en `js/views/map-view.js` (`DIV_COLORS`)
y en los tres colores de procedencia de `css/provenance.css` (observado `#1a4d2e`, estimado
`#e0b070`, sin dato `#d6d3cc`). Se eligieron por lectura de datos y accesibilidad.
**No cambiarlas al retocar el cromo.**

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
- [x] Landing animada con globo 3D
- [x] 6 vistas funcionales
- [x] 5 categorías de datos integradas
- [x] Datos subnacionales
- [x] Comercio bilateral

## Pendiente
- [ ] Crear `.gitignore` (excluir `build/`, scripts Python, `*.txt`, `_server.py`)
- [ ] Limpiar archivos de desarrollo en raíz (patch*.py, patch*.js, test.py, etc.)
- [ ] Eliminar `js/views/map-view.js.bak` (backup que no debería desplegarse)
- [ ] Revisar que funcione correctamente servido desde GitHub Pages (rutas relativas)
