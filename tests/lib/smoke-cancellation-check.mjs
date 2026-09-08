import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

async function waitFor(check, label, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(20);
  }
  throw new Error(`timed out waiting for ${label}`);
}

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

export async function checkSmokeProcessCancellation() {
  // The supported CI and developer runners are Linux/macOS. This exercises
  // real signals and descendant cleanup without requiring a browser install.
  if (process.platform === 'win32') return;
  for (const signalName of ['SIGTERM', 'SIGINT']) {
    for (const hungCleanup of [false, true]) {
      const fixture = `
        import { spawn } from 'node:child_process';
        import { once } from 'node:events';
        import { createSmokeLifecycle } from ${JSON.stringify(new URL('./smoke-lifecycle.mjs', import.meta.url).href)};
        const lifecycle = createSmokeLifecycle({ shutdownTimeoutMs: 300 });
        const grandchildSource = 'process.on("SIGTERM",()=>{});process.on("SIGINT",()=>{});process.send(process.pid);setInterval(()=>{},1000)';
        const childSource = 'const {spawn}=require("node:child_process"); const child=spawn(process.execPath,["-e",'+JSON.stringify(grandchildSource)+'],{stdio:["ignore","ignore","ignore","ipc"]});child.on("message",pid=>process.send({child:process.pid,grandchild:pid}));process.on("SIGTERM",()=>process.exit(0));setInterval(()=>{},1000)';
        const browser = spawn(process.execPath, ['-e', childSource], {stdio:['ignore','ignore','ignore','ipc']});
        const server = spawn(process.execPath, ['-e', 'process.send(process.pid);setInterval(()=>{},1000)'], {stdio:['ignore','ignore','ignore','ipc']});
        lifecycle.track(${hungCleanup ? '() => new Promise(() => {})' : 'async () => { const done=once(browser,"exit");browser.kill();await done; }'});
        lifecycle.track(async () => {const done=once(server,'exit');server.kill();await done;});
        const [browserPids] = await once(browser,'message');
        const [serverPid] = await once(server,'message');
        process.send({...browserPids,server:serverPid});
        await new Promise(resolve => lifecycle.signal.addEventListener('abort',resolve,{once:true}));
        await lifecycle.close();
        lifecycle.dispose();
        process.exit(lifecycle.signal.reason.exitCode);
      `;
      const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
      const runner = spawn(process.execPath, ['--input-type=module', '-e', fixture], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      let output = '';
      runner.stdout.on('data', chunk => { output += chunk; });
      runner.stderr.on('data', chunk => { output += chunk; });
      let pids;
      try {
        const started = once(runner, 'message');
        const exited = once(runner, 'exit');
        [pids] = await Promise.race([started, delay(5000).then(() => { throw new Error(`fixture did not start: ${output}`); })]);
        runner.kill(signalName);
        const [code, signal] = await Promise.race([exited, delay(5000).then(() => { throw new Error(`fixture did not stop: ${output}`); })]);
        assert.equal(signal, null, output);
        assert.equal(code, signalName === 'SIGINT' ? 130 : 143, output);
        await waitFor(() => Object.values(pids).every(pid => !alive(pid)), 'owned browser, descendant, and server to exit');
        assert(alive(unrelated.pid), 'cancellation must leave unrelated processes alone');
      } finally {
        for (const pid of [runner.pid, ...Object.values(pids || {}), unrelated.pid]) {
          try { process.kill(pid, 'SIGKILL'); } catch {}
        }
      }
    }
  }
  console.log('ok - SIGINT/SIGTERM close owned processes, force hung cleanup, preserve unrelated processes, and retain signal exit codes');
}
