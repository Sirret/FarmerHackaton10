import { describe, it, expect } from 'vitest';
import { addDays, daysBetween, atTime, formatDate } from '../src/lib/dates.js';

describe('dates', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-10-20', 3)).toBe('2026-10-23');
    expect(addDays('2026-10-30', 5)).toBe('2026-11-04');
    expect(addDays('2026-12-30', 56)).toBe('2027-02-24');
    expect(addDays('2026-10-20', -7)).toBe('2026-10-13');
  });

  it('counts days between dates and timestamps', () => {
    expect(daysBetween('2026-10-20', '2026-12-29')).toBe(70);
    expect(daysBetween('2026-10-20T23:00:00Z', '2026-10-21')).toBe(1);
  });

  it('combines a demo date with a wall-clock time', () => {
    expect(atTime('2026-12-15', new Date('2020-01-01T14:05:09.000Z'))).toBe('2026-12-15T14:05:09.000Z');
  });

  it('formats dates for display', () => {
    expect(formatDate('2026-10-20')).toBe('20 Oct 2026');
  });
});
