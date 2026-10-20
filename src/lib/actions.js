// Every write in the app goes through here, whichever page or channel triggers it
// (admin form, demo button, leader app, farmer USSD/voice). Same validation, same
// notifications, same audit row. Pages never write to db tables directly.
import { db, newId } from './db.js';
import { today, now, jump } from './clock.js';
import { addDays } from './dates.js';
import { cropName, t } from './i18n.js';
import { riskSignal } from './rules.js';
import { loadSignalData } from './signals.js';
import { sendSms, placeOutboundCall, farmersIn, alertSmsVars } from './notify.js';
import alertTemplates from '../data/alert_templates.json';

export const ADMIN_ID = 'user_admin';
const PHONE_RE = /^\d{7}$/;

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

async function uniqueId(table, base, prefix) {
  return (await db.table(table).get(base)) ? newId(prefix) : base;
}

// Inside a transaction, pass at: now() reads config, which is outside the transaction's tables.
async function audit(userId, action, entityId, at) {
  await db.audit.add({ id: newId('audit'), user_id: userId, action, entity_id: entityId, at: at ?? await now() });
}

function required(fields, names) {
  for (const n of names) {
    const v = fields[n];
    if (v === undefined || v === null || v === '' || Number.isNaN(v)) throw new Error(`Missing: ${n.replaceAll('_', ' ')}`);
  }
}

// ---------------------------------------------------------------- accounts

/** Admin registers a kafo and its leader under a contract (spec §8.2). */
export async function registerKafo(f, adminId = ADMIN_ID) {
  required(f, ['name', 'village', 'district', 'market_town_id', 'total_beds', 'contract_ref', 'contract_signed_on', 'leader_name', 'leader_phone', 'leader_language']);
  if (!f.consent_confirmed) throw new Error('Members must agree to data use (consent)');
  if (!(Number(f.total_beds) > 0)) throw new Error('Total beds must be more than 0');
  if (!PHONE_RE.test(f.leader_phone)) throw new Error('Leader phone must be 7 digits');
  if (await db.users.where('phone').equals(f.leader_phone).first()) throw new Error('That phone number is already registered');

  const codes = new Set((await db.kafos.toArray()).map((k) => k.code));
  let code;
  do code = String(Math.floor(Math.random() * 10000)).padStart(4, '0'); while (codes.has(code));

  const kafoId = await uniqueId('kafos', `kafo_${slug(f.village)}`, 'kafo');
  const leaderId = await uniqueId('users', `user_${slug(f.leader_name.split(' ')[0])}`, 'user');
  const ts = await now();

  const leader = {
    id: leaderId, name: f.leader_name.trim(), phone: f.leader_phone, role: 'leader', language: f.leader_language,
    kafo_id: kafoId, buyer_id: null, verified: true, pin: '1234', created_at: ts,
  };
  const kafo = {
    id: kafoId, code, name: f.name.trim(), village: f.village.trim(), district: f.district, market_town_id: f.market_town_id,
    lat: f.lat === '' || f.lat == null ? null : Number(f.lat), lng: f.lng === '' || f.lng == null ? null : Number(f.lng),
    total_beds: Number(f.total_beds), leader_id: leaderId, deputy_id: null,
    contract_ref: f.contract_ref.trim(), contract_signed_on: f.contract_signed_on, consent_confirmed: true,
    contract_photo: null, name_clip: null,
  };
  await db.transaction('rw', db.users, db.kafos, db.audit, async () => {
    await db.users.add(leader);
    await db.kafos.add(kafo);
    await audit(adminId, 'kafo.register', kafoId, ts);
  });
  return { kafo, leader };
}

/** Admin verifies or suspends a buyer; the buyer's user accounts follow. */
export async function setBuyerStatus(buyerId, patch, adminId = ADMIN_ID) {
  const ts = await now();
  await db.transaction('rw', db.buyers, db.users, db.audit, async () => {
    await db.buyers.update(buyerId, patch);
    if ('verified' in patch) await db.users.where('role').equals('buyer').filter((u) => u.buyer_id === buyerId).modify({ verified: patch.verified });
    await audit(adminId, patch.suspended ? 'buyer.suspend' : patch.verified ? 'buyer.verify' : 'buyer.update', buyerId, ts);
  });
}

// ---------------------------------------------------------------- market data

