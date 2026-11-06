const { setTimeout: delay } = require('node:timers/promises');

const retryDelayMs = 20 * 60 * 1000;
const pagesTimeoutMs = 10 * 60 * 1000;

module.exports = async function checkRetry({
  core, github, context, env = process.env, now = Date.now, sleep = delay, verifyArtifact = require('./run.cjs')
}) {
  const readyAt = Number(env.PAGES_READY_AT);
  if (!env.PAGES_ACCEPTED_URL || !Number.isSafeInteger(readyAt) || readyAt <= 0 || now() - readyAt < pagesTimeoutMs) {
    throw new Error('Pages did not reach its ten-minute timeout after accepting the artifact; see the first deployment error');
  }

  async function requireStoppedDeployment() {
    const { data: deployment } = await github.request('GET /repos/{owner}/{repo}/pages/deployments/{pages_deployment_id}', {
      ...context.repo, pages_deployment_id: context.sha
    });
    // Pages can return an empty status after its sync times out and deploy-pages cancels it.
    if (deployment.status !== '' && deployment.status !== 'deployment_cancelled') {
      throw new Error(`Pages returned status ${JSON.stringify(deployment.status)}; withholding a second deployment`);
    }
  }

  await requireStoppedDeployment();
  core.info('Waiting 20 minutes before rechecking the timed-out Pages deployment');
  await sleep(retryDelayMs);
  await requireStoppedDeployment();
  await verifyArtifact({ core });
  const { data: ref } = await github.rest.git.getRef({ ...context.repo, ref: 'heads/main' });
  if (ref.object.sha !== context.sha) throw new Error('Main moved after validation; withholding the obsolete deployment');
  core.warning(`Retrying the timed-out Pages deployment once with artifact ${env.PAGES_ARTIFACT_ID} for ${context.sha}`);
};
