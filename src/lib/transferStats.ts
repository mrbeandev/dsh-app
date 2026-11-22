/**
 * Download speed and ETA, smoothed over a sliding window of recent samples so the numbers don't jump
 * with every 2 MB chunk. Pure and clock-injectable for tests.
 */
export type TransferStats = { done: number; total: number; remaining: number; bytesPerSec: number | null; etaSec: number | null };

export function createTransferMeter(windowMs = 5000, now: () => number = Date.now) {
  const samples: { t: number; done: number }[] = [];
  return (done: number, total: number): TransferStats => {
    const t = now();
    samples.push({ t, done });
    while (samples.length > 2 && t - samples[0].t > windowMs) samples.shift();
    const first = samples[0];
    const dt = (t - first.t) / 1000;
    const bytesPerSec = dt >= 0.5 && done > first.done ? (done - first.done) / dt : null;
    const remaining = Math.max(0, total - done);
    return { done, total, remaining, bytesPerSec, etaSec: bytesPerSec ? Math.ceil(remaining / bytesPerSec) : null };
  };
}

/** "1 min 05 s", "42 s", "2 h 03 min". */
export function formatEta(sec: number): string {
  if (sec < 60) return `${sec} s`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min ${String(sec % 60).padStart(2, '0')} s`;
  return `${Math.floor(sec / 3600)} h ${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')} min`;
}
