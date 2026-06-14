# Metodologia del Atlas Agrario de America Latina

Version del visor: 2026-05-11

Este visor resume una base de datos historica anual sobre agricultura, uso del suelo, comercio, ganaderia, trabajo agrario e indicadores socioeconomicos de America Latina. La unidad geografica principal es pais-anio; cuando hay fuentes consistentes, el visor incorpora tambien regiones agregadas y unidades subnacionales.

## Cobertura general

La base nacional cubre, segun el modulo, entre 19 y 21 paises latinoamericanos desde 1900 hasta el ultimo anio disponible en cada fuente. La cobertura canonica de produccion agricola, comercio, ganaderia y bilateral se centra en 19 paises; uso del suelo y algunos indicadores socioeconomicos pueden ampliar el panel cuando la fuente externa lo permite.

Los totales regionales se calculan a partir de los paises disponibles. Cuando una serie no existe para un pais-anio, el visor no inventa valores: la celda queda vacia o se excluye de la suma segun el indicador.

## Cultivos

El modulo de cultivos combina los anuarios del Instituto Internacional de Agricultura y FAO, series nacionales, FAOSTAT desde 1961 y fuentes complementarias por producto. Los indicadores principales son produccion, superficie cosechada, rendimiento y energia alimentaria.

La regla general es conservar las observaciones originales cuando existen y rellenar lagunas solo con metodos documentados: interpolacion entre anclas, extrapolacion hacia atras con proxies agronomicos o poblacionales, y modulacion de rendimientos para evitar saltos artificiales entre el periodo historico y FAOSTAT.

Fuente principal propia: base LATAM agraria, pendiente de DOI Zenodo. Sustituir aqui por el DOI definitivo cuando se publique.

## Comercio directo

El comercio directo usa totales nacionales de exportaciones e importaciones por producto. Para el periodo moderno la referencia principal es FAOSTAT; para los tramos historicos se integran anuarios IIA/FAO y estadisticas nacionales. Los productos se expresan en toneladas y, cuando procede, tambien en energia.

Los balances comerciales se calculan como exportaciones menos importaciones. Por esa razon no se muestran metricas porcentuales ni escalas logaritmicas cuando no tienen interpretacion economica clara.

## Comercio bilateral

El comercio bilateral desagrega los totales nacionales por socio comercial. La reconstruccion conserva masa: para cada pais, producto, anio y flujo, la suma de socios debe coincidir con el total nacional correspondiente.

Fuentes directas: FAOSTAT Trade Detailed Matrix, UN Comtrade, y benchmarks historicos de Argentina, Brasil y Chile. Fuentes espejo: comercio exterior de Estados Unidos, Reino Unido, Espana e Italia. Cuando no hay una observacion bilateral directa, se usan shares historicos o priors de Comtrade, siempre separados por regimen temporal para evitar que socios modernos contaminen periodos historicos.

Citas clave: Federico y Tena-Junguito (2019), Fouquin y Hugot (2016), Federico, Natoli, Tattara y Vasta (2011), FAOSTAT TM y UN Comtrade.

## Ganaderia

El modulo de ganaderia armoniza cabezas de ganado, unidades ganaderas y consumo de forraje. La serie combina IIA/FAO historico con FAOSTAT/EDU moderno. Antes de 1961, los niveles se calibran para evitar discontinuidades mecanicas en el empalme con FAOSTAT.

Las unidades ganaderas permiten comparar especies distintas, pero siguen siendo una conversion. Para analisis de una especie concreta conviene revisar tambien la serie de cabezas.

## Uso del suelo

El uso del suelo combina cropland, pastos, bosque, otros usos naturales y urbano. La salida del proyecto esta en km2; el visor la convierte a 1000 ha para mantener una unidad familiar en la interfaz.

FAOSTAT se usa como ancla moderna cuando existe. LUH2/HYDE aportan trayectorias historicas y patrones espaciales donde FAOSTAT no cubre el periodo o la categoria. El panel impone una identidad contable: cropland + pastos + bosque + otros naturales + urbano debe sumar la superficie terrestre nacional.

Citas clave: FAOSTAT Land Use, Hurtt et al. (2020) para LUH2, Klein Goldewijk et al. (2017) para HYDE 3.2, Ramankutty et al. (2008), Fetzel et al. (2017) y Winkler et al. (2021).

