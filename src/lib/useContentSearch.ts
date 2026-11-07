import { useEffect, useState } from 'react';
import type { HarnessClient } from './harness';

export type ContentHit = { sessionId: string; snippet: string };

/**
 * Message-content search on the Harness (`session/search`, 0.2.1+), debounced while typing.
 * Returns hits for queries of 3+ characters; older Harnesses (no endpoint) simply return none.
 */
export function useContentSearch(client: HarnessClient | null, query: string, delayMs = 350) {
  const q = query.trim();
  const [state, setState] = useState<{ q: string; hits: ContentHit[]; more: boolean; loading: boolean }>({ q: '', hits: [], more: false, loading: false });
  useEffect(() => {
    if (!client || q.length < 3) return;
    let live = true;
    const timer = setTimeout(() => {
      setState(s => ({ ...s, q, loading: true }));
      client.request<{ items?: ContentHit[]; hasMore?: boolean }>('session/search', { query: q })
        .then(r => { if (live) setState({ q, hits: Array.isArray(r?.items) ? r.items : [], more: !!r?.hasMore, loading: false }); })
        .catch(() => { if (live) setState({ q, hits: [], more: false, loading: false }); });
    }, delayMs);
    return () => { live = false; clearTimeout(timer); };
  }, [client, q, delayMs]);
  if (q.length < 3 || state.q !== q) return { hits: [] as ContentHit[], more: false, loading: q.length >= 3 && !!client };
  return state;
}

/** One-line snippet with surrounding whitespace collapsed. */
export function snippetLine(s: string, max = 140) {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
