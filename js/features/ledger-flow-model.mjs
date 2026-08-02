/**
 * Pure Ledger Flow data model.
 *
 * Network requests and DOM rendering stay in ledger-flow.js so the accounting,
 * roll-up, and layout rules can be verified without a browser.
 */

const DEFAULT_MAX_LIST_ROWS = 12;
const DEFAULT_DIRECTION_NODE_BUDGET = 4;
const TIMELINE_HOUR_MS = 60 * 60 * 1000;
const TIMELINE_DAY_MS = 24 * TIMELINE_HOUR_MS;

function transactionKey(tx) {
    return tx?.id
        || tx?.hash
        || `${tx?.level || ''}:${tx?.sender?.address || ''}:${tx?.target?.address || ''}:${tx?.amount || 0}`;
}

function normalizedDelegateContext(value) {
    const complete = value?.complete === true;
    const sourceAddresses = value?.addresses;
    const sourceAliases = value?.aliases;
    const addresses = sourceAddresses instanceof Set
        ? sourceAddresses
        : new Set(Array.isArray(sourceAddresses) ? sourceAddresses : []);
    const aliases = sourceAliases instanceof Map
        ? sourceAliases
        : new Map(Object.entries(sourceAliases && typeof sourceAliases === 'object' ? sourceAliases : {}));
    return {
        complete,
        addresses: complete ? addresses : new Set(),
        aliases: complete ? aliases : new Map(),
        reason: String(value?.reason || ''),
        catalogSize: complete ? addresses.size : 0
    };
}

export function normalizeLedgerTransaction(tx, address, delegateContext = null) {
    const sender = tx?.sender || {};
    const target = tx?.target || {};
    const senderAddress = sender.address || '';
    const targetAddress = target.address || '';
    const amount = Number(tx?.amount || 0);
    if (!senderAddress || !targetAddress || !Number.isFinite(amount) || amount <= 0) return null;
    if (senderAddress === targetAddress) return null;

    let direction = '';
    if (senderAddress === address) direction = 'sent';
    else if (targetAddress === address) direction = 'received';
    if (!direction) return null;

    const counterparty = direction === 'sent' ? target : sender;
    const counterpartyAddress = counterparty.address || '';
    const delegates = normalizedDelegateContext(delegateContext);
    const catalogAlias = delegates.complete
        ? String(delegates.aliases.get(counterpartyAddress) || '')
        : '';
    return {
        id: transactionKey(tx),
        transactionId: tx?.id || null,
        hash: tx?.hash || '',
        level: Number(tx?.level || 0),
        timestamp: tx?.timestamp || '',
        amount,
        direction,
        sender,
        target,
        counterparty: {
            address: counterpartyAddress,
            alias: counterparty.alias || catalogAlias,
            isBaker: delegates.complete ? delegates.addresses.has(counterpartyAddress) : null
        }
    };
}

function latestTimestamp(current, candidate) {
    if (!candidate) return current || '';
    const candidateTime = Date.parse(candidate);
    if (!Number.isFinite(candidateTime)) {
        return Number.isFinite(Date.parse(current || '')) ? current : '';
    }
    const currentTime = Date.parse(current || '');
    if (!Number.isFinite(currentTime)) return candidate;
    return candidateTime > currentTime ? candidate : current;
}

function addCounterparty(map, tx) {
    const address = tx.counterparty.address;
    if (!address) return;
    if (!map.has(address)) {
        map.set(address, {
            key: address,
            address,
            alias: tx.counterparty.alias || '',
            isBaker: tx.counterparty.isBaker,
            sent: 0,
            received: 0,
            sentCount: 0,
            receivedCount: 0,
            sentLatest: '',
            receivedLatest: '',
            total: 0,
            count: 0,
            side: 'left',
            isCohort: false,
            isContext: false,
            isFirstValue: false
        });
    }

    const item = map.get(address);
    if (tx.counterparty.alias && !item.alias) item.alias = tx.counterparty.alias;
    if (tx.counterparty.isBaker === true) item.isBaker = true;
    item[tx.direction] += tx.amount;
    item[`${tx.direction}Count`] += 1;
    item[`${tx.direction}Latest`] = latestTimestamp(item[`${tx.direction}Latest`], tx.timestamp);
    item.total = item.sent + item.received;
    item.count = item.sentCount + item.receivedCount;
}

