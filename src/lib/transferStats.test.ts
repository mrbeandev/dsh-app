import { describe, expect, it } from 'vitest';
import { createTransferMeter, formatEta } from './transferStats';

describe('download speed and ETA', () => {
  it('computes smoothed speed, remaining bytes and ETA', () => {
    let t = 0; const meter = createTransferMeter(5000, () => t);
    expect(meter(0, 100_000_000).bytesPerSec).toBeNull();
    t = 2000; const s = meter(4_000_000, 100_000_000);
    expect(s.bytesPerSec).toBe(2_000_000);
    expect(s.remaining).toBe(96_000_000);
    expect(s.etaSec).toBe(48);
  });
  it('drops old samples outside the window', () => {
    let t = 0; const meter = createTransferMeter(5000, () => t);
    meter(0, 10e6); t = 1000; meter(1e6, 10e6); t = 9000; meter(2e6, 10e6); t = 10000;
    expect(meter(3e6, 10e6).bytesPerSec).toBe(1e6);
  });
  it('formats the ETA', () => {
    expect(formatEta(42)).toBe('42 s');
    expect(formatEta(65)).toBe('1 min 05 s');
    expect(formatEta(7380)).toBe('2 h 03 min');
  });
});
