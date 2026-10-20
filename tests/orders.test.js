import { describe, it, expect } from 'vitest';
import { orderStage, memberPayouts, kafoReliability, weeklyOutlook, buyerReliability } from '../src/lib/orders.js';

describe('orderStage', () => {
  const order = { id: 'o1', status: 'filled' };
  it('keeps stored statuses', () => {
    for (const s of ['open', 'partly_filled', 'collected', 'paid', 'cancelled']) expect(orderStage({ id: 'o1', status: s }, { plantings: [] })).toBe(s);
  });
  it('derives growing and ready from linked plantings', () => {
    expect(orderStage(order, { plantings: [] })).toBe('filled');
    expect(orderStage(order, { plantings: [{ order_id: 'o1', stage: 'growing' }, { order_id: 'o1', stage: 'ready' }] })).toBe('growing');
    expect(orderStage(order, { plantings: [{ order_id: 'o1', stage: 'ready' }, { order_id: 'o1', stage: 'harvested' }] })).toBe('ready');
    expect(orderStage(order, { plantings: [{ order_id: 'other', stage: 'ready' }] })).toBe('filled');
  });
});

describe('memberPayouts', () => {
  it('pays kg × price when everything is accepted', () => {
    const r = memberPayouts({ deliveries: [{ member_id: 'awa', kg: 38 }, { member_id: 'binta', kg: 112 }], kgWeighed: 150, kgAccepted: 150, pricePerKg: 55, feePercent: 2.5 });
    expect(r).toEqual([
      { member_id: 'awa', kg: 38, amount: 2090, platform_fee: 52 },
      { member_id: 'binta', kg: 112, amount: 6160, platform_fee: 154 },
    ]);
  });
  it('scales by the accepted share when the buyer rejects some kg', () => {
    const r = memberPayouts({ deliveries: [{ member_id: 'awa', kg: 80 }, { member_id: 'binta', kg: 72 }], kgWeighed: 152, kgAccepted: 150, pricePerKg: 55, feePercent: 2.5 });
    expect(r.map((p) => p.amount)).toEqual([4342, 3908]);
    expect(r.reduce((s, p) => s + p.amount, 0)).toBe(150 * 55);
  });
});

describe('memberPayouts with a delivery fee', () => {
  it('splits the delivery fee by kg; the platform fee is on produce only', () => {
    const r = memberPayouts({ deliveries: [{ member_id: 'awa', kg: 30 }, { member_id: 'binta', kg: 90 }], kgWeighed: 120, kgAccepted: 120, pricePerKg: 50, feePercent: 2.5, deliveryFee: 200 });
    expect(r).toEqual([
      { member_id: 'awa', kg: 30, amount: 1500 + 50, platform_fee: 38 },
      { member_id: 'binta', kg: 90, amount: 4500 + 150, platform_fee: 113 },
    ]);
  });
});

describe('buyerReliability', () => {
  const orders = [{ id: 'o1', buyer_id: 'b1' }, { id: 'o2', buyer_id: 'b1' }, { id: 'o3', buyer_id: 'b2' }];
  it('is the share of collections paid by the due time', () => {
    const payments = [
      { order_id: 'o1', collection_id: 'c1', status: 'paid', paid_at: '2026-10-20T10:00:00Z', due_by: '2026-10-22T10:00:00Z' },
      { order_id: 'o1', collection_id: 'c1', status: 'paid', paid_at: '2026-10-20T10:00:00Z', due_by: '2026-10-22T10:00:00Z' },
      { order_id: 'o2', collection_id: 'c2', status: 'paid', paid_at: '2026-10-25T10:00:00Z', due_by: '2026-10-22T10:00:00Z' },
    ];
    expect(buyerReliability('b1', { orders, payments })).toBe(50);
    expect(buyerReliability('b2', { orders, payments })).toBeNull();
  });
});

describe('kafoReliability', () => {
  const orders = [{ id: 'o1', status: 'paid' }, { id: 'o2', status: 'open' }];
  it('is accepted ÷ committed kg on finished orders', () => {
    const acceptances = [{ order_id: 'o1', kafo_id: 'k1', kg_committed: 100 }, { order_id: 'o2', kafo_id: 'k1', kg_committed: 500 }];
    const collections = [{ order_id: 'o1', kafo_id: 'k1', kg_accepted: 90 }];
    expect(kafoReliability('k1', { acceptances, collections, orders })).toBe(90);
    expect(kafoReliability('k2', { acceptances, collections, orders })).toBeNull();
  });
});

describe('weeklyOutlook', () => {
  it('spreads each planting over its harvest period, week by week', () => {
    const r = weeklyOutlook({
      plantings: [{ crop: 'okra', kafo_id: 'k1', stage: 'growing', expected_kg: 140, lost_kg: 0, expected_harvest: '2026-10-27' }],
      calendar: [{ crop: 'okra', harvest_days: 14 }], kafoIds: new Set(['k1']), today: '2026-10-20', weeks: 4,
    });
    expect(r).toEqual([{ crop: 'okra', weeks: [0, 70, 70, 0] }]);
  });
  it('skips harvested plantings and kafos outside the area filter', () => {
    const r = weeklyOutlook({
      plantings: [
        { crop: 'okra', kafo_id: 'k1', stage: 'harvested', expected_kg: 100, lost_kg: 0, expected_harvest: '2026-10-21' },
        { crop: 'okra', kafo_id: 'k2', stage: 'growing', expected_kg: 100, lost_kg: 0, expected_harvest: '2026-10-21' },
      ],
      calendar: [{ crop: 'okra', harvest_days: 7 }], kafoIds: new Set(['k1']), today: '2026-10-20', weeks: 2,
    });
    expect(r[0].weeks).toEqual([0, 0]);
  });
});
