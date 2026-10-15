/**
 * Tool call title + one-line summary, ported from the DSH Web UI (dsh-client-ui-tool
 * tool-call-model: TOOL_TITLE_KEYS / TOOL_VARIANTS / SUMMARY_KEYS / deriveSummary, English locale).
 * e.g. bash {description:"Watch sync time", command:"for i in …"} → "Bash · Watch sync time".
 */
type Variant = 'search' | 'read' | 'bash' | 'write' | 'edit' | 'code' | 'others';

const TOOL_VARIANTS: Record<string, Variant> = {
  bash: 'bash', pwsh: 'bash', read: 'read', read_image: 'read', web_fetch: 'read', web_search: 'search',
  grep: 'search', glob: 'search', write: 'write', edit: 'edit', run_code: 'code',
  cordis_package_inspect: 'read', cordis_runtime_inspect: 'read', cordis_run: 'others', cordis_stop: 'others', cordis_undefine: 'others',
};

const VARIANT_TITLES: Record<Variant, string> = { search: 'Search', read: 'Read', bash: 'Bash', write: 'Write', edit: 'Edit', code: 'Code', others: 'Tool call' };

const TOOL_TITLES: Record<string, string> = {
  cordis_package_inspect: 'Query Cordis environment', cordis_runtime_inspect: 'Query Cordis environment',
  cordis_run: 'Run Cordis Plugin', cordis_stop: 'Stop Cordis Plugin', cordis_undefine: 'Remove Cordis Plugin',
  pwsh: 'Pwsh', read_image: 'Read image', todo_write: 'Update to-do list', ask_user_question: 'Ask question',
  create_goal: 'Create goal', get_goal: 'View goal', update_goal: 'Update goal',
  schedule_create: 'Create reminder', schedule_list: 'List reminders', schedule_delete: 'Delete reminder', schedule_update: 'Update reminder',
  cordis_inspect_list: 'Inspect providers', cordis_inspect_query: 'Query runtime', cordis_inspect_self: 'Inspect plugins',
  workflow: 'Run workflow', ralph: 'Run ralph loop',
  session_event_read: 'Read event', session_event_search: 'Search events', session_event_trace: 'Trace event',
  session_search: 'Search sessions', session_trace: 'Trace session',
  list_subagent_models: 'List models', subagent: 'Create subagent', list_agents: 'List subagents', send_message: 'Send message',
  interrupt_agent: 'Interrupt agent', job_list: 'List background jobs', job_output: 'Read job output', job_kill: 'Cancel background job',
  terminal_open: 'Open terminal', terminal_read: 'Read terminal', terminal_list: 'List terminals', terminal_signal: 'Signal terminal', terminal_close: 'Close terminal',
  lsp: 'Query code symbols', spawn_teammate: 'Create teammate',
  team_task_create: 'Create team task', team_task_get: 'Read team task', team_task_update: 'Update team task', team_task_list: 'List team tasks',
  wait_agent: 'Wait for subagent',
};

const SUMMARY_KEYS: Record<Variant, string[]> = {
  bash: ['description', 'command'], read: ['path', 'file_path', 'url'], search: ['query', 'pattern', 'url'],
  write: ['path', 'file_path'], edit: ['path', 'file_path'], code: ['description'], others: [],
};

/** Web UI also matches IDE-suffixed tool names (e.g. "bash_ide") to their base tool. */
function baseName(name: string) { return name.replace(/^mcp__[^_]+__/, '').replace(/_ide$/, ''); }

const firstLine = (t: string) => { const i = t.indexOf('\n'); return i === -1 ? t : t.slice(0, i); };

export function classifyTool(name: string): Variant { return TOOL_VARIANTS[baseName(name)] ?? 'others'; }

export function toolLabel(name: string): string {
  const base = baseName(name);
  if (TOOL_TITLES[base]) return TOOL_TITLES[base];
  const variant = classifyTool(name);
  if (variant !== 'others') return VARIANT_TITLES[variant];
  // Generic rows keep the wire tool name, humanised.
  return base.replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase()) || VARIANT_TITLES.others;
}

export function toolSummary(name: string, argsRaw: string): string {
  const variant = classifyTool(name);
  let args: unknown;
  try { args = JSON.parse(argsRaw || '{}'); } catch { return firstLine(argsRaw ?? ''); }
  if (typeof args !== 'object' || args === null) return firstLine(String(argsRaw ?? ''));
  const a = args as Record<string, unknown>;
  if (variant === 'search' && Array.isArray(a.queries)) {
    const qs = a.queries.filter((q): q is string => typeof q === 'string' && q !== '');
    if (qs.length) return qs.map(firstLine).join(', ');
  }
  for (const k of SUMMARY_KEYS[variant]) { const v = a[k]; if (typeof v === 'string' && v !== '') return firstLine(v); }
  for (const v of Object.values(a)) if (typeof v === 'string' && v !== '') return firstLine(v);
  return '';
}
