// Acts out the live demo on the real seed data, step by step, the same way the
// app will (pure rules over a data snapshot). If seed tuning breaks the story, this fails.
import { describe, it, expect, beforeEach } from 'vitest';
import { plantSignal, sellSignal, riskSignal } from '../src/lib/rules.js';
import { render } from '../src/lib/render.js';
import { addDays } from '../src/lib/dates.js';

import kafos from '../src/data/seed/kafos.json';
import plantings from '../src/data/seed/plantings.json';
import orders from '../src/data/seed/orders.json';
import order_acceptances from '../src/data/seed/order_acceptances.json';
import crop_calendar from '../src/data/seed/crop_calendar.json';
import prices from '../src/data/seed/prices.json';
import transport_costs from '../src/data/seed/transport_costs.json';
import market_towns from '../src/data/seed/market_towns.json';
import alerts from '../src/data/seed/alerts.json';
import config from '../src/data/seed/config.json';

const DISTRICT = 'Kombo Central';
let data;
let today;

beforeEach(() => {
  data = structuredClone({ kafos, plantings, orders, order_acceptances, crop_calendar, prices, transport_costs, market_towns, alerts, reports: [], config });
  today = config.demo_date;
});

const plant = (crop, district = DISTRICT) => plantSignal({ crop, district, today, data });
const risk = (crop) => riskSignal({ crop, district: DISTRICT, today, data });
const sell = (crop) => sellSignal({ crop, fromTown: 'town_brikama', kafoId: 'kafo_brikama', today, data });

// What the kafo leader app does when logging a planting (Phase 4): auto-fill from the calendar.
function logPlanting(kafo_id, crop, beds, extra = {}) {
  const cal = data.crop_calendar.find((c) => c.crop === crop);
  data.plantings.push({
    id: `plant_test_${data.plantings.length}`, kafo_id, crop, beds, member_ids: [], planted_on: today,
    expected_harvest: addDays(today, cal.days_to_harvest), expected_kg: beds * cal.kg_per_bed,
    stage: 'planted', lost_kg: 0, lost_reason: null, order_id: null, logged_by: 'user_fatou', ...extra,
  });
}

describe('starting state (Brikama, 20 Oct)', () => {
  it('tomato red, onion yellow, pepper and okra green', () => {
    expect(plant('tomato').signal).toBe('red');
    expect(plant('onion').signal).toBe('yellow');
    expect(plant('pepper').signal).toBe('green');
    expect(plant('okra').signal).toBe('green');
    expect(plant('tomato').ratio).toBeCloseTo(1.9, 1);
    expect(plant('onion').ratio).toBeCloseTo(1.0, 1);
  });

  it('okra says a buyer is waiting: 150 kg in about 10 weeks', () => {
    const r = plant('okra');
    expect(r.reason).toBe('buyer_waiting');
    expect(r.numbers.next_order).toMatchObject({ kg: 150, weeks: 10 });
    expect(render(r.signal, 'ussd', 'en', { kind: 'plant' })).toBe('GOOD TO PLANT');
    expect(render(r.signal, 'voice', 'en', { kind: 'plant', crop: 'okra', reason: r.reason })).toEqual(['crop_okra', 'verdict_good_plant', 'why_buyer']);
  });

  it('pepper sells best in Banjul, OK in Sukuta and Serekunda, avoid Brikama', () => {
    const byTown = Object.fromEntries(sell('pepper').options.map((o) => [o.market_town_id, o.signal]));
    expect(byTown).toMatchObject({ town_banjul: 'green', town_sukuta: 'yellow', town_serekunda: 'yellow', town_brikama: 'red' });
    expect(sell('pepper').options[0].market_town_id).toBe('town_banjul');
  });

  it('Banjul okra shows no recent price', () => {
    expect(sell('okra').options.find((o) => o.market_town_id === 'town_banjul').signal).toBe('none');
  });

  it('no risk yet', () => {
    for (const c of ['tomato', 'onion', 'pepper', 'okra']) expect(risk(c).signal).toBe('green');
  });
});

