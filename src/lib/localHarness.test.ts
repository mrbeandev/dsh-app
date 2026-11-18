import { describe, expect, it } from 'vitest';
import { harnessInstallScript, progressLabel, ROOTFS, startState, tokenFromLog } from './localHarness';

const listening = [
  '--- starting dsh web on 127.0.0.1:3080 ---',
  'dsh web: listening on 127.0.0.1 over plain HTTP; restrict this port to a trusted proxy or network',
  'dsh web: http://127.0.0.1:3080/?token=TESTtokenAAAAbbbbCCCCddddEEEEffffGGGGhhhh123',
].join('\n');

describe('local Harness setup', () => {
  it('reads the launch token from dsh web output, latest run wins', () => {
    expect(tokenFromLog(listening)).toBe('TESTtokenAAAAbbbbCCCCddddEEEEffffGGGGhhhh123');
    expect(tokenFromLog(`${listening}\n--- starting dsh web on 127.0.0.1:3080 ---\ndsh web: http://127.0.0.1:3080/?token=NEWTOKENabcdefghij0123`)).toBe('NEWTOKENabcdefghij0123');
    expect(tokenFromLog('npm warn …')).toBeNull();
  });
  it('tells starting, listening and exited apart for the latest run only', () => {
    expect(startState('--- starting dsh web on 127.0.0.1:3080 ---\nloading plugins')).toBe('starting');
    expect(startState(listening)).toBe('listening');
    expect(startState(`${listening}\n--- dsh web exited (1) ---`)).toBe('exited');
    expect(startState(`${listening}\n--- dsh web exited (1) ---\n--- starting dsh web on 127.0.0.1:3080 ---`)).toBe('starting');
  });
  it('builds the install script with a safe version and the Linux build scripts only', () => {
    const s = harnessInstallScript('0.2.2-rc.3');
    expect(s).toContain('npm install -g @deepseek-ai/dsh@0.2.2-rc.3');
    expect(s).toContain('--allow-scripts=@deepseek-ai/dsh-subprocess-local,node-pty,protobufjs');
    expect(s).not.toContain('koffi');
    expect(harnessInstallScript('1.0; rm -rf /')).toContain('@deepseek-ai/dsh@latest');
  });
  it('points at the published, checksummed environment image', () => {
    expect(ROOTFS.url).toMatch(/^https:\/\/github\.com\/mrbeandev\/dsh-app\/releases\/download\/rootfs-/);
    expect(ROOTFS.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('labels progress', () => {
    expect(progressLabel({ phase: 'download', done: 50 * 1024 ** 2, total: 150 * 1024 ** 2 })).toBe('Downloading Linux environment… 50 MB of 150 MB');
    expect(progressLabel({ phase: 'extract', done: 1, total: 4 })).toBe('Unpacking… 25%');
  });
});

describe('setup task log', () => {
  it('is running until the exit line, ok only with exit 0 and the marker', async () => {
    const { taskResult } = await import('./localHarness');
    expect(taskResult('--- task started ---\nv24.22.1\nadded 812 packages').done).toBe(false);
    expect(taskResult('--- task started ---\nv24.22.1\n0.2.2-rc.3\nDSH_INSTALL_OK\n--- task exited (0) ---\n')).toMatchObject({ done: true, ok: true });
    expect(taskResult('--- task started ---\nnpm error network\n--- task exited (1) ---\n')).toMatchObject({ done: true, ok: false, tail: ['npm error network'] });
    // only the latest run counts
    expect(taskResult('--- task started ---\nDSH_INSTALL_OK\n--- task exited (0) ---\n--- task started ---\nnpm i…').done).toBe(false);
  });
});
