import path from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';

function artifactSegment(value) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

export async function instrumentBrowserForArtifacts(rawBrowser, { artifactRoot, suiteName, iteration, attempt }) {
  const attemptDirectory = path.join(
    artifactRoot,
    artifactSegment(suiteName),
    `iteration-${iteration}`,
    `attempt-${attempt}`
  );
  await mkdir(attemptDirectory, { recursive: true });
  const contexts = new Map();
  const artifactIssues = [];
  let contextSequence = 0;

  const instrumentContext = async (rawContext) => {
    contextSequence += 1;
    const contextId = `context-${String(contextSequence).padStart(2, '0')}`;
    let finalized = false;
    let tracing = false;
    try {
      await rawContext.tracing.start({ screenshots: true, snapshots: true, sources: true });
      tracing = true;
    } catch (error) {
      artifactIssues.push(`${contextId} trace start: ${error.message}`);
    }

    const finalize = async ({ capturePages = false } = {}) => {
      if (finalized) return;
      finalized = true;
      const pageMetadata = [];
      const pages = capturePages ? rawContext.pages() : [];
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
        const page = pages[pageIndex];
        const pageId = `${contextId}-page-${String(pageIndex + 1).padStart(2, '0')}`;
        pageMetadata.push({ id: pageId, url: page.url(), closed: page.isClosed() });
        if (page.isClosed()) continue;
        try {
          await page.screenshot({
            path: path.join(attemptDirectory, `${pageId}.png`),
            fullPage: false,
            timeout: 5000
          });
        } catch (error) {
          artifactIssues.push(`${pageId} screenshot: ${error.message}`);
        }
        try {
          await writeFile(path.join(attemptDirectory, `${pageId}.html`), await page.content());
        } catch (error) {
          artifactIssues.push(`${pageId} html: ${error.message}`);
        }
      }
      try {
        await writeFile(
          path.join(attemptDirectory, `${contextId}-pages.json`),
          `${JSON.stringify(pageMetadata, null, 2)}\n`
        );
      } catch (error) {
        artifactIssues.push(`${contextId} metadata: ${error.message}`);
      }
      if (tracing) {
        try {
          await rawContext.tracing.stop({ path: path.join(attemptDirectory, `${contextId}-trace.zip`) });
        } catch (error) {
          artifactIssues.push(`${contextId} trace stop: ${error.message}`);
        }
      }
    };

    const contextProxy = new Proxy(rawContext, {
      get(target, property) {
        if (property === 'close') {
          return async (...args) => {
            try {
              await finalize();
            } finally {
              contexts.delete(rawContext);
            }
            return target.close(...args);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
    contexts.set(rawContext, finalize);
    return contextProxy;
  };

  const browserProxy = new Proxy(rawBrowser, {
    get(target, property) {
      if (property === 'newContext') {
        return async (...args) => instrumentContext(await target.newContext(...args));
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });

  return {
    browser: browserProxy,
    async flush({ retain = true } = {}) {
      await Promise.allSettled([...contexts.values()].map((finalize) => finalize({ capturePages: retain })));
      if (!retain) {
        await rm(attemptDirectory, { recursive: true, force: true });
        return;
      }
      if (artifactIssues.length) {
        await writeFile(
          path.join(attemptDirectory, 'artifact-errors.txt'),
          `${artifactIssues.join('\n')}\n`
        );
      }
    }
  };
}