function totalsFor(transfers) {
    return transfers.reduce((totals, tx) => {
        totals[tx.direction] += tx.amount;
        totals.count += 1;
        return totals;
    }, { sent: 0, received: 0, count: 0 });
}

function latestForCounterparty(item) {
    return latestTimestamp(item?.sentLatest || '', item?.receivedLatest || '');
}

function directionCohort(direction, members) {
    if (!members.length) return null;
    const amount = members.reduce((sum, item) => sum + item[direction], 0);
    const count = members.reduce((sum, item) => sum + item[`${direction}Count`], 0);
    const latest = members.reduce(
        (value, item) => latestTimestamp(value, item[`${direction}Latest`]),
        ''
    );
    if (!(amount > 0)) return null;
    const inbound = direction === 'received';
    return {
        key: `cohort:${direction}`,
        address: '',
        alias: inbound ? 'Other senders' : 'Other recipients',
        label: inbound ? 'Other senders' : 'Other recipients',
        sent: direction === 'sent' ? amount : 0,
        received: direction === 'received' ? amount : 0,
        sentCount: direction === 'sent' ? count : 0,
        receivedCount: direction === 'received' ? count : 0,
        sentLatest: direction === 'sent' ? latest : '',
        receivedLatest: direction === 'received' ? latest : '',
        total: amount,
        count,
        side: inbound ? 'left' : 'right',
        isCohort: true,
        isContext: false,
        isFirstValue: false,
        memberCount: members.length,
        members
    };
}

function contextNode(event) {
    const counterparty = event?.counterparty;
    if (!counterparty?.address) return null;
    return {
        key: `context:${counterparty.address}`,
        address: counterparty.address,
        alias: counterparty.alias || '',
        sent: 0,
        received: 0,
        sentCount: 0,
        receivedCount: 0,
        sentLatest: '',
        receivedLatest: '',
        total: 0,
        count: 0,
        side: 'left',
        isCohort: false,
        isContext: true,
        isFirstValue: true
    };
}

function edgeFor(item, direction, firstValueTransactionId, firstValueAddress = '') {
    const amount = Number(item?.[direction] || 0);
    if (!(amount > 0)) return null;
    return {
        id: `${item.key}:${direction}`,
        direction,
        counterparty: item,
        amount,
        count: Number(item?.[`${direction}Count`] || 0),
        latest: item?.[`${direction}Latest`] || '',
        isFirstValue: Boolean(
            firstValueTransactionId
            && !item.isCohort
            && item.address === firstValueAddress
            && direction === 'received'
        )
    };
}

function firstValueMatchesShownTransfer(event, transfers) {
    const transactionId = event?.transactionId;
    if (transactionId == null) return false;
    return transfers.some((tx) => String(tx.transactionId) === String(transactionId));
}

function directionalIndividual(item, direction, { firstValue = false } = {}) {
    const inbound = direction === 'received';
    const amount = Number(item?.[direction] || 0);
    const count = Number(item?.[`${direction}Count`] || 0);
    return {
        ...item,
        key: `individual:${direction}:${item.address}`,
        sent: inbound ? 0 : amount,
        received: inbound ? amount : 0,
        sentCount: inbound ? 0 : count,
        receivedCount: inbound ? count : 0,
        sentLatest: inbound ? '' : item.sentLatest,
        receivedLatest: inbound ? item.receivedLatest : '',
        total: amount,
        count,
        side: inbound ? 'left' : 'right',
        isDirectional: true,
        diagramDirection: direction,
        isFirstValue: firstValue
    };
}