## Subnacional

El modulo subnacional se usa donde hay series consistentes por provincia, estado, departamento o region. En la version actual incluye Argentina, Bolivia, Brasil, Chile, Colombia y Mexico para cultivos. Las unidades se escalan a los totales nacionales para que el mapa subnacional y el total pais sean compatibles.

Regla del visor: cuando hay datos y geometria subnacional, se dibuja el desglose admin1. Si faltan datos subnacionales para un indicador, se muestra el valor nacional. Si existen datos pero no geometria util, el pais no desaparece: cae al valor nacional siempre que sea posible.

Fuentes: MAGyP/IIA para Argentina, IIA/IBGE para Brasil, censos y SIAP/SADER para Mexico, INE para Bolivia, ODEPA para Chile, y censos/agregados Contraloria-DANE/EVA para Colombia.

## Trabajo agrario

El modulo de trabajo agrario recoge empleo y horas trabajadas en agricultura, ganaderia y ramas afines. La base procede de series historicas armonizadas de empleo sectorial y se agrega para America Latina con la misma estructura pais-anio del resto del visor.

Los porcentajes de empleo deben interpretarse como participacion dentro del empleo total disponible en la fuente, no como intensidad fisica de produccion.

Cita provisional en ingles: Infante-Amate and Escalante (forthcoming). *Agricultural Labour Database for Latin America*. El registro Zenodo y el paper de datos se enlazaran aqui cuando exista DOI definitivo.

## Desigualdad y reforma agraria

El visor incorpora una primera version del bloque socioeconomico con Gini de la tierra, Gini de ingreso disponible, Gini de ingreso de mercado e indicadores de reforma agraria.

El Gini de la tierra combina Frankema (2010), Deininger y Olinto (2000) y calculos propios a partir de FAOSTAT WCAD. Cuando varias fuentes cubren el mismo pais-anio se aplica una jerarquia de preferencia documentada en el pipeline, y las series se interpolan con etiquetas de metodo en el panel largo original.

Los Gini de ingreso proceden de SWIID y se reescalan de 0-100 a 0-1. Las variables de reforma agraria proceden de Albertus (2015), expresadas como legislacion/reforma binaria, intensidad y reforma total como porcentaje de tierra cultivable. Estas series no se extienden artificialmente despues del ultimo anio cubierto por la fuente.

Citas clave: Frankema (2010), Deininger y Olinto (2000), FAOSTAT WCAD, Solt (2020) para SWIID, Albertus (2015), V-Dem v15 para indices institucionales, Maddison Project Database 2023 y World Bank WDI para modulos macroeconomicos aun no expuestos en el visor.

## Lectura de las visualizaciones

El visor oculta opciones sin sentido para cada indicador siempre que es posible. Por ejemplo, los balances no se muestran como porcentaje regional; los indices y variables binarias no usan escala logaritmica; y la comparacion subnacional cae a nacional cuando no hay desglose real.

Los mapas comparativos usan la misma escala de color para ambos anios, de modo que diferencias cromaticas representan cambios reales y no un reescalado independiente de cada panel.

## Citas breves

- Albertus, M. (2015). *Autocracy and Redistribution: The Politics of Land Reform*. Cambridge University Press.
- Bolt, J., & van Zanden, J. L. (2024). Maddison Project Database 2023.
- Deininger, K., & Olinto, P. (2000). *Asset Distribution, Inequality, and Growth*. World Bank Policy Research Working Paper 2375.
- FAO. FAOSTAT, World Census of Agriculture Database, Land Use domain, Trade Crops and Livestock, and Trade Detailed Matrix.
- Federico, G., & Tena-Junguito, A. (2019). World Trade, 1800-1938: A New Synthesis. *Revista de Historia Economica*.
- Frankema, E. (2010). The colonial roots of land inequality. *The Economic History Review*.
- Hurtt, G. C., et al. (2020). LUH2 land-use harmonization.
- Klein Goldewijk, K., et al. (2017). HYDE 3.2. *Earth System Science Data*.
- Solt, F. (2020). Measuring Income Inequality across Countries and over Time: SWIID. *Social Science Quarterly*.
- World Bank. World Development Indicators.
