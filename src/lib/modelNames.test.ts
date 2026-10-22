import { describe, expect, it } from 'vitest';
import { modelName } from './modelNames';

const catalog = { groups: [
  { id: '9router', models: [{ id: 'cc/claude-opus-5-5', name: 'Claude Opus 5.5' }, { id: 'cx/gpt-6-sol', name: 'cx/gpt-6-sol' }] },
  { id: 'routerx', models: [{ id: 'cc/claude-opus-5-5', name: 'Opus via RouterX' }] },
] };

describe('model display names', () => {
  it('shows the catalog name instead of the id', () => {
    expect(modelName(catalog, 'cc/claude-opus-5-5', '9router')).toBe('Claude Opus 5.5');
  });
  it('uses the selected provider when two providers share an id', () => {
    expect(modelName(catalog, 'cc/claude-opus-5-5', 'routerx')).toBe('Opus via RouterX');
  });
  it('shows the name even when it equals the id', () => {
    expect(modelName(catalog, 'cx/gpt-6-sol')).toBe('cx/gpt-6-sol');
  });
  it('falls back to the id only while the catalog is unavailable or lacks the model', () => {
    expect(modelName(null, 'cc/claude-opus-5-5')).toBe('cc/claude-opus-5-5');
    expect(modelName(catalog, 'unknown/model')).toBe('unknown/model');
    expect(modelName(catalog, undefined)).toBe('');
  });
});
