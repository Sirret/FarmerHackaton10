// Kafo Signal colour engine. PURE: takes a data snapshot (see loadSignalData in
// signals.js), returns 'green' | 'yellow' | 'red' | 'none' plus a reason code and
// the numbers behind it. Never returns colours or class names.
import { addDays, daysBetween } from './dates.js';

const RANK = { none: -1, green: 0, yellow: 1, red: 2 };
/** The more severe of two signals. */
export const worst = (a, b) => (RANK[b] > RANK[a] ? b : a);

// Order statuses that still represent produce to be grown and delivered.
const LIVE_ORDER = ['open', 'partly_filled', 'filled', 'growing', 'ready'];

const kafoIdsIn = (data, district) =>
  new Set(data.kafos.filter((k) => k.district === district).map((k) => k.id));

const cropCal = (data, crop) => data.crop_calendar.find((c) => c.crop === crop);

/**
 * PLANT: expected supply ÷ demand for one crop in one district.
 *
 * Horizon = today → the day a planting made today would finish harvesting
 * (days_to_harvest + harvest_days), so a new planting always counts.
 * Supply = unharvested plantings whose harvest overlaps the horizon (expected − lost kg)
 *        + kg committed to buyer orders by kafos here that isn't logged as a planting yet.
 * Demand = baseline weekly demand × horizon weeks
 *        + forward orders due in the horizon: kg committed by kafos here + kg nobody has committed yet.
 * Ratio < plant_green_below → green · ≤ plant_red_above → yellow · above → red.
 */
export function plantSignal({ crop, district, today, data }) {
  const cal = cropCal(data, crop);
  const { plant_green_below, plant_red_above } = data.config;
  if (!cal) return { signal: 'none', reason: 'unknown_crop', ratio: null, numbers: {} };

  const horizonDays = cal.days_to_harvest + cal.harvest_days;
  const horizonEnd = addDays(today, horizonDays);
  const here = kafoIdsIn(data, district);

  const plantings = data.plantings.filter((p) => p.crop === crop && here.has(p.kafo_id)
    && p.stage !== 'harvested'
    && p.expected_harvest <= horizonEnd
    && addDays(p.expected_harvest, cal.harvest_days) >= today);
  const plantedKg = plantings.reduce((s, p) => s + Math.max(0, p.expected_kg - (p.lost_kg || 0)), 0);

  const orders = data.orders.filter((o) => o.crop === crop && o.type === 'forward'
    && LIVE_ORDER.includes(o.status) && o.window_end >= today && o.window_start <= horizonEnd);

  let orderDemandKg = 0;
  let committedNotPlantedKg = 0;
  for (const o of orders) {
    const acc = data.order_acceptances.filter((a) => a.order_id === o.id);
    const committedAll = acc.reduce((s, a) => s + a.kg_committed, 0);
    const committedHere = acc.filter((a) => here.has(a.kafo_id)).reduce((s, a) => s + a.kg_committed, 0);
    orderDemandKg += committedHere + Math.max(0, o.kg - committedAll);
    // A commitment counts as supply until the kafo logs plantings for that order.
    for (const a of acc.filter((x) => here.has(x.kafo_id))) {
      const linkedKg = data.plantings
        .filter((p) => p.order_id === o.id && p.kafo_id === a.kafo_id)
        .reduce((s, p) => s + Math.max(0, p.expected_kg - (p.lost_kg || 0)), 0);
      committedNotPlantedKg += Math.max(0, a.kg_committed - linkedKg);
    }
  }

  const weeks = horizonDays / 7;
  const baselineKg = Math.round(cal.baseline_demand_kg * weeks);
  const supply_kg = plantedKg + committedNotPlantedKg;
  const demand_kg = baselineKg + orderDemandKg;
  const ratio = demand_kg > 0 ? supply_kg / demand_kg : (supply_kg > 0 ? Infinity : 0);

  const signal = ratio < plant_green_below ? 'green' : ratio <= plant_red_above ? 'yellow' : 'red';
  const openKg = orders.reduce((s, o) => {
    const committedAll = data.order_acceptances.filter((a) => a.order_id === o.id).reduce((t, a) => t + a.kg_committed, 0);
    return s + Math.max(0, o.kg - committedAll);
  }, 0);
  const reason = signal === 'red' ? 'many_planting'
    : signal === 'yellow' ? 'some_planting'
    : openKg > 0 ? 'buyer_waiting' : 'few_planting';

  // Nearest open order, for "Hotel needs 150kg in 10 wks".
  const next = orders
    .filter((o) => o.status === 'open' || o.status === 'partly_filled')
    .sort((a, b) => a.window_start.localeCompare(b.window_start))[0];

  return {
    signal, reason, ratio,
    numbers: {
      supply_kg, demand_kg, baseline_kg: baselineKg, order_kg: orderDemandKg, open_order_kg: openKg,
      plantings: plantings.length, horizon_end: horizonEnd,
      next_order: next ? { id: next.id, buyer_id: next.buyer_id, kg: next.kg, weeks: Math.round(daysBetween(today, next.window_start) / 7) } : null,
    },
  };
}

/**
 * SELL: for a kafo's market town, compare each market's latest price minus transport
 * (per kg, from cost per bag) with the 4-week average price across all markets.
 * net ≥ avg × sell_green_above → green · net < avg × sell_red_below → red · else yellow.
 * A price older than price_stale_days → 'none' (no recent price).
 * A confirmed order for this kafo is always green.
 * Returns markets sorted best first.
 */
