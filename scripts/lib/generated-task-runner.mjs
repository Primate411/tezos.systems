export const RETRYABLE_TEMP_FAILURE_EXIT_CODE = 75;

function failureFrom(name, error) {
  return {
    name,
    exitCode: Number.isInteger(error?.exitCode) ? error.exitCode : null,
    message: error?.message || String(error)
  };
}

function defaultWait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function runGeneratedTask({
  name,
  execute,
  failures = null,
  maxAttempts = 1,
  retryExitCodes = [],
  retryDelayMs = 0,
  wait = defaultWait,
  logger = console
}) {
  if (!name || typeof execute !== 'function') {
    throw new TypeError('generated task requires a name and execute function');
  }
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError('generated task maxAttempts must be a positive integer');
  }

  const retryable = new Set(retryExitCodes);
  let lastError = null;
  let attemptsUsed = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attemptsUsed = attempt;
    try {
      const value = await execute({ attempt, maxAttempts });
      return { ok: true, attempts: attempt, value };
    } catch (error) {
      lastError = error;
      const canRetry = attempt < maxAttempts && retryable.has(error?.exitCode);
      if (!canRetry) break;
      logger.warn(`Generated task ${name} returned retryable exit ${error.exitCode}; retrying ${attempt + 1}/${maxAttempts} after ${retryDelayMs}ms`);
      await wait(retryDelayMs);
    }
  }

  const failure = failureFrom(name, lastError);
  if (!Array.isArray(failures)) throw lastError;
  failures.push(failure);
  logger.error(`Generated task ${name} failed${failure.exitCode === null ? '' : ` with exit ${failure.exitCode}`}; continuing scheduled refresh`);
  return { ok: false, attempts: attemptsUsed, failure };
}

export function throwIfGeneratedTaskFailures(failures) {
  if (!Array.isArray(failures) || failures.length === 0) return;
  const summary = failures
    .map((failure) => `${failure.name}${failure.exitCode === null ? '' : ` (exit ${failure.exitCode})`}`)
    .join(', ');
  const error = new Error(`Scheduled generated-surface refresh completed with ${failures.length} failed task(s): ${summary}`);
  error.failures = failures;
  throw error;
}
