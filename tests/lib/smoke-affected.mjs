import {
  GLOBAL_SMOKE_PATTERNS,
  NO_BROWSER_IMPACT_PATTERNS
} from './smoke-metadata.mjs';

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

export function smokeGlobMatches(pattern, file) {
  const source = String(pattern)
    .split('**')
    .map((part) => escapeRegExp(part).replaceAll('*', '[^/]*'))
    .join('.*');
  return new RegExp(`^${source}$`).test(String(file).replace(/^\.\//, ''));
}

function matchesAny(file, patterns) {
  return patterns.some((pattern) => smokeGlobMatches(pattern, file));
}

export function selectAffectedSmokeSuites(catalog, changedFiles, {
  globalPatterns = GLOBAL_SMOKE_PATTERNS,
  ignoredPatterns = NO_BROWSER_IMPACT_PATTERNS
} = {}) {
  const files = [...new Set(changedFiles.map((file) => String(file).trim().replace(/^\.\//, '')).filter(Boolean))];
  const relevantFiles = files.filter((file) => !matchesAny(file, ignoredPatterns));
  if (!relevantFiles.length) {
    return { mode: 'none', reason: 'Only documentation or ignored files changed.', suites: [], changedFiles: files };
  }

  const globalFile = relevantFiles.find((file) => matchesAny(file, globalPatterns));
  if (globalFile) {
    return {
      mode: 'full',
      reason: `${globalFile} is shared harness or runtime infrastructure.`,
      suites: [...catalog],
      changedFiles: files
    };
  }

  const selectedNames = new Set();
  for (const file of relevantFiles) {
    const matched = catalog.filter((suite) => matchesAny(file, suite.files || []));
    if (!matched.length) {
      return {
        mode: 'full',
        reason: `${file} is not mapped to a bounded smoke owner.`,
        suites: [...catalog],
        changedFiles: files
      };
    }
    for (const suite of matched) selectedNames.add(suite.name);
  }

  return {
    mode: 'affected',
    reason: `${selectedNames.size} suite(s) own ${relevantFiles.length} changed file(s).`,
    suites: catalog.filter((suite) => selectedNames.has(suite.name)),
    changedFiles: files
  };
}
