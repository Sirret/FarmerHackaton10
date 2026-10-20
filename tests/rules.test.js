// Unit tests for the colour engine on small hand-built data.
import { describe, it, expect } from 'vitest';
import { plantSignal, sellSignal, riskSignal, worst } from '../src/lib/rules.js';

const TODAY = '2026-10-20';
const config = {
  demo_date: TODAY, plant_green_below: 0.8, plant_red_above: 1.3, sell_green_above: 1.05, sell_red_below: 0.9,
  report_count: 3, report_window_days: 7, price_stale_days: 14, price_avg_weeks: 4, unit_kg: { bag: 25 },
};
// okra horizon = 42 + 28 = 70 days = 10 weeks → baseline 10 kg/week × 10 = 100 kg demand
const crop_calendar = [{ crop: 'okra', days_to_harvest: 42, harvest_days: 28, kg_per_bed: 4, baseline_demand_kg: 10 }];
const kafos = [
  { id: 'k1', district: 'D1', market_town_id: 'town_a' },
  { id: 'k2', district: 'D1', market_town_id: 'town_a' },
  { id: 'k3', district: 'D2', market_town_id: 'town_a' },
];

const base = (over = {}) => ({
  kafos, crop_calendar, config, plantings: [], orders: [], order_acceptances: [],
  prices: [], transport_costs: [], market_towns: [], alerts: [], reports: [], ...over,
});
const planting = (kg, over = {}) => ({ id: `p${kg}`, kafo_id: 'k1', crop: 'okra', expected_kg: kg, lost_kg: 0, expected_harvest: '2026-11-20', stage: 'growing', order_id: null, ...over });
const plant = (data) => plantSignal({ crop: 'okra', district: 'D1', today: TODAY, data });

describe('plantSignal thresholds', () => {
  it.each([
    [0, 'green'], [79, 'green'], [80, 'yellow'], [100, 'yellow'], [130, 'yellow'], [131, 'red'], [300, 'red'],
  ])('supply %i kg vs 100 kg demand → %s', (kg, expected) => {
    const data = base({ plantings: kg ? [planting(kg)] : [] });
    expect(plant(data).signal).toBe(expected);
  });

  it('subtracts lost kg', () => {
    expect(plant(base({ plantings: [planting(150, { lost_kg: 80 })] })).signal).toBe('green');
  });

  it('ignores harvested plantings, other districts, other crops, and harvests outside the horizon', () => {
    const data = base({ plantings: [
      planting(500, { id: 'a', stage: 'harvested' }),
      planting(500, { id: 'b', kafo_id: 'k3' }),
      planting(500, { id: 'c', crop: 'tomato' }),
      planting(500, { id: 'd', expected_harvest: '2027-02-01' }),        // after the 70-day horizon
      planting(500, { id: 'e', expected_harvest: '2026-09-01' }),        // harvest finished before today
    ] });
    expect(plant(data).numbers.supply_kg).toBe(0);
  });

  it('always counts a planting logged today', () => {
    const data = base({ plantings: [planting(90, { expected_harvest: '2026-12-01' })] });
    expect(plant(data).numbers.supply_kg).toBe(90);
  });

  it('adds open forward orders to demand and says a buyer is waiting', () => {
    const order = { id: 'o1', crop: 'okra', type: 'forward', kg: 100, status: 'open', window_start: '2026-12-01', window_end: '2026-12-07', buyer_id: 'b1' };
    const r = plant(base({ plantings: [planting(100)], orders: [order] }));
    expect(r.numbers.demand_kg).toBe(200);
    expect(r.signal).toBe('green');
    expect(r.reason).toBe('buyer_waiting');
    expect(r.numbers.next_order.kg).toBe(100);
  });

  it('counts a commitment as supply here, and removes it from demand elsewhere', () => {
    const order = { id: 'o1', crop: 'okra', type: 'forward', kg: 100, status: 'filled', window_start: '2026-12-01', window_end: '2026-12-07' };
    const acc = { id: 'a1', order_id: 'o1', kafo_id: 'k1', kg_committed: 100 };
    const data = base({ plantings: [planting(100)], orders: [order], order_acceptances: [acc] });
    expect(plant(data).numbers).toMatchObject({ supply_kg: 200, demand_kg: 200 });
    // District D2 has no commitment, and the order is fully taken: no extra demand there.
    expect(plantSignal({ crop: 'okra', district: 'D2', today: TODAY, data }).numbers.demand_kg).toBe(100);
  });

  it('does not double count a commitment once its planting is logged', () => {
    const order = { id: 'o1', crop: 'okra', type: 'forward', kg: 100, status: 'filled', window_start: '2026-12-01', window_end: '2026-12-07' };
    const acc = { id: 'a1', order_id: 'o1', kafo_id: 'k1', kg_committed: 100 };
    const data = base({ plantings: [planting(100), planting(120, { id: 'linked', order_id: 'o1' })], orders: [order], order_acceptances: [acc] });
    expect(plant(data).numbers.supply_kg).toBe(220);
  });

  it('returns none for a crop missing from the calendar', () => {
    expect(plantSignal({ crop: 'cabbage', district: 'D1', today: TODAY, data: base() }).signal).toBe('none');
  });
});