/** Save this week's prices: [{ market_town_id, crop, price_per_kg }]. One row per market × crop × date. */
export async function savePrices(entries, adminId = ADMIN_ID) {
  const [date, ts] = [await today(), await now()];
  const valid = entries.filter((e) => Number(e.price_per_kg) > 0);
  await db.transaction('rw', db.prices, db.audit, async () => {
    for (const e of valid) {
      const existing = await db.prices.where('[market_town_id+crop]').equals([e.market_town_id, e.crop]).filter((p) => p.date === date).first();
      if (existing) await db.prices.update(existing.id, { price_per_kg: Number(e.price_per_kg), entered_by: adminId });
      else await db.prices.add({ id: newId('price'), market_town_id: e.market_town_id, crop: e.crop, price_per_kg: Number(e.price_per_kg), date, entered_by: adminId });
    }
    await audit(adminId, 'prices.save', date, ts);
  });
  return valid.length;
}

export async function saveTransport(fromTownId, toMarketId, costPerBag, adminId = ADMIN_ID) {
  const cost = Number(costPerBag);
  if (!(cost >= 0)) throw new Error('Cost must be 0 or more');
  await db.transport_costs.put({ from_town_id: fromTownId, to_market_id: toMarketId, cost_per_bag: cost });
  await audit(adminId, 'transport.save', `${fromTownId}>${toMarketId}`);
}

// ---------------------------------------------------------------- alerts & reports

/** Admin alert from a template. SMS goes to farmers in those districts who grow those crops. */
export async function createAlert(f, adminId = ADMIN_ID) {
  required(f, ['template_type', 'starts_on', 'ends_on']);
  if (!f.districts?.length) throw new Error('Choose at least one district');
  if (f.ends_on < f.starts_on) throw new Error('End date is before start date');
  const alert = {
    id: newId('alert'), template_type: f.template_type, level: f.level ?? alertTemplates[f.template_type].level,
    crops: f.crops ?? [], districts: f.districts, starts_on: f.starts_on, ends_on: f.ends_on,
    note: f.note?.trim() || null, created_by: adminId,
  };
  await db.alerts.add(alert);
  await audit(adminId, 'alert.create', alert.id);

  const [farmers, kafos, day] = await Promise.all([db.farmers.toArray(), db.kafos.toArray(), today()]);
  const targets = farmersIn(alert, { farmers, kafos }, 'sms');
  for (const f2 of targets) {
    await sendSms(f2.user_id, `sms.alert.${alert.template_type}`, (lang) => alertSmsVars(alert, day, lang));
  }
  return { alert, sent: targets.length };
}

/** End an alert now (it stops counting from today). */
export async function endAlert(alertId, adminId = ADMIN_ID) {
  await db.alerts.update(alertId, { ends_on: addDays(await today(), -1) });
  await audit(adminId, 'alert.end', alertId);
}

/** Ring every farmer with voice alerts on, for an alert (default: the newest active one). */
export async function callFarmersWithAlert(alertId) {
  const day = await today();
  const severity = { red: 2, yellow: 1 };
  const alert = alertId ? await db.alerts.get(alertId)
    : (await db.alerts.toArray())
      .filter((a) => a.ends_on >= day)
      .sort((a, b) => severity[b.level] - severity[a.level] || b.starts_on.localeCompare(a.starts_on))[0];
  if (!alert) throw new Error('No active alert to call about');
  const [farmers, kafos] = await Promise.all([db.farmers.toArray(), db.kafos.toArray()]);
  const targets = farmersIn(alert, { farmers, kafos }, 'voice');
  for (const f of targets) await placeOutboundCall(f.user_id, 'outbound_alert', alert.id);
  return { alert, called: targets.length };
}

/**
 * A farmer (unverified) or leader reports a problem. When reports first push the
 * district's risk for that crop from ALL OK to WATCH OUT, nearby growers get an SMS.
 */
