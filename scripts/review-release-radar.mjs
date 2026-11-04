#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { reviewSources } from './lib/release-radar-review.mjs';
export async function runReview({ root = process.cwd(), reportPath, apply = false, force = false, collect = false, fetcher, now } = {}) {
  const file = path.join(root, 'data/release-radar.json');
  const receipt = JSON.parse(await fs.readFile(file, 'utf8'));
  const baseline = collect ? null : JSON.parse(await fs.readFile(path.join(root, 'data/release-radar-review.json'), 'utf8'));
  const result = await reviewSources({ receipt, baseline, force, collect, fetcher, now });
  await fs.writeFile(reportPath, `${JSON.stringify(result.report, null, 2)}\n`);
  if (apply && result.report.status === 'reviewed') {
    const text = `${JSON.stringify(result.receipt)}\n`;
    if (Buffer.byteLength(text) > 20 * 1024) throw new Error('Renewed Radar exceeds startup allowance');
    await fs.writeFile(`${file}.tmp`, text);await fs.rename(`${file}.tmp`, file);
  }
  return result.report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);const reportPath = args[args.indexOf('--report') + 1];
  if (!args.includes('--report') || !reportPath) throw new Error('--report is required');
  runReview({ reportPath: path.resolve(reportPath), apply: args.includes('--apply'), force: args.includes('--force-review'), collect: args.includes('--collect') })
    .then(r => console.log(JSON.stringify({ status: r.status, sources: r.sources.length, problems: r.problems })))
    .catch(e => { console.error(e);process.exitCode = 1; });
}
