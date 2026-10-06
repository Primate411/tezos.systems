import { SCHEDULED_REFRESH_LANES } from './scheduled-refresh-lanes.mjs';

const HOUR = 3_600_000;
export const GENERATED_WORKFLOW = 'refresh-governance-surfaces.yml';
export const HISTORY_WORKFLOW = 'collect-chamber-history.yml';
const recoveryTitle = /^Recover generated data (\d+) attempt ([12])$/;
const isWorkflow = (run, name) => run.path === `.github/workflows/${name}`;
const started = run => Date.parse(run.created_at);
const completed = run => Date.parse(run.updated_at);
const active = runs => runs.some(run => run.status !== 'completed');

// Reports are evidence, never executable instructions. Fail closed on truncated,
// unknown, inconsistent or fatal reports; validation failures never qualify.
export function temporaryFailedLanes(report) {
  if (report?.schemaVersion !== 1 || report.fatal || !Array.isArray(report.lanes) || !report.lanes.length) return [];
  const ids = new Set();
  const counts = { total: report.lanes.length, succeeded: 0, failed: 0, skipped: 0, attempted: 0 };
  for (const lane of report.lanes) {
    if (!lane || typeof lane !== 'object' || ids.has(lane.id) || !SCHEDULED_REFRESH_LANES.some(item => item.id === lane.id)
      || !['succeeded', 'failed', 'skipped'].includes(lane.status)) return [];
    ids.add(lane.id);
    counts[lane.status]++;
    if (lane.status !== 'skipped') counts.attempted++;
  }
  if (Object.entries(counts).some(([key, value]) => report.summary?.[key] !== value) || counts.skipped) return [];
  return report.lanes.filter(lane => lane.status === 'failed' && lane.transient === true
    && Array.isArray(lane.attempts) && lane.attempts.at(-1)?.transient === true
    && SCHEDULED_REFRESH_LANES.find(item => item.id === lane.id)?.retryTransient === true).map(lane => lane.id);
}

export function planActionsRecovery({ runs, reports = {}, history = [], now = Date.now(), repository }) {
  const trusted = runs.filter(run => run.head_branch === 'main' && run.head_repository?.full_name === repository
    && ['schedule', 'workflow_dispatch', 'push'].includes(run.event))
    .sort((a, b) => started(b) - started(a) || b.id - a.id);
  const actions = [];
  const notes = [];
  const generated = trusted.filter(run => isWorkflow(run, GENERATED_WORKFLOW));
  const root = generated.find(run => !recoveryTitle.test(run.display_title || ''));
  if (!active(generated)) {
    if (!root || now - started(root) >= 8 * HOUR) {
      actions.push({ workflow: GENERATED_WORKFLOW, inputs: {}, reason: 'Full generated refresh has not started within eight hours' });
    } else if (root.conclusion === 'failure') {
      const recoveries = generated.filter(run => recoveryTitle.exec(run.display_title || '')?.[1] === String(root.id));
      const previous = recoveries[0] || root;
      const attempt = recoveries.reduce((max, run) => Math.max(max, Number(recoveryTitle.exec(run.display_title)[2])), 0);
      const lanes = temporaryFailedLanes(reports[previous.id]);
      if (previous.conclusion === 'failure' && lanes.length && attempt < 2) {
        const delay = (attempt === 0 ? 0.5 : 1) * HOUR;
        if (now - completed(previous) >= delay) {
          actions.push({ workflow: GENERATED_WORKFLOW, inputs: {
            lanes: lanes.join(','), recovery_of: String(root.id), recovery_attempt: String(attempt + 1)
          }, reason: `Recover only temporary source failures from run ${root.id}, attempt ${attempt + 1}/2` });
        } else notes.push('Temporary source recovery is cooling down');
      } else if (previous.conclusion !== 'success') notes.push('Generated failure requires investigation or has exhausted its two recovery attempts');
    }
  } else notes.push('Generated refresh already queued or running');

  const collectors = trusted.filter(run => isWorkflow(run, HISTORY_WORKFLOW));
  const age = stamp => now - Date.parse(stamp);
  // Two hours leaves recovery headroom before the existing five-hour alarm.
  // Unknown clocks do not authorize a write; the independent audit reports them.
  const overdue = history.filter(item => Number.isFinite(age(item.timestamp)) && age(item.timestamp) >= 2 * HOUR);
  if (overdue.length && !active(collectors) && (!collectors[0] || now - completed(collectors[0]) >= 0.5 * HOUR)) {
    actions.push({ workflow: HISTORY_WORKFLOW, inputs: {}, reason: `History catch-up due: ${overdue.map(item => item.table).join(', ')}` });
  }
  return { checkedAt: new Date(now).toISOString(), actions, notes };
}
