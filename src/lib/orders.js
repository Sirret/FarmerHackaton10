// Pure order helpers for the buyer side (and the leader's view of the same orders).
import { addDays, daysBetween } from './dates.js';

export const STAGE_FLOW = ['open', 'partly_filled', 'filled', 'growing', 'ready', 'collected', 'paid'];

/**
 * The stage a buyer sees. Stored status covers open → filled and collected → paid;
 * Growing and Ready are derived from the plantings linked to the order (spec: plan §5.5).
 */
export function orderStage(order, { plantings, collections = [], shipments = [] }) {
  if (['cancelled', 'collected', 'paid', 'disputed', 'open', 'partly_filled'].includes(order.status)) return order.status;
  // Weighed produce on its way: the shipment says where it is.
  const ships = shipments.filter((s) => s.order_id === order.id);
  if (ships.length) return ships.every((s) => s.status === 'delivered') ? 'delivered' : 'in_transit';
  if (collections.some((c) => c.order_id === order.id)) return 'weighed';
  const linked = plantings.filter((p) => p.order_id === order.id);
  if (!linked.length) return order.status; // filled, nothing logged yet
  if (linked.every((p) => p.stage === 'ready' || p.stage === 'harvested')) return 'ready';
  return 'growing';
}

/**
 * Pay each member for her weighed kg, scaled by the share the buyer accepted.
 * amount = kg × price × accepted ÷ weighed (whole dalasi). The platform fee is charged
 * to the buyer on top and never taken from members.
 */
export function memberPayouts({ deliveries, kgWeighed, kgAccepted, pricePerKg, feePercent, deliveryFee = 0 }) {
  const share = kgWeighed > 0 ? kgAccepted / kgWeighed : 0;
  const totalKg = deliveries.reduce((s, d) => s + d.kg, 0);
  return deliveries.map((d) => {
    const produce = Math.round(d.kg * pricePerKg * share);
    // Kafo delivers to the buyer: the delivery fee goes to the members who carried it, by kg.
    const delivery = totalKg > 0 ? Math.round((deliveryFee * d.kg) / totalKg) : 0;
    return { member_id: d.member_id, kg: d.kg, amount: produce + delivery, platform_fee: Math.round((produce * feePercent) / 100) };
  });
}

/** Share of a buyer's payments made by their due time (collection + 48 h). null = no payments yet. */
export function buyerReliability(buyerId, { orders, payments }) {
  const mine = new Set(orders.filter((o) => o.buyer_id === buyerId).map((o) => o.id));
  // One collection is paid at once: judge each collection, not each member payment.
  const byCollection = new Map();
  for (const p of payments) if (mine.has(p.order_id) && p.status === 'paid') byCollection.set(p.collection_id ?? p.id, p);
  const list = [...byCollection.values()];
  if (!list.length) return null;
  return Math.round((list.filter((p) => p.paid_at <= p.due_by).length / list.length) * 100);
}

/** Share of committed kg a kafo actually delivered and had accepted, on finished orders. null = no history yet. */
export function kafoReliability(kafoId, { acceptances, collections, orders }) {
  const done = new Set(orders.filter((o) => o.status === 'collected' || o.status === 'paid').map((o) => o.id));
  const committed = acceptances.filter((a) => a.kafo_id === kafoId && done.has(a.order_id)).reduce((s, a) => s + a.kg_committed, 0);
  if (!committed) return null;
  const accepted = collections.filter((c) => c.kafo_id === kafoId && done.has(c.order_id)).reduce((s, c) => s + (c.kg_accepted ?? 0), 0);
  return Math.min(100, Math.round((accepted / committed) * 100));
}

/**
 * Expected harvest per crop for the next `weeks` weeks. Each unharvested planting's
 * kg (minus losses) is spread evenly over its harvest period.
 * @returns {{ crop: string, weeks: number[] }[]}
 */
export function weeklyOutlook({ plantings, calendar, kafoIds, today, weeks = 8 }) {
  return calendar.map(({ crop, harvest_days }) => {
    const kg = Array(weeks).fill(0);
    for (const p of plantings) {
      if (p.crop !== crop || p.stage === 'harvested' || !kafoIds.has(p.kafo_id)) continue;
      const net = Math.max(0, p.expected_kg - (p.lost_kg || 0));
      const perDay = net / Math.max(1, harvest_days);
      for (let d = 0; d < harvest_days; d++) {
        const week = Math.floor(daysBetween(today, addDays(p.expected_harvest, d)) / 7);
        if (week >= 0 && week < weeks) kg[week] += perDay;
      }
    }
    return { crop, weeks: kg.map(Math.round) };
  });
}

