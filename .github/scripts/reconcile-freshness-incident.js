// Keep one incident with failure and recovery receipts; updates need no bot comments.
module.exports = async function reconcileFreshnessIncident({ github, context, core, env = process.env, readLogOverride }) {
  const fs = require('node:fs');
  const crypto = require('node:crypto');
  const marker = '<!-- tezos-systems-generated-freshness-incident -->';
  const readLog = readLogOverride || ((file) => {
    try {
      return fs.readFileSync(file, 'utf8');
    } catch {
      return '';
    }
  });
  const noteworthy = (text) => text
    .split(/\r?\n/)
    .filter((line) => /^(?:stale|fail) -|freshness failed|Error:/i.test(line.trim()))
    .slice(-24);
  const generated = noteworthy(readLog(env.GENERATED_LOG));
  const history = noteworthy(readLog(env.HISTORY_LOG));
  const failed = env.GENERATED_OUTCOME !== 'success'
    || env.HISTORY_OUTCOME !== 'success';
  const details = [
    ...(env.GENERATED_OUTCOME !== 'success' ? generated : []),
    ...(env.HISTORY_OUTCOME !== 'success' ? history : [])
  ];
  const failureKeys = details.map((line) => {
    const contract = line.trim().match(/^(?:stale|fail) - ([^:]+):/i);
    if (contract) return contract[1];
    if (/^Error:/i.test(line.trim())) return 'error';
    return line.trim().replace(/\d+(?:\.\d+)?/g, '#');
  });
  const signature = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      generated: env.GENERATED_OUTCOME,
      history: env.HISTORY_OUTCOME,
      failureKeys: [...new Set(failureKeys)].sort()
    }))
    .digest('hex')
    .slice(0, 16);
  const signatureMarker = `<!-- freshness-signature:${signature} -->`;
  const runUrl = `${env.GITHUB_SERVER_URL}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  const body = [
    marker,
    signatureMarker,
    '# Generated freshness incident',
    '',
    'The read-only audit found stale or unavailable published data.',
    '',
    `- Commit: \`${env.CHECKED_OUT_SHA || context.sha}\``,
    `- Workflow run: ${runUrl}`,
    `- Generated artifacts: **${env.GENERATED_OUTCOME}**`,
    `- Historical ledgers: **${env.HISTORY_OUTCOME}**`,
    '',
    '```text',
    ...(details.length ? details : ['The failed check did not emit a recognized freshness detail.']),
    '```',
    '',
    'This issue is updated only when the failure signature changes and closes after a successful delivery passes both freshness checks.'
  ].join('\n');

  const { data: issues } = await github.rest.issues.listForRepo({
    owner: context.repo.owner,
    repo: context.repo.repo,
    state: 'all',
    sort: 'updated',
    direction: 'desc',
    per_page: 100
  });
  const incident = issues.find((issue) => !issue.pull_request && issue.body?.includes(marker));

  if (failed) {
    core.warning(details.join('\n') || 'A freshness check failed without a recognized detail.');
    await core.summary
      .addHeading('Generated freshness incident')
      .addLink('Open this workflow run', runUrl)
      .addCodeBlock(details.join('\n') || 'No recognized freshness detail', 'text')
      .write();
    if (!incident) {
      await github.rest.issues.create({
        owner: context.repo.owner,
        repo: context.repo.repo,
        title: 'Generated freshness incident',
        body
      });
    } else if (incident.state !== 'open') {
      await github.rest.issues.update({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: incident.number,
        state: 'open',
        body
      });
    } else if (!incident.body?.includes(signatureMarker)) {
      await github.rest.issues.update({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: incident.number,
        body
      });
    } else {
      core.info(`Existing incident #${incident.number} already represents this failure.`);
    }
  } else {
    await core.summary
      .addHeading('Generated freshness healthy')
      .addLink('Open this workflow run', runUrl)
      .write();
    if (incident?.state === 'open') {
      await github.rest.issues.update({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: incident.number,
        state: 'closed',
        state_reason: 'completed',
        body: `${incident.body}\n\n## Recovered\nBoth generated artifacts and historical ledgers passed in ${runUrl}.`
      });
    }
  }
};
