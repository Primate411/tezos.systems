#!/usr/bin/env node
/** Read-only, informational Knip evidence. Findings never authorize deletion. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const CATEGORIES = ['binaries', 'catalog', 'dependencies', 'devDependencies', 'duplicates', 'enumMembers', 'exports', 'files', 'namespaceMembers', 'nsExports', 'nsTypes', 'optionalPeerDependencies', 'types', 'unlisted', 'unresolved'];
const LIMITATIONS = [
  'This combines runtime, generator, and test reachability; a test-only reference can retain an otherwise unused runtime export.',
  'An unused export may still be used inside its own module; it is not evidence that its function or value can be deleted.',
  'Static analysis cannot prove every computed import, global API, or external consumer. Review findings against runtime behavior before cleanup.',
  'Indirect namespace access can retain extra exports or hide real consumers; new dispatch patterns need review. Knip also excludes exports of actual CLI entry files by default; catalog-only chambers stay ordinary analyzed modules.',
  'This report makes no unused CSS, image, or data-file deletion claims.',
  'No source is automatically removed or fixed. Findings are informational and are not CI blockers; analyzer or report failures remain errors.'
];

function execute(command, args, options) {
  return new Promise(resolve => {
    execFile(command, args, { encoding: 'utf8', ...options }, (error, stdout, stderr) => resolve({ error, stdout: stdout || '', stderr: stderr || '' }));
  });
}

async function gitMetadata(root) {
  const options = { cwd: root, timeout: 5_000, maxBuffer: 1024 * 1024 };
  const head = await execute('git', ['rev-parse', 'HEAD'], options);
  if (head.error || !/^[a-f\d]{40,64}$/i.test(head.stdout.trim())) return null;
  const status = await execute('git', ['status', '--porcelain=v1', '--untracked-files=normal'], options);
  return { commit: head.stdout.trim(), dirty: status.error ? null : Boolean(status.stdout.trim()) };
}

async function knipVersion(root, knipCli) {
  for (const candidate of [path.resolve(path.dirname(knipCli), '../package.json'), path.join(root, 'node_modules/knip/package.json')]) {
    try {
      const manifest = JSON.parse(await fs.readFile(candidate, 'utf8'));
      if (manifest.name === 'knip' && typeof manifest.version === 'string') return manifest.version;
    } catch { /* Optional metadata must not hide the analyzer result. */ }
  }
  return null;
}

function validateResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result) || !Array.isArray(result.issues)) throw new Error('Knip JSON must contain an issues array');
  for (const row of result.issues) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.file !== 'string' || !row.file.trim()) throw new Error('Each Knip issue row must contain a nonempty file string');
    if (!CATEGORIES.some(category => Object.hasOwn(row, category))) throw new Error('Each Knip issue row must contain an issue-category array');
    for (const [category, entries] of Object.entries(row)) {
      if (category === 'file') continue;
      if (category !== 'owners' && !CATEGORIES.includes(category)) throw new Error(`Unknown Knip issue category: ${category}`);
      if (!Array.isArray(entries)) throw new Error(`Knip issue category ${category} must be an array`);
    }
  }
  return result.issues;
}

const markdown = value => String(value).replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ');

function renderReport(report) {
  const lines = [
    '# Unused-code audit', '',
    `Status: **${report.status}**. Knip findings are informational.`, '',
    `Analyzed commit: ${report.git?.commit || 'unavailable'}; working tree: ${report.git?.dirty === null || !report.git ? 'unknown' : report.git.dirty ? 'modified' : 'clean'}.`,
    `Knip: ${report.tool.version || 'unknown'}; completed: ${report.completedAt || 'not completed'}.`, ''
  ];
  if (report.error) lines.push(`Audit failure: ${markdown(report.error.message)}`, '');
  if (report.status === 'completed') {
    lines.push(`Total findings: **${report.totalFindings}**.`, '', '| Category | Count |', '| --- | ---: |');
    for (const [category, count] of Object.entries(report.counts)) lines.push(`| ${category} | ${count} |`);
    lines.push('', '## Findings', '');
    if (!report.totalFindings) lines.push('No findings in the configured analysis scope.');
    else {
      lines.push('| File | Category | Candidate |', '| --- | --- | --- |');
      for (const row of report.issues) {
        for (const category of CATEGORIES) {
          for (const entry of row[category] || []) {
            const detail = typeof entry === 'string' ? entry : JSON.stringify(entry);
            lines.push(`| ${markdown(row.file)} | ${category} | ${markdown(detail)} |`);
          }
        }
      }
    }
    lines.push('');
  }
  lines.push('## Interpretation', '', ...report.limitations.map(item => `- ${item}`), '', 'Raw analyzer output: `knip.stdout.txt` and `knip.stderr.txt`.', '');
  return lines.join('\n');
}