/**
 * What the kafo's members earn if the leader accepts `kg` of this order, before losses.
 * Delivery orders add the kafo's share of the delivery fee (by kg). The platform fee is
 * paid by the buyer on top, so it never comes off this number.
 */
export function expectedCash(order, kg) {
  const amount = Math.max(0, Math.round(Number(kg) || 0));
  const produce = amount * order.price_per_kg;
  const delivery = order.fulfilment === 'delivery' && order.kg > 0 ? Math.round((order.delivery_fee * amount) / order.kg) : 0;
  return { kg: amount, produce, delivery, total: produce + delivery };
}

/** Last day to plant so the crop is ready when the buyer's window opens. */
export const plantBy = (order, cal) => (cal ? addDays(order.window_start, -cal.days_to_harvest) : null);

const STAGE_RANK = { planted: 0, growing: 1, ready: 2, harvested: 3 };
const netKg = (p) => (p.stage === 'harvested' && p.harvested_kg != null ? p.harvested_kg : Math.max(0, p.expected_kg - (p.lost_kg || 0)));
const latest = (xs) => xs.filter(Boolean).sort().at(-1) ?? null;
const earliest = (xs) => xs.filter(Boolean).sort()[0] ?? null;

/** Rows that belong to one order, optionally for one kafo only. */
function orderRows(order, ctx, kafoId) {
  const mine = (r) => r.order_id === order.id && (!kafoId || r.kafo_id === kafoId);
  const collections = ctx.collections.filter(mine);
  const colIds = new Set(collections.map((c) => c.id));
  return {
    acceptances: ctx.acceptances.filter(mine),
    plantings: ctx.plantings.filter(mine),
    collections,
    shipments: (ctx.shipments ?? []).filter(mine),
    payments: (ctx.payments ?? []).filter((p) => colIds.has(p.collection_id)),
  };
}

export const TIMELINE = ['posted', 'accepted', 'assigned', 'growing', 'ready', 'harvested', 'weighed', 'shipped', 'delivered', 'checked', 'paid'];

/**
 * Every step of an order from posting to payment, with when it happened, so leaders
 * and buyers see the same record. Pass kafoId for one kafo's share of the order.
 * @returns {{ key: string, done: boolean, at: string|null, detail?: string }[]}
 */
export function orderTimeline(order, ctx, kafoId = null) {
  const r = orderRows(order, ctx, kafoId);
  const reached = (stage) => r.plantings.length > 0 && r.plantings.every((p) => STAGE_RANK[p.stage] >= STAGE_RANK[stage]);
  const stageAt = (stage) => latest(r.plantings.map((p) => p.stage_dates?.[stage]));
  const committed = r.acceptances.reduce((s, a) => s + a.kg_committed, 0);
  const members = new Set(r.plantings.flatMap((p) => p.member_ids ?? [])).size;
  const weighed = r.collections.reduce((s, c) => s + c.kg_weighed, 0);
  const checked = r.collections.filter((c) => c.kg_accepted != null);
  const steps = {
    posted: { done: true, at: order.created_at, detail: `${order.kg} kg` },
    accepted: { done: r.acceptances.length > 0, at: earliest(r.acceptances.map((a) => a.accepted_at)), detail: committed ? `${committed} kg` : '' },
    assigned: { done: r.plantings.length > 0, at: earliest(r.plantings.map((p) => p.logged_at)), detail: r.plantings.length ? `${members} members · ${r.plantings.reduce((s, p) => s + p.beds, 0)} beds` : '' },
    growing: { done: reached('growing'), at: stageAt('growing') },
    ready: { done: reached('ready'), at: stageAt('ready') },
    harvested: { done: reached('harvested'), at: stageAt('harvested'), detail: reached('harvested') ? `${r.plantings.reduce((s, p) => s + netKg(p), 0)} kg` : '' },
    weighed: { done: r.collections.length > 0, at: latest(r.collections.map((c) => c.collected_at)), detail: weighed ? `${weighed} kg` : '' },
    shipped: { done: r.shipments.length > 0, at: latest(r.shipments.map((s) => s.dispatched_at)) },
    delivered: { done: r.shipments.length > 0 && r.shipments.every((s) => s.status === 'delivered'), at: latest(r.shipments.map((s) => s.delivered_at)) },
    checked: { done: r.collections.length > 0 && checked.length === r.collections.length, at: null, detail: checked.length ? `${checked.reduce((s, c) => s + c.kg_accepted, 0)} kg accepted` : '' },
    paid: { done: r.payments.length > 0 && new Set(r.payments.map((p) => p.collection_id)).size === r.collections.length, at: latest(r.payments.map((p) => p.paid_at)), detail: r.payments.length ? `D${r.payments.reduce((s, p) => s + p.amount, 0)}` : '' },
  };
  // A later step being done means the earlier ones are too (e.g. weighed before anyone pressed Harvested).
  let after = false;
  return TIMELINE.slice().reverse().map((key) => {
    after ||= steps[key].done;
    return { key, ...steps[key], done: after };
  }).reverse();
}

