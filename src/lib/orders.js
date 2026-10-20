// Pure order helpers for the buyer side (and the leader's view of the same orders).
import { addDays, daysBetween } from './dates.js';

export const STAGE_FLOW = ['open', 'partly_filled', 'filled', 'growing', 'ready', 'collected', 'paid'];

/**
 * The stage a buyer sees. Stored status covers open → filled and collected → paid;
 * Growing and Ready are derived from the plantings linked to the order (spec: plan §5.5).
 */
export function orderStage(order, { plantings }) {
  if (['cancelled', 'collected', 'paid', 'disputed', 'open', 'partly_filled'].includes(order.status)) return order.status;
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
export function memberPayouts({ deliveries, kgWeighed, kgAccepted, pricePerKg, feePercent }) {
  const share = kgWeighed > 0 ? kgAccepted / kgWeighed : 0;
  return deliveries.map((d) => {
    const amount = Math.round(d.kg * pricePerKg * share);
    return { member_id: d.member_id, kg: d.kg, amount, platform_fee: Math.round((amount * feePercent) / 100) };
  });
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