function selectedForDirection(ranked, direction, budget, pinnedAddress = '') {
    const selected = ranked
        .filter((item) => Number(item?.[direction] || 0) > 0)
        .sort((left, right) => (
            Number(right?.[direction] || 0) - Number(left?.[direction] || 0)
            || Number(right?.[`${direction}Count`] || 0) - Number(left?.[`${direction}Count`] || 0)
            || left.address.localeCompare(right.address)
        ))
        .slice(0, budget);
    if (!pinnedAddress || selected.some((item) => item.address === pinnedAddress)) return selected;
    const pinned = ranked.find((item) => (
        item.address === pinnedAddress && Number(item?.[direction] || 0) > 0
    ));
    if (!pinned) return selected;
    if (selected.length < budget) selected.push(pinned);
    else selected[selected.length - 1] = pinned;
    return selected;
}

export function ledgerCounterpartyKind(item) {
    const address = String(item?.address || '');
    if (item?.isBaker === true) return 'baker';
    if (address.startsWith('KT1')) return 'contract';
    if (String(item?.alias || '').trim()) return 'aliased';
    return 'unaliased';
}

function buildCounterpartyComposition(counterparties, bakerClassificationComplete) {
    const definitions = bakerClassificationComplete
        ? [
            ['baker', 'Bakers'],
            ['contract', 'Contracts'],
            ['aliased', 'TzKT-named addresses'],
            ['unaliased', 'Unnamed addresses']
        ]
        : [
            ['contract', 'Contracts'],
            ['aliased', 'TzKT-aliased addresses'],
            ['unaliased', 'Unaliased addresses']
        ];
    const buckets = new Map(definitions.map(([key, label]) => [key, {
        key,
        label,
        memberCount: 0,
        sent: 0,
        received: 0,
        sentCount: 0,
        receivedCount: 0,
        sentMemberCount: 0,
        receivedMemberCount: 0,
        total: 0,
        count: 0
    }]));
    for (const item of counterparties) {
        const bucket = buckets.get(ledgerCounterpartyKind(item));
        bucket.memberCount += 1;
        bucket.sent += Number(item.sent || 0);
        bucket.received += Number(item.received || 0);
        bucket.sentCount += Number(item.sentCount || 0);
        bucket.receivedCount += Number(item.receivedCount || 0);
        if (Number(item.sent || 0) > 0) bucket.sentMemberCount += 1;
        if (Number(item.received || 0) > 0) bucket.receivedMemberCount += 1;
        bucket.total = bucket.sent + bucket.received;
        bucket.count = bucket.sentCount + bucket.receivedCount;
    }
    const result = definitions.map(([key]) => buckets.get(key));
    return bakerClassificationComplete
        ? result
        : result.filter((bucket) => bucket.memberCount > 0);
}

export function filterLedgerCounterparties(counterparties, options = {}) {
    const query = String(options.query || '').trim().toLowerCase();
    const kind = ['all', 'baker', 'contract', 'aliased', 'unaliased'].includes(options.kind)
        ? options.kind
        : 'all';
    const sort = ['total', 'received', 'sent', 'count', 'latest'].includes(options.sort)
        ? options.sort
        : 'total';
    const rows = [...(Array.isArray(counterparties) ? counterparties : [])]
        .filter((item) => {
            if (kind !== 'all' && ledgerCounterpartyKind(item) !== kind) return false;
            if (!query) return true;
            const address = String(item?.address || '').toLowerCase();
            const alias = String(item?.alias || '').toLowerCase();
            return address.startsWith(query) || alias.includes(query);
        });

    rows.sort((left, right) => {
        let delta = 0;
        if (sort === 'latest') {
            delta = (Date.parse(latestForCounterparty(right)) || 0)
                - (Date.parse(latestForCounterparty(left)) || 0);
        } else {
            delta = Number(right?.[sort] || 0) - Number(left?.[sort] || 0);
        }
        return delta || String(left?.address || '').localeCompare(String(right?.address || ''));
    });
    return rows;
}

