import assert from 'node:assert/strict';

export async function assertSerializationUpgrade(browser, baseUrl, installFeatureMocks) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await installFeatureMocks(context);
    // Model a long-lived tab that imported the pre-serializer module before
    // deployment, then opens another Chamber after the new files are served.
    await context.route('**/js/core/sha256.js', route => route.fulfill({
      contentType: 'application/javascript',
      body: 'export async function sha256Text() { return "legacy-module"; }'
    }));
    const page = await context.newPage();
    await page.goto(`${baseUrl}/offline.html`, { waitUntil: 'domcontentloaded' });
    const receipt = await page.evaluate(async () => {
      const legacy = await import('/js/core/sha256.js');
      const names = ['capital-chamber', 'minerals-chamber', 'metals-chamber', 'uranium-chamber', 'ecosystem-chamber', 'maxis', 'leaderboard'];
      for (const name of names) await import(`/js/features/${name}.js`);
      const current = await import('/js/core/sha256.js?serialization=1');
      return { loaded: names.length, legacy: await legacy.sha256Text('abc'), current: await current.sha256Text('abc'), serialized: JSON.stringify(current.stableJsonValue({ z: 2, a: 1 })) };
    });
    assert.deepEqual(receipt, {
      loaded: 7, legacy: 'legacy-module',
      current: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      serialized: '{"a":1,"z":2}'
    });
  } finally { await context.close(); }
}
