/* data-loader.js - CSV-first data loader with JSON fallback */

import State from './state.js?v=20260522-mobile-ui18';
import { COUNTRIES, REGIONS } from './utils.js';

const DataLoader = (() => {
    const DATA_VERSION = '20260522-mobile-ui18';
    let _metadata = null;
    let _geo = null;
    let _topo = null;
    let _dataStore = {};
    let _loadPromises = {};

    let _subData = null;
    let _subTopo = null;
    let _subGeo = null;
    let _subLoadPromise = null;

    let _bilateralData = null;
    let _bilateralPromise = null;

    const YEAR_MIN = 1840;
    const YEAR_MAX = 2024;
    const CSV_BASES = ['output/data', '../output/data', '/output/data'];

    function _withVersion(url) {
        return url.includes('?') ? `${url}&v=${DATA_VERSION}` : `${url}?v=${DATA_VERSION}`;
    }

    async function init() {
        const [metaResp] = await Promise.all([
            fetch(_withVersion('data/metadata.json')).then(r => r.json()),
            _loadTopo(),
        ]);
        _metadata = metaResp;
        await loadCategory('agriculture');
    }

    async function _loadTopo() {
        try {
            const resp = await fetch(_withVersion('data/latam.topo.json'));
            if (resp.ok) {
                _topo = await resp.json();
                _geo = topojson.feature(_topo, _topo.objects.countries);
                return;
            }
        } catch (e) { }

        const resp = await fetch(_withVersion('data/latam.geojson'));
        _geo = await resp.json();
    }

    async function _loadCsvTextFromCandidates(fileNames) {
        const names = Array.isArray(fileNames) ? fileNames : [fileNames];
        for (const base of CSV_BASES) {
            for (const name of names) {
                try {
                    const path = `${base}/${name}`;
                    const resp = await fetch(_withVersion(path));
                    if (resp.ok) {
                        return await resp.text();
                    }
                } catch (e) { }
            }
        }
        return null;
    }

    function _num(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function _initYearBucket(obj, year) {
        if (!obj[year]) {
            obj[year] = {
                production: 0,
                area: 0,
                value_GJ: 0,
                yield_sum: 0,
                yield_n: 0,
                yield_kcal_ha_sum: 0,
                yield_kcal_ha_n: 0,
                workers: 0,
                hours: 0,
                totalWorkers: 0,
                arable_land: 0,
                permanent_crops: 0,
                agricultural_land: 0,
                forest_land: 0,
            };
        }
        return obj[year];
    }

    function _finalizeSeries(years, byYear, fields) {
        const out = {};
        fields.forEach(f => {
            out[f] = years.map(y => {
                const v = byYear[y]?.[f];
                return Number.isFinite(v) ? v : null;
            });
        });
        return out;
    }

    function _regionLabel(id) {
        return REGIONS[id]?.label || id;
    }

    function _buildTopItemsFromCountryItemMap(years, countryItemMap) {
        const topItemsByCountry = {};
        Object.entries(countryItemMap).forEach(([iso3, itemObj]) => {
            const itemRows = Object.entries(itemObj).map(([itemName, byYear]) => {
                const production = years.map(y => byYear[y]?.production ?? null);
                const area = years.map(y => byYear[y]?.area ?? null);
                const value_GJ = years.map(y => byYear[y]?.value_GJ ?? null);
                const yieldArr = years.map((y, idx) => {
                    const p = production[idx];
                    const a = area[idx];
                    if (p != null && a != null && a > 0) return p / a;
                    const avg = byYear[y]?.yield_n > 0 ? byYear[y].yield_sum / byYear[y].yield_n : null;
                    return avg;
                });
                return { name: itemName, production, area, value_GJ, yield: yieldArr };
            });

            itemRows.sort((a, b) => {
                const av = a.production[a.production.length - 1] ?? 0;
                const bv = b.production[b.production.length - 1] ?? 0;
                return bv - av;
            });

            topItemsByCountry[iso3] = itemRows.slice(0, 40);
        });
        return topItemsByCountry;
    }

    async function _buildAgricultureFromCsv() {
        const text = await _loadCsvTextFromCandidates('crop_panel_energy.csv');
        if (!text) return null;

        const rows = d3.csvParse(text);
        const yearsSet = new Set();
        const categoriesSet = new Set();

        const byCountry = {};
        const byRegion = {};
        const byCountryItem = {};

        rows.forEach(row => {
            const iso3 = (row.iso3 || '').trim();
            const year = _num(row.year);
            if (!iso3 || year == null) return;

            yearsSet.add(year);
            if (row.category_fao) categoriesSet.add(row.category_fao);

            const regionId = (row.region_latam || COUNTRIES[iso3]?.region || 'latin_america').trim();
            const production = _num(row.production) ?? 0;
            const area = _num(row.area) ?? 0;
            const productionKcal = _num(row.production_kcal) ?? 0;
            const yieldVal = _num(row.yield);
            const yieldKcalHa = _num(row.yield_kcal_ha);

            byCountry[iso3] = byCountry[iso3] || {};
            const cBucket = _initYearBucket(byCountry[iso3], year);
            cBucket.production += production;
            cBucket.area += area;
            cBucket.value_GJ += productionKcal;
            if (yieldVal != null) {
                cBucket.yield_sum += yieldVal;
                cBucket.yield_n += 1;
            }
            if (yieldKcalHa != null) {
                cBucket.yield_kcal_ha_sum += yieldKcalHa;
                cBucket.yield_kcal_ha_n += 1;
            }

            byRegion[regionId] = byRegion[regionId] || {};
            const rBucket = _initYearBucket(byRegion[regionId], year);
            rBucket.production += production;
            rBucket.area += area;
            rBucket.value_GJ += productionKcal;
            if (yieldVal != null) {
                rBucket.yield_sum += yieldVal;
                rBucket.yield_n += 1;
            }
            if (yieldKcalHa != null) {
                rBucket.yield_kcal_ha_sum += yieldKcalHa;
                rBucket.yield_kcal_ha_n += 1;
            }

            const itemName = (row.item || '').trim();
            if (itemName) {
                byCountryItem[iso3] = byCountryItem[iso3] || {};
                byCountryItem[iso3][itemName] = byCountryItem[iso3][itemName] || {};
                const iBucket = _initYearBucket(byCountryItem[iso3][itemName], year);
                iBucket.production += production;
                iBucket.area += area;
                iBucket.value_GJ += productionKcal;
                if (yieldVal != null) {
                    iBucket.yield_sum += yieldVal;
                    iBucket.yield_n += 1;
                }
            }
        });

        const years = Array.from(yearsSet).sort((a, b) => a - b);
        if (years.length === 0) return null;

        const countries = {};
        Object.entries(byCountry).forEach(([iso3, yearMap]) => {
            const production = years.map(y => yearMap[y]?.production ?? null);
            const area = years.map(y => yearMap[y]?.area ?? null);
            const value_GJ = years.map(y => yearMap[y]?.value_GJ ?? null);
            const yieldArr = years.map((y, idx) => {
                const p = production[idx];
                const a = area[idx];
                if (p != null && a != null && a > 0) return p / a;
                const b = yearMap[y];
                if (b?.yield_n > 0) return b.yield_sum / b.yield_n;
                return null;
            });

            countries[iso3] = {
                name: COUNTRIES[iso3]?.name || iso3,
                region: COUNTRIES[iso3]?.region || 'latin_america',
                totals: {
                    production,
                    area,
                    value_GJ,
                    yield: yieldArr,
                },
            };
        });

        const regions = {};
        Object.entries(byRegion).forEach(([rid, yearMap]) => {
            const production = years.map(y => yearMap[y]?.production ?? null);
            const area = years.map(y => yearMap[y]?.area ?? null);
            const value_GJ = years.map(y => yearMap[y]?.value_GJ ?? null);
            const yieldArr = years.map((y, idx) => {
                const p = production[idx];
                const a = area[idx];
                if (p != null && a != null && a > 0) return p / a;
                const b = yearMap[y];
                if (b?.yield_n > 0) return b.yield_sum / b.yield_n;
                return null;
            });

            regions[rid] = {
                name: _regionLabel(rid),
                label: _regionLabel(rid),
                totals: {
                    production,
                    area,
                    value_GJ,
                    yield: yieldArr,
                },
            };
        });

        if (!regions.latin_america) {
            const latamByYear = {};
            Object.values(byCountry).forEach(yearMap => {
                Object.entries(yearMap).forEach(([year, vals]) => {
                    const b = _initYearBucket(latamByYear, year);
                    b.production += vals.production;
                    b.area += vals.area;
                    b.value_GJ += vals.value_GJ;
                    b.yield_sum += vals.yield_sum;
                    b.yield_n += vals.yield_n;
                });
            });

            const production = years.map(y => latamByYear[y]?.production ?? null);
            const area = years.map(y => latamByYear[y]?.area ?? null);
            const value_GJ = years.map(y => latamByYear[y]?.value_GJ ?? null);
            const yieldArr = years.map((y, idx) => {
                const p = production[idx];
                const a = area[idx];
                if (p != null && a != null && a > 0) return p / a;
                const b = latamByYear[y];
                if (b?.yield_n > 0) return b.yield_sum / b.yield_n;
                return null;
            });

            regions.latin_america = {
                name: 'América Latina',
                label: 'América Latina',
                totals: { production, area, value_GJ, yield: yieldArr },
            };
        }

        const topItemsByCountry = _buildTopItemsFromCountryItemMap(years, byCountryItem);
        Object.entries(countries).forEach(([iso3, c]) => {
            c.topItems = topItemsByCountry[iso3] || [];
        });
        regions.latin_america.topItems = Object.values(topItemsByCountry).flat().slice(0, 40);

        return {
            years,
            countries,
            regions,
            categories: Array.from(categoriesSet).sort(),
        };
    }

    async function _buildLandUseFromCsv() {
        const text = await _loadCsvTextFromCandidates('land_use_national.csv');
        if (!text) return null;

        const rows = d3.csvParse(text);
        const yearsSet = new Set();
        const byCountry = {};
        const byRegion = {};

        rows.forEach(row => {
            const iso3 = (row.iso3 || '').trim();
            const year = _num(row.year);
            if (!iso3 || year == null) return;

            yearsSet.add(year);
            const regionId = COUNTRIES[iso3]?.region || 'latin_america';

            const arable = _num(row.cropland_annual) ?? 0;
            const permanent = _num(row.cropland_permanent) ?? 0;
            const cropland = _num(row.cropland) ?? 0;
            const pasture = _num(row.pasture) ?? 0;
            const forest = _num(row.forest) ?? 0;

            const agricultural = cropland + pasture;

            byCountry[iso3] = byCountry[iso3] || {};
            const c = _initYearBucket(byCountry[iso3], year);
            c.arable_land += arable;
            c.permanent_crops += permanent;
            c.agricultural_land += agricultural;
            c.forest_land += forest;

            byRegion[regionId] = byRegion[regionId] || {};
            const r = _initYearBucket(byRegion[regionId], year);
            r.arable_land += arable;
            r.permanent_crops += permanent;
            r.agricultural_land += agricultural;
            r.forest_land += forest;
        });

        const years = Array.from(yearsSet).sort((a, b) => a - b);
        if (years.length === 0) return null;

        const fields = ['agricultural_land', 'arable_land', 'permanent_crops', 'forest_land'];
        const countries = {};
        Object.entries(byCountry).forEach(([iso3, yearMap]) => {
            countries[iso3] = {
                name: COUNTRIES[iso3]?.name || iso3,
                region: COUNTRIES[iso3]?.region || 'latin_america',
                totals: _finalizeSeries(years, yearMap, fields),
            };
        });

        const regions = {};
        Object.entries(byRegion).forEach(([rid, yearMap]) => {
            regions[rid] = {
                name: _regionLabel(rid),
                label: _regionLabel(rid),
                totals: _finalizeSeries(years, yearMap, fields),
            };
        });

        if (!regions.latin_america) {
            const latamByYear = {};
            Object.values(byCountry).forEach(yearMap => {
                Object.entries(yearMap).forEach(([year, vals]) => {
                    const b = _initYearBucket(latamByYear, year);
                    b.arable_land += vals.arable_land;
                    b.permanent_crops += vals.permanent_crops;
                    b.agricultural_land += vals.agricultural_land;
                    b.forest_land += vals.forest_land;
                });
            });
            regions.latin_america = {
                name: 'América Latina',
                label: 'América Latina',
                totals: _finalizeSeries(years, latamByYear, fields),
            };
        }

        return { years, countries, regions, categories: [] };
    }

    function _pickCol(headers, candidates) {
        return candidates.find(c => headers.includes(c)) || null;
    }

    async function _buildLaborFromCsv() {
        const text = await _loadCsvTextFromCandidates([
            'employment_panel.csv',
            'labor_panel.csv',
            'employment_national.csv',
            'agricultural_employment.csv',
        ]);
        if (!text) return null;

        const rows = d3.csvParse(text);
        if (!rows.length) return null;

        const headers = Object.keys(rows[0]);
        const workersCol = _pickCol(headers, ['workers_agri', 'agri_workers', 'workers_agriculture', 'agricultural_workers', 'workers']);
        const hoursCol = _pickCol(headers, ['hours_agri', 'agricultural_hours', 'hours']);
        const totalCol = _pickCol(headers, ['workers_total', 'total_workers', 'employment_total', 'workers_economy_total', 'total_employment']);
        const shareCol = _pickCol(headers, ['share_economy', 'share_total_economy', 'share']);

        if (!workersCol) return null;

        const yearsSet = new Set();
        const byCountry = {};
        const byRegion = {};

        rows.forEach(row => {
            const iso3 = (row.iso3 || '').trim();
            const year = _num(row.year);
            if (!iso3 || year == null) return;
            yearsSet.add(year);

            const regionId = COUNTRIES[iso3]?.region || 'latin_america';
            const workers = _num(row[workersCol]) ?? 0;
            const hours = hoursCol ? (_num(row[hoursCol]) ?? 0) : 0;
            const totalWorkers = totalCol ? (_num(row[totalCol]) ?? 0) : 0;
            const shareRaw = shareCol ? _num(row[shareCol]) : null;

            byCountry[iso3] = byCountry[iso3] || {};
            const c = _initYearBucket(byCountry[iso3], year);
            c.workers += workers;
            c.hours += hours;
            c.totalWorkers += totalWorkers;
            if (shareRaw != null && totalWorkers === 0) {
                c.share_economy = shareRaw;
            }

            byRegion[regionId] = byRegion[regionId] || {};
            const r = _initYearBucket(byRegion[regionId], year);
            r.workers += workers;
            r.hours += hours;
            r.totalWorkers += totalWorkers;
        });

        const years = Array.from(yearsSet).sort((a, b) => a - b);
        if (!years.length) return null;

        const countries = {};
        Object.entries(byCountry).forEach(([iso3, yearMap]) => {
            const workers = years.map(y => yearMap[y]?.workers ?? null);
            const hours = years.map(y => yearMap[y]?.hours ?? null);
            const share_economy = years.map(y => {
                const b = yearMap[y];
                if (!b) return null;
                if (b.totalWorkers > 0) return (b.workers / b.totalWorkers) * 100;
                return Number.isFinite(b.share_economy) ? b.share_economy : null;
            });
            countries[iso3] = {
                name: COUNTRIES[iso3]?.name || iso3,
                region: COUNTRIES[iso3]?.region || 'latin_america',
                totals: {
                    workers,
                    hours,
                    share_economy,
                    share: share_economy,
                },
            };
        });

        const regions = {};
        Object.entries(byRegion).forEach(([rid, yearMap]) => {
            const workers = years.map(y => yearMap[y]?.workers ?? null);
            const hours = years.map(y => yearMap[y]?.hours ?? null);
            const share_economy = years.map(y => {
                const b = yearMap[y];
                if (!b) return null;
                if (b.totalWorkers > 0) return (b.workers / b.totalWorkers) * 100;
                return null;
            });
            regions[rid] = {
                name: _regionLabel(rid),
                label: _regionLabel(rid),
                totals: {
                    workers,
                    hours,
                    share_economy,
                    share: share_economy,
                },
            };
        });

        return { years, countries, regions, categories: [] };
    }

    async function _tryLoadCategoryFromCsv(categoryId) {
        return null; // CSV loading disabled to prevent 404s. Using JSONs instead.
    }

    async function loadCategory(categoryId) {
        // If data is already in the store, return immediately
        if (_dataStore[categoryId]) return _dataStore[categoryId];

        // If a load is in progress, wait for it
        if (_loadPromises[categoryId]) return _loadPromises[categoryId];

        _loadPromises[categoryId] = (async () => {
            const csvData = await _tryLoadCategoryFromCsv(categoryId);
            if (csvData) {
                _dataStore[categoryId] = csvData;
                return csvData;
            }

            const cat = _metadata.categories.find(c => c.id === categoryId);
            if (!cat || !cat.dataFiles) {
                console.warn(`Category ${categoryId} not found or has no data files`);
                return null;
            }

            try {
                const resp = await fetch(_withVersion(cat.dataFiles.annual));
                if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${cat.dataFiles.annual}`);
                const data = await resp.json();
                _dataStore[categoryId] = data;

                // Compute yield_GJ (GJ/ha) for agriculture from value_GJ / area
                if (categoryId === 'agriculture') {
                    _computeYieldGJ(data);
                }

                // Also load bilateral data and inject totals into trade data
                if (categoryId === 'trade' && cat.dataFiles.bilateral) {
                    await loadBilateral();
                    _injectBilateralTotals(data);
                }

                // Null out the last year if its values are <10% of the prior year's
                // across all countries - usually means the source data is mid-year
                // and would distort the map / chart endpoint.
                _trimPartialLastYear(data);

                return data;
            } catch (err) {
                console.warn(`Failed to load ${categoryId}:`, err);
                // Clear cached promise so a retry is possible
                delete _loadPromises[categoryId];
                return null;
            }
        })();

        return _loadPromises[categoryId];
    }

    function _trimPartialLastYear(data, threshold = 0.10) {
        if (!data?.years || !Array.isArray(data.years)) return;
        const last = data.years.length - 1;
        if (last < 1) return;

        // Pick a representative field by sampling the first country's totals.
        const sample = data.countries ? Object.values(data.countries)[0] : null;
        if (!sample?.totals) return;
        const fields = Object.keys(sample.totals).filter(
            f => Array.isArray(sample.totals[f])
        );
        if (!fields.length) return;

        const field = fields[0];
        let lastSum = 0, prevSum = 0;
        for (const c of Object.values(data.countries || {})) {
            const s = c.totals?.[field];
            if (!Array.isArray(s)) continue;
            const lv = s[last], pv = s[last - 1];
            if (lv != null && pv != null && pv !== 0) {
                lastSum += Math.abs(lv);
                prevSum += Math.abs(pv);
            }
        }
        if (prevSum === 0 || lastSum / prevSum >= threshold) return;

        const wipe = (entity) => {
            const t = entity?.totals;
            if (t) {
                for (const k of Object.keys(t)) {
                    if (Array.isArray(t[k])) t[k][last] = null;
                }
            }
            // Also blank nested item series to keep treemap/ranking in sync
            const nested = [entity?.bySpecies, entity?.byCategory, entity?.byItem];
            for (const dict of nested) {
                if (!dict) continue;
                for (const item of Object.values(dict)) {
                    if (!item) continue;
                    for (const k of Object.keys(item)) {
                        if (Array.isArray(item[k])) item[k][last] = null;
                    }
                }
            }
            if (Array.isArray(entity?.topItems)) {
                for (const it of entity.topItems) {
                    for (const k of Object.keys(it)) {
                        if (Array.isArray(it[k])) it[k][last] = null;
                    }
                }
            } else if (entity?.topItems && typeof entity.topItems === 'object') {
                for (const arr of Object.values(entity.topItems)) {
                    if (!Array.isArray(arr)) continue;
                    for (const it of arr) {
                        for (const k of Object.keys(it)) {
                            if (Array.isArray(it[k])) it[k][last] = null;
                        }
                    }
                }
            }
        };

        Object.values(data.countries || {}).forEach(wipe);
        Object.values(data.regions || {}).forEach(wipe);
        console.log(`[DATA] Trimmed partial last year (${data.years[last]}): ${field} was ${(lastSum / prevSum * 100).toFixed(1)}% of prior year`);
    }

    function _computeYieldGJSeries(gjSeries, areaSeries) {
        return _computeYieldSeries(gjSeries, areaSeries);
    }

    function _computeYieldSeries(valueSeries, areaSeries) {
        const len = Math.max(valueSeries?.length || 0, areaSeries?.length || 0);
        const out = [];
        for (let i = 0; i < len; i++) {
            const v = valueSeries?.[i];
            const a = areaSeries?.[i];
            if (v != null && a != null && Number.isFinite(v) && Number.isFinite(a) && a > 0) {
                out.push(v / a);
            } else {
                out.push(null);
            }
        }
        return out;
    }

    function _computeYieldGJ(data) {
        // Add yield_GJ to totals for countries and regions
        for (const entity of [...Object.values(data.countries || {}), ...Object.values(data.regions || {})]) {
            if (entity.totals?.production && entity.totals?.area && !entity.totals.yield) {
                entity.totals.yield = _computeYieldSeries(entity.totals.production, entity.totals.area);
            }
            if (entity.totals?.value_GJ && entity.totals?.area) {
                entity.totals.yield_GJ = _computeYieldGJSeries(entity.totals.value_GJ, entity.totals.area);
            }
            // Also for topItems
            if (Array.isArray(entity.topItems)) {
                for (const item of entity.topItems) {
                    if (item.production && item.area && !item.yield) {
                        item.yield = _computeYieldSeries(item.production, item.area);
                    }
                    if (item.value_GJ && item.area) {
                        item.yield_GJ = _computeYieldGJSeries(item.value_GJ, item.area);
                    }
                }
            }
            // Also for byCategory
            if (entity.byCategory) {
                for (const cat of Object.values(entity.byCategory)) {
                    if (cat.production && cat.area && !cat.yield) {
                        cat.yield = _computeYieldSeries(cat.production, cat.area);
                    }
                    if (cat.value_GJ && cat.area) {
                        cat.yield_GJ = _computeYieldGJSeries(cat.value_GJ, cat.area);
                    }
                }
            }
        }
    }

    function _buildSubnationalFromCropCsv(text) {
        const rows = d3.csvParse(text);
        const yearsSet = new Set();
        const countries = {};

        rows.forEach(row => {
            const iso3 = (row.iso3 || '').trim();
            const adminName = (row.admin_name || '').trim();
            const year = _num(row.year);
            if (!iso3 || !adminName || year == null) return;

            yearsSet.add(year);

            countries[iso3] = countries[iso3] || { admin1: {} };
            countries[iso3].admin1[adminName] = countries[iso3].admin1[adminName] || { name: adminName, _byYear: {} };

            const bucket = _initYearBucket(countries[iso3].admin1[adminName]._byYear, year);
            bucket.production += _num(row.production) ?? 0;
            bucket.area += _num(row.area) ?? 0;
            bucket.value_GJ += _num(row.production_kcal) ?? 0;

            const y = _num(row.yield);
            if (y != null) {
                bucket.yield_sum += y;
                bucket.yield_n += 1;
            }

            const yk = _num(row.yield_kcal_ha);
            if (yk != null) {
                bucket.yield_kcal_ha_sum += yk;
                bucket.yield_kcal_ha_n += 1;
            }
        });

        const years = Array.from(yearsSet).sort((a, b) => a - b);

        Object.values(countries).forEach(c => {
            Object.values(c.admin1).forEach(admin => {
                const byYear = admin._byYear;
                const production = years.map(y => byYear[y]?.production ?? null);
                const area = years.map(y => byYear[y]?.area ?? null);
                const value_GJ = years.map(y => byYear[y]?.value_GJ ?? null);
                const yieldArr = years.map((y, idx) => {
                    const p = production[idx];
                    const a = area[idx];
                    if (p != null && a != null && a > 0) return p / a;
                    const b = byYear[y];
                    return b?.yield_n > 0 ? b.yield_sum / b.yield_n : null;
                });

                const yield_GJ = _computeYieldGJSeries(value_GJ, area);
                admin.totals = { production, area, value_GJ, yield: yieldArr, yield_GJ };
                delete admin._byYear;
            });
        });

        return { years, countries };
    }

    async function loadSubnational() {
        if (_subLoadPromise) return _subLoadPromise;

        _subLoadPromise = (async () => {
            try {
                const [data, topo] = await Promise.all([
                    fetch(_withVersion('data/subnational.json')).then(r => r.json()),
                    fetch(_withVersion('data/subnational.topo.json')).then(r => r.json()),
                ]);
                _subData = data;
                // Compute yield_GJ for subnational JSON data
                for (const cData of Object.values(data.countries || {})) {
                    for (const admin of Object.values(cData.admin1 || {})) {
                        if (admin.totals?.value_GJ && admin.totals?.area && !admin.totals.yield_GJ) {
                            admin.totals.yield_GJ = _computeYieldGJSeries(admin.totals.value_GJ, admin.totals.area);
                        }
                    }
                }
                _subTopo = topo;
                _subGeo = topojson.feature(topo, topo.objects.admin1);
                console.log(`Subnational JSON loaded: ${_subGeo.features.length} admin1 units`);
            } catch (err) {
                console.warn('Failed to load subnational data:', err);
            }
        })();

        return _subLoadPromise;
    }

    function _injectBilateralTotals(tradeData) {
        if (!_bilateralData || !tradeData) return;
        const bYears = _bilateralData.years || [];
        const tYears = tradeData.years || [];

        function alignSeries(bSeries) {
            // Align bilateral years to trade years
            return tYears.map(y => {
                const bi = bYears.indexOf(y);
                if (bi < 0 || bi >= (bSeries || []).length) return null;
                return bSeries[bi];
            });
        }

        function computeBalance(exp, imp) {
            if (!exp || !imp) return null;
            return exp.map((e, i) => {
                if (e == null || imp[i] == null) return null;
                return Math.round((e - imp[i]) * 10) / 10;
            });
        }

        // Inject into countries
        for (const [iso3, cData] of Object.entries(_bilateralData.countries || {})) {
            const tc = tradeData.countries?.[iso3];
            if (!tc) continue;
            if (!tc.totals) tc.totals = {};
            const bExp = cData.export?.total ? alignSeries(cData.export.total) : null;
            const bImp = cData.import?.total ? alignSeries(cData.import.total) : null;
            if (bExp) tc.totals.bilateral_exports = bExp;
            if (bImp) tc.totals.bilateral_imports = bImp;
            const bal = computeBalance(bExp, bImp);
            if (bal) tc.totals.bilateral_balance = bal;
        }

        // Inject into regions
        for (const [regId, rData] of Object.entries(_bilateralData.regions || {})) {
            const tr = tradeData.regions?.[regId];
            if (!tr) continue;
            if (!tr.totals) tr.totals = {};
            const bExp = rData.export?.total ? alignSeries(rData.export.total) : null;
            const bImp = rData.import?.total ? alignSeries(rData.import.total) : null;
            if (bExp) tr.totals.bilateral_exports = bExp;
            if (bImp) tr.totals.bilateral_imports = bImp;
            const bal = computeBalance(bExp, bImp);
            if (bal) tr.totals.bilateral_balance = bal;
        }

        console.log('[DATA] Bilateral totals injected into trade data');
    }

    function _activeData() {
        const catId = State.get('activeCategory');
        return _dataStore[catId] || null;
    }

    function getMetadata() { return _metadata; }
    function getGeo() { return _geo; }
    function getTopo() { return _topo; }

    function getYears() {
        const data = _activeData();
        if (data?.years) return data.years;
        return Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i);
    }

    function yearIndex(year) {
        const data = _activeData();
        if (data?.years) {
            const idx = data.years.indexOf(year);
            return idx >= 0 ? idx : year - (data.years[0] || YEAR_MIN);
        }
        return year - YEAR_MIN;
    }

    function _cloneSeries(series) {
        if (!Array.isArray(series)) return [];
        return series.slice(); // Don't trim here - trimming happens in getTimeSeries
    }

    function _activeIndicatorDataField() {
        const cat = _metadata?.categories?.find(c => c.id === State.get('activeCategory'));
        if (!cat) return null;
        const activeUnit = State.get('activeUnit');
        for (const group of (cat.indicatorGroups || [])) {
            for (const ind of (group.indicators || [])) {
                if (ind.id !== State.get('activeIndicator')) continue;
                if (activeUnit === 'GJ' && ind.dataFieldGJ) return ind.dataFieldGJ;
                return ind.dataField || null;
            }
        }
        return null;
    }

    function _rawSeries(code, dataField, geoLevel = 'country') {
        const data = _activeData();
        if (!data) return [];

        let entity = null;
        if (geoLevel === 'country') entity = data.countries?.[code];
        if (geoLevel === 'region') entity = data.regions?.[code];
        if (!entity) return [];

        const cropItem = State.get('cropItem');
        const cropCategory = State.get('cropCategory');

        // Filter by specific crop item
        if (cropItem && cropItem !== 'all') {
            if (State.get('activeCategory') === 'landuse' && entity.totals) {
                const field = _landuseFieldFromItemName(cropItem);
                const arr = entity.totals[field];
                if (Array.isArray(arr)) return _cloneSeries(arr);
            }
            // Check bySpecies / byCategory / byItem dicts
            const bySub = entity.bySpecies || entity.byCategory || entity.byItem;
            if (bySub && bySub[cropItem]) {
                const arr = bySub[cropItem][dataField] || bySub[cropItem];
                if (Array.isArray(arr)) return _cloneSeries(arr);
            }
            // Check topItems array (agriculture: [{name, production[], area[], ...}])
            if (Array.isArray(entity.topItems)) {
                const item = entity.topItems.find(it => it.name === cropItem);
                if (item && Array.isArray(item[dataField])) {
                    return _cloneSeries(item[dataField]);
                }
            }
            // Check topItems dict (trade: {exports:[{name,code,values[]}], imports:[...]})
            if (entity.topItems && typeof entity.topItems === 'object' && !Array.isArray(entity.topItems)) {
                for (const subItems of Object.values(entity.topItems)) {
                    if (!Array.isArray(subItems)) continue;
                    const item = subItems.find(it => it.name === cropItem || it.code === cropItem);
                    if (item) {
                        const arr = _itemValueSeries(item, dataField);
                        if (Array.isArray(arr)) return _cloneSeries(arr);
                    }
                }
            }
        }

        // Filter by crop category (e.g. "Cereals", "Sugar Crops")
        if (cropCategory && cropCategory !== 'all') {
            if (entity.byCategory && entity.byCategory[cropCategory]) {
                const arr = entity.byCategory[cropCategory][dataField];
                if (Array.isArray(arr)) return _cloneSeries(arr);
            }
        }

        // If the user explicitly filtered by an item or category, do NOT
        // silently fall back to the country total. That was the cause of the
        // "millions of workers in olive groves" bug — selecting Olivar would
        // show the whole country's agricultural workforce because Olivar's
        // own series wasn't found for the active year.
        if ((cropItem && cropItem !== 'all') || (cropCategory && cropCategory !== 'all')) {
            return [];
        }

        return _cloneSeries(entity.totals?.[dataField]);
    }

    function _rawSubnationalSeries(iso3, adminName, dataField) {
        if (!_subData) return [];
        const entity = _subData.countries?.[iso3]?.admin1?.[adminName];
        if (!entity) return [];

        const cropItem = State.get('cropItem');
        const cropCategory = State.get('cropCategory');

        // Filter by specific crop item
        if (cropItem && cropItem !== 'all') {
            if (State.get('activeCategory') === 'landuse' && entity.totals) {
                const field = _landuseFieldFromItemName(cropItem);
                const arr = entity.totals[field];
                if (Array.isArray(arr)) return _cloneSeries(arr);
            }
            // Check bySpecies / byCategory / byItem dicts
            const bySub = entity.bySpecies || entity.byCategory || entity.byItem;
            if (bySub && bySub[cropItem]) {
                const arr = bySub[cropItem][dataField] || bySub[cropItem];
                if (Array.isArray(arr)) return _cloneSeries(arr);
            }
            // Check topItems array (agriculture: [{name, production[], area[], ...}])
            if (Array.isArray(entity.topItems)) {
                const item = entity.topItems.find(it => it.name === cropItem);
                if (item && Array.isArray(item[dataField])) {
                    return _cloneSeries(item[dataField]);
                }
            }
            // Check topItems dict (trade: {exports:[{name,code,values[]}], imports:[...]})
            if (entity.topItems && typeof entity.topItems === 'object' && !Array.isArray(entity.topItems)) {
                for (const subItems of Object.values(entity.topItems)) {
                    if (!Array.isArray(subItems)) continue;
                    const item = subItems.find(it => it.name === cropItem || it.code === cropItem);
                    if (item) {
                        const arr = _itemValueSeries(item, dataField);
                        if (Array.isArray(arr)) return _cloneSeries(arr);
                    }
                }
            }
        }

        // Filter by crop category (e.g. "Cereals", "Sugar Crops")
        if (cropCategory && cropCategory !== 'all') {
            if (entity.byCategory && entity.byCategory[cropCategory]) {
                const arr = entity.byCategory[cropCategory][dataField];
                if (Array.isArray(arr)) return _cloneSeries(arr);
            }
        }

        // Same defensive guard as _rawSeries: don't substitute the entity
        // total when the user has an item/category filter active.
        if ((cropItem && cropItem !== 'all') || (cropCategory && cropCategory !== 'all')) {
            return [];
        }

        return _cloneSeries(entity.totals?.[dataField]);
    }

    function _sumSeries(seriesList) {
        const maxLen = d3.max(seriesList, s => s?.length || 0) || 0;
        const out = Array(maxLen).fill(null);
        for (let i = 0; i < maxLen; i++) {
            let acc = 0;
            let has = false;
            seriesList.forEach(series => {
                const v = series?.[i];
                if (v != null && Number.isFinite(v)) {
                    acc += v;
                    has = true;
                }
            });
            out[i] = has ? acc : null;
        }
        return out;
    }

    function _latamTotalSeries(dataField, geoLevel) {
        const data = _activeData();
        if (!data) return [];

        const fromRegions = data.regions?.latin_america?.totals?.[dataField];
        if (fromRegions?.length) return _cloneSeries(fromRegions);

        if (geoLevel === 'region' && data.regions) {
            const regionSeries = Object.entries(data.regions)
                .filter(([rid]) => rid !== 'latin_america')
                .map(([, r]) => r?.totals?.[dataField])
                .filter(Boolean);
            if (regionSeries.length) return _sumSeries(regionSeries);
        }

        if (data.countries) {
            const countrySeries = Object.values(data.countries)
                .map(c => c?.totals?.[dataField])
                .filter(Boolean);
            if (countrySeries.length) return _sumSeries(countrySeries);
        }

        return [];
    }

    function _subnationalCountryTotalSeries(iso3, dataField) {
        const data = _activeData();
        return _cloneSeries(data?.countries?.[iso3]?.totals?.[dataField]);
    }

    function _seriesToIndex100(series) {
        if (!series.length) return [];
        const base = series.find(v => v != null && Number.isFinite(v) && v !== 0);
        if (base == null) return series.map(() => null);
        return series.map(v => (v != null && Number.isFinite(v) ? (v / base) * 100 : null));
    }

    function _seriesToSharePct(series, totalSeries) {
        const len = Math.max(series.length, totalSeries.length);
        const out = Array(len).fill(null);
        for (let i = 0; i < len; i++) {
            const v = series[i];
            const t = totalSeries[i];
            if (v != null && t != null && Number.isFinite(v) && Number.isFinite(t) && t !== 0) {
                out[i] = (v / t) * 100;
            }
        }
        return out;
    }

    function _territoryTotalSeries(code, dataField, geoLevel) {
        const data = _activeData();
        if (!data) return [];
        let entity = null;
        if (geoLevel === 'country') entity = data.countries?.[code];
        if (geoLevel === 'region') entity = data.regions?.[code];
        if (!entity) return [];
        return _cloneSeries(entity.totals?.[dataField]);
    }

    function _transformSeries(series, dataField, geoLevel, code) {
        const mode = State.get('axisMode') || 'absolute';
        const raw = _cloneSeries(series);
        if (mode === 'absolute') return raw;
        if (mode === 'index') return _seriesToIndex100(raw);
        if (mode === 'pct_territory') {
            const total = _territoryTotalSeries(code, dataField, geoLevel);
            return _seriesToSharePct(raw, total);
        }
        if (mode === 'pct_total') {
            const itemName = State.get('cropItem');
            const itemTotal = itemName && itemName !== 'all'
                ? _latamItemTotalSeries(itemName, dataField, geoLevel)
                : [];
            const total = itemTotal.length ? itemTotal : _latamTotalSeries(dataField, geoLevel);
            return _seriesToSharePct(raw, total);
        }
        return raw;
    }

    function _transformSubnationalSeries(series, dataField, iso3, adminName) {
        const mode = State.get('axisMode') || 'absolute';
        const raw = _cloneSeries(series);
        if (mode === 'absolute') return raw;
        if (mode === 'index') return _seriesToIndex100(raw);
        if (mode === 'pct_territory') {
            // % over all crops within this province
            if (adminName && _subData) {
                const entity = _subData.countries?.[iso3]?.admin1?.[adminName];
                const total = _cloneSeries(entity?.totals?.[dataField]);
                return _seriesToSharePct(raw, total);
            }
            const total = _subnationalCountryTotalSeries(iso3, dataField);
            return _seriesToSharePct(raw, total);
        }
        if (mode === 'pct_total') {
            const total = _subnationalCountryTotalSeries(iso3, dataField);
            return _seriesToSharePct(raw, total);
        }
        return raw;
    }

    function getValue(iso3, year, dataField, geoLevel = 'country') {
        const data = _activeData();
        if (!data) return null;

        const yi = yearIndex(year);
        if (yi < 0 || !data.years || yi >= data.years.length) return null;

        const raw = _rawSeries(iso3, dataField, geoLevel);
        if (!raw.length) return null;
        const transformed = _transformSeries(raw, dataField, geoLevel, iso3);
        return transformed[yi] ?? null;
    }

    function getSubnationalValue(iso3, adminName, year, dataField) {
        if (!_subData) return null;
        const yi = _subData.years.indexOf(year);
        if (yi < 0) return null;
        const raw = _rawSubnationalSeries(iso3, adminName, dataField);
        if (!raw.length) return null;
        const transformed = _transformSubnationalSeries(raw, dataField, iso3, adminName);
        return transformed[yi] ?? null;
    }

    function getTimeSeries(code, dataField, geoLevel = 'country') {
        const data = _activeData();
        if (!data) return [];

        const raw = _rawSeries(code, dataField, geoLevel);
        if (!raw.length) return [];
        const series = _transformSeries(raw, dataField, geoLevel, code);

        const result = data.years.map((year, i) => ({ year, value: series[i] }))
            .filter(d => d.value != null);
        // Trim trailing zeros (e.g. 2024 with no data yet)
        while (result.length > 0 && (result[result.length - 1].value === 0 || result[result.length - 1].value == null)) {
            result.pop();
        }
        return result;
    }

    function _rawSeriesToYearRows(years, series) {
        if (!Array.isArray(years) || !Array.isArray(series)) return [];
        return years.map((year, i) => ({ year, value: series[i] ?? null }))
            .filter(d => d.value != null && Number.isFinite(d.value));
    }

    function getOriginalTimeSeries(code, dataField, geoLevel = 'country') {
        const data = _activeData();
        if (!data) return [];
        return _rawSeriesToYearRows(data.years, _rawSeries(code, dataField, geoLevel));
    }

    function getObservationPoints(code, dataField, geoLevel = 'country') {
        const data = _activeData();
        if (!data || (State.get('axisMode') || 'absolute') !== 'absolute') return [];

        let entity = null;
        if (geoLevel === 'country') entity = data.countries?.[code];
        if (geoLevel === 'region') entity = data.regions?.[code];
        if (!entity) return [];

        const points = entity.observations?.[dataField];
        if (!Array.isArray(points)) return [];
        return points
            .filter(point => point && Number.isFinite(point.year) && Number.isFinite(point.value))
            .map(point => ({ ...point }));
    }

    function getSubnationalTimeSeries(iso3, adminName, dataField) {
        if (!_subData) return [];
        const raw = _rawSubnationalSeries(iso3, adminName, dataField);
        if (!raw.length) return [];
        const series = _transformSubnationalSeries(raw, dataField, iso3, adminName);
        const result = _subData.years.map((year, i) => ({ year, value: series[i] }))
            .filter(d => d.value != null);
        // Trim trailing zeros (e.g. 2024 with no data yet)
        while (result.length > 0 && (result[result.length - 1].value === 0 || result[result.length - 1].value == null)) {
            result.pop();
        }
        return result;
    }

    function getOriginalSubnationalTimeSeries(iso3, adminName, dataField) {
        if (!_subData) return [];
        return _rawSeriesToYearRows(_subData.years, _rawSubnationalSeries(iso3, adminName, dataField));
    }

    function getRanking(year, dataField, geoLevel = 'country') {
        const data = _activeData();
        if (!data) return [];

        const yi = yearIndex(year);
        const entries = [];
        const source = geoLevel === 'country' ? data.countries : data.regions;
        if (!source) return [];

        for (const [code, entity] of Object.entries(source)) {
            // Skip aggregate entries from rankings (latin_america is the total, not a region)
            if (geoLevel === 'region' && code === 'latin_america') continue;
            // Use _rawSeries to respect crop/item filtering (cropItem, cropCategory)
            const raw = _rawSeries(code, dataField, geoLevel);
            if (raw && raw.length > 0) {
                const series = _transformSeries(raw, dataField, geoLevel, code);
                if (yi >= series.length || series[yi] == null) continue;
                entries.push({
                    code,
                    name: entity.name || entity.label || code,
                    value: series[yi],
                });
            }
        }

        entries.sort((a, b) => b.value - a.value);
        entries.forEach((e, i) => e.rank = i + 1);
        return entries;
    }

    function getSubnationalRanking(year, dataField, iso3) {
        if (!_subData) return [];
        const yi = _subData.years.indexOf(year);
        if (yi < 0) return [];

        const entries = [];
        const countries = iso3 ? { [iso3]: _subData.countries[iso3] } : _subData.countries;

        for (const [cIso, cData] of Object.entries(countries)) {
            if (!cData?.admin1) continue;
            for (const [adminName, admin] of Object.entries(cData.admin1)) {
                const raw = admin.totals?.[dataField];
                if (raw) {
                    const series = _transformSubnationalSeries(raw, dataField, cIso, adminName);
                    if (series[yi] == null) continue;
                    entries.push({
                        code: `${cIso}::${adminName}`,
                        iso3: cIso,
                        adminName,
                        name: adminName,
                        value: series[yi],
                    });
                }
            }
        }

        entries.sort((a, b) => b.value - a.value);
        entries.forEach((e, i) => e.rank = i + 1);
        return entries;
    }

    function getTopItems(code, geoLevel = 'country', subKey = null) {
        const data = _activeData();
        if (!data) return [];

        const entity = geoLevel === 'country' ? data.countries?.[code] : data.regions?.[code];
        if (!entity) return [];
        
        // Dynamically compute top items if not present
        if (!entity.topItems && data.years) {
            const bySub = entity.bySpecies || entity.byCategory || entity.byItem;
            if (bySub) {
                const yrIdx = data.years.length - 1;
                const preferredField = _activeIndicatorDataField();
                const items = Object.keys(bySub).map(k => {
                    const out = { name: k, code: k };
                    let vals = [];
                    const itemData = bySub[k];
                    if (itemData && typeof itemData === 'object') {
                        const keys = Object.keys(itemData).filter(key => Array.isArray(itemData[key]));
                        keys.forEach(key => { out[key] = itemData[key]; });
                        vals = itemData[preferredField] || itemData.values || itemData.production || itemData[keys[0]] || [];
                    }
                    out.value = vals[yrIdx] || 0;
                    return out;
                }).sort((a, b) => b.value - a.value);
                entity.topItems = { default: items };
            }
        }

        if (!entity.topItems) return [];

        if (Array.isArray(entity.topItems)) return entity.topItems;
        if (subKey && entity.topItems[subKey]) return entity.topItems[subKey];

        for (const val of Object.values(entity.topItems)) {
            if (Array.isArray(val)) return val;
        }
        return [];
    }

    /**
     * Rank items (products/species) within an entity for a given year & dataField.
     * Works with agriculture topItems (array of {name, production[], area[], value_GJ[]}),
     * trade topItems (dict {exports:[], imports:[]}),
     * and livestock bySpecies (dict {name: {heads[], grass_intake[], lu[]}}).
     */
    function _landuseFieldFromItemName(itemName) {
        const explicit = {
            'Agricultural land': 'agricultural_land',
            'Arable land': 'arable_land',
            'Permanent crops': 'permanent_crops',
            'Forest land': 'forest_land',
            'Other land': 'other_land',
        };
        return explicit[itemName] || String(itemName || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    }

    function _topItemsKeyForDataField(dataField) {
        const base = String(dataField || '').replace(/_GJ$/, '');
        const mapping = { exports: 'exports', imports: 'imports', balance: 'exports' };
        return mapping[base] || base;
    }

    function _itemValueSeries(item, dataField) {
        if (!item || typeof item !== 'object') return null;
        const field = String(dataField || '');
        if (Array.isArray(item[field])) return item[field];
        if (field.endsWith('_GJ') && Array.isArray(item.values_GJ)) return item.values_GJ;
        const base = field.replace(/_GJ$/, '');
        if (Array.isArray(item[base])) return item[base];
        if (Array.isArray(item.values)) return item.values;
        return null;
    }

    function _rawItemSeriesForEntity(entity, itemName, dataField) {
        if (!entity || !itemName) return null;

        const bySub = entity.bySpecies || entity.byCategory || entity.byItem;
        const subEntry = bySub?.[itemName];
        if (subEntry) {
            if (Array.isArray(subEntry)) return _cloneSeries(subEntry);
            const arr = subEntry[dataField] || _itemValueSeries(subEntry, dataField);
            if (Array.isArray(arr)) return _cloneSeries(arr);
        }

        if (entity.topItems) {
            if (Array.isArray(entity.topItems)) {
                const item = entity.topItems.find(it => it.name === itemName || it.code === itemName);
                const arr = item ? _itemValueSeries(item, dataField) : null;
                if (Array.isArray(arr)) return _cloneSeries(arr);
            } else if (typeof entity.topItems === 'object') {
                for (const subItems of Object.values(entity.topItems)) {
                    if (!Array.isArray(subItems)) continue;
                    const item = subItems.find(it => it.name === itemName || it.code === itemName);
                    const arr = item ? _itemValueSeries(item, dataField) : null;
                    if (Array.isArray(arr)) return _cloneSeries(arr);
                }
            }
        }

        if (State.get('activeCategory') === 'landuse' && entity.totals) {
            const field = _landuseFieldFromItemName(itemName);
            const arr = entity.totals[field];
            if (Array.isArray(arr)) return _cloneSeries(arr);
        }

        return null;
    }

    function _latamItemTotalSeries(itemName, dataField, geoLevel) {
        const data = _activeData();
        if (!data || !itemName) return [];

        const latamArr = _rawItemSeriesForEntity(data.regions?.latin_america, itemName, dataField);
        if (latamArr?.length) return latamArr;

        if (geoLevel === 'region' && data.regions) {
            const regionSeries = Object.entries(data.regions)
                .filter(([rid]) => rid !== 'latin_america')
                .map(([, r]) => _rawItemSeriesForEntity(r, itemName, dataField))
                .filter(arr => Array.isArray(arr) && arr.length > 0);
            if (regionSeries.length) return _sumSeries(regionSeries);
        }

        if (data.countries) {
            const countrySeries = Object.values(data.countries)
                .map(c => _rawItemSeriesForEntity(c, itemName, dataField))
                .filter(arr => Array.isArray(arr) && arr.length > 0);
            if (countrySeries.length) return _sumSeries(countrySeries);
        }

        return [];
    }

    function _transformItemSeries(series, itemName, dataField, geoLevel, code) {
        const mode = State.get('axisMode') || 'absolute';
        const raw = _cloneSeries(series);
        if (mode === 'absolute') return raw;
        if (mode === 'index') return _seriesToIndex100(raw);
        if (mode === 'pct_territory') {
            const total = _territoryTotalSeries(code, dataField, geoLevel);
            return _seriesToSharePct(raw, total);
        }
        if (mode === 'pct_total') {
            const total = _latamItemTotalSeries(itemName, dataField, geoLevel);
            return _seriesToSharePct(raw, total.length ? total : _latamTotalSeries(dataField, geoLevel));
        }
        return raw;
    }

    function getItemRanking(code, year, dataField, geoLevel = 'country') {
        const data = _activeData();
        if (!data) return [];

        const entity = geoLevel === 'country' ? data.countries?.[code] : data.regions?.[code];
        if (!entity) return [];

        const yi = yearIndex(year);
        const entries = [];
        const catId = State.get('activeCategory');

        // Source 1: topItems - individual products (agriculture, trade)
        // Check this FIRST so that topItems take priority over byCategory
        // (regions have both byCategory for aggregates and topItems for individual crops)
        if (entity.topItems) {
            const items = Array.isArray(entity.topItems) ? entity.topItems : null;
            // Trade: topItems is a dict {exports:[], imports:[]}
            if (!items && typeof entity.topItems === 'object') {
                // For trade, try to find subKey matching dataField
                let subItems = null;
                if (entity.topItems[dataField]) {
                    subItems = entity.topItems[dataField];
                } else {
                    // Try mapping: exports ? exports, imports ? imports, balance ? exports
                    const key = _topItemsKeyForDataField(dataField) || Object.keys(entity.topItems)[0];
                    subItems = entity.topItems[key];
                }
                if (Array.isArray(subItems)) {
                    subItems.forEach(item => {
                        // Trade items have {name, code, values[]}
                        const arr = _itemValueSeries(item, dataField);
                        if (Array.isArray(arr) && arr[yi] != null) {
                            entries.push({ code: item.code || item.name, name: item.name, value: Math.abs(arr[yi]) });
                        }
                    });
                }
            } else if (items) {
                // Agriculture: topItems is array of {name, production[], area[], value_GJ[]}
                items.forEach(item => {
                    const arr = item[dataField];
                    if (Array.isArray(arr) && arr[yi] != null) {
                        entries.push({ code: item.name, name: item.name, value: arr[yi] });
                    }
                });
            }
        }

        // Source 2: bySpecies / byCategory / byItem dicts (livestock, landuse, etc.)
        // Only used as fallback when topItems didn't produce results
        if (entries.length === 0) {
            const bySub = entity.bySpecies || entity.byCategory || entity.byItem;
            if (bySub) {
                for (const [itemName, itemData] of Object.entries(bySub)) {
                    if (!itemData || typeof itemData !== 'object') continue;
                    const arr = itemData[dataField];
                    if (Array.isArray(arr) && arr[yi] != null) {
                        entries.push({ code: itemName, name: itemName, value: arr[yi] });
                    }
                }
            }
        }

        // Source 3: land-use data stores each use as a totals field rather than
        // a nested item dictionary. Treat those fields as facetable items.
        if (entries.length === 0 && catId === 'landuse' && Array.isArray(data.items) && entity.totals) {
            data.items.forEach(item => {
                const name = item.name || item.label || item.code;
                const field = _landuseFieldFromItemName(name);
                const arr = entity.totals[field];
                if (Array.isArray(arr) && arr[yi] != null) {
                    entries.push({ code: field, name, value: arr[yi] });
                }
            });
        }

        entries.sort((a, b) => b.value - a.value);
        entries.forEach((e, i) => e.rank = i + 1);
        return entries;
    }

    /**
     * Get time series for a specific item within an entity.
     * Returns [{year, value}] array compatible with trend-view.
     */
    function getItemTimeSeries(code, itemName, dataField, geoLevel = 'country') {
        const data = _activeData();
        if (!data) return [];

        const entity = geoLevel === 'country' ? data.countries?.[code] : data.regions?.[code];
        if (!entity || !data.years) return [];

        const arr = _rawItemSeriesForEntity(entity, itemName, dataField);

        if (!Array.isArray(arr)) return [];

        const transformed = _transformItemSeries(arr, itemName, dataField, geoLevel, code);
        const result = data.years.map((year, i) => ({ year, value: transformed[i] ?? null }))
            .filter(d => d.value != null);
        // Trim trailing zeros (e.g. 2024 with no data yet)
        while (result.length > 0 && (result[result.length - 1].value === 0 || result[result.length - 1].value == null)) {
            result.pop();
        }
        return result;
    }

    function getOriginalItemTimeSeries(code, itemName, dataField, geoLevel = 'country') {
        const data = _activeData();
        if (!data) return [];

        const entity = geoLevel === 'country' ? data.countries?.[code] : data.regions?.[code];
        if (!entity || !data.years) return [];

        const arr = _rawItemSeriesForEntity(entity, itemName, dataField);
        return _rawSeriesToYearRows(data.years, arr);
    }

    /**
     * Get list of available item names for an entity (for faceted trend).
     */
    function getItemNames(code, dataField, geoLevel = 'country') {
        const data = _activeData();
        if (!data) return [];

        const entity = geoLevel === 'country' ? data.countries?.[code] : data.regions?.[code];
        if (!entity) return [];

        // bySpecies/byCategory/byItem
        const bySub = entity.bySpecies || entity.byCategory || entity.byItem;
        if (bySub) return Object.keys(bySub);

        if (State.get('activeCategory') === 'landuse' && Array.isArray(data.items)) {
            return data.items.map(it => it.name || it.label || String(it.code));
        }

        // topItems
        if (entity.topItems) {
            if (Array.isArray(entity.topItems)) {
                return entity.topItems.map(it => it.name);
            }
            // Trade dict
            const allNames = new Set();
            for (const subItems of Object.values(entity.topItems)) {
                if (Array.isArray(subItems)) {
                    subItems.forEach(it => allNames.add(it.name));
                }
            }
            return [...allNames];
        }

        return [];
    }

    function getCategoryBreakdown(regionId) {
        const data = _activeData();
        if (!data) return null;
        const region = data.regions?.[regionId];
        return region ? (region.byCategory || null) : null;
    }

    function getCategories() {
        const data = _activeData();
        const raw = data?.categories || data?.species || data?.items || [];
        return raw.map(c => typeof c === 'string' ? c : (c?.name || c?.label || String(c)));
    }

    function getCountryCodes() {
        const data = _activeData();
        if (data?.countries) return Object.keys(data.countries);
        return Object.keys(COUNTRIES);
    }

    function getCountryName(iso3) {
        if (iso3 === 'latin_america') return 'América Latina';
        if (REGIONS[iso3]?.label) return REGIONS[iso3].label;
        if (COUNTRIES[iso3]?.name) return COUNTRIES[iso3].name;
        for (const data of Object.values(_dataStore)) {
            if (data?.countries?.[iso3]?.name) return data.countries[iso3].name;
            // Also check regions (for codes like 'latin_america', 'andean', etc.)
            if (data?.regions?.[iso3]) return data.regions[iso3].name || data.regions[iso3].label || iso3;
        }
        return COUNTRIES[iso3]?.name || iso3;
    }

    function getDatasetMetadata(categoryId = State.get('activeCategory')) {
        return _dataStore?.[categoryId]?.metadata || null;
    }

    function getSubnationalGeo(iso3) {
        if (!_subGeo) return null;
        if (!iso3) return _subGeo;
        return {
            type: 'FeatureCollection',
            features: _subGeo.features.filter(f => f.properties.iso3 === iso3),
        };
    }

    function getSubnationalTopo() { return _subTopo; }
    function getSubnationalData() { return _subData; }
    function isSubnationalLoaded() { return _subData != null && _subTopo != null; }

    function getAdmin1Names(iso3) {
        if (!_subData?.countries?.[iso3]?.admin1) return [];
        return Object.keys(_subData.countries[iso3].admin1);
    }

    function hasSubnationalData(iso3, dataField = null) {
        const admin1 = _subData?.countries?.[iso3]?.admin1;
        if (!admin1) return false;
        if (!dataField) return Object.keys(admin1).length > 0;

        return Object.values(admin1).some(admin => {
            const series = admin?.totals?.[dataField];
            return Array.isArray(series) && series.some(v => v != null && Number.isFinite(v));
        });
    }

    function getSubnationalCountries(dataField = null) {
        if (!_subData) return [];
        const countries = Object.keys(_subData.countries);
        if (!dataField) return countries;
        return countries.filter(iso3 => hasSubnationalData(iso3, dataField));
    }

    function getSubnationalTopItems(iso3, adminName) {
        if (!_subData) return [];
        return _subData.countries?.[iso3]?.admin1?.[adminName]?.topItems || [];
    }

    // -- Bilateral trade --
    async function loadBilateral() {
        if (_bilateralPromise) return _bilateralPromise;
        _bilateralPromise = (async () => {
            try {
                const cat = _metadata?.categories?.find(c => c.id === 'trade');
                const url = cat?.dataFiles?.bilateral || 'data/bilateral.json';
                _bilateralData = await fetch(_withVersion(url)).then(r => r.json());
                console.log(`[DATA] Bilateral loaded: ${Object.keys(_bilateralData.countries).length} countries`);
            } catch (err) {
                console.warn('Failed to load bilateral data:', err);
            }
        })();
        return _bilateralPromise;
    }

    function isBilateralLoaded() { return _bilateralData != null; }
    function getBilateralData() { return _bilateralData; }

    function getBilateralPartners(code, element, geoLevel = 'country') {
        if (!_bilateralData) return {};
        const source = geoLevel === 'country'
            ? _bilateralData.countries?.[code]
            : _bilateralData.regions?.[code];
        return source?.[element]?.partners || {};
    }

    function getBilateralItems(code, element, geoLevel = 'country') {
        if (!_bilateralData) return {};
        const source = geoLevel === 'country'
            ? _bilateralData.countries?.[code]
            : _bilateralData.regions?.[code];
        return source?.[element]?.items || {};
    }

    function getBilateralTotal(code, element, geoLevel = 'country') {
        if (!_bilateralData) return [];
        const source = geoLevel === 'country'
            ? _bilateralData.countries?.[code]
            : _bilateralData.regions?.[code];
        return source?.[element]?.total || [];
    }

    function getBilateralPartnerItems(code, element, partnerName, geoLevel = 'country') {
        if (!_bilateralData) return [];
        const source = geoLevel === 'country'
            ? _bilateralData.countries?.[code]
            : _bilateralData.regions?.[code];
        return source?.[element]?.partnerItems?.[partnerName] || [];
    }

    function getBilateralItemPartners(code, element, itemName, geoLevel = 'country') {
        if (!_bilateralData) return {};
        const source = geoLevel === 'country'
            ? _bilateralData.countries?.[code]
            : _bilateralData.regions?.[code];
        return source?.[element]?.itemPartners?.[itemName] || {};
    }

    function getBilateralYears() {
        return _bilateralData?.years || [];
    }

    /**
     * Get the effective year range for the current category by scanning actual data.
     * Returns [firstYearWithData, lastYearWithData] based on non-null values
     * across all countries for the given dataField (defaults to 'production').
     */
    function getEffectiveYearRange(dataField) {
        const data = _activeData();
        if (!data || !data.years || data.years.length === 0) return null;

        const years = data.years;
        const countries = data.countries;
        if (!countries) return [years[0], years[years.length - 1]];

        const field = dataField || 'production';

        let firstYear = Infinity;
        let lastYear = -Infinity;

        for (const code of Object.keys(countries)) {
            const entity = countries[code];
            const series = entity?.totals?.[field];
            if (!Array.isArray(series)) continue;

            for (let i = 0; i < series.length && i < years.length; i++) {
                if (series[i] != null && series[i] !== 0) {
                    if (years[i] < firstYear) firstYear = years[i];
                    break;
                }
            }
            for (let i = series.length - 1; i >= 0; i--) {
                if (i < years.length && series[i] != null && series[i] !== 0) {
                    if (years[i] > lastYear) lastYear = years[i];
                    break;
                }
            }
        }

        if (firstYear === Infinity || lastYear === -Infinity) {
            return [years[0], years[years.length - 1]];
        }
        return [firstYear, lastYear];
    }

    return {
        init,
        loadCategory,
        loadSubnational,
        loadBilateral,
        getMetadata,
        getGeo,
        getTopo,
        getYears,
        getEffectiveYearRange,
        getValue,
        getTimeSeries,
        getOriginalTimeSeries,
        getObservationPoints,
        getRanking,
        getItemRanking,
        getItemTimeSeries,
        getOriginalItemTimeSeries,
        getItemNames,
        getTopItems,
        getCategoryBreakdown,
        getCategories,
        getCountryCodes,
        getCountryName,
        getDatasetMetadata,
        yearIndex,
        getSubnationalValue,
        getSubnationalTimeSeries,
        getOriginalSubnationalTimeSeries,
        getSubnationalRanking,
        getSubnationalGeo,
        getSubnationalTopo,
        getSubnationalData,
        isSubnationalLoaded,
        getAdmin1Names,
        getSubnationalCountries,
        hasSubnationalData,
        getSubnationalTopItems,
        isBilateralLoaded,
        getBilateralData,
        getBilateralPartners,
        getBilateralItems,
        getBilateralTotal,
        getBilateralPartnerItems,
        getBilateralItemPartners,
        getBilateralYears,
    };
})();

export default DataLoader;