export function buildLedgerFlowModel(data, options = {}) {
    const requestedThreshold = Number(options.thresholdMutez ?? 0);
    const requestedListRows = Number(options.maxListRows ?? DEFAULT_MAX_LIST_ROWS);
    const requestedNodeBudget = Number(
        options.directionNodeBudget
        ?? options.individualNodeBudget
        ?? DEFAULT_DIRECTION_NODE_BUDGET
    );
    const threshold = Number.isFinite(requestedThreshold)
        ? Math.max(0, requestedThreshold)
        : 0;
    const settings = {
        maxListRows: Number.isFinite(requestedListRows)
            ? Math.max(1, Math.floor(requestedListRows))
            : DEFAULT_MAX_LIST_ROWS,
        directionNodeBudget: Number.isFinite(requestedNodeBudget)
            ? Math.max(1, Math.floor(requestedNodeBudget))
            : DEFAULT_DIRECTION_NODE_BUDGET
    };
    const address = data?.address || '';
    const delegateContext = normalizedDelegateContext(data?.delegateCatalog);
    const seenRows = new Set();
    const allTransfers = [];
    let selfTransferRows = 0;

    for (const raw of data?.transactions || []) {
        const rowKey = transactionKey(raw);
        if (seenRows.has(rowKey)) continue;
        seenRows.add(rowKey);
        const senderAddress = raw?.sender?.address || '';
        const targetAddress = raw?.target?.address || '';
        if (senderAddress === address
            && targetAddress === address
            && Number(raw?.amount || 0) > 0) {
            selfTransferRows += 1;
        }
        const tx = normalizeLedgerTransaction(raw, address, delegateContext);
        if (!tx) continue;
        allTransfers.push(tx);
    }

    const shownTransfers = allTransfers.filter((tx) => tx.amount >= threshold);
    const counterparties = new Map();
    shownTransfers.forEach((tx) => addCounterparty(counterparties, tx));

    const ranked = [...counterparties.values()]
        .map((item) => ({
            ...item,
            side: item.received >= item.sent ? 'left' : 'right'
        }))
        .filter((item) => item.total > 0)
        .sort((a, b) => b.total - a.total || a.address.localeCompare(b.address));

    const firstValueEvent = data?.firstValueEvent || null;
    const firstValueIsShown = firstValueMatchesShownTransfer(firstValueEvent, shownTransfers);
    const firstValueAddress = firstValueEvent?.counterparty?.address || '';
    const receivedIndividuals = selectedForDirection(
        ranked,
        'received',
        settings.directionNodeBudget,
        firstValueIsShown ? firstValueAddress : ''
    );
    const sentIndividuals = selectedForDirection(
        ranked,
        'sent',
        settings.directionNodeBudget
    );
    const receivedAddresses = new Set(receivedIndividuals.map((item) => item.address));
    const sentAddresses = new Set(sentIndividuals.map((item) => item.address));
    const receivedRolledUp = ranked.filter((item) => (
        item.received > 0 && !receivedAddresses.has(item.address)
    ));
    const sentRolledUp = ranked.filter((item) => (
        item.sent > 0 && !sentAddresses.has(item.address)
    ));
    const receivedCohort = directionCohort(
        'received',
        receivedRolledUp
    );
    const sentCohort = directionCohort(
        'sent',
        sentRolledUp
    );
    const diagramNodes = [
        ...receivedIndividuals.map((item) => directionalIndividual(item, 'received', {
            firstValue: firstValueIsShown && item.address === firstValueAddress
        })),
        receivedCohort,
        ...sentIndividuals.map((item) => directionalIndividual(item, 'sent')),
        sentCohort
    ].filter(Boolean);

    if (!firstValueIsShown) {
        const originNode = contextNode(firstValueEvent);
        if (originNode) diagramNodes.push(originNode);
    }

    const edges = [];
    for (const item of diagramNodes) {
        if (item.isContext) continue;
        const direction = item.diagramDirection || (item.received > 0 ? 'received' : 'sent');
        const edge = edgeFor(
            item,
            direction,
            direction === 'received' && firstValueIsShown
                ? firstValueEvent?.transactionId
                : null,
            firstValueAddress
        );
        if (edge) edges.push(edge);
    }
    if (!firstValueIsShown) {
        const node = diagramNodes.find((item) => item.isContext);
        if (node) {
            edges.push({
                id: `${node.key}:first`,
                direction: 'first',
                counterparty: node,
                amount: Number(firstValueEvent?.amountMutez || 0),
                count: 1,
                latest: firstValueEvent?.timestamp || '',
                isFirstValue: true,
                event: firstValueEvent
            });
        }
    }

    const counterpartyEdges = ranked.flatMap((item) => [
        edgeFor(
            item,
            'received',
            firstValueIsShown ? firstValueEvent?.transactionId : null,
            firstValueAddress
        ),
        edgeFor(item, 'sent', null)
    ].filter(Boolean));
    const listCounterparties = ranked.slice(0, settings.maxListRows);
    const listEdges = listCounterparties.map((item) => {
        const direction = item.received >= item.sent ? 'received' : 'sent';
        return counterpartyEdges.find((edge) => (
            edge.counterparty.address === item.address && edge.direction === direction
        ));
    }).filter(Boolean);

    const latest = allTransfers.reduce(
        (value, tx) => latestTimestamp(value, tx.timestamp),
        ''
    );

    return {
        address,
        label: data?.label || address,
        account: data?.account || null,
        resolution: data?.resolution || null,
        coverage: data?.coverage || null,
        updatedAt: data?.updatedAt || '',
        accountOrigin: data?.accountOrigin || null,
        firstInbound: data?.firstInboundEvent || null,
        firstValueEvent,
        allTransfers,
        transfers: shownTransfers,
        totals: totalsFor(shownTransfers),
        fullLoadedTotals: totalsFor(allTransfers),
        counterparties: ranked,
        counterpartyEdges,
        composition: buildCounterpartyComposition(ranked, delegateContext.complete),
        bakerContext: {
            complete: delegateContext.complete,
            reason: delegateContext.reason,
            catalogSize: delegateContext.catalogSize
        },
        listCounterparties,
        listEdges,
        visibleCounterparties: diagramNodes,
        edges,
        rolledUpCount: new Set([
            ...receivedRolledUp.map((item) => item.address),
            ...sentRolledUp.map((item) => item.address)
        ]).size,
        hiddenListCount: Math.max(0, ranked.length - settings.maxListRows),
        selfTransferRows,
        threshold,
        latest
    };
}

