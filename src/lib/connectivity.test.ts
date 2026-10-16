import { describe, expect, it } from 'vitest';
import { deviceIsOffline, friendlyNetworkError } from './connectivity';
describe('offline device state', () => {
  it('detects no transport without assuming lack of internet means LAN is unavailable', () => {
    expect(deviceIsOffline({ isConnected: false })).toBe(true);
    expect(deviceIsOffline({ type: 'NONE' })).toBe(true);
    expect(deviceIsOffline({ isConnected: true, type: 'WIFI' })).toBe(false);
    expect(deviceIsOffline({})).toBe(false);
  });
  it('replaces raw DNS/transport errors but preserves business errors', () => {
    expect(friendlyNetworkError('fetch failed: java.net.UnknownHostException: Unable to resolve host private.example')).not.toContain('private.example');
    expect(friendlyNetworkError('Network request failed')).toContain('Saved chats');
    expect(friendlyNetworkError('Permission denied')).toBe('Permission denied');
  });
});
