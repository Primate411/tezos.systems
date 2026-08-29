import { createHash } from 'node:crypto';

export const ECOSYSTEM_SCHEMA_VERSION = 1;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const LAYER_IDS = Object.freeze(['tezos', 'etherlink']);
export const TEZOS_IMPLICIT_ADDRESS_PATTERN = /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/;

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function stableHash(value) {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

export function contractUniverseHash(apps) {
  return stableHash((apps || []).map((app) => ({
    id: app.id,
    layers: (app.layers || []).map((layer) => ({
      id: layer.id,
      contracts: (layer.contracts || []).map((contract) => String(contract.address || contract).toLowerCase()).sort()
    }))
  })));
}

export function mergeResolvedContracts(currentContracts = [], previousContracts = []) {
  return [...new Map([
    ...previousContracts,
    ...currentContracts
  ].map((contract) => [String(contract?.address || '').toLowerCase(), contract])).values()]
    .sort((left, right) => left.address.localeCompare(right.address, 'en'));
}

export function utcWeekStart(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid date: ${value}`);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + mondayOffset));
}

export function addWeeks(value, count) {
  return new Date(new Date(value).getTime() + count * WEEK_MS);
}

export function networkRebuildStart(previousWeeks, lastCompleteStart) {
  const latestStart = new Date(lastCompleteStart);
  const previousEnd = new Date(Array.isArray(previousWeeks) ? previousWeeks.at(-1)?.weekEnd || '' : '').getTime();
  return Number.isFinite(previousEnd) && previousEnd < latestStart.getTime()
    ? new Date(previousEnd)
    : latestStart;
}

export function iso(value) {
  return new Date(value).toISOString();
}

export function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Math.round((((current - previous) / previous) * 100) * 100) / 100;
}

export function retentionRate(currentWallets, previousWallets) {
  if (!(currentWallets instanceof Set) || !(previousWallets instanceof Set) || previousWallets.size === 0) return null;
  let retained = 0;
  for (const wallet of previousWallets) if (currentWallets.has(wallet)) retained += 1;
  return Math.round(((retained / previousWallets.size) * 100) * 100) / 100;
}

export function emptyMetric() {
  return { wallets: new Set(), operations: new Set() };
}

export function mergeMetric(target, source, walletPrefix = '') {
  for (const wallet of source.wallets || []) target.wallets.add(`${walletPrefix}${wallet}`);
  for (const operation of source.operations || []) target.operations.add(operation);
  return target;
}

export function tezosNetworkWallet(transaction) {
  const address = transaction?.initiator?.address || transaction?.sender?.address || null;
  return TEZOS_IMPLICIT_ADDRESS_PATTERN.test(address || '') ? address : null;
}

export function combineNetworkActivity(layers, status = 'complete') {
  const metrics = LAYER_IDS.map((layerId) => layers?.[layerId]);
  if (metrics.some((metric) => !Number.isSafeInteger(metric?.activeWallets) || metric.activeWallets < 0)) {
    return { status: 'unavailable', activeWallets: null, approximate: false };
  }
  return {
    status,
    activeWallets: metrics.reduce((total, metric) => total + metric.activeWallets, 0),
    approximate: metrics.some((metric) => metric.approximate === true)
  };
}

export function publicMetric(metric, previousMetric = null) {
  return {
    activeWallets: metric.wallets.size,
    interactions: metric.operations.size,
    callsPerWallet: metric.wallets.size
      ? Math.round((metric.operations.size / metric.wallets.size) * 100) / 100
      : null,
    returningWalletRate: previousMetric ? retentionRate(metric.wallets, previousMetric.wallets) : null
  };
}

function rowMetric(row, layer) {
  if (layer === 'all') return row?.status === 'complete' ? row.all : null;
  return row?.layers?.[layer]?.status === 'complete' ? row.layers[layer] : null;
}

export function summarizeApp(app, layer = 'all') {
  const complete = (app.weekly || [])
    .map((row) => ({ row, metric: rowMetric(row, layer) }))
    .filter(({ metric }) => Number.isFinite(metric?.activeWallets));
  const current = complete.at(-1) || null;
  const previous = complete.at(-2) || null;
  const yoyStart = current ? iso(addWeeks(current.row.weekStart, -52)) : null;
  const yoy = yoyStart ? complete.find(({ row }) => row.weekStart === yoyStart) || null : null;
  const trailing = complete.slice(-4);
  const peak = complete.reduce((best, item) => (
    !best || item.metric.activeWallets > best.activeWallets
      ? { weekStart: item.row.weekStart, activeWallets: item.metric.activeWallets }
      : best
  ), null);
  return {
    weekStart: current?.row?.weekStart || null,
    activeWallets: current?.metric?.activeWallets ?? null,
    interactions: current?.metric?.interactions ?? null,
    callsPerWallet: current?.metric?.callsPerWallet ?? null,
    returningWalletRate: current?.metric?.returningWalletRate ?? null,
    wowPct: current && previous ? pctChange(current.metric.activeWallets, previous.metric.activeWallets) : null,
    yoyPct: current && yoy ? pctChange(current.metric.activeWallets, yoy.metric.activeWallets) : null,
    fourWeekAverage: trailing.length
      ? Math.round((trailing.reduce((sum, item) => sum + item.metric.activeWallets, 0) / trailing.length) * 100) / 100
      : null,
    peak
  };
}

export function rankApps(apps, layer = 'all') {
  return apps
    .map((app) => {
      const summary = layer === 'all' ? (app.summary || summarizeApp(app)) : summarizeApp(app, layer);
      return {
        id: app.id,
        name: app.name,
        category: app.category,
        layers: app.layers.map((item) => item.id),
        ...summary
      };
    })
    .filter((row) => Number.isFinite(row.activeWallets))
    .sort((left, right) => (
      right.activeWallets - left.activeWallets
      || (right.interactions || 0) - (left.interactions || 0)
      || left.name.localeCompare(right.name, 'en')
    ))
    .map((row, index) => ({ rank: index + 1, ...row }));
}

export function validateManifest(manifest) {
  const errors = [];
  if (manifest?.schemaVersion !== ECOSYSTEM_SCHEMA_VERSION) errors.push('schemaVersion must be 1');
  if (manifest?.weekStartsOn !== 'monday') errors.push('weekStartsOn must be monday');
  if (manifest?.rankingMetric !== 'active_wallets') errors.push('rankingMetric must be active_wallets');
  if (!Array.isArray(manifest?.apps) || manifest.apps.length < 10) errors.push('at least 10 tracked apps are required');
  const ids = new Set();
  const explicitAddresses = new Map();
  const layers = new Set();
  for (const app of manifest?.apps || []) {
    if (!/^[a-z0-9-]+$/.test(app?.id || '')) errors.push(`invalid app id ${app?.id || '<missing>'}`);
    if (ids.has(app.id)) errors.push(`duplicate app id ${app.id}`);
    ids.add(app.id);
    if (!app.name || !app.category || !/^https:\/\//.test(app.website || '')) errors.push(`invalid identity for ${app.id}`);
    if (!Array.isArray(app.layers) || !app.layers.length) errors.push(`missing layers for ${app.id}`);
    for (const layer of app.layers || []) {
      layers.add(layer.id);
      if (!LAYER_IDS.includes(layer.id)) errors.push(`invalid layer ${layer.id} for ${app.id}`);
      if (!Number.isFinite(Date.parse(layer.since || ''))) errors.push(`invalid since date for ${app.id}/${layer.id}`);
      if (!Array.isArray(layer.proofUrls) || !layer.proofUrls.length || layer.proofUrls.some((url) => !/^https:\/\//.test(url))) {
        errors.push(`missing HTTPS proof URLs for ${app.id}/${layer.id}`);
      }
      const source = layer.contractSource;
      if (!['addresses', 'tzkt_alias_catalog'].includes(source?.type)) errors.push(`invalid contract source for ${app.id}/${layer.id}`);
      if (source?.type === 'addresses') {
        if (!Array.isArray(source.addresses) || !source.addresses.length) errors.push(`missing addresses for ${app.id}/${layer.id}`);
        for (const address of source?.addresses || []) {
          const valid = layer.id === 'tezos'
            ? /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)
            : /^0x[0-9a-fA-F]{40}$/.test(address);
          if (!valid) errors.push(`invalid ${layer.id} address ${address} for ${app.id}`);
          const key = `${layer.id}:${address.toLowerCase()}`;
          if (explicitAddresses.has(key)) errors.push(`address ${address} is assigned to ${explicitAddresses.get(key)} and ${app.id}`);
          explicitAddresses.set(key, app.id);
        }
      }
      if (source?.type === 'tzkt_alias_catalog') {
        if (!Array.isArray(source.aliasPatterns) || !source.aliasPatterns.length) errors.push(`missing alias patterns for ${app.id}`);
        for (const pattern of source?.aliasPatterns || []) {
          try { new RegExp(pattern, 'i'); } catch { errors.push(`invalid alias pattern for ${app.id}: ${pattern}`); }
        }
      }
    }
  }
  for (const layer of LAYER_IDS) if (!layers.has(layer)) errors.push(`manifest must include ${layer}`);
  return errors;
}

export function snapshotContentHash(snapshot) {
  const { contentHash: ignored, ...unsigned } = snapshot || {};
  return stableHash(unsigned);
}

export function validateSnapshot(snapshot, manifest = null, { allowMissingNetworkActivity = false } = {}) {
  const errors = [];
  const validCount = (value) => Number.isSafeInteger(value) && value >= 0;
  const nullMetric = (metric) => (
    metric?.activeWallets === null
    && metric?.interactions === null
    && metric?.callsPerWallet === null
    && metric?.returningWalletRate === null
  );
  if (snapshot?.schemaVersion !== ECOSYSTEM_SCHEMA_VERSION) errors.push('snapshot schemaVersion must be 1');
  if (!Number.isFinite(Date.parse(snapshot?.generatedAt || ''))) errors.push('snapshot generatedAt is invalid');
  if (!/^[0-9a-f]{64}$/.test(snapshot?.contentHash || '')) errors.push('snapshot contentHash is invalid');
  else if (snapshotContentHash(snapshot) !== snapshot.contentHash) errors.push('snapshot contentHash does not match');
  if (!/^[0-9a-f]{64}$/.test(snapshot?.manifestHash || '')) errors.push('snapshot manifestHash is invalid');
  if (manifest && snapshot.manifestHash !== stableHash(manifest)) errors.push('snapshot manifestHash is stale');
  if (!/^[0-9a-f]{64}$/.test(snapshot?.contractUniverseHash || '')) errors.push('snapshot contractUniverseHash is invalid');
  else if (contractUniverseHash(snapshot?.apps) !== snapshot.contractUniverseHash) errors.push('snapshot contractUniverseHash does not match');
  const catalogReceipts = snapshot?.sourceReceipts?.tzkt?.catalog;
  if (!Array.isArray(catalogReceipts) || !catalogReceipts.length) {
    errors.push('snapshot TzKT catalog receipt is missing');
  } else {
    const catalogKinds = new Set();
    for (const receipt of catalogReceipts) {
      if (!['smart_contract', 'asset'].includes(receipt?.kind)) errors.push('snapshot TzKT catalog receipt has an invalid kind');
      else catalogKinds.add(receipt.kind);
      if (!Number.isSafeInteger(receipt?.aliasedContracts) || receipt.aliasedContracts < 1) {
        errors.push(`snapshot TzKT ${receipt?.kind || 'unknown'} catalog count is invalid`);
      }
      if (receipt?.pagination !== 'id.gt keyset' || !Number.isSafeInteger(receipt?.pageSize) || receipt.pageSize < 1) {
        errors.push(`snapshot TzKT ${receipt?.kind || 'unknown'} catalog pagination receipt is invalid`);
      }
    }
    for (const kind of ['smart_contract', 'asset']) {
      if (!catalogKinds.has(kind)) errors.push(`snapshot TzKT ${kind} catalog receipt is missing`);
    }
  }
  if (!Array.isArray(snapshot?.apps) || snapshot.apps.length < 10) errors.push('snapshot must contain at least 10 apps');
  if (!Array.isArray(snapshot?.weeks) || !snapshot.weeks.length) errors.push('snapshot must contain ecosystem weeks');
  if (!Array.isArray(snapshot?.rankings?.all) || snapshot.rankings.all.length < 10) errors.push('snapshot must contain a top 10 all-layer ranking');
  const networkActivity = snapshot?.networkActivity;
  if (!networkActivity) {
    if (!allowMissingNetworkActivity) errors.push('snapshot network-wide activity is missing');
  } else {
    const networkRows = networkActivity.weeks;
    if (!Array.isArray(networkRows) || !networkRows.length) {
      errors.push('snapshot network-wide activity must contain completed weeks');
    } else {
      if (networkActivity.coverageStart !== networkRows[0]?.weekStart) {
        errors.push('snapshot network-wide activity coverageStart does not match its first week');
      }
      for (const [index, row] of networkRows.entries()) {
        if (row?.status !== 'complete'
          || !Number.isFinite(Date.parse(row?.weekStart || ''))
          || row?.weekEnd !== iso(addWeeks(row.weekStart, 1))) {
          errors.push(`network-wide week ${index} has invalid boundaries or status`);
          continue;
        }
        const layers = row.layers || {};
        for (const layerId of LAYER_IDS) {
          const metric = layers[layerId];
          if (metric?.status !== 'complete'
            || !validCount(metric?.activeWallets)
            || typeof metric?.approximate !== 'boolean') {
            errors.push(`network-wide week ${index} ${layerId} metric is invalid`);
          }
        }
        const expected = combineNetworkActivity(layers, 'complete');
        if (row?.all?.status !== 'complete'
          || row.all.activeWallets !== expected.activeWallets
          || row.all.approximate !== expected.approximate) {
          errors.push(`network-wide week ${index} all-layer metric does not match its layers`);
        }
        if (index > 0 && row.weekStart !== networkRows[index - 1].weekEnd) {
          errors.push(`network-wide week ${index} is not contiguous`);
        }
      }
      if (networkRows.at(-1)?.weekStart !== snapshot?.completeWeek?.weekStart) {
        errors.push('latest network-wide week is not completeWeek');
      }
    }
    const networkPartial = networkActivity.partialWeek;
    if (networkPartial?.weekStart !== snapshot?.partialWeek?.weekStart
      || networkPartial?.observedAt !== snapshot?.partialWeek?.observedAt
      || networkPartial?.status !== 'partial') {
      errors.push('network-wide partial week does not match the snapshot boundary');
    } else {
      for (const layerId of LAYER_IDS) {
        const metric = networkPartial.layers?.[layerId];
        if (metric?.status !== 'partial'
          || !validCount(metric?.activeWallets)
          || typeof metric?.approximate !== 'boolean') {
          errors.push(`network-wide partial ${layerId} metric is invalid`);
        }
      }
      const expected = combineNetworkActivity(networkPartial.layers, 'partial');
      if (networkPartial?.all?.status !== 'partial'
        || networkPartial.all.activeWallets !== expected.activeWallets
        || networkPartial.all.approximate !== expected.approximate) {
        errors.push('network-wide partial all-layer metric does not match its layers');
      }
    }
  }
  if (Array.isArray(snapshot?.apps)) {
    const expectedCategories = [...new Set(snapshot.apps.map((app) => app.category))].sort();
    const expectedLayers = Object.fromEntries(LAYER_IDS.map((layerId) => [
      layerId,
      snapshot.apps.filter((app) => app.layers?.some((layer) => layer.id === layerId)).length
    ]));
    if (snapshot?.universe?.eligibleApps !== snapshot.apps.length
      || stableHash(snapshot?.universe?.categories || null) !== stableHash(expectedCategories)
      || stableHash(snapshot?.universe?.layers || null) !== stableHash(expectedLayers)) {
      errors.push('snapshot universe summary does not match its app catalog');
    }
  }
  const generatedAt = new Date(snapshot?.generatedAt || '');
  if (Number.isFinite(generatedAt.getTime())) {
    const currentStart = utcWeekStart(generatedAt);
    const completeStart = addWeeks(currentStart, -1);
    if (snapshot?.completeWeek?.weekStart !== iso(completeStart)
      || snapshot?.completeWeek?.weekEnd !== iso(currentStart)) {
      errors.push('completeWeek does not match generatedAt');
    }
    if (snapshot?.partialWeek?.weekStart !== iso(currentStart)
      || snapshot?.partialWeek?.status !== 'partial'
      || snapshot?.partialWeek?.observedAt !== iso(generatedAt)) {
      errors.push('partialWeek does not match generatedAt');
    }
    for (const layerId of LAYER_IDS) {
      const metric = snapshot?.partialWeek?.layers?.[layerId];
      if (metric?.status !== 'partial'
        || !validCount(metric?.activeWallets)
        || !validCount(metric?.interactions)) {
        errors.push(`partialWeek ${layerId} metric is not explicitly partial`);
      }
    }
    if (snapshot?.partialWeek?.all?.status !== 'partial'
      || !validCount(snapshot?.partialWeek?.all?.activeWallets)
      || !validCount(snapshot?.partialWeek?.all?.interactions)) {
      errors.push('partialWeek all-layer metric is not explicitly partial');
    }
  }
  const firstActive = manifest ? Object.fromEntries(LAYER_IDS.map((layerId) => [
    layerId,
    Math.min(...manifest.apps.flatMap((app) => app.layers
      .filter((layer) => layer.id === layerId)
      .map((layer) => Date.parse(layer.since))))
  ])) : null;
  for (const [index, row] of (snapshot?.weeks || []).entries()) {
    if (!Number.isFinite(Date.parse(row?.weekStart || '')) || !Number.isFinite(Date.parse(row?.weekEnd || ''))) {
      errors.push(`ecosystem week ${index} has invalid boundaries`);
      continue;
    }
    if (row.weekEnd !== iso(addWeeks(row.weekStart, 1))) errors.push(`ecosystem week ${index} is not seven days`);
    if (index > 0 && row.weekStart !== snapshot.weeks[index - 1].weekEnd) errors.push(`ecosystem week ${index} is not contiguous`);
    if (firstActive) {
      for (const layerId of LAYER_IDS) {
        const metric = row?.layers?.[layerId];
        const active = Date.parse(row.weekEnd) > firstActive[layerId];
        if (active && (metric?.status !== 'complete'
          || !validCount(metric?.activeWallets)
          || !validCount(metric?.interactions))) {
          errors.push(`ecosystem week ${index} ${layerId} coverage is not complete`);
        }
        if (!active && (metric?.status !== 'not-active' || !nullMetric(metric))) {
          errors.push(`ecosystem week ${index} ${layerId} pre-coverage is not explicit`);
        }
      }
    }
  }
  if (snapshot?.weeks?.at(-1)?.weekStart !== snapshot?.completeWeek?.weekStart) errors.push('latest ecosystem week is not completeWeek');
  for (const layer of ['all', ...LAYER_IDS]) {
    const ranking = snapshot?.rankings?.[layer];
    if (!Array.isArray(ranking)) {
      errors.push(`${layer} ranking is missing`);
      continue;
    }
    for (const [index, row] of ranking.entries()) {
      if (row.rank !== index + 1) errors.push(`${layer} ranking is not dense`);
      if (index > 0 && row.activeWallets > ranking[index - 1].activeWallets) errors.push(`${layer} ranking is not descending`);
    }
    const expectedRanking = rankApps((snapshot?.apps || []).map((app) => ({
      ...app,
      summary: summarizeApp(app)
    })), layer);
    if (stableHash(ranking) !== stableHash(expectedRanking)) errors.push(`${layer} ranking does not match the weekly app ledger`);
  }
  const manifestIds = new Set((manifest?.apps || []).map((app) => app.id));
  const snapshotIds = new Set((snapshot?.apps || []).map((app) => app.id));
  if (manifest && (manifestIds.size !== snapshotIds.size || [...manifestIds].some((id) => !snapshotIds.has(id)))) {
    errors.push('snapshot app universe does not match manifest');
  }
  const assignedContracts = new Map();
  for (const app of snapshot?.apps || []) {
    const definition = manifest?.apps?.find((candidate) => candidate.id === app.id);
    if (definition && ['name', 'category', 'website', 'description'].some((key) => app[key] !== definition[key])) {
      errors.push(`${app.id} identity does not match manifest`);
    }
    if (!Array.isArray(app.layers) || !app.layers.length) errors.push(`${app.id} is missing resolved layers`);
    if (!Array.isArray(app.weekly) || app.weekly.length !== snapshot?.weeks?.length) errors.push(`${app.id} weekly history does not match ecosystem coverage`);
    else if (app.weekly.some((row, index) => row.weekStart !== snapshot.weeks[index].weekStart)) errors.push(`${app.id} weekly boundaries drifted`);
    if (stableHash(app.summary || null) !== stableHash(summarizeApp(app))) errors.push(`${app.id} summary does not match its weekly ledger`);
    for (const layer of app.layers || []) {
      const layerDefinition = definition?.layers?.find((candidate) => candidate.id === layer.id);
      if (layerDefinition && (layer.since !== layerDefinition.since
        || layer.contractSource !== layerDefinition.contractSource.type
        || stableHash(layer.proofUrls || null) !== stableHash(layerDefinition.proofUrls))) {
        errors.push(`${app.id}/${layer.id} receipt does not match manifest`);
      }
      if (!Number.isInteger(layer.contractCount) || layer.contractCount < 1) errors.push(`${app.id}/${layer.id} has no contracts`);
      if (!Array.isArray(layer.contracts) || layer.contracts.length !== layer.contractCount) errors.push(`${app.id}/${layer.id} contract receipt mismatch`);
      for (const contract of layer.contracts || []) {
        const key = `${layer.id}:${String(contract.address || '').toLowerCase()}`;
        if (assignedContracts.has(key)) errors.push(`${contract.address} is assigned to both ${assignedContracts.get(key)} and ${app.id}`);
        else assignedContracts.set(key, app.id);
      }
    }
  }
  return errors;
}
