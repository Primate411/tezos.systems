/**
 * Objkt NFT Profile - Creator & Collector stats from objkt.com API
 */

const OBJKT_GRAPHQL = 'https://data.objkt.com/v3/graphql';
const OBJKT_PAGE_SIZE = 500;
const OBJKT_COLLECTION_PAGE_SIZE = 50;
const OBJKT_MAX_PAGE_ROUNDS = 40;

function asNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

/**
 * Fetch creator and collector data for an address
 */
export async function fetchObjktProfile(address) {
    const query = `query ObjktProfile(
        $address: String!,
        $heldLimit: Int!,
        $heldOffset: Int!,
        $createdLimit: Int!,
        $createdOffset: Int!,
        $collectionLimit: Int!,
        $collectionOffset: Int!,
        $soldLimit: Int!,
        $soldOffset: Int!,
        $boughtLimit: Int!,
        $boughtOffset: Int!
    ) {
        holder(where: {address: {_eq: $address}}, limit: 1) {
            address
            alias
            tzdomain
            twitter
            description
            logo
            held_tokens(where: {quantity: {_gt: "0"}}, limit: $heldLimit, offset: $heldOffset) {
                quantity
                token {
                    name
                    thumbnail_uri
                    pk
                    supply
                    fa { name contract collection_id }
                    lowest_ask
                }
            }
            created_tokens(limit: $createdLimit, offset: $createdOffset) {
                token_pk
                token {
                    name
                    supply
                    thumbnail_uri
                    pk
                    fa { name contract }
                    lowest_ask
                    listing_sales {
                        price_xtz
                        timestamp
                    }
                }
            }
            fa2s_created(limit: $collectionLimit, offset: $collectionOffset) {
                name
                contract
                items
                volume_total
                floor_price
                owners
                logo
            }
            listings_sold(limit: $soldLimit, offset: $soldOffset) {
                price_xtz
                timestamp
            }
            listings_bought(limit: $boughtLimit, offset: $boughtOffset) {
                price_xtz
                timestamp
            }
            sales_stats(order_by: {volume: desc}, limit: 20) {
                type
                volume
                interval_days
            }
        }
    }`;

    const holder = await fetchPagedHolder(address, query);
    if (!holder) return null;

    return processProfile(holder);
}

async function fetchHolderPage(address, query, offsets, limits) {
    const resp = await fetch(OBJKT_GRAPHQL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query,
            variables: {
                address,
                heldLimit: limits.held,
                heldOffset: offsets.held,
                createdLimit: limits.created,
                createdOffset: offsets.created,
                collectionLimit: limits.collection,
                collectionOffset: offsets.collection,
                soldLimit: limits.sold,
                soldOffset: offsets.sold,
                boughtLimit: limits.bought,
                boughtOffset: offsets.bought
            }
        })
    });

    if (!resp.ok) throw new Error(`Objkt API error: ${resp.status}`);
    const data = await resp.json();
    if (data.errors) throw new Error(data.errors[0].message);
    return data.data?.holder?.[0] || null;
}

async function fetchPagedHolder(address, query) {
    const pages = {
        held_tokens: [],
        created_tokens: [],
        fa2s_created: [],
        listings_sold: [],
        listings_bought: []
    };
    let metadata = null;
    let salesStats = [];
    let offsets = {
        held: 0,
        created: 0,
        collection: 0,
        sold: 0,
        bought: 0
    };
    let active = {
        held: true,
        created: true,
        collection: true,
        sold: true,
        bought: true
    };

    for (let round = 0; round < OBJKT_MAX_PAGE_ROUNDS; round += 1) {
        const limits = {
            held: active.held ? OBJKT_PAGE_SIZE : 0,
            created: active.created ? OBJKT_PAGE_SIZE : 0,
            collection: active.collection ? OBJKT_COLLECTION_PAGE_SIZE : 0,
            sold: active.sold ? OBJKT_PAGE_SIZE : 0,
            bought: active.bought ? OBJKT_PAGE_SIZE : 0
        };
        if (!limits.held && !limits.created && !limits.collection && !limits.sold && !limits.bought) break;

        const page = await fetchHolderPage(address, query, offsets, limits);
        if (!page) return metadata ? { ...metadata, sales_stats: salesStats, ...pages } : null;

        if (!metadata) {
            metadata = {
                address: page.address,
                alias: page.alias,
                tzdomain: page.tzdomain,
                twitter: page.twitter,
                description: page.description,
                logo: page.logo
            };
            salesStats = page.sales_stats || [];
        }

        if (active.held) {
            const rows = page.held_tokens || [];
            pages.held_tokens.push(...rows);
            active.held = rows.length === OBJKT_PAGE_SIZE;
            offsets.held += rows.length;
        }
        if (active.created) {
            const rows = page.created_tokens || [];
            pages.created_tokens.push(...rows);
            active.created = rows.length === OBJKT_PAGE_SIZE;
            offsets.created += rows.length;
        }
        if (active.collection) {
            const rows = page.fa2s_created || [];
            pages.fa2s_created.push(...rows);
            active.collection = rows.length === OBJKT_COLLECTION_PAGE_SIZE;
            offsets.collection += rows.length;
        }
        if (active.sold) {
            const rows = page.listings_sold || [];
            pages.listings_sold.push(...rows);
            active.sold = rows.length === OBJKT_PAGE_SIZE;
            offsets.sold += rows.length;
        }
        if (active.bought) {
            const rows = page.listings_bought || [];
            pages.listings_bought.push(...rows);
            active.bought = rows.length === OBJKT_PAGE_SIZE;
            offsets.bought += rows.length;
        }
    }

    return metadata ? { ...metadata, sales_stats: salesStats, ...pages } : null;
}

