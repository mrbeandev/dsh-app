import { describe, expect, it } from 'vitest';
import { parentOf, resolveFileLink } from './fileLinks';

const root = '/root/visibility-v2';

describe('file links in agent replies', () => {
  it('resolves workspace-relative links', () => {
    expect(resolveFileLink('docs/FEATURE-BACKLOG.md', root)).toEqual({ path: 'docs/FEATURE-BACKLOG.md' });
    expect(resolveFileLink('./src/app.tsx', root)).toEqual({ path: 'src/app.tsx' });
    expect(resolveFileLink('FEATURE-BACKLOG.md', root)).toEqual({ path: 'FEATURE-BACKLOG.md' });
  });
  it('maps absolute paths inside the workspace and rejects ones outside it', () => {
    expect(resolveFileLink('/root/visibility-v2/src/server.ts', root)).toEqual({ path: 'src/server.ts' });
    expect(resolveFileLink('/root/visibility-v2', root)).toEqual({ path: '' });
    expect(resolveFileLink('/etc/passwd', root)).toBeNull();
    expect(resolveFileLink('/root/visibility-v2-other/x', root)).toBeNull();
  });
  it('understands file:// URLs, encoded names and line anchors', () => {
    expect(resolveFileLink('file:///root/visibility-v2/My%20Notes.md', root)).toEqual({ path: 'My Notes.md' });
    expect(resolveFileLink('src/app.tsx#L42', root)).toEqual({ path: 'src/app.tsx', line: 42 });
    expect(resolveFileLink('src/app.tsx#L10-L20', root)).toEqual({ path: 'src/app.tsx', line: 10 });
    expect(resolveFileLink('src/app.tsx:42:7', root)).toEqual({ path: 'src/app.tsx', line: 42 });
  });
  it('treats trailing slashes as folders and refuses to climb out of the workspace', () => {
    expect(resolveFileLink('docs/', root)).toEqual({ path: 'docs' });
    expect(resolveFileLink('docs/../src/a.ts', root)).toEqual({ path: 'src/a.ts' });
    expect(resolveFileLink('../secrets.env', root)).toBeNull();
  });
  it('leaves web and other app links alone', () => {
    for (const href of ['https://x.dev', 'http://127.0.0.1:8090', 'mailto:a@b.c', 'vscode://file/x', '#section', '']) expect(resolveFileLink(href, root)).toBeNull();
  });
  it('splits a path into folder and name', () => {
    expect(parentOf('docs/log/a.md')).toEqual({ dir: 'docs/log', name: 'a.md' });
    expect(parentOf('README.md')).toEqual({ dir: '', name: 'README.md' });
  });
});
