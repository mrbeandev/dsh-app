import { DshLocal } from '../../modules/dsh-local';
import { taskResult } from './localHarness';

/**
 * Run a long setup script (Harness install/update) in the native foreground service and wait for
 * it, reporting the last output lines. The work keeps going if the app is backgrounded or killed;
 * calling this again while it runs just resumes waiting on the same task.
 */
export async function runLocalTask(script: string, onLines: (lines: string[]) => void, timeoutMs = 60 * 60 * 1000): Promise<{ ok: boolean; tail: string[] }> {
  if (!DshLocal) throw new Error('Not available on this device.');
  if (!DshLocal.taskRunning()) DshLocal.startTask(script);
  const deadline = Date.now() + timeoutMs;
  // Give the service a moment to truncate the previous log.
  await new Promise(r => setTimeout(r, 1500));
  while (Date.now() < deadline) {
    const r = taskResult(DshLocal.readTaskLog(32_000));
    onLines(r.tail.slice(-6));
    if (r.done) return { ok: r.ok, tail: r.tail };
    await new Promise(res => setTimeout(res, 2000));
  }
  throw new Error('Setup took too long. It may still be running; check Settings › Local Harness › Logs.');
}
