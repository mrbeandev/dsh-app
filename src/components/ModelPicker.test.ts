import { describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({}));
vi.mock('@expo/vector-icons', () => ({}));
vi.mock('../state/app', () => ({}));
vi.mock('../lib/harness', () => ({}));
vi.mock('./Loader', () => ({}));
vi.mock('./ui', () => ({}));
vi.mock('./Sheet', () => ({}));
const { isCurrentModel } = await import('./ModelPicker');

describe('model picker selection', () => {
  const opus = { id: 'cc/claude-opus-5-5', name: 'Claude Opus 5.5' };
  it('checks only the provider that is actually selected when two providers offer the same model', () => {
    const current = { provider: 'routerx', model: 'cc/claude-opus-5-5' };
    expect(isCurrentModel(current, 'routerx', { id: 'cc/claude-opus-5-5' })).toBe(true);
    expect(isCurrentModel(current, '9router', opus)).toBe(false);
  });
  it('still matches by display name for the right provider', () => {
    expect(isCurrentModel({ provider: '9router', model: 'Claude Opus 5.5' }, '9router', opus)).toBe(true);
  });
  it('falls back to the model id when the provider is unknown, and selects nothing without a model', () => {
    expect(isCurrentModel({ model: 'cc/claude-opus-5-5' }, '9router', opus)).toBe(true);
    expect(isCurrentModel(undefined, '9router', opus)).toBe(false);
  });
});
