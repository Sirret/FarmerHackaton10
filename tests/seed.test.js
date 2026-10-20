// Seed data integrity: references resolve, enums match spec/data-dictionary.md,
// and the demo story numbers hold.
import { describe, it, expect } from 'vitest';
import { addDays } from '../src/lib/dates.js';
import users from '../src/data/seed/users.json';
import farmers from '../src/data/seed/farmers.json';
import kafos from '../src/data/seed/kafos.json';
import buyers from '../src/data/seed/buyers.json';
import market_towns from '../src/data/seed/market_towns.json';
import crop_calendar from '../src/data/seed/crop_calendar.json';
import plantings from '../src/data/seed/plantings.json';
import prices from '../src/data/seed/prices.json';
import transport_costs from '../src/data/seed/transport_costs.json';
import orders from '../src/data/seed/orders.json';
import config from '../src/data/seed/config.json';

const LANGS = ['en', 'mnk', 'wo', 'ff', 'dyo'];
const CROPS = crop_calendar.map((c) => c.crop);
const userIds = new Set(users.map((u) => u.id));
const kafoIds = new Set(kafos.map((k) => k.id));
const townIds = new Set(market_towns.map((t) => t.id));

describe('seed references', () => {
  it('has unique ids', () => {
    for (const rows of [users, kafos, buyers, market_towns, plantings, prices, orders]) {
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    }
  });

  it('links users, farmers and kafos', () => {
    for (const u of users) expect(LANGS).toContain(u.language);
    for (const f of farmers) {
      expect(userIds.has(f.user_id)).toBe(true);
      expect(kafoIds.has(f.kafo_id)).toBe(true);
      for (const c of f.crops) expect(CROPS).toContain(c);
    }
    for (const k of kafos) {
      expect(k.code).toMatch(/^\d{4}$/);
      expect(users.find((u) => u.id === k.leader_id)?.role).toBe('leader');
      expect(townIds.has(k.market_town_id)).toBe(true);
    }
  });

  it('links plantings to their kafo, members and leader', () => {
    for (const p of plantings) {
      const kafo = kafos.find((k) => k.id === p.kafo_id);
      expect(kafo).toBeDefined();
      expect(p.logged_by).toBe(kafo.leader_id);
      expect(['planted', 'growing', 'ready', 'harvested']).toContain(p.stage);
      for (const m of p.member_ids) expect(farmers.find((f) => f.user_id === m)?.kafo_id).toBe(p.kafo_id);
    }
  });

  it('has transport from every kafo town to every market', () => {
    const markets = market_towns.filter((t) => t.is_market).map((t) => t.id);
    for (const k of kafos) for (const m of markets) {
      expect(transport_costs.find((t) => t.from_town_id === k.market_town_id && t.to_market_id === m)).toBeDefined();
    }
  });
});

describe('demo story', () => {
  it('has Awa (Mandinka) and Binta (Wolof) in Brikama, and one farmer without a phone', () => {
    const awa = users.find((u) => u.id === 'user_awa');
    const binta = users.find((u) => u.id === 'user_binta');
    expect(awa).toMatchObject({ language: 'mnk', kafo_id: 'kafo_brikama' });
    expect(binta).toMatchObject({ language: 'wo', kafo_id: 'kafo_brikama' });
    expect(farmers.filter((f) => !f.has_phone).length).toBeGreaterThanOrEqual(1);
    expect(kafos).toHaveLength(6);
    expect(farmers.length).toBeGreaterThanOrEqual(24);
  });

  it('has one verified hotel, one verified wholesaler, one pending school supplier', () => {
    expect(buyers.map((b) => [b.type, b.verified])).toEqual([['hotel', true], ['wholesaler', true], ['school_supplier', false]]);
  });

  it('has an open 150 kg okra forward order about 10 weeks out', () => {
    const o = orders.find((x) => x.status === 'open');
    expect(o).toMatchObject({ type: 'forward', crop: 'okra', kg: 150, buyer_id: 'buyer_coastal_hotel' });
    expect(o.window_start >= addDays(config.demo_date, 63) && o.window_start <= addDays(config.demo_date, 77)).toBe(true);
  });

  it('has exactly one stale price (older than price_stale_days)', () => {
    const latest = {};
    for (const p of prices) {
      const k = `${p.market_town_id}|${p.crop}`;
      if (!latest[k] || p.date > latest[k]) latest[k] = p.date;
    }
    const stale = Object.entries(latest).filter(([, d]) => d < addDays(config.demo_date, -config.price_stale_days));
    expect(stale.map(([k]) => k)).toEqual(['town_banjul|okra']);
  });

  it('tunes Kombo Central to tomato red, onion yellow, pepper and okra green', () => {
    const district = new Set(kafos.filter((k) => k.district === 'Kombo Central').map((k) => k.id));
    const end = addDays(config.demo_date, config.plant_window_weeks * 7);
    const ratio = (crop) => {
      const cal = crop_calendar.find((c) => c.crop === crop);
      const supply = plantings
        .filter((p) => p.crop === crop && district.has(p.kafo_id) && p.stage !== 'harvested'
          && p.expected_harvest >= config.demo_date && p.expected_harvest <= end)
        .reduce((s, p) => s + p.expected_kg - p.lost_kg, 0);
      const demand = cal.baseline_demand_kg * config.plant_window_weeks
        + orders.filter((o) => o.crop === crop && o.type === 'forward' && o.status === 'open').reduce((s, o) => s + o.kg, 0);
      return supply / demand;
    };
    expect(ratio('tomato')).toBeCloseTo(1.9, 1);
    expect(ratio('onion')).toBeCloseTo(1.0, 1);
    expect(ratio('pepper')).toBeLessThan(config.plant_green_below);
    expect(ratio('okra')).toBeLessThan(config.plant_green_below);
  });
});
