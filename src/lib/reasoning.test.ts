import { describe, expect, it } from 'vitest';
import { effortChoices, effortLabel } from './reasoning';

const opus = { efforts: [{ id: 'off', name: 'Off' }, { id: 'low', name: 'Low' }, { id: 'medium', name: 'Medium' }, { id: 'high', name: 'High' }, { id: 'max', name: 'Max' }] };

describe('reasoning levels', () => {
  it('lists Default first when the model has no default level, then each level (Web UI parity)', () => {
    expect(effortChoices(opus).map(c => [c.label, c.effort])).toEqual([['Default', undefined], ['Off', 'off'], ['Low', 'low'], ['Medium', 'medium'], ['High', 'high'], ['Max', 'max']]);
  });
  it('omits Default when the model declares one', () => {
    expect(effortChoices({ ...opus, defaultEffort: 'medium' })[0]).toEqual({ key: 'effort:off', effort: 'off', label: 'Off' });
  });
  it('labels the active level, falling back to the model default or "Default"', () => {
    expect(effortLabel(opus, 'high')).toBe('High');
    expect(effortLabel({ ...opus, defaultEffort: 'low' }, undefined)).toBe('Low');
    expect(effortLabel(opus, undefined)).toBe('Default');
    expect(effortLabel(opus, 'ultra')).toBe('ultra');
  });
  it('shows nothing for models without reasoning levels', () => {
    expect(effortChoices(undefined)).toEqual([]);
    expect(effortLabel(undefined, 'high')).toBeUndefined();
    expect(effortLabel({ efforts: [] }, 'high')).toBeUndefined();
  });
});
