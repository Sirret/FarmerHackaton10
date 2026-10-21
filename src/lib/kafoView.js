// Everything the kafo leader app shows for one kafo, in one snapshot.
// Used inside useLive(), so any change in any tab re-runs it.
import { db } from './db.js';
import { loadSignalData } from './signals.js';
import { plantSignal, sellSignal, riskSignal, fairPriceSignal } from './rules.js';
import { buyerReliability, orderTimeline, nextStep, lossSummary, plantBy, expectedCash } from './orders.js';

const OPEN = ['open', 'partly_filled'];
const LIVE = ['open', 'partly_filled', 'filled', 'growing', 'ready', 'collected'];

export async function loadKafoView(kafoId) {
  const data = await loadSignalData();
  const kafo = data.kafos.find((k) => k.id === kafoId);
  if (!kafo || !data.config) return null;
  const today = data.config.demo_date;

  const [users, farmers, requests, offers, interests, collections, deliveries, payments, buyers, shipments] = await Promise.all([
    db.users.toArray(), db.farmers.where('kafo_id').equals(kafoId).toArray(),
    db.produce_requests.where('kafo_id').equals(kafoId).toArray(), db.produce_offers.where('kafo_id').equals(kafoId).toArray(),
    db.interests.where('kafo_id').equals(kafoId).toArray(), db.collections.where('kafo_id').equals(kafoId).toArray(),
    db.deliveries.toArray(), db.payments.toArray(), db.buyers.toArray(), db.shipments.where('kafo_id').equals(kafoId).toArray(),
  ]);
  const calOf = (crop) => data.crop_calendar.find((c) => c.crop === crop);
  // Everything the order timeline needs, limited to this kafo's own rows.
  const ctx = { acceptances: data.order_acceptances, plantings: data.plantings, collections, shipments, payments };
  const userById = new Map(users.map((u) => [u.id, u]));
  const buyerById = new Map(buyers.map((b) => [b.id, b]));
  const name = (id) => userById.get(id)?.name ?? id;

  const members = farmers
    .map((f) => {
      const u = userById.get(f.user_id) ?? {};
      return {
        ...u, ...f, id: f.user_id,
        delivered_kg: deliveries.filter((d) => d.member_id === f.user_id).reduce((s, d) => s + d.kg, 0),
        paid: payments.filter((p) => p.member_id === f.user_id && p.status === 'paid').reduce((s, p) => s + p.amount, 0),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const plantings = data.plantings.filter((p) => p.kafo_id === kafoId)
    .sort((a, b) => (a.stage === 'harvested') - (b.stage === 'harvested') || a.expected_harvest.localeCompare(b.expected_harvest));

  const crops = data.crop_calendar.map(({ crop }) => ({
    crop,
    plant: plantSignal({ crop, district: kafo.district, today, data }),
    sell: sellSignal({ crop, fromTown: kafo.market_town_id, kafoId, today, data }),
    risk: riskSignal({ crop, district: kafo.district, today, data }),
  }));

  const committed = (orderId) => data.order_acceptances.filter((a) => a.order_id === orderId);
  const withBuyer = (o) => ({ ...o, buyer: buyerById.get(o.buyer_id) });

  // Orders this kafo can still take a share of.
  const openOrders = data.orders
    .filter((o) => o.type === 'forward' && OPEN.includes(o.status) && o.window_end >= today)
    .map((o) => {
      const acc = committed(o.id);
      return {
        ...withBuyer(o),
        remaining: o.kg - acc.reduce((s, a) => s + a.kg_committed, 0),
        ours: acc.filter((a) => a.kafo_id === kafoId).reduce((s, a) => s + a.kg_committed, 0),
        fair: fairPriceSignal({ crop: o.crop, price: o.price_per_kg, today, data }),
        buyer_reliability: buyerReliability(o.buyer_id, { orders: data.orders, payments }),
        plant_by: plantBy(o, calOf(o.crop)),
        kg_per_bed: calOf(o.crop)?.kg_per_bed,
      };
    })
    .filter((o) => o.remaining > 0)
    .sort((a, b) => a.window_start.localeCompare(b.window_start));

  // Orders this kafo committed to.
  const ourOrders = [...new Set(data.order_acceptances.filter((a) => a.kafo_id === kafoId).map((a) => a.order_id))]
    .map((id) => data.orders.find((o) => o.id === id))
    .filter((o) => o && LIVE.concat('paid').includes(o.status))
    .map((o) => {
      const cols = collections.filter((c) => c.order_id === o.id);
      const linked = plantings.filter((p) => p.order_id === o.id);
      const ours = committed(o.id).filter((a) => a.kafo_id === kafoId);
      const timeline = orderTimeline(o, ctx, kafoId);
      const kgCommitted = ours.reduce((s, a) => s + a.kg_committed, 0);
      return {
        ...withBuyer(o),
        kg_committed: kgCommitted,
        accepted_at: ours[0]?.accepted_at, accepted_by: ours[0] ? name(ours[0].accepted_by) : null,
        expected_cash: expectedCash(o, kgCommitted),
        plant_by: plantBy(o, calOf(o.crop)),
        kg_per_bed: calOf(o.crop)?.kg_per_bed,
        plantings: linked.map((p) => ({ ...p, members: p.member_ids.map(name) })),
        planted_kg: linked.reduce((s, p) => s + p.expected_kg - (p.lost_kg || 0), 0),
        planted_members: [...new Set(linked.flatMap((p) => p.member_ids))],
        loss: lossSummary(linked, cols),
        timeline, next: nextStep(timeline),
        collections: cols.map((c) => ({
          ...c,
          deliveries: deliveries.filter((d) => d.collection_id === c.id).map((d) => ({ ...d, name: name(d.member_id) })),
          shipment: shipments.find((s) => s.collection_id === c.id) ?? null,
          paid: payments.some((p) => p.collection_id === c.id),
        })),
      };
    })
    .sort((a, b) => a.window_start.localeCompare(b.window_start));

  const reports = data.reports.filter((r) => r.kafo_id === kafoId)
    .map((r) => ({ ...r, reporter: name(r.reporter_id) }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Buyers asking to buy one of our spot offers: the leader confirms or declines.
  const offerIds = new Set(offers.map((o) => o.id));
  const spotRequests = data.orders
    .filter((o) => o.type === 'spot' && o.status === 'open' && offerIds.has(o.offer_id))
    .map((o) => ({ ...withBuyer(o), offer: offers.find((x) => x.id === o.offer_id) }));

  const inbox = {
    spot: spotRequests,
    interests: interests.filter((i) => i.status === 'new').map((i) => ({ ...i, farmer: name(i.farmer_id) })),
    requests: requests.filter((r) => r.status === 'pending_leader').map((r) => ({ ...r, farmer: name(r.farmer_id) })),
    reports: reports.filter((r) => r.status === 'open' && !r.verified),
    orders: openOrders.filter((o) => o.ours === 0),
  };
  inbox.count = inbox.spot.length + inbox.interests.length + inbox.requests.length + inbox.reports.length + inbox.orders.length;

  const alerts = data.alerts
    .filter((a) => a.ends_on >= today && a.districts.includes(kafo.district))
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));

  return {
    today, kafo, config: data.config, calendar: data.crop_calendar,
    town: data.market_towns.find((t) => t.id === kafo.market_town_id),
    towns: Object.fromEntries(data.market_towns.map((t) => [t.id, t.name])),
    leader: userById.get(kafo.leader_id),
    members, plantings, crops, openOrders, ourOrders, offers: offers.slice().reverse(), reports, inbox, alerts,
    loss: lossSummary(plantings, collections),
    earned: payments.filter((p) => p.status === 'paid' && collections.some((c) => c.id === p.collection_id)).reduce((s, p) => s + p.amount, 0),
  };
}