function safeWholeNumber(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
        ? value
        : null;
}

function validDate(value) {
    return Number.isFinite(Date.parse(value || ''));
}

function validWhaleOperation(operation, transferWindow, isValidAddress) {
    const sender = String(operation?.sender || '');
    const target = String(operation?.target || '');
    const amountMutez = safeWholeNumber(operation?.amountMutez);
    const timestamp = Date.parse(operation?.timestamp || '');
    const since = Date.parse(transferWindow?.since || '');
    const until = Date.parse(transferWindow?.until || '');
    return String(operation?.status || '').toLowerCase() === 'applied'
        && Boolean(operation?.hash)
        && isValidAddress(sender)
        && isValidAddress(target)
        && sender !== target
        && amountMutez > 0
        && Number.isFinite(timestamp)
        && Number.isFinite(since)
        && Number.isFinite(until)
        && timestamp >= since
        && timestamp <= until;
}

function sourceAlias(value) {
    return String(value || '').trim();
}

function whaleHero(operation, selectionKind) {
    const senderAlias = sourceAlias(operation?.senderAlias);
    const targetAlias = sourceAlias(operation?.targetAlias);
    const focusAddress = senderAlias
        ? String(operation.sender)
        : targetAlias
            ? String(operation.target)
            : String(operation.sender);
    const focusAlias = senderAlias || targetAlias;
    return {
        selectionKind,
        focusAddress,
        focusAlias,
        sender: {
            address: String(operation.sender),
            alias: senderAlias
        },
        target: {
            address: String(operation.target),
            alias: targetAlias
        },
        amountMutez: Number(operation.amountMutez),
        timestamp: operation.timestamp,
        hash: operation.hash
    };
}

