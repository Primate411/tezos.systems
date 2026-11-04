const fs = require('node:fs');
const { createHash } = require('node:crypto');
module.exports = async ({ github, context, core, env = process.env }) => {
  const report = JSON.parse(fs.readFileSync(env.REVIEW_REPORT, 'utf8'));
  const review = report.attempts?.at(-1)?.review;
  const runUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  await core.summary.addHeading(`Release Radar: ${report.status}`).addLink('Source review report', runUrl).write();
  if (report.status === 'not_due') return;
  if (!['review_required', 'reviewed'].includes(report.status)) throw new Error(report.error || 'Release review failed');
  const marker = '<!-- tezos-systems-release-review -->';
  const problems = review?.problems || [];
  if (report.status === 'review_required' && !problems.length) throw new Error('Review required without evidence');
  if (report.status === 'reviewed' && (!report.published || !report.commit || problems.length)) throw new Error('No published successful review');
  const signature = `<!-- signature:${createHash('sha256').update(JSON.stringify(problems)).digest('hex')} -->`;
  const issues = await github.paginate(github.rest.issues.listForRepo, { ...context.repo, state: 'all', per_page: 100 });
  const incident = issues.find(i => !i.pull_request && i.body?.includes(marker));
  if (report.status === 'review_required') {
    core.warning('Release Radar needs substantive source review; last-good evidence clocks were preserved.');
    const body = [marker, signature, 'Canonical source evidence changed or could not be verified.',
      '', '**No review clocks were advanced. The 36-hour freshness limit remains enforced.**',
      `The routine review starts after 12 hours. Review run: ${runUrl}`, '',
      ...problems.map(p => `- ${p.url || 'Review boundary'}: ${p.reason}`), '',
      'Review the complete canonical sources, update the honest Radar receipt and human baseline together, then verify CI and deployment. Do not accept collected fingerprints without reading the sources.'
    ].join('\n');
    const params = { ...context.repo, title: 'Release Radar source review required', body };
    if (!incident) await github.rest.issues.create(params);
    else if (incident.state !== 'open' || !incident.body.includes(signature)) await github.rest.issues.update({ ...params, issue_number: incident.number, state: 'open' });
  } else if (incident?.state === 'open') {
    await github.rest.issues.update({ ...context.repo, issue_number: incident.number, state: 'closed', state_reason: 'completed', body: `${incident.body}\n\nSources verified and renewed receipt committed as ${report.commit} in ${runUrl}. CI and Pages run separately.` });
  }
};
