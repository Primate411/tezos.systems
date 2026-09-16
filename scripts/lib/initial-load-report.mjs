import { MATRIX_PROFILES } from './initial-load-config.mjs';

export const BUDGET_METRICS = Object.freeze(['sameOriginDecodedBytes', 'eagerJsDecodedBytes', 'styleDecodedBytes', 'jsonDecodedBytes', 'sameOriginRequests', 'domNodes']);
const POSITIVE_WORKLOAD_METRICS = BUDGET_METRICS.filter(metric => metric !== 'jsonDecodedBytes');

// A broken page or missing resource timing cannot qualify as a smaller workload.
// Validate this even when the caller is recording a baseline without budgets.
export function validateInitialLoadWorkload(run) {
  return BUDGET_METRICS.flatMap(metric => {
    const value = run?.[metric];
    const positive = POSITIVE_WORKLOAD_METRICS.includes(metric);
    return !Number.isFinite(value) || value < 0 || (positive && value === 0)
      ? [`${metric} must be a finite ${positive ? 'positive' : 'nonnegative'} measurement; received ${value}`]
      : [];
  });
}
const METRICS = [...BUDGET_METRICS, 'domContentLoadedMs', 'domInteractiveMs', 'loadMs', 'sameOriginTransferBytes',
  'sameOriginEncodedBytes', 'jsonTransferBytes', 'imageDecodedBytes', 'layoutShift', 'longTaskCount',
  'longTaskDurationMs', 'totalBlockingTimeMs', 'longestTaskMs', 'networkTransferCount', 'zeroTransferCount',
  'serviceWorkerResponseCount', 'externalRequestAttempts', 'cachedScriptCount', 'fixtureResponseBytes'];
export const median = values => {
  if (!values.length || !values.every(Number.isFinite)) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
};
const round = (value, digits = 1) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
export function maxAdjacentDeltaPct(values) {
  if (!values.length || !values.every(Number.isFinite)) return null;
  return Math.max(0, ...values.slice(1).map((value, i) => Math.abs(value - values[i]) / Math.max(1, Math.abs(values[i])) * 100));
}
export function summarizeInitialLoadRuns(runs) {
  const resources = new Map();
  for (const run of runs) for (const resource of run.resources || []) {
    const values = resources.get(resource.path) || []; values.push(resource.decodedBodySize); resources.set(resource.path, values);
  }
  const decoded = maxAdjacentDeltaPct(runs.map(run => run.sameOriginDecodedBytes));
  const tasks = maxAdjacentDeltaPct(runs.map(run => run.longTaskDurationMs));
  const blocking = maxAdjacentDeltaPct(runs.map(run => run.totalBlockingTimeMs));
  return {
    medians: Object.fromEntries(METRICS.map(metric => [metric, round(median(runs.map(run => run[metric])), metric === 'layoutShift' ? 4 : 1)])),
    maxima: Object.fromEntries(BUDGET_METRICS.map(metric => {
      const values = runs.map(run => run[metric]);
      return [metric, values.length && values.every(Number.isFinite) ? Math.max(...values) : null];
    })),
    stability: { decodedBytesMaxAdjacentDeltaPct: round(decoded, 2), decodedBytesWithinFivePct: Number.isFinite(decoded) && decoded < 5,
      longTaskMaxAdjacentDeltaPct: round(tasks, 2), rawLongTasksWithinFifteenPct: Number.isFinite(tasks) && tasks < 15,
      totalBlockingTimeMaxAdjacentDeltaPct: round(blocking, 2), totalBlockingTimeWithinFifteenPct: Number.isFinite(blocking) && blocking < 15 },
    largestResources: [...resources].map(([path, sizes]) => ({ path, medianDecodedBytes: round(median(sizes), 0), observedRuns: sizes.length }))
      .sort((a, b) => (b.medianDecodedBytes ?? -1) - (a.medianDecodedBytes ?? -1)).slice(0, 20)
  };
}