describe('sellSignal', () => {
  const market_towns = [
    { id: 'town_a', is_market: true }, { id: 'town_b', is_market: true }, { id: 'town_c', is_market: true }, { id: 'town_x', is_market: false },
  ];
  const transport_costs = [
    { from_town_id: 'town_a', to_market_id: 'town_a', cost_per_bag: 0 },
    { from_town_id: 'town_a', to_market_id: 'town_b', cost_per_bag: 50 }, // 2 D/kg
    { from_town_id: 'town_a', to_market_id: 'town_c', cost_per_bag: 0 },
  ];
  // average of the 4 recent prices = 50
  const prices = [
    { market_town_id: 'town_a', crop: 'okra', price_per_kg: 50, date: '2026-10-19' },
    { market_town_id: 'town_b', crop: 'okra', price_per_kg: 56, date: '2026-10-19' },
    { market_town_id: 'town_c', crop: 'okra', price_per_kg: 44, date: '2026-10-19' },
    { market_town_id: 'town_c', crop: 'okra', price_per_kg: 50, date: '2026-10-12' },
  ];
  const sell = (over = {}, kafoId = null) => sellSignal({ crop: 'okra', fromTown: 'town_a', kafoId, today: TODAY, data: base({ market_towns, transport_costs, prices, ...over }) });

  it('compares price minus transport with the 4-week average, best first', () => {
    const r = sell();
    expect(r.average).toBe(50);
    expect(r.options.map((o) => [o.market_town_id, o.net, o.signal])).toEqual([
      ['town_b', 54, 'green'],   // 56 − 2 = 54 ≥ 52.5
      ['town_a', 50, 'yellow'],
      ['town_c', 44, 'red'],     // 44 < 45
    ]);
    expect(r.signal).toBe('green');
  });

  it('gives none for a stale price', () => {
    const r = sell({ prices: [...prices.filter((p) => p.market_town_id !== 'town_b'), { market_town_id: 'town_b', crop: 'okra', price_per_kg: 99, date: '2026-10-05' }] });
    const b = r.options.find((o) => o.market_town_id === 'town_b');
    expect(b).toMatchObject({ signal: 'none', reason: 'no_recent_price' });
    expect(r.options.at(-1).market_town_id).toBe('town_b');
  });

  it('puts a confirmed order first and always green', () => {
    const order = { id: 'o1', crop: 'okra', type: 'forward', kg: 100, status: 'filled', price_per_kg: 40, buyer_id: 'b1' };
    const r = sell({ orders: [order], order_acceptances: [{ order_id: 'o1', kafo_id: 'k1', kg_committed: 100 }] }, 'k1');
    expect(r.options[0]).toMatchObject({ order_id: 'o1', signal: 'green', reason: 'order_confirmed' });
  });
});

describe('riskSignal', () => {
  const report = (n, over = {}) => Array.from({ length: n }, (_, i) => ({
    id: `r${i}`, crop: 'okra', district: 'D1', problem: 'insects', verified: false, status: 'open', created_at: '2026-10-19T10:00:00Z', ...over,
  }));
  const risk = (over) => riskSignal({ crop: 'okra', district: 'D1', today: TODAY, data: base(over) });

  it('is green with no reports or alerts', () => {
    expect(risk({}).signal).toBe('green');
  });

  it('needs report_count unverified reports for yellow', () => {
    expect(risk({ reports: report(2) }).signal).toBe('green');
    expect(risk({ reports: report(3) }).signal).toBe('yellow');
  });

  it('never goes red on unverified reports alone', () => {
    expect(risk({ reports: report(20) }).signal).toBe('yellow');
  });

  it('goes red when a leader verifies one of enough reports', () => {
    const reports = [...report(2), ...report(1, { id: 'v', verified: true })];
    expect(risk({ reports })).toMatchObject({ signal: 'red', reason: 'reports_verified' });
    expect(risk({ reports: report(1, { verified: true }) }).signal).toBe('yellow');
  });

  it('ignores dismissed, old, other-crop and other-district reports', () => {
    const reports = [
      ...report(3, { status: 'dismissed' }), ...report(3, { created_at: '2026-10-10T10:00:00Z' }),
      ...report(3, { crop: 'tomato' }), ...report(3, { district: 'D2' }),
    ];
    expect(risk({ reports }).signal).toBe('green');
  });

  it('uses the admin alert level for matching district and crop', () => {
    const alert = { id: 'a1', template_type: 'heavy_rain', level: 'red', crops: [], districts: ['D1'], starts_on: '2026-10-20', ends_on: '2026-10-25' };
    expect(risk({ alerts: [alert] })).toMatchObject({ signal: 'red', reason: 'alert_heavy_rain' });
    expect(risk({ alerts: [{ ...alert, districts: ['D2'] }] }).signal).toBe('green');
    expect(risk({ alerts: [{ ...alert, crops: ['tomato'] }] }).signal).toBe('green');
    expect(risk({ alerts: [{ ...alert, ends_on: '2026-10-19' }] }).signal).toBe('green');
  });

  it('counts an alert issued ahead of time, up to alert_lead_days before it starts', () => {
    const alert = { id: 'a1', template_type: 'heavy_rain', level: 'red', crops: [], districts: ['D1'], starts_on: '2026-10-22', ends_on: '2026-10-25' };
    const withLead = (data) => riskSignal({ crop: 'okra', district: 'D1', today: TODAY, data: { ...data, config: { ...config, alert_lead_days: 7 } } });
    expect(withLead(base({ alerts: [alert] })).signal).toBe('red');
    expect(withLead(base({ alerts: [{ ...alert, starts_on: '2026-11-10', ends_on: '2026-11-12' }] })).signal).toBe('green');
  });
});

describe('worst', () => {
  it('picks the more severe signal', () => {
    expect(worst('green', 'yellow')).toBe('yellow');
    expect(worst('red', 'yellow')).toBe('red');
    expect(worst('none', 'green')).toBe('green');
  });
});