/** First step not done yet, or null when the order is finished. */
export const nextStep = (timeline) => timeline.find((s) => !s.done)?.key ?? null;

/**
 * Kg lost on the way from planting to the buyer: reported losses, a harvest smaller than
 * expected, and kg the buyer rejected. Percent of the kg that was expected.
 */
export function lossSummary(plantings, collections = []) {
  const expected = plantings.reduce((s, p) => s + p.expected_kg, 0);
  const reported = plantings.reduce((s, p) => s + (p.lost_kg || 0), 0);
  const shortHarvest = plantings
    .filter((p) => p.stage === 'harvested' && p.harvested_kg != null)
    .reduce((s, p) => s + Math.max(0, p.expected_kg - (p.lost_kg || 0) - p.harvested_kg), 0);
  const rejected = collections.reduce((s, c) => s + (c.kg_rejected || 0), 0);
  const total = reported + shortHarvest + rejected;
  const byReason = {};
  for (const p of plantings) if (p.lost_kg > 0) byReason[p.lost_reason ?? 'other'] = (byReason[p.lost_reason ?? 'other'] ?? 0) + p.lost_kg;
  return { expected, reported, shortHarvest, rejected, total, percent: expected ? Math.round((total / expected) * 100) : 0, byReason };
}

/**
 * What the buyer can expect: kg on the way (planted, minus losses), kg promised but not
 * planted yet, kg nobody has taken, and when the harvest starts.
 * status: needs_kafos | not_planted | short | late | on_track | done
 */
export function orderProjection(order, ctx, cal) {
  const r = orderRows(order, ctx);
  const committed = r.acceptances.reduce((s, a) => s + a.kg_committed, 0);
  const plantedKg = r.plantings.reduce((s, p) => s + netKg(p), 0);
  let notPlanted = 0;
  for (const a of r.acceptances) {
    // Kafos that accepted but logged no planting yet still owe their whole share.
    if (!r.plantings.some((p) => p.kafo_id === a.kafo_id)) notPlanted += a.kg_committed;
  }
  const expectedKg = plantedKg + notPlanted;
  const readyFrom = earliest(r.plantings.filter((p) => p.stage !== 'harvested').map((p) => p.expected_harvest))
    ?? earliest(r.plantings.map((p) => p.expected_harvest));
  const uncommitted = Math.max(0, order.kg - committed);
  const losses = lossSummary(r.plantings, r.collections);
  let status = 'on_track';
  if (['collected', 'paid'].includes(order.status) || r.collections.length) status = 'done';
  else if (uncommitted > 0) status = 'needs_kafos';
  else if (notPlanted > 0) status = 'not_planted';
  else if (expectedKg < order.kg) status = 'short';
  else if (readyFrom && readyFrom > order.window_end) status = 'late';
  return {
    status, ordered: order.kg, committed, uncommitted, plantedKg, notPlanted, expectedKg,
    gap: Math.max(0, order.kg - expectedKg), readyFrom, plantBy: plantBy(order, cal), losses,
    updatedAt: latest(r.plantings.map((p) => p.updated_at)),
  };
}