/** Deterministic budgets cover EVERY run, never just a median that can hide a regression. */
export function checkInitialLoadBudgets(report, budgets) {
  const errors = [];
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(budgets) || budgets.schemaVersion !== 1 || !object(budgets.profiles) || !object(budgets.profileContract)) {
    return ['Invalid initial-load budget schema'];
  }
  const contract = budgets.profileContract;
  if (!['populated', 'blocked'].includes(contract.network)
    || !['aurora', 'clean'].includes(contract.theme)
    || !Number.isInteger(contract.settleMs) || contract.settleMs < 0 || contract.settleMs > 15000
    || typeof contract.fixtureRevision !== 'string' || !contract.fixtureRevision.trim()) {
    errors.push('Invalid initial-load budget profile contract');
  }
  for (const [id, limits] of Object.entries(budgets.profiles)) {
    if (!MATRIX_PROFILES.some(profile => profile.id === id)) errors.push(`Unknown budget profile: ${id}`);
    if (!object(limits)) { errors.push(`${id}: invalid metric budget map`); continue; }
    for (const metric of Object.keys(limits)) {
      if (!BUDGET_METRICS.includes(metric)) errors.push(`${id}: unknown budget metric ${metric}`);
    }
    for (const metric of BUDGET_METRICS) {
      if (!Number.isFinite(limits[metric]) || limits[metric] < 0) errors.push(`${id}: invalid ${metric} budget`);
    }
  }
  if (!object(report) || report.schemaVersion !== 2 || !Array.isArray(report.profiles) || !report.profiles.length) {
    return [...errors, 'Invalid initial-load report: at least one profile is required'];
  }
  if (!Array.isArray(report.errors) || report.errors.length) errors.push('Initial-load report contains errors or omitted its error receipt');
  if (!Number.isInteger(report.runsPerProfile) || report.runsPerProfile < 1 || report.runsPerProfile > 20) {
    errors.push('Invalid initial-load report runsPerProfile');
  }
  if (!Number.isInteger(report.warmupRuns) || report.warmupRuns < 0 || report.warmupRuns > 3) {
    errors.push('Invalid initial-load report warmupRuns');
  }
  const selected = report.selectedProfileIds;
  if (!Array.isArray(selected) || !selected.length
    || selected.some(id => !MATRIX_PROFILES.some(profile => profile.id === id))
    || new Set(selected).size !== selected.length) {
    errors.push('Invalid initial-load report selectedProfileIds');
  } else {
    const actualIds = report.profiles.map(measurement => measurement?.profile?.id);
    for (const id of selected) if (!actualIds.includes(id)) errors.push(`Missing selected measurement profile: ${id}`);
    for (const id of actualIds) if (!selected.includes(id)) errors.push(`Unselected measurement profile: ${id}`);
  }
  for (const key of ['network', 'theme', 'settleMs', 'fixtureRevision']) {
    if (report[key] !== contract[key]) errors.push(`Budget profile contract differs: ${key} (${report[key]} vs ${contract[key]})`);
  }
  const seenProfiles = new Set();
  for (const measurement of report.profiles) {
    const profile = measurement?.profile;
    const id = profile?.id;
    const expected = MATRIX_PROFILES.find(item => item.id === id);
    if (!expected) { errors.push(`Unknown measurement profile: ${id}`); continue; }
    if (seenProfiles.has(id)) errors.push(`Duplicate measurement profile: ${id}`);
    seenProfiles.add(id);
    for (const key of ['device', 'cache', 'savedWallet']) {
      if (profile[key] !== expected[key]) errors.push(`${id}: profile ${key} does not match its catalog ID`);
    }
    if (profile.viewport?.width !== expected.viewport.width || profile.viewport?.height !== expected.viewport.height) {
      errors.push(`${id}: profile viewport does not match its catalog ID`);
    }
    for (const key of ['network', 'theme']) {
      if (profile[key] !== report[key]) errors.push(`${id}: profile ${key} differs from the report contract`);
    }
    if (report.network === 'blocked' && profile.savedWallet) errors.push(`${id}: saved-wallet measurements require populated fixtures`);
    if (!Array.isArray(measurement.errors) || measurement.errors.length) errors.push(`${id}: measurement reported errors or omitted its error receipt`);
    const validateReceipt = (receipt, label) => {
      if (!Array.isArray(receipt?.errors) || receipt.errors.length) errors.push(`${label}: reported errors or omitted its error receipt`);
      if (profile.cache !== 'cold') {
        if (!object(receipt?.seed)) errors.push(`${label}: missing cache seed receipt`);
        else {
          if (!Array.isArray(receipt.seed.errors) || receipt.seed.errors.length) errors.push(`${label}: cache seed reported errors or omitted its error receipt`);
          errors.push(...validateInitialLoadWorkload(receipt.seed).map(error => `${label} seed: ${error}`));
        }
      }
    };
    if (!Array.isArray(measurement.warmupDiagnostics) || measurement.warmupDiagnostics.length !== report.warmupRuns) {
      errors.push(`${id}: warmup receipt count does not match warmupRuns`);
    } else {
      for (const [index, warmup] of measurement.warmupDiagnostics.entries()) {
        if (warmup?.run !== `warmup-${index + 1}`) errors.push(`${id}: warmup IDs must cover warmup-1 through warmupRuns in order`);
        const label = `${id} warmup ${index + 1}`;
        validateReceipt(warmup, label);
        errors.push(...validateInitialLoadWorkload(warmup).map(error => `${label}: ${error}`));
      }
    }
    const limits = budgets.profiles[id];
    if (!object(limits)) { errors.push(`No reviewed budget for ${id}`); continue; }
    if (!Array.isArray(measurement.runs) || !measurement.runs.length) {
      errors.push(`${id}: no successful measurement runs`);
      continue;
    }
    if (measurement.runs.length !== report.runsPerProfile) errors.push(`${id}: expected ${report.runsPerProfile} runs, received ${measurement.runs.length}`);
    const runIds = measurement.runs.map(run => run?.run);
    if (new Set(runIds).size !== runIds.length || runIds.some(run => !Number.isInteger(run) || run < 1 || run > report.runsPerProfile)) {
      errors.push(`${id}: run IDs must be distinct integers from 1 through runsPerProfile`);
    }
    for (const [index, run] of measurement.runs.entries()) {
      validateReceipt(run, `${id} run ${run?.run ?? index + 1}`);
      errors.push(...validateInitialLoadWorkload(run).map(error => `${id} run ${run?.run ?? index + 1}: ${error}`));
    }
    for (const metric of BUDGET_METRICS) {
      if (!Number.isFinite(limits[metric]) || limits[metric] < 0) continue;
      for (const [index, run] of measurement.runs.entries()) {
        const value = run?.[metric];
        if (!Number.isFinite(value) || value < 0 || value > limits[metric]) {
          errors.push(`${id} run ${run?.run ?? index + 1}: ${metric} ${value} exceeds reviewed limit ${limits[metric]}`);
        }
      }
    }
  }
  return errors;
}
