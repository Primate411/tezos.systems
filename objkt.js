/**
 * Objkt NFT Profile - Creator & Collector stats from objkt.com API
 */

const OBJKT_GRAPHQL = 'https://data.objkt.com/v3/graphql';

/**
 * Fetch creator and collector data for an address
 */
export async function fetchObjktProfile(address) {
    const query = `{
        holder(where: {address: {_eq: "${address}"}}) {
            address
            alias
            tzdomain
            twitter
            description
            logo
            held_tokens(where: {quantity: {_gt: "0"}}, limit: 500) {
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
            created_tokens(limit: 500) {
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
            fa2s_created(limit: 50) {
                name
                contract
                items
                volume_total
                floor_price
                owners
                logo
            }
            listings_sold(limit: 500) {
                price_xtz
                timestamp
            }
            listings_bought(limit: 500) {
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

    const resp = await fetch(OBJKT_GRAPHQL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });

    if (!resp.ok) throw new Error(`Objkt API error: ${resp.status}`);
    const data = await resp.json();
    if (data.errors) throw new Error(data.errors[0].message);

    const holder = data.data?.holder?.[0];
    if (!holder) return null;

    return processProfile(holder);
}

/**
 * Process raw API data into display-ready stats
 */
function processProfile(holder) {
    const profile = {
        alias: holder.alias || holder.tzdomain || null,
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
    const validHeld = heldTokens.filter(h => h.token?.name && h.quantity > 0);

    if (validHeld.length > 0) {
        // Total pieces held
        const totalHeld = validHeld.reduce((sum, h) => sum + h.quantity, 0);

        // Unique collections
        const collectionMap = new Map();
        for (const h of validHeld) {
            const fa = h.token?.fa;
            const key = fa?.contract || 'unknown';
            if (!collectionMap.has(key)) {
                collectionMap.set(key, {
                    name: fa?.name || 'Unknown',
                    count: 0,
                    estimatedValue: 0
                });
            }
            const entry = collectionMap.get(key);
            entry.count += h.quantity;
            if (h.token.lowest_ask) {
                entry.estimatedValue += (h.token.lowest_ask * h.quantity);
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
                portfolioValue += h.token.lowest_ask * h.quantity;
            }
        }

        // Top collections by count
        const topCollections = [...collectionMap.values()]
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        profile.collector = {
            totalHeld,
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

/**
 * Resolve IPFS URIs to gateway URLs
 */
export function resolveIpfs(uri) {
    if (!uri) return null;
    if (uri.startsWith('ipfs://')) {
        return `https://ipfs.io/ipfs/${uri.slice(7)}`;
    }
    return uri;
}