export async function createReport({ reporterId, crop, problem, verified = false, voice_note = null }) {
  const reporter = await db.users.get(reporterId);
  if (!reporter?.kafo_id) throw new Error('Reporter is not in a kafo');
  const kafo = await db.kafos.get(reporter.kafo_id);
  const before = await riskFor(crop, kafo.district);

  const report = {
    id: newId('rep'), reporter_id: reporterId, kafo_id: kafo.id, district: kafo.district, crop, problem,
    voice_note, verified, status: 'open', created_at: await now(),
  };
  await db.reports.add(report);
  if (reporter.role !== 'farmer') await audit(reporterId, 'report.create', report.id);

  const after = await riskFor(crop, kafo.district);
  let warned = 0;
  if (before.signal === 'green' && after.signal !== 'green' && after.reason.startsWith('reports_')) {
    const [farmers, kafos] = await Promise.all([db.farmers.toArray(), db.kafos.toArray()]);
    const targets = farmersIn({ districts: [kafo.district], crops: [crop] }, { farmers, kafos }, 'sms');
    for (const f of targets) {
      await sendSms(f.user_id, 'sms.pest.watch_out', (lang) => ({
        CROP: cropName(crop, lang).toUpperCase(), problem: t(`problem.${problem}`, lang), town: kafo.village,
      }));
    }
    warned = targets.length;
  }
  return { report, before: before.signal, after: after.signal, warned };
}

async function riskFor(crop, district) {
  const data = await loadSignalData();
  return riskSignal({ crop, district, today: data.config.demo_date, data });
}

// ---------------------------------------------------------------- orders

/** A verified buyer posts a forward order (Phase 5 form uses this too). */
export async function postOrder(buyerId, f) {
  const buyer = await db.buyers.get(buyerId);
  if (!buyer) throw new Error('Unknown buyer');
  if (!buyer.verified) throw new Error('Buyer is awaiting verification');
  if (buyer.suspended) throw new Error('Buyer is suspended');
  required(f, ['crop', 'kg', 'window_start', 'window_end', 'price_per_kg']);
  if (!(Number(f.kg) > 0)) throw new Error('Kg must be more than 0');
  if (f.window_end < f.window_start) throw new Error('Delivery window ends before it starts');
  const order = {
    id: newId('order'), buyer_id: buyerId, type: f.type ?? 'forward', crop: f.crop, kg: Number(f.kg),
    window_start: f.window_start, window_end: f.window_end, price_per_kg: Number(f.price_per_kg),
    grade: f.grade ?? 'A', fulfilment: f.fulfilment ?? 'pickup', delivery_fee: Number(f.delivery_fee ?? 0),
    repeat_weekly: Boolean(f.repeat_weekly), offer_id: f.offer_id ?? null, status: 'open', cancelled_reason: null,
    created_at: await now(),
  };
  await db.orders.add(order);
  const user = await db.users.where('role').equals('buyer').filter((u) => u.buyer_id === buyerId).first();
  await audit(user?.id ?? buyerId, 'order.create', order.id);
  return order;
}

// ---------------------------------------------------------------- demo clock

/** Jump the demo clock. Latest prices are carried forward so "where to sell" keeps working. */
export async function jumpDemo(days) {
  const date = await jump(days);
  const prices = await db.prices.toArray();
  const latest = new Map();
  for (const p of prices) {
    const k = `${p.market_town_id}|${p.crop}`;
    if (!latest.has(k) || p.date > latest.get(k).date) latest.set(k, p);
  }
  // Keep a stale price stale (e.g. Banjul okra): only carry forward prices that were current.
  const config = await db.config.get('main');
  const before = addDays(date, -days);
  const rows = [...latest.values()]
    .filter((p) => p.date < date && p.date >= addDays(before, -config.price_stale_days))
    .map((p) => ({ ...p, id: newId('price'), date, entered_by: ADMIN_ID }));
  if (days > 0) await db.prices.bulkAdd(rows);
  return { date, pricesCarried: days > 0 ? rows.length : 0 };
}

// ---------------------------------------------------------------- demo scenario buttons (spec §8.14)

const DEMO_KAFO = 'kafo_brikama';

export async function demoPestReports(crop = 'okra') {
  const reporters = (await db.farmers.where('kafo_id').equals(DEMO_KAFO).toArray()).filter((f) => f.has_phone).slice(0, 3);
  let last;
  for (const f of reporters) last = await createReport({ reporterId: f.user_id, crop, problem: 'insects' });
  return last;
}

export async function demoHeavyRain() {
  const day = await today();
  const kafo = await db.kafos.get(DEMO_KAFO);
  return createAlert({
    template_type: 'heavy_rain', level: 'red', crops: [], districts: [kafo.district],
    starts_on: addDays(day, 2), ends_on: addDays(day, 5), note: 'Demo: from DWR bulletin',
  });
}

export async function demoPostOrder() {
  const day = await today();
  return postOrder('buyer_westfield_wholesale', {
    crop: 'pepper', kg: 200, window_start: addDays(day, 70), window_end: addDays(day, 76), price_per_kg: 62,
  });
}
