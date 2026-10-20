// Everything the buyer website shows for one buyer, in one live snapshot.
// Privacy rule (plan §5.7): buyers see kafo name, area, verified leader and
// reliability, never farmer names or phone numbers. Nothing here returns them.
import { db } from './db.js';
import { loadSignalData } from './signals.js';
import { fairPriceSignal } from './rules.js';
import { orderStage, kafoReliability } from './orders.js';

export async function loadBuyerView(userId) {
  const user = await db.users.get(userId);
  if (!user || user.role !== 'buyer') return null;
  const data = await loadSignalData();
  if (!data.config) return null;
  const today = data.config.demo_date;

  const [buyer, offers, collections, deliveries, payments, disputes, users] = await Promise.all([
    db.buyers.get(user.buyer_id), db.produce_offers.toArray(), db.collections.toArray(),
    db.deliveries.toArray(), db.payments.toArray(), db.disputes.toArray(), db.users.where('role').equals('leader').toArray(),
  ]);
  const ctx = { acceptances: data.order_acceptances, collections, orders: data.orders };

  /** Public face of a kafo for buyers. */
  const kafoCard = (kafoId) => {
    const k = data.kafos.find((x) => x.id === kafoId);
    const leader = users.find((u) => u.id === k?.leader_id);
    return { id: kafoId, name: k?.name ?? kafoId, district: k?.district, village: k?.village, leader_verified: Boolean(leader?.verified), reliability: kafoReliability(kafoId, ctx) };
  };

  const reference = Object.fromEntries(data.crop_calendar.map(({ crop }) => [crop, fairPriceSignal({ crop, price: 0, today, data }).average]));

  const orders = data.orders
    .filter((o) => o.buyer_id === buyer.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((o) => {
      const acc = data.order_acceptances.filter((a) => a.order_id === o.id);
      const cols = collections.filter((c) => c.order_id === o.id).map((c) => {
        const pays = payments.filter((p) => p.collection_id === c.id);
        return {
          ...c, kafo: kafoCard(c.kafo_id),
          members: deliveries.filter((d) => d.collection_id === c.id).length,
          paid: pays.length > 0, paid_total: pays.reduce((s, p) => s + p.amount, 0),
          fee_total: pays.reduce((s, p) => s + p.platform_fee, 0), method: pays[0]?.method,
        };
      });
      return {
        ...o,
        stage: orderStage(o, { plantings: data.plantings }),
        committed: acc.reduce((s, a) => s + a.kg_committed, 0),
        kafos: acc.map((a) => ({ ...kafoCard(a.kafo_id), kg: a.kg_committed })),
        collections: cols,
        open_dispute: disputes.find((d) => d.order_id === o.id && d.status === 'open') ?? null,
        offer: o.offer_id ? offers.find((x) => x.id === o.offer_id) : null,
      };
    });

  const waitingOffers = new Set(data.orders.filter((o) => o.type === 'spot' && o.status === 'open').map((o) => o.offer_id));
  const market = offers
    .filter((o) => o.status === 'available')
    .map((o) => ({ ...o, kafo: kafoCard(o.kafo_id), reference: reference[o.crop], requested: waitingOffers.has(o.id) }));

  const districts = [...new Set(data.kafos.map((k) => k.district))].sort();

  return {
    today, user, buyer, config: data.config, reference, orders, market, districts,
    calendar: data.crop_calendar,
    // Kafo-level only: drop member and leader IDs from plantings.
    plantings: data.plantings.map(({ member_ids, logged_by, ...p }) => p),
    kafos: data.kafos.map((k) => ({ id: k.id, name: k.name, district: k.district })),
    priceData: { prices: data.prices, config: data.config },
  };
}