async function writeReport(outputDir, report) {
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, 'report.md'), renderReport(report));
}

export async function runUnusedCodeAudit({ root = ROOT, outputDir, knipCli } = {}) {
  root = path.resolve(root);
  outputDir = path.resolve(root, outputDir || 'test-artifacts/unused-code');
  knipCli = path.resolve(root, knipCli || 'node_modules/knip/bin/knip.js');
  const args = [knipCli, '--config', 'knip.config.js', '--no-progress', '--no-exit-code', '--reporter', 'json'];
  const report = {
    schemaVersion: 1, status: 'failed', informational: true,
    startedAt: new Date().toISOString(), completedAt: null,
    tool: { name: 'knip', version: await knipVersion(root, knipCli) },
    git: await gitMetadata(root),
    command: { args, exitCode: null, signal: null, timedOut: false },
    counts: Object.fromEntries(CATEGORIES.map(category => [category, 0])),
    totalFindings: 0, issues: [], limitations: [...LIMITATIONS],
    error: { message: 'Audit did not complete', code: 'INCOMPLETE' }
  };
  await fs.mkdir(outputDir, { recursive: true });
  // An interrupted attempt must never leave a previous successful report in place.
  await writeReport(outputDir, report);
  await Promise.all(['knip.stdout.txt', 'knip.stderr.txt'].map(file => fs.writeFile(path.join(outputDir, file), '')));
  const result = await execute(process.execPath, args, { cwd: root, timeout: 180_000, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024 });
  report.command.exitCode = result.error ? (Number.isInteger(result.error.code) ? result.error.code : null) : 0;
  report.command.signal = result.error?.signal || null;
  report.command.timedOut = Boolean(result.error?.killed && result.error?.signal === 'SIGKILL' && result.error?.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER');
  await Promise.all([
    fs.writeFile(path.join(outputDir, 'knip.stdout.txt'), result.stdout),
    fs.writeFile(path.join(outputDir, 'knip.stderr.txt'), result.stderr)
  ]);
  try {
    if (result.error) throw result.error;
    report.issues = validateResult(JSON.parse(result.stdout));
    for (const row of report.issues) {
      for (const category of CATEGORIES) report.counts[category] += row[category]?.length || 0;
    }
    report.totalFindings = Object.values(report.counts).reduce((sum, count) => sum + count, 0);
    report.status = 'completed';
    report.error = null;
  } catch (error) {
    report.error = { message: String(error.message || error), code: error.code || 'INVALID_REPORT' };
  }
  report.completedAt = new Date().toISOString();
  await writeReport(outputDir, report);
  return report;
}

function cliOptions(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  if (!args.length) return {};
  if (args.length === 2 && args[0] === '--output-dir' && args[1] && !args[1].startsWith('--')) return { outputDir: args[1] };
  throw new Error('Usage: node scripts/audit-unused-code.mjs [--output-dir <path>]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = cliOptions(process.argv.slice(2));
    if (options.help) console.log('Usage: node scripts/audit-unused-code.mjs [--output-dir <path>]\nRuns a read-only informational Knip audit. Findings exit 0; analyzer failures exit 1.');
    else {
      const report = await runUnusedCodeAudit(options);
      console.log(report.status === 'completed'
        ? `Unused-code audit: ${report.totalFindings} informational findings. See ${path.resolve(ROOT, options.outputDir || 'test-artifacts/unused-code')}/report.md`
        : `Unused-code audit failed: ${report.error.message}`);
      process.exitCode = report.status === 'completed' ? 0 : 1;
    }
  } catch (error) {
    console.error(String(error.message || error));
    process.exitCode = 1;
  }
}
