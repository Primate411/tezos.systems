// Analysis only: these adapters never change the code served to browsers.
module.exports = async () => (await import('./scripts/lib/knip-config.mjs')).createKnipConfig();
