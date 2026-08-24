/* Apply saved Home visibility before the dashboard shell is parsed. */
(function () {
    var STORAGE_KEY = 'tezos-systems-home-layout-v1';
    var IDS = ['ticker', 'search', 'live-pulse', 'explore', 'moments', 'handoff', 'credits'];
    var LEGACY = [
        ['tezos-systems-chambers-visible', 'explore', 'false'],
        ['tezos-systems-collapsed-pulse-ticker', 'live-pulse', '1'],
        ['tezos-systems-collapsed-chambers-section', 'explore', '1'],
        ['tezos-systems-collapsed-moments-section', 'moments', '1']
    ];
    var hidden = [];

    try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw !== null) {
            var saved = JSON.parse(raw);
            var valid = saved
                && saved.version === 1
                && Array.isArray(saved.hidden)
                && saved.hidden.every(function (id) { return IDS.indexOf(id) !== -1; });
            if (valid) hidden = IDS.filter(function (id) { return saved.hidden.indexOf(id) !== -1; });
        } else {
            LEGACY.forEach(function (entry) {
                if (localStorage.getItem(entry[0]) === entry[2] && hidden.indexOf(entry[1]) === -1) {
                    hidden.push(entry[1]);
                }
            });
            if (LEGACY.some(function (entry) { return localStorage.getItem(entry[0]) !== null; })) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, hidden: hidden }));
            }
        }
        LEGACY.forEach(function (entry) { localStorage.removeItem(entry[0]); });
    } catch (_) {
        hidden = [];
    }

    document.documentElement.setAttribute('data-home-hidden', hidden.join(' '));

    var CATEGORY_STORAGE_KEY = 'tezos-systems-explore-layout-v1';
    var LEGACY_CATEGORY_STORAGE_KEY = 'tezos-systems-chamber-categories-v1';
    var CATEGORY_IDS = ['network', 'capital', 'ecosystem', 'bakers', 'governance', 'people', 'history'];
    var ROOM_IDS = ['pulse', 'health', 'tezosx', 'capital', 'minerals', 'uranium', 'metals', 'whales', 'staking-chamber', 'ecosystem', 'leaderboard', 'tz4', 'chamber', 'l2-governance', 'liquidity-baking', 'ledger-flow', 'domains', 'maxis', 'tezoscrp', 'anthology', 'history'];
    var CATEGORY_ROOMS = {
        network: ['pulse', 'health', 'tezosx'],
        capital: ['capital', 'minerals', 'uranium', 'metals', 'whales', 'staking-chamber'],
        ecosystem: ['ecosystem'],
        bakers: ['leaderboard', 'tz4'],
        governance: ['chamber', 'l2-governance', 'liquidity-baking'],
        people: ['ledger-flow', 'domains', 'maxis', 'tezoscrp'],
        history: ['anthology', 'history']
    };
    var hiddenCategories = [];
    var hiddenRooms = [];

    try {
        var categoryRaw = localStorage.getItem(CATEGORY_STORAGE_KEY);
        if (categoryRaw !== null) {
            var categorySaved = JSON.parse(categoryRaw);
            var categoryValid = categorySaved
                && categorySaved.version === 1
                && Array.isArray(categorySaved.hiddenCategories)
                && Array.isArray(categorySaved.hiddenRooms)
                && categorySaved.hiddenCategories.every(function (id) { return CATEGORY_IDS.indexOf(id) !== -1; })
                && categorySaved.hiddenRooms.every(function (id) { return ROOM_IDS.indexOf(id) !== -1; });
            if (categoryValid) {
                hiddenCategories = CATEGORY_IDS.filter(function (id) {
                    return categorySaved.hiddenCategories.indexOf(id) !== -1;
                });
                hiddenRooms = ROOM_IDS.filter(function (id) {
                    return categorySaved.hiddenRooms.indexOf(id) !== -1;
                });
            }
        } else {
            var legacyCategoryRaw = localStorage.getItem(LEGACY_CATEGORY_STORAGE_KEY);
            if (legacyCategoryRaw !== null) {
                var legacyCategorySaved = JSON.parse(legacyCategoryRaw);
                var legacyCategoryValid = legacyCategorySaved
                    && legacyCategorySaved.version === 1
                    && Array.isArray(legacyCategorySaved.hidden)
                    && legacyCategorySaved.hidden.every(function (id) { return CATEGORY_IDS.indexOf(id) !== -1; });
                if (legacyCategoryValid) {
                    hiddenCategories = CATEGORY_IDS.filter(function (id) {
                        return legacyCategorySaved.hidden.indexOf(id) !== -1;
                    });
                    localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify({
                        version: 1,
                        hiddenCategories: hiddenCategories,
                        hiddenRooms: []
                    }));
                    localStorage.removeItem(LEGACY_CATEGORY_STORAGE_KEY);
                }
            }
        }
    } catch (_) {
        hiddenCategories = [];
        hiddenRooms = [];
    }

    var effectiveHiddenCategories = CATEGORY_IDS.filter(function (categoryId) {
        return hiddenCategories.indexOf(categoryId) !== -1
            || CATEGORY_ROOMS[categoryId].every(function (roomId) { return hiddenRooms.indexOf(roomId) !== -1; });
    });
    document.documentElement.setAttribute('data-chamber-categories-hidden', effectiveHiddenCategories.join(' '));
    document.documentElement.setAttribute('data-chamber-rooms-hidden', hiddenRooms.join(' '));
}());
