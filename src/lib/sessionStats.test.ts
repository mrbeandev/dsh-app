import { describe, expect, it } from 'vitest';
import { compact, contextUsage, duration, grouped, sessionStats, tokenUsage } from './sessionStats';

describe('session stats (web UI parity)', () => {
  it('reproduces the token-usage popover from your screenshot', () => {
    const t = tokenUsage({ uncachedInputTokens: 62604145, cacheReadTokens: 198537180, outputTokens: 401634 });
    expect(grouped(t.total)).toBe('261,542,959');
    expect(Math.round(t.cacheHit * 100)).toBe(76);
    expect(compact(t.total)).toBe('262M');
  });
  it('formats durations like the web UI', () => {
    expect(duration(229 * 60000 + 38000)).toBe('229m38s');
    expect(duration(9800)).toBe('9.8s');
    expect(duration(450)).toBe('0.45s');
  });
  it('computes context fraction and parts', () => {
    const c = contextUsage({ projectedTokens: 409000, contextWindow: 1000000 }, { systemTokens: 2000, toolsTokens: 9000, messageTokens: 210000 });
    expect(Math.round(c.fraction * 100)).toBe(41);
    expect(compact(c.window)).toBe('1M');
    expect(c.parts.map(p => compact(p.tokens))).toEqual(['2K', '9K', '210K']);
  });
  it('derives TTFT and TPS from live Harness stats', () => {
    const s = sessionStats({ turns: 9, steps: 11, llmMs: 46818, toolMs: 107728, ttftMs: 36597, ttftSteps: 10, decodeMs: 10221, decodeTokens: 1746 });
    expect(duration(s.avgTtftMs)).toBe('3.7s');
    expect(Math.round(s.tokensPerSecond)).toBe(171);
  });
  it('is safe on missing data', () => {
    expect(tokenUsage(null).total).toBe(0);
    expect(contextUsage(undefined, undefined).fraction).toBe(0);
    expect(sessionStats(undefined).tokensPerSecond).toBe(0);
  });
});
