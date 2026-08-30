function requireInteger(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}`);
  }
  return number;
}

export class SmokeInfrastructureError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'SmokeInfrastructureError';
    this.infrastructure = true;
  }
}

export function isSmokeInfrastructureError(error) {
  return error?.infrastructure === true || error?.name === 'SmokeInfrastructureError';
}

export function parseShard(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d+)\/(\d+)$/);
  if (!match) throw new Error(`invalid smoke shard "${value}"; expected <index>/<total>`);
  const index = requireInteger(match[1], 'smoke shard index', { min: 1, max: 64 });
  const total = requireInteger(match[2], 'smoke shard total', { min: 1, max: 64 });
  if (index > total) throw new Error(`smoke shard index ${index} exceeds total ${total}`);
  return { index, total, value: `${index}/${total}` };
}

export function planSuiteShards(catalog, total, suiteCosts = {}) {
  const shardTotal = requireInteger(total, 'smoke shard total', { min: 1, max: 64 });
  const buckets = Array.from({ length: shardTotal }, (_, index) => ({
    index,
    cost: 0,
    entries: []
  }));
  const weighted = catalog.map((suite, order) => {
    const configuredCost = Number(suiteCosts[suite.name]);
    return {
      suite,
      order,
      cost: Number.isFinite(configuredCost) && configuredCost > 0 ? configuredCost : 10
    };
  }).sort((left, right) => right.cost - left.cost || left.order - right.order);

  for (const entry of weighted) {
    const bucket = buckets.reduce((best, candidate) => {
      if (candidate.cost !== best.cost) return candidate.cost < best.cost ? candidate : best;
      if (candidate.entries.length !== best.entries.length) {
        return candidate.entries.length < best.entries.length ? candidate : best;
      }
      return candidate.index < best.index ? candidate : best;
    }, buckets[0]);
    bucket.entries.push(entry);
    bucket.cost += entry.cost;
  }

  return buckets.map((bucket) => ({
    index: bucket.index + 1,
    estimatedCost: bucket.cost,
    suites: bucket.entries.sort((left, right) => left.order - right.order).map((entry) => entry.suite)
  }));
}

export function selectSuiteCatalog(catalog, { onlySuites = [], shard = null, suiteCosts = {} } = {}) {
  const names = catalog.map((suite) => suite.name);
  const uniqueNames = new Set(names);
  if (uniqueNames.size !== names.length) {
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    throw new Error(`duplicate smoke suite name(s): ${[...new Set(duplicates)].join(', ')}`);
  }

  const requested = onlySuites.map((suite) => String(suite).trim()).filter(Boolean);
  const missing = requested.filter((suite) => !uniqueNames.has(suite));
  if (missing.length) {
    throw new Error(`unknown smoke suite(s): ${missing.join(', ')}\nAvailable suites: ${names.join(', ')}`);
  }

  const requestedSet = new Set(requested);
  const selected = requested.length
    ? catalog.filter((suite) => requestedSet.has(suite.name))
    : [...catalog];
  if (!shard) return selected;
  return planSuiteShards(selected, shard.total, suiteCosts)[shard.index - 1].suites;
}

export function serializeSmokeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error),
    stack: error?.stack || ''
  };
}

export async function executeSuiteCatalog(catalog, {
  continueOnFailure = false,
  onEvent = () => {},
  repeatEach = 1,
  retryFailures = 0,
  retryInfrastructure = 0,
  runAttempt
} = {}) {
  if (typeof runAttempt !== 'function') throw new Error('runAttempt is required');
  const repeats = requireInteger(repeatEach, 'repeatEach', { min: 1, max: 100 });
  const retries = requireInteger(retryFailures, 'retryFailures', { min: 0, max: 10 });
  const infrastructureRetries = requireInteger(retryInfrastructure, 'retryInfrastructure', { min: 0, max: 10 });
  const results = [];

  for (const suite of catalog) {
    const suiteStartedAt = Date.now();
    const suiteRepeats = suite.repeatEach == null
      ? repeats
      : requireInteger(suite.repeatEach, `${suite.name} repeatEach`, { min: 1, max: 100 });
    const iterations = [];
    let suiteStatus = 'passed';

    for (let iteration = 1; iteration <= suiteRepeats; iteration += 1) {
      const attempts = [];
      let iterationStatus = 'failed';

      for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
        const attemptStartedAt = Date.now();
        await onEvent({ type: 'attempt-start', suite, iteration, attempt, repeats: suiteRepeats, retries });
        let infrastructureRetry = 0;
        while (true) {
          try {
            await runAttempt(suite, {
              iteration,
              attempt,
              diagnostic: attempt > 1,
              infrastructureRetry
            });
            attempts.push({
              attempt,
              durationMs: Date.now() - attemptStartedAt,
              infrastructureRetries: infrastructureRetry,
              status: 'passed'
            });
            iterationStatus = attempt === 1 ? 'passed' : 'flaky';
            await onEvent({ type: 'attempt-pass', suite, iteration, attempt, status: iterationStatus });
            break;
          } catch (error) {
            if (isSmokeInfrastructureError(error) && infrastructureRetry < infrastructureRetries) {
              infrastructureRetry += 1;
              await onEvent({
                type: 'infrastructure-retry',
                suite,
                iteration,
                attempt,
                infrastructureRetry,
                infrastructureRetries,
                error: serializeSmokeError(error)
              });
              continue;
            }
            const serializedError = serializeSmokeError(error);
            attempts.push({
              attempt,
              durationMs: Date.now() - attemptStartedAt,
              error: serializedError,
              infrastructureFailure: isSmokeInfrastructureError(error),
              infrastructureRetries: infrastructureRetry,
              status: 'failed'
            });
            await onEvent({
              type: 'attempt-fail',
              suite,
              iteration,
              attempt,
              error: serializedError,
              infrastructureFailure: isSmokeInfrastructureError(error)
            });
            if (attempt > retries) iterationStatus = 'failed';
            break;
          }
        }
        if (iterationStatus !== 'failed') break;
      }

      iterations.push({ iteration, status: iterationStatus, attempts });
      if (iterationStatus === 'failed') suiteStatus = 'failed';
      else if (iterationStatus === 'flaky' && suiteStatus === 'passed') suiteStatus = 'flaky';
    }

    const result = {
      name: suite.name,
      description: suite.description || '',
      durationMs: Date.now() - suiteStartedAt,
      repeatEach: suiteRepeats,
      status: suiteStatus,
      iterations
    };
    results.push(result);
    await onEvent({ type: 'suite-complete', suite, result });

    if (suiteStatus !== 'passed' && !continueOnFailure) break;
  }

  return results;
}

export function summarizeSuiteResults(results, selectedCount = results.length) {
  const summary = {
    selected: selectedCount,
    executed: results.length,
    passed: 0,
    flaky: 0,
    failed: 0
  };
  for (const result of results) {
    if (result.status === 'passed') summary.passed += 1;
    else if (result.status === 'flaky') summary.flaky += 1;
    else summary.failed += 1;
  }
  summary.skipped = Math.max(0, summary.selected - summary.executed);
  return summary;
}

export function formatSuiteSummary(results, selectedCount = results.length) {
  const summary = summarizeSuiteResults(results, selectedCount);
  return `${summary.passed} passed, ${summary.flaky} flaky, ${summary.failed} failed, ${summary.skipped} not run (${summary.selected} selected)`;
}

export function unstableSuiteResults(results) {
  return results.filter((result) => result.status !== 'passed');
}
