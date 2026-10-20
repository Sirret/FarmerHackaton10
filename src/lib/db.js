// Dexie (IndexedDB) database. Tables, fields and enums follow spec/data-dictionary.md
// exactly; the schema string below is copied from it. Change both together.
import Dexie from 'dexie';

import users from '../data/seed/users.json';
import farmers from '../data/seed/farmers.json';
import kafos from '../data/seed/kafos.json';
import buyers from '../data/seed/buyers.json';
import market_towns from '../data/seed/market_towns.json';
import crop_calendar from '../data/seed/crop_calendar.json';
import plantings from '../data/seed/plantings.json';
import alerts from '../data/seed/alerts.json';
import prices from '../data/seed/prices.json';
import transport_costs from '../data/seed/transport_costs.json';
import orders from '../data/seed/orders.json';
import config from '../data/seed/config.json';

/** @typedef {'en'|'mnk'|'wo'|'ff'|'dyo'} Lang */
/** @typedef {'tomato'|'onion'|'pepper'|'okra'} Crop */
/** @typedef {'green'|'yellow'|'red'|'none'} Signal */

/** @typedef {{ id: string, name: string, phone: string, role: 'farmer'|'leader'|'buyer'|'admin', language: Lang, kafo_id?: string|null, buyer_id?: string|null, verified: boolean, pin?: string|null, created_at: string }} User */
/** @typedef {{ user_id: string, kafo_id: string, crops: Crop[], has_phone: boolean, shared_phone_slot?: number|null, name_clip?: string|null, sms_alerts: boolean, voice_alerts: boolean }} Farmer */
/** @typedef {{ id: string, code: string, name: string, village: string, district: string, market_town_id: string, lat: number, lng: number, total_beds: number, leader_id: string, deputy_id?: string|null, contract_ref: string, contract_signed_on: string, consent_confirmed: boolean, contract_photo?: Blob|null, name_clip?: string|null }} Kafo */
/** @typedef {{ id: string, business_name: string, type: 'hotel'|'wholesaler'|'supermarket'|'school_supplier'|'processor', reg_number: string, contact_name: string, contact_phone: string, location: string, verified: boolean, suspended: boolean }} Buyer */
/** @typedef {{ id: string, name: string, region: 'WCR'|'KMC'|'BJL'|'LRR'|'NBR'|'CRR'|'URR', is_market: boolean, name_clip?: string|null }} MarketTown */
/** @typedef {{ crop: Crop, days_to_harvest: number, harvest_days: number, kg_per_bed: number, pest_risk_months: number[], pest_note_key: string, baseline_demand_kg: number }} CropCalendar */
/** @typedef {{ id: string, kafo_id: string, crop: Crop, beds: number, member_ids: string[], planted_on: string, expected_harvest: string, expected_kg: number, stage: 'planted'|'growing'|'ready'|'harvested', lost_kg: number, lost_reason?: 'pests'|'disease'|'flood'|'drought'|'animals'|'other'|null, order_id?: string|null, logged_by: string, logged_at: string, updated_at: string }} Planting */
/** @typedef {{ id: string, reporter_id: string, kafo_id: string, district: string, crop: Crop, problem: 'insects'|'leaf_spots'|'wilting'|'animals'|'flooding'|'other', voice_note?: Blob|null, verified: boolean, status: 'open'|'dismissed'|'escalated', created_at: string }} Report */
/** @typedef {{ id: string, template_type: 'heavy_rain'|'dry_spell'|'pest_outbreak'|'disease', level: 'yellow'|'red', crops: Crop[], districts: string[], starts_on: string, ends_on: string, note?: string|null, created_by: string }} Alert */
/** @typedef {{ id: string, market_town_id: string, crop: Crop, price_per_kg: number, date: string, entered_by: string }} Price */
/** @typedef {{ from_town_id: string, to_market_id: string, cost_per_bag: number }} TransportCost */
/** @typedef {{ id: string, buyer_id: string, type: 'forward'|'spot', crop: Crop, kg: number, window_start: string, window_end: string, price_per_kg: number, grade: 'A'|'B', fulfilment: 'pickup'|'delivery', delivery_fee: number, repeat_weekly: boolean, offer_id?: string|null, status: 'open'|'partly_filled'|'filled'|'growing'|'ready'|'collected'|'paid'|'cancelled'|'disputed', cancelled_reason?: string|null, created_at: string }} Order */
/** @typedef {{ id: string, order_id: string, kafo_id: string, kg_committed: number, accepted_by: string, accepted_at: string }} OrderAcceptance */
/** @typedef {{ id: string, farmer_id: string, kafo_id: string, crop: Crop, amount_unit: 'bucket'|'bag'|'bags_2_4'|'bags_5_plus', est_kg: number, ready_when: 'today'|'this_week', status: 'pending_leader'|'merged'|'rejected', offer_id?: string|null, created_at: string }} ProduceRequest */
/** @typedef {{ id: string, kafo_id: string, crop: Crop, kg: number, request_ids: string[], ready_when: 'today'|'this_week', status: 'available'|'sold'|'withdrawn', confirmed_by: string }} ProduceOffer */
/** @typedef {{ id: string, order_id: string, kafo_id: string, kg_weighed: number, kg_accepted: number, kg_rejected: number, reject_reason?: 'size'|'ripeness'|'damage'|'other'|null, collected_at: string }} Collection */
/** @typedef {{ id: string, collection_id: string, order_id: string, member_id: string, kg: number }} Delivery */
/** @typedef {{ id: string, order_id: string, member_id: string, amount: number, method: 'wave'|'qmoney'|'afrimoney', status: 'pending'|'paid'|'on_hold', due_by: string, paid_at?: string|null, platform_fee: number }} Payment */
/** @typedef {{ id: string, to_user_id: string, from: string, template_key: string, body: string, lang: Lang, read: boolean, sent_at: string }} Sms */
/** @typedef {{ id: string, user_id: string, direction: 'callback'|'outbound_alert'|'welcome', status: 'ringing'|'answered'|'missed'|'ended', alert_id?: string|null, started_at: string, ended_at?: string|null }} Call */
/** @typedef {{ id: string, phone: string, voice_note?: Blob|null, market_town_id?: string|null, status: 'new'|'contacted'|'registered'|'not_suitable', notes: string, created_at: string }} Lead */
/** @typedef {{ id: string, entity: 'planting'|'collection'|'order'|'report', entity_id: string, reason: 'kg_over_capacity'|'update_burst'|'estimate_gap', status: 'open'|'approved'|'corrected' }} Flag */
/** @typedef {{ id: string, order_id: string, raised_by: string, issue: 'short_delivery'|'quality'|'late_payment'|'other', description: string, status: 'open'|'resolved', resolution_note?: string|null }} Dispute */
/** @typedef {{ id: string, user_id: string, action: string, entity_id: string, at: string }} Audit */
/** @typedef {{ id: 'main', seed_version: number, demo_date: string, plant_green_below: number, plant_red_above: number, sell_green_above: number, sell_red_below: number, report_count: number, report_window_days: number, price_stale_days: number, price_avg_weeks: number, payment_due_hours: number, fee_percent: number, unit_kg: Record<'bucket'|'bag'|'bags_2_4'|'bags_5_plus', number>, theme: string }} Config */