export function sellSignal({ crop, fromTown, kafoId, today, data }) {
  const c = data.config;
  const bagKg = c.unit_kg.bag;
  const avgFrom = addDays(today, -(c.price_avg_weeks * 7));
  const staleBefore = addDays(today, -c.price_stale_days);

  const recent = data.prices.filter((p) => p.crop === crop && p.date > avgFrom && p.date <= today);
  const avg = recent.length ? recent.reduce((s, p) => s + p.price_per_kg, 0) / recent.length : null;

  const markets = data.market_towns.filter((t) => t.is_market).map((town) => {
    const latest = data.prices
      .filter((p) => p.crop === crop && p.market_town_id === town.id && p.date <= today)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const transport = data.transport_costs.find((t) => t.from_town_id === fromTown && t.to_market_id === town.id);
    const transport_per_kg = transport ? transport.cost_per_bag / bagKg : 0;

    if (!latest || latest.date < staleBefore || avg == null) {
      return { market_town_id: town.id, signal: 'none', reason: 'no_recent_price', price: latest?.price_per_kg ?? null, net: null, price_date: latest?.date ?? null, transport_per_kg };
    }
    const net = latest.price_per_kg - transport_per_kg;
    const signal = net >= avg * c.sell_green_above ? 'green' : net < avg * c.sell_red_below ? 'red' : 'yellow';
    const reason = signal === 'green' ? 'price_high' : signal === 'red' ? 'price_low' : 'price_normal';
    return { market_town_id: town.id, signal, reason, price: latest.price_per_kg, net: Math.round(net), price_date: latest.date, transport_per_kg };
  });

  // Confirmed buyer orders for this kafo: always green, listed first.
  const confirmed = kafoId == null ? [] : data.order_acceptances
    .filter((a) => a.kafo_id === kafoId)
    .map((a) => data.orders.find((o) => o.id === a.order_id))
    .filter((o) => o && o.crop === crop && LIVE_ORDER.includes(o.status))
    .map((o) => ({ order_id: o.id, buyer_id: o.buyer_id, signal: 'green', reason: 'order_confirmed', price: o.price_per_kg, net: o.price_per_kg }));

  const priced = markets.filter((m) => m.signal !== 'none').sort((a, b) => b.net - a.net);
  const unpriced = markets.filter((m) => m.signal === 'none');
  const options = [...confirmed, ...priced, ...unpriced];
  return { signal: options[0]?.signal ?? 'none', average: avg == null ? null : Math.round(avg), options };
}

/**
 * FAIR PRICE for a buyer order: offered price vs the 4-week average across markets.
 * ≥ average → green (fair or better) · ≥ average × sell_red_below → yellow · below → red.
 * No recent prices → 'none'.
 */
export function fairPriceSignal({ crop, price, today, data }) {
  const c = data.config;
  const avgFrom = addDays(today, -(c.price_avg_weeks * 7));
  const recent = data.prices.filter((p) => p.crop === crop && p.date > avgFrom && p.date <= today);
  if (!recent.length) return { signal: 'none', reason: 'no_recent_price', average: null };
  const average = recent.reduce((s, p) => s + p.price_per_kg, 0) / recent.length;
  const signal = price >= average ? 'green' : price >= average * c.sell_red_below ? 'yellow' : 'red';
  const reason = signal === 'green' ? 'price_fair' : signal === 'yellow' ? 'price_bit_low' : 'price_too_low';
  return { signal, reason, average: Math.round(average) };
}

/**
 * RISK: active admin alerts + problem reports in the district for this crop.
 * An admin alert sets its own level (yellow or red). Alerts are warnings, so they count
 * from alert_lead_days before they start until they end ("heavy rain in 2 days").
 * Reports in the last report_window_days (not dismissed):
 *   - unverified reports can only raise the signal to yellow (needs report_count of them);
 *   - red needs a leader-verified report: ≥1 verified and ≥ report_count in total → red;
 *     a single verified report on its own → yellow.
 */
export function riskSignal({ crop, district, today, data }) {
  const c = data.config;
  const issuedFrom = addDays(today, c.alert_lead_days ?? 7);
  const alerts = data.alerts.filter((a) => a.starts_on <= issuedFrom && a.ends_on >= today
    && a.districts.includes(district) && (a.crops.length === 0 || a.crops.includes(crop)));

  const windowStart = addDays(today, -(c.report_window_days - 1));
  const reports = data.reports.filter((r) => r.crop === crop && r.district === district
    && r.status !== 'dismissed' && r.created_at.slice(0, 10) >= windowStart && r.created_at.slice(0, 10) <= today);
  const verified = reports.filter((r) => r.verified).length;

  let reportSignal = 'green';
  if (verified > 0 && reports.length >= c.report_count) reportSignal = 'red';
  else if (verified > 0 || reports.length >= c.report_count) reportSignal = 'yellow';

  const alertSignal = alerts.reduce((s, a) => worst(s, a.level), 'green');
  const signal = worst(reportSignal, alertSignal);

  const topAlert = alerts.sort((a, b) => RANK[b.level] - RANK[a.level])[0];
  const reason = signal === 'green' ? 'all_ok'
    : RANK[alertSignal] >= RANK[reportSignal] && topAlert ? `alert_${topAlert.template_type}`
    : verified > 0 ? 'reports_verified' : 'reports_unverified';

  const problems = {};
  for (const r of reports) problems[r.problem] = (problems[r.problem] || 0) + 1;

  return {
    signal, reason,
    numbers: { reports: reports.length, verified, alerts: alerts.map((a) => a.id), top_alert: topAlert?.template_type ?? null, problems },
  };
}