export function buildLedgerFlowEntryProjection(artifact, options = {}) {
    const isValidAddress = typeof options.isValidAddress === 'function'
        ? options.isValidAddress
        : (value) => /^(?:tz[1-4]|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(value || ''));
    const transfers = artifact?.transfers24h || null;
    const coverage = artifact?.coverage?.transfers24h || null;
    const minimumXtz = safeWholeNumber(transfers?.minimumXtz);
    const operationCount = safeWholeNumber(transfers?.operationCount);
    const uniqueSenders = safeWholeNumber(transfers?.uniqueSenders);
    const uniqueTargets = safeWholeNumber(transfers?.uniqueTargets);
    const grossObservedMutez = safeWholeNumber(transfers?.grossObservedMutez);
    const flowStories = Array.isArray(transfers?.topFlowStories)
        ? transfers.topFlowStories
        : [];
    const metricsValid = artifact?.kind === 'tezos-whale-watch'
        && Number(artifact?.version) === 1
        && validDate(artifact?.generatedAt)
        && transfers?.complete === true
        && coverage?.complete === true
        && operationCount !== null
        && uniqueSenders !== null
        && uniqueTargets !== null
        && grossObservedMutez !== null
        && minimumXtz !== null
        && operationCount === safeWholeNumber(coverage?.eligibleCount)
        && minimumXtz === safeWholeNumber(artifact?.methodology?.minimumTransferXtz)
        && Number(transfers?.window?.hours) === 24
        && validDate(transfers?.window?.since)
        && validDate(transfers?.window?.until)
        && Date.parse(transfers.window.until) > Date.parse(transfers.window.since)
        && Boolean(String(transfers?.semantics || '').trim());

    const aliasByAddress = new Map();
    const rememberAliases = (operation) => {
        if (operation?.sender && operation?.senderAlias) {
            aliasByAddress.set(String(operation.sender), String(operation.senderAlias));
        }
        if (operation?.target && operation?.targetAlias) {
            aliasByAddress.set(String(operation.target), String(operation.targetAlias));
        }
    };
    rememberAliases(transfers?.largestOperation);
    rememberAliases(transfers?.largestNamedOperation);
    flowStories.forEach((story) => (
        (Array.isArray(story?.operations) ? story.operations : []).forEach(rememberAliases)
    ));

    let hero = null;
    if (metricsValid) {
        const largest = transfers?.largestOperation;
        const largestValid = validWhaleOperation(largest, transfers.window, isValidAddress);
        const largestNamed = transfers?.largestNamedOperation;
        const namedValid = validWhaleOperation(largestNamed, transfers.window, isValidAddress)
            && Boolean(sourceAlias(largestNamed?.senderAlias) || sourceAlias(largestNamed?.targetAlias))
            && (!largestValid || Number(largestNamed.amountMutez) <= Number(largest.amountMutez));
        if (namedValid) hero = whaleHero(largestNamed, 'largest-named-endpoint');
        else if (largestValid) hero = whaleHero(largest, 'largest-overall');
    }

    const stories = [];
    const usedStoryAddresses = new Set(hero
        ? [hero.sender.address, hero.target.address]
        : []);
    if (metricsValid) {
        for (const story of flowStories) {
            const operations = Array.isArray(story?.operations) ? story.operations : [];
            for (const operation of operations) {
                if (!validWhaleOperation(operation, transfers.window, isValidAddress)) continue;
                const candidates = [
                    [operation.target, operation.targetAlias],
                    [operation.sender, operation.senderAlias]
                ];
                const candidate = candidates.find(([address]) => (
                    isValidAddress(address) && !usedStoryAddresses.has(String(address))
                ));
                if (!candidate) continue;
                const [address, alias] = candidate;
                usedStoryAddresses.add(String(address));
                stories.push({
                    address: String(address),
                    alias: String(alias || aliasByAddress.get(String(address)) || ''),
                    amountMutez: Number(operation.amountMutez),
                    timestamp: operation.timestamp,
                    hash: operation.hash
                });
                break;
            }
            if (stories.length >= 3) break;
        }
    }

    const resumeAddress = String(options.resumeAddress || '');
    const resume = isValidAddress(resumeAddress)
        ? {
            address: resumeAddress,
            alias: aliasByAddress.get(resumeAddress) || '',
            source: options.resumeSource === 'my-tezos' ? 'my-tezos' : 'ledger-flow-last-target'
        }
        : null;

    return {
        source: metricsValid ? {
            kind: artifact.kind,
            version: Number(artifact.version),
            generatedAt: artifact.generatedAt,
            windowSince: transfers.window.since,
            windowUntil: transfers.window.until,
            complete: true
        } : null,
        hero,
        metrics: metricsValid ? {
            minimumXtz,
            operationCount,
            uniqueSenders,
            uniqueTargets,
            grossObservedMutez,
            semantics: String(transfers.semantics)
        } : null,
        stories,
        resume
    };
}

