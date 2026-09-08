import { execFileSync } from 'node:child_process';

export class SmokeCancelledError extends Error {
  constructor(signalName) {
    super(`Smoke run cancelled by ${signalName}`);
    this.name = 'SmokeCancelledError';
    this.signalName = signalName;
    this.exitCode = signalName === 'SIGINT' ? 130 : 143;
  }
}

function processTable() {
  if (process.platform === 'win32') return [];
  return execFileSync('ps', ['-A', '-o', 'pid=,ppid=,lstart='], { encoding: 'utf8' })
    .trim().split('\n').map(line => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
      return match ? { pid: Number(match[1]), parent: Number(match[2]), started: match[3] } : null;
    }).filter(Boolean);
}

function descendantsOf(pid, table) {
  const children = table.filter(entry => entry.parent === pid);
  return children.flatMap(child => [...descendantsOf(child.pid, table), child]);
}

/** Own only this invocation's resources; never signal an existing preview. */
export function createSmokeLifecycle({ shutdownTimeoutMs = 5000, logger = console.error } = {}) {
  const controller = new AbortController();
  const resources = new Set();
  const descendants = new Map();
  let deadline;

  const captureDescendants = () => {
    try {
      for (const entry of descendantsOf(process.pid, processTable())) descendants.set(entry.pid, entry);
    } catch (error) {
      logger(`warn - smoke descendant discovery failed: ${error.message}`);
    }
  };
  const killRemainingDescendants = () => {
    captureDescendants();
    let current;
    try { current = new Map(processTable().map(entry => [entry.pid, entry])); }
    catch { return; }
    for (const entry of descendants.values()) {
      // Retain descendants discovered before their parent exited, but guard
      // against targeting a PID reused for an unrelated process during cleanup.
      if (current.get(entry.pid)?.started !== entry.started) continue;
      try { process.kill(entry.pid, 'SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') logger(`warn - smoke cleanup ${entry.pid}: ${error.message}`); }
    }
  };
  const close = async () => {
    await Promise.allSettled([...resources].map(resource => resource.stop()));
    if (controller.signal.aborted) killRemainingDescendants();
  };
  const cancel = signalName => {
    if (controller.signal.aborted) return;
    const reason = new SmokeCancelledError(signalName);
    captureDescendants();
    controller.abort(reason);
    logger(`cancel - ${reason.message}; closing this run's browser and server`);
    deadline = setTimeout(() => {
      killRemainingDescendants();
      process.exit(reason.exitCode);
    }, shutdownTimeoutMs);
    void close();
  };
  const handlers = new Map(['SIGINT', 'SIGTERM'].map(name => [name, () => cancel(name)]));
  for (const [name, handler] of handlers) process.on(name, handler);

  return {
    signal: controller.signal,
    track(stop) {
      let stopping;
      const resource = { stop: () => stopping ||= Promise.resolve().then(stop).finally(() => resources.delete(resource)) };
      resources.add(resource);
      if (controller.signal.aborted) void resource.stop().catch(() => {});
      return () => resources.delete(resource);
    },
    close,
    dispose() {
      clearTimeout(deadline);
      for (const [name, handler] of handlers) process.removeListener(name, handler);
    }
  };
}
