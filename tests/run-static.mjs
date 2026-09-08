#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STATIC_CHECKS } from './lib/static-test-catalog.mjs';
import { createSmokeLifecycle } from './lib/smoke-lifecycle.mjs';

const args = process.argv.slice(2);
if (args.length && (args.length !== 1 || args[0] !== '--list')) throw new Error('Usage: node tests/run-static.mjs [--list]');
if (args[0] === '--list') {
    for (const entry of STATIC_CHECKS) console.log([entry.script, ...entry.args].join(' '));
} else {
    const lifecycle = createSmokeLifecycle({ logger: message => console.error(message.replaceAll('Smoke run', 'Static run').replace('browser and server', 'test processes')) });
    try {
        for (const entry of STATIC_CHECKS) {
            lifecycle.signal.throwIfAborted();
            await new Promise((resolve, reject) => {
                const child = spawn(process.execPath, [entry.script, ...entry.args], { cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit' });
                const stopTracking = lifecycle.track(() => new Promise(done => {
                    if (child.exitCode !== null || child.signalCode !== null) return done();
                    child.once('exit', done);
                    child.kill('SIGTERM');
                }));
                child.once('error', error => { stopTracking(); reject(error); });
                child.once('exit', (code, signal) => {
                    stopTracking();
                    if (lifecycle.signal.aborted) reject(lifecycle.signal.reason);
                    else if (code === 0) resolve();
                    else reject(Object.assign(new Error(`${entry.script} failed (${signal || code})`), { exitCode: code || 1 }));
                });
            });
        }
    } catch (error) {
        console.error(error.message);
        process.exitCode = error.exitCode || 1;
    } finally {
        await lifecycle.close();
        lifecycle.dispose();
    }
}
