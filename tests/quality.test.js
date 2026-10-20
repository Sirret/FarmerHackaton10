import { describe, it, expect } from 'vitest';
import { plantingFlags, deliveryFlags } from '../src/lib/quality.js';
import { fairPriceSignal } from '../src/lib/rules.js';

describe('plantingFlags', () => {
  const base = { kgPerBed: 4, totalBeds: 100, otherActiveBeds: 50 };
  it('accepts a normal planting', () => {
    expect(plantingFlags({ ...base, planting: { beds: 20, expected_kg: 80 } })).toEqual([]);
    expect(plantingFlags({ ...base, planting: { beds: 20, expected_kg: 120 } })).toEqual([]); // exactly 1.5×
  });
  it('flags kg far above what the beds can grow', () => {
    expect(plantingFlags({ ...base, planting: { beds: 20, expected_kg: 121 } })).toEqual(['kg_over_capacity']);
  });
  it('flags more beds than the kafo has', () => {
    expect(plantingFlags({ ...base, planting: { beds: 51, expected_kg: 204 } })).toEqual(['kg_over_capacity']);
  });
});

describe('deliveryFlags', () => {
  it('flags a big gap between estimate and weighed kg', () => {
    expect(deliveryFlags({ expectedKg: 150, weighedKg: 152 })).toEqual([]);
    expect(deliveryFlags({ expectedKg: 150, weighedKg: 100 })).toEqual(['estimate_gap']);
    expect(deliveryFlags({ expectedKg: 0, weighedKg: 100 })).toEqual([]);
  });
});

describe('fairPriceSignal', () => {
  const data = {
    config: { price_avg_weeks: 4, sell_red_below: 0.9 },
    prices: [
      { crop: 'okra', price_per_kg: 50, date: '2026-10-19' },
      { crop: 'okra', price_per_kg: 50, date: '2026-10-12' },
      { crop: 'okra', price_per_kg: 99, date: '2026-08-01' }, // too old for the average
    ],
  };
  const fair = (price) => fairPriceSignal({ crop: 'okra', price, today: '2026-10-20', data });
  it('compares the offer with the 4-week average', () => {
    expect(fair(55)).toMatchObject({ signal: 'green', average: 50 });
    expect(fair(50).signal).toBe('green');
    expect(fair(45).signal).toBe('yellow');
    expect(fair(44).signal).toBe('red');
  });
  it('gives none without recent prices', () => {
    expect(fairPriceSignal({ crop: 'onion', price: 50, today: '2026-10-20', data }).signal).toBe('none');
  });
});