function nextUtcBucketBoundary(timestamp, unit) {
    const date = new Date(timestamp);
    if (unit === 'hour') {
        return Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            date.getUTCHours() + 1
        );
    }
    const midnight = Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate()
    );
    if (unit === 'day') return midnight + TIMELINE_DAY_MS;
    const daysUntilMonday = (8 - date.getUTCDay()) % 7 || 7;
    return midnight + daysUntilMonday * TIMELINE_DAY_MS;
}

function timelineBucketIndex(buckets, timestamp, until) {
    if (timestamp === until) return buckets.length - 1;
    let low = 0;
    let high = buckets.length - 1;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const bucket = buckets[middle];
        const start = Date.parse(bucket.start);
        const end = Date.parse(bucket.end);
        if (timestamp < start) high = middle - 1;
        else if (timestamp >= end) low = middle + 1;
        else return middle;
    }
    return -1;
}

export function buildLedgerFlowTimeline(model) {
    const coverage = model?.coverage || {};
    const windowKey = String(coverage.windowKey || '');
    if (coverage.mode === 'sample') {
        return { available: false, reason: 'sample', windowKey, buckets: [] };
    }
    if (windowKey === 'all') {
        return { available: false, reason: 'all-window', windowKey, buckets: [] };
    }
    const config = {
        '24h': { unit: 'hour', bucketMs: TIMELINE_HOUR_MS },
        '7d': { unit: 'day', bucketMs: TIMELINE_DAY_MS },
        '30d': { unit: 'day', bucketMs: TIMELINE_DAY_MS },
        '1y': { unit: 'week', bucketMs: 7 * TIMELINE_DAY_MS }
    }[windowKey];
    const since = Date.parse(coverage.since || '');
    const until = Date.parse(coverage.until || '');
    if (!config || !Number.isFinite(since) || !Number.isFinite(until) || until <= since) {
        return { available: false, reason: 'unbounded', windowKey, buckets: [] };
    }

    const buckets = [];
    let cursor = since;
    while (cursor < until && buckets.length < 1000) {
        const boundary = nextUtcBucketBoundary(cursor, config.unit);
        const endMs = Math.min(until, Math.max(cursor + 1, boundary));
        buckets.push({
            index: buckets.length,
            start: new Date(cursor).toISOString(),
            end: new Date(endMs).toISOString(),
            sent: 0,
            received: 0,
            sentCount: 0,
            receivedCount: 0,
            count: 0
        });
        cursor = endMs;
    }
    if (!buckets.length || cursor !== until) {
        return { available: false, reason: 'unbounded', windowKey, buckets: [] };
    }
    let ignoredRows = 0;
    for (const transfer of model?.transfers || []) {
        const timestamp = Date.parse(transfer?.timestamp || '');
        if (!Number.isFinite(timestamp) || timestamp < since || timestamp > until) {
            ignoredRows += 1;
            continue;
        }
        const index = timelineBucketIndex(buckets, timestamp, until);
        const bucket = buckets[index];
        const direction = transfer?.direction;
        if (!bucket || !['sent', 'received'].includes(direction)) {
            ignoredRows += 1;
            continue;
        }
        bucket[direction] += Number(transfer.amount || 0);
        bucket[`${direction}Count`] += 1;
        bucket.count += 1;
    }
    if (ignoredRows > 0) {
        return {
            available: false,
            reason: 'invalid-rows',
            windowKey,
            buckets: [],
            ignoredRows
        };
    }
    const totals = buckets.reduce((value, bucket) => ({
        sent: value.sent + bucket.sent,
        received: value.received + bucket.received,
        count: value.count + bucket.count
    }), { sent: 0, received: 0, count: 0 });
    return {
        available: true,
        reason: '',
        windowKey,
        unit: config.unit,
        bucketMs: config.bucketMs,
        partialEndpoints: (
            Date.parse(buckets[0].end) - Date.parse(buckets[0].start) !== config.bucketMs
            || Date.parse(buckets.at(-1).end) - Date.parse(buckets.at(-1).start) !== config.bucketMs
        ),
        since: new Date(since).toISOString(),
        until: new Date(until).toISOString(),
        buckets,
        totals,
        ignoredRows
    };
}

