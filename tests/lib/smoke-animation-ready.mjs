// A paused animation has no completion deadline. Poll only the tested surface
// and never await document-wide Animation.finished promises through CDP.
export async function waitForSettledAnimations(page, selector, { timeout = 5000 } = {}) {
  await page.waitForFunction(selector => {
    const roots = [...document.querySelectorAll(selector)];
    return roots.length > 0 && roots.every(root => root.getAnimations({ subtree: true }).every(animation => (
      animation.effect?.getComputedTiming().iterations === Infinity
      || (!animation.pending && animation.playState !== 'running')
    )));
  }, selector, { timeout, polling: 50 });
}
