/**
 * `@` mention grammar — a faithful port of the DSH Web UI's (`@deepseek-ai/dsh-file-reference`
 * `activeAtToken` / `formatFileMention`), so prompts written in the app read identically to the
 * agent. File mentions are plain prompt text: `@path`, `@"path with spaces"`, `dir/` for folders.
 * Session mentions use the Harness-provided canonical `@[label](dsh-session:…)` string verbatim.
 */
export type AtToken = { prefix: string; query: string; quoted: boolean; start: number };
export type FileCandidate = { path: string; kind: 'file' | 'directory' };

/** The `@` token immediately before the caret, if any (start of input or after whitespace). */
export function activeAtToken(text: string, caret: number): AtToken | undefined {
  const before = text.slice(0, caret);
  const quoted = /(?:^|\s)(@"([^"]*))$/u.exec(before);
  if (quoted?.[1] !== undefined && quoted[2] !== undefined) return { prefix: quoted[1], query: quoted[2], quoted: true, start: caret - quoted[1].length };
  const plain = /(?:^|\s)(@([^\s]*))$/u.exec(before);
  if (plain?.[1] === undefined || plain[2] === undefined) return undefined;
  return { prefix: plain[1], query: plain[2], quoted: false, start: caret - plain[1].length };
}

/** Prompt text for a picked path; undefined when the grammar can't represent it safely. */
export function formatFileMention(candidate: FileCandidate, preserveQuote = false): string | undefined {
  const path = candidate.kind === 'directory' ? `${candidate.path}/` : candidate.path;
  if (/[\u0000-\u001f\u007f-\u009f"]/u.test(path)) return undefined;
  if (!(preserveQuote || /\s/u.test(path))) return `@${path}`;
  if (candidate.kind === 'directory') return `@"${path}`;
  return `@"${path}"`;
}

/**
 * Replace the active token with `insert`. Files end with a space so typing continues; directories
 * don't, so the picker stays open to descend a level.
 */
export function applyMention(text: string, token: AtToken, caret: number, insert: string, keepOpen: boolean) {
  const tail = text.slice(caret);
  const add = keepOpen || tail.startsWith(' ') ? insert : `${insert} `;
  const next = text.slice(0, token.start) + add + tail;
  return { text: next, caret: token.start + add.length };
}
