import { setTimeout as delay } from 'node:timers/promises';
import { GENERATED_WORKFLOW } from './actions-recovery.mjs';

export function isTemporaryGitHubError(error) {
  const text = `${error?.message || ''} ${error?.stderr || ''}`;
  return /HTTP (?:408|429|500|502|503|504)\b|\b(?:ETIMEDOUT|ECONNRESET|EAI_AGAIN)\b|TLS handshake timeout|connection reset by peer/i.test(text)
    || ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(error?.code);
}

// Read retries are safe. Writes require a fresh receipt check first: a 5xx
// response can arrive after GitHub has already accepted the dispatch.
export async function retryGitHubRead(operation, { sleep = delay } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (!isTemporaryGitHubError(error) || attempt === 2) throw error;
      await sleep([2000, 5000][attempt]);
    }
  }
}

export function findAcceptedDispatch({ runs, action, repository, knownRunIds, startedAt }) {
  const title = action.inputs.recovery_of
    ? `Recover generated data ${action.inputs.recovery_of} attempt ${action.inputs.recovery_attempt}`
    : action.workflow === GENERATED_WORKFLOW ? 'Refresh generated data (all)' : null;
  return runs.find(run => !knownRunIds.has(String(run.id))
    && run.path === `.github/workflows/${action.workflow}`
    && run.head_repository?.full_name === repository && run.head_branch === 'main'
    && run.event === 'workflow_dispatch'
    && Date.parse(run.created_at) >= startedAt - 1000
    && (!title || run.display_title === title));
}

export async function dispatchRecoveryWorkflow({ action, repository, knownRunIds,
  dispatch, listRuns, sleep = delay, now = Date.now }) {
  const startedAt = now();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await dispatch();
      return { result: 'dispatched', dispatchAttempts: attempt + 1 };
    } catch (error) {
      if (!isTemporaryGitHubError(error)) throw error;
      await sleep([5000, 15000, 30000][attempt]);
      // If confirmation cannot be read, fail closed rather than blindly repeat
      // an ambiguous write. The next supervisor can reconcile the run normally.
      const runs = await listRuns();
      const accepted = findAcceptedDispatch({ runs, action, repository, knownRunIds, startedAt });
      if (accepted) return { result: 'confirmed after temporary GitHub response', runId: accepted.id, dispatchAttempts: attempt + 1 };
      if (runs.length >= 100 && runs.every(run => Date.parse(run.created_at) >= startedAt - 1000)) {
        throw new Error('Dispatch confirmation inventory is incomplete; ambiguous write was not repeated');
      }
      if (attempt === 2) throw error;
    }
  }
}