export function layoutLedgerFlowNodes(nodes, options = {}) {
    const nodeHeight = Math.max(1, Number(options.nodeHeight || 62));
    const minimumGap = Math.max(1, Number(options.minimumGap || 18));
    const topPadding = Math.max(0, Number(options.topPadding || 72));
    const bottomPadding = Math.max(0, Number(options.bottomPadding || 72));
    const minimumHeight = Math.max(1, Number(options.minimumHeight || 560));
    const left = nodes.filter((item) => item.side !== 'right');
    const right = nodes.filter((item) => item.side === 'right');
    const directionalCount = left.length + right.length;
    const imbalance = directionalCount
        ? (left.length - right.length) / directionalCount
        : 0;
    const centerX = Math.max(340, Math.min(660, 500 + imbalance * 160));
    const columnGap = left.length && right.length ? 320 : 360;
    const leftX = Math.max(150, centerX - columnGap);
    const rightX = Math.min(850, centerX + columnGap);
    const largestColumn = Math.max(left.length, right.length, 1);
    const requiredHeight = topPadding
        + bottomPadding
        + largestColumn * nodeHeight
        + Math.max(0, largestColumn - 1) * minimumGap;
    const viewHeight = Math.max(minimumHeight, requiredHeight);
    const positions = new Map();

    const place = (items, x) => {
        if (!items.length) return;
        const pitch = nodeHeight + minimumGap;
        const contentHeight = items.length * nodeHeight + Math.max(0, items.length - 1) * minimumGap;
        const firstCenter = (viewHeight - contentHeight) / 2 + nodeHeight / 2;
        items.forEach((item, index) => {
            positions.set(item.key, { x, y: firstCenter + index * pitch });
        });
    };

    place(left, leftX);
    place(right, rightX);
    return {
        positions,
        viewHeight,
        center: { x: centerX, y: viewHeight / 2 },
        columns: { left: leftX, right: rightX },
        minimumGap
    };
}
