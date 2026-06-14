/* state.js — Centralized pub/sub state management */
const State = (() => {
    const _state = {
        activeCategory: 'agriculture',
        activeIndicator: 'production',
        activeView: 'map',
        geoLevel: 'country',           // country | region | subnational
        selectedCountries: [],          // ISO3 codes
        currentYear: 2024,
        yearRange: [1900, 2024],
        isPlaying: false,
        playSpeed: 100,
        axisMode: 'absolute',          // absolute | index | pct_territory | pct_total
        pickerOpen: false,
        isFullscreen: false,
        settingsOpen: false,

        activeUnit: 'toneladas',       // toneladas | GJ (for unit toggle)

        // Item selection
        cropItem: 'all',               // 'all' or specific item name (for map, single)
        selectedItems: [],             // specific item names for multi-product trend facets
        selectedPartners: [],          // bilateral trade partner names
        cropCategory: 'all',           // 'all' or category like 'Cereals'
        unit: 'tonnes',                // tonnes | hectares | GJ | tonnes_per_ha

        // Compare mode
        compareMode: false,
        startYear: 1900,

        // Desktop layout: side-by-side map + trend chart (opt-in, wide screens)
        splitMode: false,

        // Viz settings
        mapMode: 'choropleth',
        chartLayout: 'overlay',        // overlay | facet
        facetYMode: 'shared',          // shared | free
        chartType: 'lines',           // lines | stacked
        scaleType: 'linear',           // linear | log
        trendMA: 'none',               // none | 5 | 10 | 20
        trendShowLine: false,
        trendShowBreaks: false,
        rankingTopN: 10,
        rankingMode: 'byCountry',      // byCountry | byProduct
        topN: 10,                      // products to show in treemap
        treemapLevel: 'category',      // category | item
    };

    const _subs = {};

    function _notify(key) {
        (_subs[key] || []).forEach(fn => fn(_state[key]));
        (_subs['*'] || []).forEach(fn => fn(key, _state[key]));
    }

    return {
        get(key) { return _state[key]; },
        set(key, value) {
            if (JSON.stringify(_state[key]) === JSON.stringify(value)) return;
            _state[key] = value;
            _notify(key);
        },
        subscribe(key, fn) {
            (_subs[key] = _subs[key] || []).push(fn);
        },
        addCountry(code) {
            const arr = _state.selectedCountries;
            if (!arr.includes(code)) {
                _state.selectedCountries = [...arr, code];
                _notify('selectedCountries');
            }
        },
        removeCountry(code) {
            const arr = _state.selectedCountries;
            if (arr.includes(code)) {
                _state.selectedCountries = arr.filter(c => c !== code);
                _notify('selectedCountries');
            }
        },
        toggleCountry(code) {
            _state.selectedCountries.includes(code)
                ? this.removeCountry(code)
                : this.addCountry(code);
        },
        clearCountries() {
            _state.selectedCountries = [];
            _notify('selectedCountries');
        },
        setCountries(codes) {
            const unique = [...new Set(codes || [])];
            if (JSON.stringify(_state.selectedCountries) === JSON.stringify(unique)) return;
            _state.selectedCountries = unique;
            _notify('selectedCountries');
        },
        snapshot() { return JSON.parse(JSON.stringify(_state)); },
    };
})();

export default State;
