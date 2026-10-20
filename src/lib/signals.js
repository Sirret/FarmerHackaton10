// Loads the data snapshot rules.js needs from Dexie. Wrap calls in useLive()
// so signals update the moment any tab changes plantings, orders, reports, etc.
import { db } from './db.js';
import { plantSignal, sellSignal, riskSignal } from './rules.js';

export async function loadSignalData() {
  const [kafos, plantings, orders, order_acceptances, crop_calendar, prices, transport_costs, market_towns, alerts, reports, config] =
    await Promise.all([
      db.kafos.toArray(), db.plantings.toArray(), db.orders.toArray(), db.order_acceptances.toArray(),
      db.crop_calendar.toArray(), db.prices.toArray(), db.transport_costs.toArray(), db.market_towns.toArray(),
      db.alerts.toArray(), db.reports.toArray(), db.config.get('main'),
    ]);
  return { kafos, plantings, orders, order_acceptances, crop_calendar, prices, transport_costs, market_towns, alerts, reports, config };
}

/** All three signals for every crop, as seen by one kafo. */
export async function kafoSignals(kafoId) {
  const data = await loadSignalData();
  if (!data.config) return null;
  const kafo = data.kafos.find((k) => k.id === kafoId);
  if (!kafo) return null;
  const today = data.config.demo_date;
  const base = { district: kafo.district, today, data };
  return {
    today,
    kafo,
    towns: Object.fromEntries(data.market_towns.map((t) => [t.id, t.name])),
    crops: data.crop_calendar.map(({ crop }) => ({
      crop,
      plant: plantSignal({ crop, ...base }),
      sell: sellSignal({ crop, fromTown: kafo.market_town_id, kafoId, today, data }),
      risk: riskSignal({ crop, ...base }),
    })),
  };
}
