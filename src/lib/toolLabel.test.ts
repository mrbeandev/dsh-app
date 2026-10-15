import { describe, expect, it } from 'vitest';
import { toolLabel, toolSummary } from './toolLabel';

describe('tool titles (Web UI parity)', () => {
  it('bash shows the agent-written description, not the command', () => {
    const args = JSON.stringify({ command: 'for i in 1 2 3; do echo $i; done\nsleep 1', description: 'Watch sync time; tap to sync now' });
    expect(toolLabel('bash')).toBe('Bash');
    expect(toolSummary('bash', args)).toBe('Watch sync time; tap to sync now');
    expect(toolSummary('bash', JSON.stringify({ command: 'ls -la\npwd' }))).toBe('ls -la');
  });
  it('IDE-suffixed and MCP names map to the same titles', () => {
    expect(toolLabel('bash_ide')).toBe('Bash');
    expect(toolLabel('read_image_ide')).toBe('Read image');
    expect(toolLabel('mcp__playwright__browser_click')).toBe('Browser click');
  });
  it('files, search, named tools', () => {
    expect([toolLabel('read'), toolSummary('read', '{"file_path":"src/app/index.tsx"}')]).toEqual(['Read', 'src/app/index.tsx']);
    expect([toolLabel('grep'), toolSummary('grep', '{"pattern":"Last updated","path":"src"}')]).toEqual(['Search', 'Last updated']);
    expect(toolSummary('web_search', '{"queries":["a","b"]}')).toBe('a, b');
    expect(toolLabel('todo_write')).toBe('Update to-do list');
    expect(toolLabel('subagent')).toBe('Create subagent');
    expect(toolLabel('glob')).toBe('Search');
  });
});
