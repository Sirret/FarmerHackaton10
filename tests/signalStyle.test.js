import { describe, it, expect } from 'vitest';
import { signalStyle, SIGNALS } from '../src/lib/signalStyle.js';

describe('signalStyle', () => {
  it('maps each signal to its token classes and icon', () => {
    expect(signalStyle('green')).toMatchObject({ bg: 'bg-go', icon: '✓' });
    expect(signalStyle('yellow')).toMatchObject({ bg: 'bg-careful', icon: '!' });
    expect(signalStyle('red')).toMatchObject({ bg: 'bg-stop', icon: '✕' });
    expect(signalStyle('none')).toMatchObject({ bg: 'bg-stale' });
  });

  it('falls back to none for unknown values', () => {
    expect(signalStyle('purple')).toEqual(signalStyle('none'));
  });

  it('never returns hex colours', () => {
    for (const s of SIGNALS) {
      expect(JSON.stringify(signalStyle(s))).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    }
  });
});
