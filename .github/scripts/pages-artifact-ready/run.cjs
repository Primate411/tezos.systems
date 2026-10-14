const { DefaultArtifactClient } = require('@actions/artifact');
const { waitForPagesArtifact } = require('./index.cjs');

module.exports = async ({ core }) => {
  const client = new DefaultArtifactClient();
  return waitForPagesArtifact({
    listArtifacts: () => client.listArtifacts(),
    expectedId: process.env.PAGES_ARTIFACT_ID,
    log: message => core.info(message)
  });
};
