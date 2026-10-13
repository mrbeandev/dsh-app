/**
 * Readable session statistics from the Harness `session/projections` values — the same
 * numbers the DSH web UI shows in its token-usage, context and session-statistics popovers.
 */
export type TokenUsage = { uncachedInputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number };
export type ContextPressure = { pressureTokens?: number; projectedTokens?: number; contextWindow?: number };
export type ContextBreakdown = { systemTokens?: number; toolsTokens?: number; messageTokens?: number };
export type SessionStatsValue = { turns?: number; steps?: number; llmMs?: number; toolMs?: number; ttftMs?: number; ttftSteps?: number; decodeMs?: number; decodeTokens?: number };

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** 261542959 → "261,542,959". */
export const grouped = (v: number) => Math.round(v).toLocaleString('en-US');

/** 261542959 → "262M", 409123 → "409K", 1448 → "1.4K", 12 → "12". */
export function compact(v: number) {
  const a = Math.abs(v);
  if (a >= 1e9) return `${+(v / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${+(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${+(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  return String(Math.round(v));
}

/** 13778000 ms → "229m38s"; 9800 → "9.8s"; 450 → "0.45s". Matches the web UI's duration format. */
export function duration(ms: number) {
  if (ms < 1000) return `${+(ms / 1000).toFixed(2)}s`;
  if (ms < 60000) return `${+(ms / 1000).toFixed(1)}s`;
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60;
  return h >= 10 ? `${h}h${String(m).padStart(2, '0')}m` : `${h * 60 + m}m${String(s).padStart(2, '0')}s`;
}

export function tokenUsage(v: TokenUsage | null | undefined) {
  const uncached = n(v?.uncachedInputTokens), cached = n(v?.cacheReadTokens) + n(v?.cacheWriteTokens), output = n(v?.outputTokens);
  const input = uncached + cached;
  return { total: input + output, uncached, cached, output, cacheHit: input ? cached / input : 0 };
}

export function contextUsage(p: ContextPressure | null | undefined, b: ContextBreakdown | null | undefined) {
  const window = n(p?.contextWindow);
  const used = n(p?.projectedTokens) || n(p?.pressureTokens);
  const parts = [
    { key: 'system', label: 'System prompt', tokens: n(b?.systemTokens) },
    { key: 'tools', label: 'Tool definitions', tokens: n(b?.toolsTokens) },
    { key: 'messages', label: 'Messages', tokens: n(b?.messageTokens) },
  ];
  return { used, window, fraction: window ? Math.min(1, used / window) : 0, parts };
}

export function sessionStats(v: SessionStatsValue | null | undefined) {
  const decodeMs = n(v?.decodeMs);
  return {
    turns: n(v?.turns), steps: n(v?.steps), llmMs: n(v?.llmMs), toolMs: n(v?.toolMs),
    avgTtftMs: n(v?.ttftSteps) ? n(v?.ttftMs) / n(v?.ttftSteps) : 0,
    tokensPerSecond: decodeMs ? n(v?.decodeTokens) / (decodeMs / 1000) : 0,
  };
}