/**
 * Process raw API data into display-ready stats
 */
function processProfile(holder) {
    const profile = {
        alias: holder.alias || holder.tzdomain || null,
        tzdomain: holder.tzdomain || null,
        twitter: holder.twitter,
        description: holder.description,
        logo: holder.logo,
        creator: null,
        collector: null
    };

    // --- CREATOR STATS ---
    const createdTokens = holder.created_tokens || [];
    const collections = holder.fa2s_created || [];
    const soldListings = holder.listings_sold || [];

    if (createdTokens.length > 0 || collections.length > 0) {
        // Total pieces created
        const totalCreated = createdTokens.length;

        // Total sales volume from listing_sales on created tokens
        let totalSalesVolume = 0;
        let totalSalesCount = 0;
        const uniqueCollectors = new Set();

        for (const ct of createdTokens) {
            const sales = ct.token?.listing_sales || [];
            for (const sale of sales) {
                if (sale.price_xtz > 0) {
                    totalSalesVolume += sale.price_xtz;
                    totalSalesCount++;
                }
            }
        }

        // Also count from listings_sold
        for (const sale of soldListings) {
            if (sale.price_xtz > 0) {
                totalSalesVolume += sale.price_xtz;
                totalSalesCount++;
            }
        }

        // Deduplicate - use sales_stats if available for more accurate volume
        const creatorStats = holder.sales_stats?.filter(s => s.type === 'creator') || [];
        const allTimeCreator = creatorStats.find(s => s.interval_days === null || s.interval_days === 0);
        if (allTimeCreator && allTimeCreator.volume > 0) {
            totalSalesVolume = allTimeCreator.volume; // Use official stat
        }

        // Collection stats
        const totalCollectionVolume = collections.reduce((sum, c) => sum + (c.volume_total || 0), 0);
        const totalEditions = collections.reduce((sum, c) => sum + (c.items || 0), 0);
        const totalOwners = collections.reduce((sum, c) => sum + (c.owners || 0), 0);

        profile.creator = {
            totalCreated,
            totalSalesCount,
            totalSalesVolume: totalSalesVolume / 1e6, // Convert mutez to XTZ
            collections: collections.map(c => ({
                name: c.name || 'Unnamed',
                contract: c.contract,
                items: c.items || 0,
                volume: (c.volume_total || 0) / 1e6,
                floor: (c.floor_price || 0) / 1e6,
                owners: c.owners || 0,
                logo: c.logo
            })).sort((a, b) => b.volume - a.volume),
            totalCollectionVolume: totalCollectionVolume / 1e6,
            totalEditions,
            totalOwners
        };
    }

    // --- COLLECTOR STATS ---
    const heldTokens = holder.held_tokens || [];
    const boughtListings = holder.listings_bought || [];

    // Filter out zero-value/null tokens
    const validHeld = heldTokens.filter(h => h.token?.name && asNumber(h.quantity) > 0);

    if (validHeld.length > 0) {
        // Total pieces held
        const totalHeld = validHeld.reduce((sum, h) => sum + asNumber(h.quantity), 0);
        const uniqueAssetKeys = new Set();

        // Unique collections
        const collectionMap = new Map();
        for (const h of validHeld) {
            const fa = h.token?.fa;
            const key = fa?.contract || 'unknown';
            if (!collectionMap.has(key)) {
                collectionMap.set(key, {
                    name: fa?.name || 'Unknown',
                    assetCount: 0,
                    editionCount: 0,
                    assetKeys: new Set(),
                    estimatedValue: 0
                });
            }
            const entry = collectionMap.get(key);
            const assetKey = String(h.token?.pk || `${key}:${h.token?.name || entry.assetKeys.size}`);
            const quantity = asNumber(h.quantity);
            uniqueAssetKeys.add(assetKey);
            entry.assetKeys.add(assetKey);
            entry.assetCount = entry.assetKeys.size;
            entry.editionCount += quantity;
            if (h.token.lowest_ask) {
                entry.estimatedValue += (asNumber(h.token.lowest_ask) * quantity);
            }
        }

        // Total spent
        let totalSpent = 0;
        for (const b of boughtListings) {
            if (b.price_xtz > 0) totalSpent += b.price_xtz;
        }

        const collectorStats = holder.sales_stats?.filter(s => s.type === 'collector') || [];
        const allTimeCollector = collectorStats.find(s => s.interval_days === null || s.interval_days === 0);
        if (allTimeCollector && allTimeCollector.volume > 0) {
            totalSpent = allTimeCollector.volume;
        }

        // Estimated portfolio value (sum of floor prices)
        let portfolioValue = 0;
        for (const h of validHeld) {
            if (h.token.lowest_ask) {
                portfolioValue += asNumber(h.token.lowest_ask) * asNumber(h.quantity);
            }
        }

        // Top collections by distinct assets. Edition quantity can be misleading
        // for high-supply FA2 tokens, so keep it as secondary metadata only.
        const topCollections = [...collectionMap.values()]
            .map(({ assetKeys, ...entry }) => entry)
            .sort((a, b) => (b.assetCount - a.assetCount) || (b.editionCount - a.editionCount))
            .slice(0, 5);

        profile.collector = {
            totalHeld,
            uniqueAssetsHeld: uniqueAssetKeys.size,
            uniqueCollections: collectionMap.size,
            totalSpent: totalSpent / 1e6,
            portfolioValue: portfolioValue / 1e6,
            topCollections,
            recentAcquisitions: validHeld.slice(0, 5).map(h => ({
                name: h.token.name,
                thumbnail: h.token.thumbnail_uri,
                collection: h.token.fa?.name,
                quantity: h.quantity
            }))
        };
    }

    return profile;
}
