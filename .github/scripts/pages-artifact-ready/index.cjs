const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitForPagesArtifact({ listArtifacts, expectedId, artifactName = 'github-pages', attempts = 12, delayMs = 5000, sleep = delay, log = () => {} }) {
  if (!/^\d+$/.test(String(expectedId || '')) || Number(expectedId) <= 0) {
    throw new Error('Pages upload did not return a valid artifact ID');
  }
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 12 || delayMs < 0 || delayMs > 5000) {
    throw new Error('Pages artifact readiness must stay bounded');
  }
  let lastState = 'not listed';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { artifacts } = await listArtifacts();
    if (!Array.isArray(artifacts)) throw new Error('Artifact service returned an invalid listing');
    const matching = artifacts.filter(artifact => artifact.name === artifactName);
    if (matching.length > 1) throw new Error(`Multiple ${artifactName} artifacts would make Pages deployment ambiguous`);
    const artifact = matching[0];
    if (artifact && String(artifact.id) === String(expectedId)) {
      if (!Number.isFinite(artifact.size) || artifact.size <= 0) throw new Error('Pages artifact has no verified content');
      log(`Pages artifact ${artifact.id} is visible to the deployment client (${artifact.size} bytes; attempt ${attempt}/${attempts})`);
      return artifact;
    }
    lastState = artifact ? `listing has a different artifact ID (${artifact.id})` : 'not listed';
    if (attempt < attempts) {
      log(`Waiting for Pages artifact ${expectedId}: ${lastState} (${attempt}/${attempts})`);
      await sleep(delayMs);
    }
  }
  throw new Error(`Pages artifact ${expectedId} is not ready after ${attempts} checks: ${lastState}`);
}

module.exports = { waitForPagesArtifact };