describe('demo actions change the signals', () => {
  it('logging a new planting of ANY crop raises its ratio immediately', () => {
    for (const { crop } of crop_calendar) {
      const before = plant(crop).numbers.supply_kg;
      logPlanting('kafo_brikama', crop, 10);
      expect(plant(crop).numbers.supply_kg).toBeGreaterThan(before);
    }
  });

  it('logging lots of okra turns okra from green to yellow, then red', () => {
    logPlanting('kafo_brikama', 'okra', 25);   // +100 kg
    expect(plant('okra').signal).toBe('yellow');
    logPlanting('kafo_kembujeh', 'okra', 60);  // +240 kg
    expect(plant('okra').signal).toBe('red');
  });

  it('accepting the 150 kg okra order moves okra to about 1.0 (yellow)', () => {
    data.order_acceptances.push({ id: 'acc_1', order_id: 'order_0001', kafo_id: 'kafo_brikama', kg_committed: 150 });
    data.orders[0].status = 'filled';
    expect(plant('okra').ratio).toBeCloseTo(1.0, 1);
    expect(plant('okra').signal).toBe('yellow');
    // Logging the planting for that order does not double count it.
    const ratio = plant('okra').ratio;
    logPlanting('kafo_brikama', 'okra', 38, { order_id: 'order_0001' }); // 152 kg for the order
    expect(plant('okra').ratio).toBeCloseTo(ratio, 1);
    // The Brikama kafo now sees the order as its best place to sell okra.
    expect(sell('okra').options[0]).toMatchObject({ order_id: 'order_0001', signal: 'green' });
  });

  it('partial acceptance: 80 of 150 kg, the rest stays open demand', () => {
    data.order_acceptances.push({ id: 'acc_1', order_id: 'order_0001', kafo_id: 'kafo_brikama', kg_committed: 80 });
    data.orders[0].status = 'partly_filled';
    expect(plant('okra').numbers.open_order_kg).toBe(70);
    expect(plant('okra', 'Kombo South').numbers.order_kg).toBe(70);
  });

  it('3 unverified pest reports → WATCH OUT; leader verifies one → ACT NOW', () => {
    for (let i = 0; i < 3; i++) {
      data.reports.push({ id: `rep_${i}`, reporter_id: 'user_awa', kafo_id: 'kafo_brikama', district: DISTRICT, crop: 'okra', problem: 'insects', verified: false, status: 'open', created_at: `${today}T10:0${i}:00Z` });
    }
    expect(render(risk('okra').signal, 'ussd', 'en', { kind: 'risk' })).toBe('WATCH OUT');
    data.reports[0].verified = true;
    expect(render(risk('okra').signal, 'ussd', 'en', { kind: 'risk' })).toBe('ACT NOW');
    expect(risk('tomato').signal).toBe('green');
  });

  it('admin heavy rain alert in Brikama → ACT NOW for every crop', () => {
    data.alerts.push({ id: 'alert_x', template_type: 'heavy_rain', level: 'red', crops: [], districts: [DISTRICT], starts_on: today, ends_on: addDays(today, 3), note: null, created_by: 'user_admin' });
    for (const { crop } of crop_calendar) expect(risk(crop)).toMatchObject({ signal: 'red', reason: 'alert_heavy_rain' });
  });

  it('jump +8 weeks: signals still compute; old prices go stale until the admin enters new ones', () => {
    today = addDays(today, 56);
    for (const { crop } of crop_calendar) expect(['green', 'yellow', 'red']).toContain(plant(crop).signal);
    expect(sell('pepper').options.every((o) => o.signal === 'none')).toBe(true);
  });

  it('a brand-new crop works once it is in the crop calendar', () => {
    data.crop_calendar.push({ crop: 'cabbage', days_to_harvest: 90, harvest_days: 30, kg_per_bed: 10, pest_risk_months: [], pest_note_key: 'pest.cabbage', baseline_demand_kg: 50 });
    expect(plant('cabbage').signal).toBe('green');
    logPlanting('kafo_brikama', 'cabbage', 150);  // 1500 kg vs ~857 kg demand
    expect(plant('cabbage').signal).toBe('red');
    expect(render('red', 'voice', 'en', { kind: 'plant', crop: 'cabbage', reason: 'many_planting' })).toEqual(['crop_cabbage', 'verdict_dont_plant', 'why_many_planting']);
  });
});
