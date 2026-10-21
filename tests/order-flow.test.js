// Order lifecycle helpers (src/lib/orders.js) on the seeded platform history.
import { describe, it, expect } from 'vitest';
import { expectedCash, plantBy, orderTimeline, nextStep, orderProjection, lossSummary, orderStage } from '../src/lib/orders.js';
import { sampleProofPhoto } from '../src/lib/proof.js';

import orders from '../src/data/seed/orders.json';
import order_acceptances from '../src/data/seed/order_acceptances.json';
import plantings from '../src/data/seed/plantings.json';
import collections from '../src/data/seed/collections.json';
import shipments from '../src/data/seed/shipments.json';
import payments from '../src/data/seed/payments.json';
import deliveries from '../src/data/seed/deliveries.json';
import crop_calendar from '../src/data/seed/crop_calendar.json';
import users from '../src/data/seed/users.json';

const ctx = { acceptances: order_acceptances, plantings, collections, shipments, payments };
const order = (id) => orders.find((o) => o.id === id);
const cal = (crop) => crop_calendar.find((c) => c.crop === crop);
const done = (tl) => tl.filter((s) => s.done).map((s) => s.key);

describe('expected cash before accepting', () => {
  it('kg × price, plus the kafo’s share of a delivery fee', () => {
    expect(expectedCash({ kg: 150, price_per_kg: 105, fulfilment: 'pickup', delivery_fee: 0 }, 150).total).toBe(15750);
    const d = expectedCash({ kg: 200, price_per_kg: 110, fulfilment: 'delivery', delivery_fee: 400 }, '100');
    expect(d).toEqual({ kg: 100, produce: 11000, delivery: 200, total: 11200 });
    expect(expectedCash({ kg: 100, price_per_kg: 50 }, '').total).toBe(0);
  });

  it('plant-by date = buyer window start − days to harvest', () => {
    expect(plantBy(order('order_0001'), cal('okra'))).toBe('2026-11-01');
  });
});

describe('seeded history: one example of every step', () => {
  it('paid order has every step done, with dates', () => {
    const tl = orderTimeline(order('order_h01'), ctx);
    expect(done(tl)).toHaveLength(tl.length);
    expect(nextStep(tl)).toBeNull();
    expect(tl.find((s) => s.key === 'harvested').at).toMatch(/^2026-08-25/);
  });

  it('on the road: next step is the handover', () => {
    const tl = orderTimeline(order('order_p01'), ctx);
    expect(nextStep(tl)).toBe('delivered');
    expect(orderStage(order('order_p01'), { plantings, collections, shipments })).toBe('in_transit');
  });

  it('handed over: waiting for the buyer to check and pay', () => {
    expect(nextStep(orderTimeline(order('order_p02'), ctx))).toBe('checked');
    expect(orderStage(order('order_p02'), { plantings, collections, shipments })).toBe('delivered');
  });

  it('growing and short: the buyer projection warns', () => {
    const p = orderProjection(order('order_p03'), ctx, cal('okra'));
    expect(p).toMatchObject({ status: 'short', ordered: 80, expectedKg: 60, gap: 20 });
    expect(nextStep(orderTimeline(order('order_p03'), ctx))).toBe('ready');
  });

  it('the open demo order needs kafos', () => {
    expect(orderProjection(order('order_0001'), ctx, cal('okra'))).toMatchObject({ status: 'needs_kafos', uncommitted: 150 });
  });

  it('one kafo’s view only counts its own rows', () => {
    const tl = orderTimeline(order('order_h02'), ctx, 'kafo_busumbala');
    expect(tl.find((s) => s.key === 'weighed').detail).toBe('92 kg');
  });

  it('every seeded shipment has a proof photo and a 4-digit code', () => {
    for (const s of shipments) {
      expect(s.proof_photo).toMatch(/^data:image\//);
      expect(s.handover_code).toMatch(/^\d{4}$/);
    }
  });

  it('seeded payments add up to the deliveries (no member paid twice)', () => {
    const keys = payments.map((p) => `${p.collection_id}:${p.member_id}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of payments) expect(deliveries.some((d) => d.collection_id === p.collection_id && d.member_id === p.member_id)).toBe(true);
  });

  it('seed only points at users that exist', () => {
    const ids = new Set(users.map((u) => u.id));
    for (const d of deliveries) expect(ids.has(d.member_id)).toBe(true);
    for (const s of shipments) expect(ids.has(s.dispatched_by)).toBe(true);
  });
});

describe('loss metric', () => {
  it('field losses + smaller harvest + rejected kg', () => {
    const l = lossSummary(
      [{ expected_kg: 100, lost_kg: 10, lost_reason: 'pests', stage: 'harvested', harvested_kg: 80 }],
      [{ kg_rejected: 5 }],
    );
    expect(l).toMatchObject({ reported: 10, shortHarvest: 10, rejected: 5, total: 25, percent: 25, byReason: { pests: 10 } });
  });
});

describe('proof photo', () => {
  it('demo photo is an SVG data URL with the kg on the slip', () => {
    const url = sampleProofPhoto({ kafo: 'Brikama', crop: 'Okra', kg: 118, date: '25 Aug', slip: '0388' });
    expect(url).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(url)).toContain('118 kg');
  });
});