/**
 * @typedef {Dexie & {
 *   users: import('dexie').Table<User, string>, farmers: import('dexie').Table<Farmer, string>,
 *   kafos: import('dexie').Table<Kafo, string>, buyers: import('dexie').Table<Buyer, string>,
 *   market_towns: import('dexie').Table<MarketTown, string>, crop_calendar: import('dexie').Table<CropCalendar, string>,
 *   plantings: import('dexie').Table<Planting, string>, reports: import('dexie').Table<Report, string>,
 *   alerts: import('dexie').Table<Alert, string>, prices: import('dexie').Table<Price, string>,
 *   transport_costs: import('dexie').Table<TransportCost, [string, string]>, orders: import('dexie').Table<Order, string>,
 *   order_acceptances: import('dexie').Table<OrderAcceptance, string>, produce_requests: import('dexie').Table<ProduceRequest, string>,
 *   produce_offers: import('dexie').Table<ProduceOffer, string>, collections: import('dexie').Table<Collection, string>,
 *   deliveries: import('dexie').Table<Delivery, string>, payments: import('dexie').Table<Payment, string>,
 *   sms: import('dexie').Table<Sms, string>, calls: import('dexie').Table<Call, string>,
 *   leads: import('dexie').Table<Lead, string>, flags: import('dexie').Table<Flag, string>,
 *   disputes: import('dexie').Table<Dispute, string>, audit: import('dexie').Table<Audit, string>,
 *   config: import('dexie').Table<Config, string>
 * }} KafoDB
 */

/** @type {KafoDB} */
export const db = /** @type {KafoDB} */ (new Dexie('kafo-signal'));

db.version(1).stores({
  users: 'id, phone, role, kafo_id',
  farmers: 'user_id, kafo_id',
  kafos: 'id, code, district',
  buyers: 'id, verified',
  market_towns: 'id',
  crop_calendar: 'crop',
  plantings: 'id, kafo_id, crop, stage, expected_harvest',
  reports: 'id, kafo_id, district, verified, created_at',
  alerts: 'id, ends_on',
  prices: 'id, market_town_id, crop, date, [market_town_id+crop]',
  transport_costs: '[from_town_id+to_market_id], from_town_id, to_market_id',
  orders: 'id, buyer_id, type, crop, status',
  order_acceptances: 'id, order_id, kafo_id',
  produce_requests: 'id, farmer_id, kafo_id, status',
  produce_offers: 'id, kafo_id, status',
  collections: 'id, order_id, kafo_id',
  deliveries: 'id, collection_id, order_id, member_id',
  payments: 'id, order_id, member_id, status',
  sms: 'id, to_user_id, read, sent_at',
  calls: 'id, user_id',
  leads: 'id, status',
  flags: 'id, status',
  disputes: 'id, order_id, status',
  audit: 'id, user_id, at',
  config: 'id'
});

/** Seed rows per table. Tables not listed start empty. */
const SEED = {
  users, farmers, kafos, buyers, market_towns, crop_calendar, plantings,
  alerts, prices, transport_costs, orders, config: [config],
};

/** Generated ID: prefix_ + 6 random chars. */
export function newId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
}

async function writeSeed() {
  for (const [table, rows] of Object.entries(SEED)) {
    // structuredClone so the imported JSON modules are never mutated.
    await db.table(table).bulkPut(structuredClone(rows));
  }
}

/**
 * Seed on first visit, and reseed when the seed files changed (config.seed_version
 * differs from the browser's copy). Safe with several tabs open: one transaction.
 */
export async function seedIfEmpty() {
  await db.transaction('rw', db.tables, async () => {
    const current = await db.config.get('main');
    if (!current) return writeSeed();
    if (current.seed_version !== config.seed_version) {
      await Promise.all(db.tables.map((t) => t.clear()));
      await writeSeed();
    }
  });
}

let readyPromise;
/** Resolves once the database is seeded and current. Seeds at most once per page. */
export function ready() {
  return (readyPromise ??= seedIfEmpty());
}

/** Wipe every table and reseed. Other open tabs update through liveQuery. */
export async function resetDemo() {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await writeSeed();
  });
}
