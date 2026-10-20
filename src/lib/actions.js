// Every write in the app goes through here, whichever page or channel triggers it
// (admin form, demo button, leader app, farmer USSD/voice). Same validation, same
// notifications, same audit row. Pages never write to db tables directly.
import { db, newId } from './db.js';
import { today, now, jump } from './clock.js';
import { addDays, formatDate } from './dates.js';
import { cropName, t } from './i18n.js';
import { riskSignal } from './rules.js';
import { loadSignalData } from './signals.js';
import { sendSms, placeOutboundCall, farmersIn, alertSmsVars } from './notify.js';
import { plantingFlags, deliveryFlags } from './quality.js';
import { memberPayouts } from './orders.js';
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
export async function postOrder(buyerId, f, userId = null) {
  if (userId) await assertBuyer(userId, buyerId);
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
  await audit(userId ?? user?.id ?? buyerId, 'order.create', order.id);
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

export async function demoProduceRequests() {
  return [
    await createProduceRequest({ farmerId: 'user_awa', crop: 'pepper', amount_unit: 'bag', ready_when: 'today' }),
    await createProduceRequest({ farmerId: 'user_binta', crop: 'pepper', amount_unit: 'bags_2_4', ready_when: 'this_week' }),
  ];
}

export async function demoInterest() {
  return createInterest({ farmerId: 'user_binta', crop: 'okra' });
}

// ---------------------------------------------------------------- permissions

/** Only the kafo's own leader (or the admin) may write kafo data. Returns the user. */
async function assertLeader(userId, kafoId) {
  const user = await db.users.get(userId);
  if (user?.role === 'admin') return user;
  if (user?.role !== 'leader' || user.kafo_id !== kafoId) throw new Error("Only this kafo's leader can do that");
  return user;
}

async function raiseFlags(entity, entityId, reasons) {
  for (const reason of reasons) await db.flags.add({ id: newId('flag'), entity, entity_id: entityId, reason, status: 'open' });
  return reasons;
}

// ---------------------------------------------------------------- farmers (phone)

/** Farmer: "Tell my leader I'm interested" in planting a crop. */
export async function createInterest({ farmerId, crop }) {
  const farmer = await db.farmers.get(farmerId);
  if (!farmer) throw new Error('Not a registered farmer');
  const row = { id: newId('int'), farmer_id: farmerId, kafo_id: farmer.kafo_id, crop, status: 'new', created_at: await now() };
  await db.interests.add(row);
  return row;
}

/** Farmer: "I have produce". Waits for the leader to confirm or merge it. */
export async function createProduceRequest({ farmerId, crop, amount_unit, ready_when }) {
  const farmer = await db.farmers.get(farmerId);
  if (!farmer) throw new Error('Not a registered farmer');
  const config = await db.config.get('main');
  const row = {
    id: newId('req'), farmer_id: farmerId, kafo_id: farmer.kafo_id, crop, amount_unit,
    est_kg: config.unit_kg[amount_unit], ready_when, status: 'pending_leader', offer_id: null, created_at: await now(),
  };
  await db.produce_requests.add(row);
  return row;
}

/** A simulated call moves on: answered, missed (declined / not picked up) or ended. */
export async function setCallStatus(callId, status) {
  if (!['ringing', 'answered', 'missed', 'ended'].includes(status)) throw new Error('Unknown call status');
  const patch = { status };
  if (status === 'missed' || status === 'ended') patch.ended_at = await now();
  await db.calls.update(callId, patch);
}

/** Farmer opened her messages: mark them all read. */
export async function markSmsRead(userId) {
  await db.sms.where('to_user_id').equals(userId).filter((s) => !s.read).modify({ read: true });
}

/** Farmer switches her own alerts: { sms_alerts } and/or { voice_alerts }. */
export async function setFarmerAlerts(farmerId, patch) {
  const allowed = Object.fromEntries(Object.entries(patch).filter(([k]) => k === 'sms_alerts' || k === 'voice_alerts').map(([k, v]) => [k, Boolean(v)]));
  const farmer = await db.farmers.get(farmerId);
  if (!farmer) throw new Error('Not a registered farmer');
  if (!farmer.has_phone) throw new Error('No phone registered');
  await db.farmers.update(farmerId, allowed);
}

/** An unknown number asks to join (USSD / voice). The admin follows up (spec §5). */
export async function createLead({ phone, voice_note = null, market_town_id = null }) {
  const open = await db.leads.where('status').equals('new').filter((l) => l.phone === phone).first();
  if (open) return open; // one open lead per number
  const row = { id: newId('lead'), phone, voice_note, market_town_id, status: 'new', notes: '', created_at: await now() };
  await db.leads.add(row);
  return row;
}

// ---------------------------------------------------------------- kafo leader

export async function markInterestSeen(interestId, leaderId) {
  const row = await db.interests.get(interestId);
  await assertLeader(leaderId, row.kafo_id);
  await db.interests.update(interestId, { status: 'seen' });
}

/**
 * Leader logs a planting. Harvest date and kg come pre-filled from the crop calendar
 * (the form passes the leader's edits). Raises a data-quality flag when kg or beds
 * are far above the kafo's capacity. Returns { planting, flags }.
 */
export async function logPlanting(f, leaderId) {
  await assertLeader(leaderId, f.kafo_id);
  required(f, ['kafo_id', 'crop', 'beds', 'planted_on']);
  const beds = Number(f.beds);
  if (!(beds > 0)) throw new Error('Beds must be more than 0');
  const [cal, kafo, active, ts] = await Promise.all([
    db.crop_calendar.get(f.crop), db.kafos.get(f.kafo_id),
    db.plantings.where('kafo_id').equals(f.kafo_id).filter((p) => p.stage !== 'harvested').toArray(), now(),
  ]);
  const planting = {
    id: newId('plant'), kafo_id: f.kafo_id, crop: f.crop, beds, member_ids: f.member_ids ?? [],
    planted_on: f.planted_on,
    expected_harvest: f.expected_harvest || addDays(f.planted_on, cal.days_to_harvest),
    expected_kg: f.expected_kg === '' || f.expected_kg == null ? beds * cal.kg_per_bed : Number(f.expected_kg),
    stage: 'planted', lost_kg: 0, lost_reason: null, order_id: f.order_id || null,
    logged_by: leaderId, logged_at: ts, updated_at: ts,
  };
  await db.plantings.add(planting);
  await audit(leaderId, 'planting.create', planting.id);
  const flags = await raiseFlags('planting', planting.id, plantingFlags({
    planting, kgPerBed: cal.kg_per_bed, totalBeds: kafo.total_beds,
    otherActiveBeds: active.reduce((s, p) => s + p.beds, 0),
  }));
  // Growing for a buyer order: members learn the crop is already sold (spec §9.3 "Buyer took the order").
  if (planting.order_id) {
    const order = await db.orders.get(planting.order_id);
    for (const memberId of planting.member_ids) {
      await sendSms(memberId, 'sms.order_taken', (lang) => ({
        crop: cropName(planting.crop, lang).toLowerCase(), kafo: kafo.name, day: formatDate(order.window_start), time: '9:00',
      }));
    }
  }
  return { planting, flags };
}

export const STAGES = ['planted', 'growing', 'ready', 'harvested'];

export async function setPlantingStage(plantingId, stage, leaderId) {
  if (!STAGES.includes(stage)) throw new Error('Unknown stage');
  const p = await db.plantings.get(plantingId);
  await assertLeader(leaderId, p.kafo_id);
  await db.plantings.update(plantingId, { stage, updated_at: await now() });
  await audit(leaderId, `planting.stage.${stage}`, plantingId);
}

/** "Lost some / all": lost_kg is the total lost so far (capped at the expected kg). */
export async function reportLoss(plantingId, { lost_kg, lost_reason }, leaderId) {
  const p = await db.plantings.get(plantingId);
  await assertLeader(leaderId, p.kafo_id);
  if (!lost_reason) throw new Error('Choose a reason');
  const kg = Math.min(p.expected_kg, Math.max(0, Math.round(Number(lost_kg))));
  await db.plantings.update(plantingId, { lost_kg: kg, lost_reason, updated_at: await now() });
  await audit(leaderId, 'planting.loss', plantingId);
}

/** Accept all or part of a buyer order. The rest stays open for other kafos. */
export async function acceptOrder(orderId, kafoId, kg, leaderId) {
  await assertLeader(leaderId, kafoId);
  const ts = await now();
  return db.transaction('rw', db.orders, db.order_acceptances, db.audit, async () => {
    const order = await db.orders.get(orderId);
    if (!order || !['open', 'partly_filled'].includes(order.status)) throw new Error('This order is no longer open');
    const acc = await db.order_acceptances.where('order_id').equals(orderId).toArray();
    const remaining = order.kg - acc.reduce((s, a) => s + a.kg_committed, 0);
    const amount = Math.round(Number(kg));
    if (!(amount > 0)) throw new Error('Kg must be more than 0');
    if (amount > remaining) throw new Error(`Only ${remaining} kg is still open`);
    const row = { id: newId('acc'), order_id: orderId, kafo_id: kafoId, kg_committed: amount, accepted_by: leaderId, accepted_at: ts };
    await db.order_acceptances.add(row);
    await db.orders.update(orderId, { status: amount === remaining ? 'filled' : 'partly_filled' });
    await audit(leaderId, 'order.accept', orderId, ts);
    return row;
  });
}

/**
 * Confirm one or more members' produce requests as a single kafo offer buyers can see.
 * One request = confirm; several = merge. The leader may correct the total kg.
 * Each member gets an SMS that her produce is now on offer.
 */
export async function confirmProduce(requestIds, kg, leaderId) {
  if (!requestIds.length) throw new Error('Choose at least one request');
  const requests = await db.produce_requests.bulkGet(requestIds);
  const kafoId = requests[0]?.kafo_id;
  await assertLeader(leaderId, kafoId);
  if (requests.some((r) => !r || r.status !== 'pending_leader' || r.kafo_id !== kafoId)) throw new Error('A request was already handled');
  if (new Set(requests.map((r) => r.crop)).size > 1) throw new Error('Only merge requests for the same crop');
  const total = kg === '' || kg == null ? requests.reduce((s, r) => s + r.est_kg, 0) : Math.round(Number(kg));
  if (!(total > 0)) throw new Error('Kg must be more than 0');

  const offer = {
    id: newId('offer'), kafo_id: kafoId, crop: requests[0].crop, kg: total, request_ids: requestIds,
    ready_when: requests.some((r) => r.ready_when === 'today') ? 'today' : 'this_week',
    status: 'available', confirmed_by: leaderId,
  };
  await db.transaction('rw', db.produce_offers, db.produce_requests, async () => {
    await db.produce_offers.add(offer);
    for (const r of requests) await db.produce_requests.update(r.id, { status: 'merged', offer_id: offer.id });
  });
  await audit(leaderId, requestIds.length > 1 ? 'produce.merge' : 'produce.confirm', offer.id);
  for (const r of requests) {
    await sendSms(r.farmer_id, 'sms.produce_confirmed', (lang) => ({ amount: t(`unit.${r.amount_unit}`, lang), crop: cropName(r.crop, lang).toLowerCase() }));
  }
  return offer;
}

export async function rejectProduceRequest(requestId, leaderId) {
  const r = await db.produce_requests.get(requestId);
  await assertLeader(leaderId, r.kafo_id);
  await db.produce_requests.update(requestId, { status: 'rejected' });
  await audit(leaderId, 'produce.reject', requestId);
}

export async function withdrawOffer(offerId, leaderId) {
  const o = await db.produce_offers.get(offerId);
  await assertLeader(leaderId, o.kafo_id);
  if (o.status !== 'available') throw new Error('Only available offers can be withdrawn');
  await db.produce_offers.update(offerId, { status: 'withdrawn' });
  await audit(leaderId, 'offer.withdraw', offerId);
}

/** Leader confirms (verified → can turn risk red) or dismisses a member's problem report. */
export async function reviewReport(reportId, decision, leaderId) {
  const r = await db.reports.get(reportId);
  await assertLeader(leaderId, r.kafo_id);
  if (decision === 'verify') await db.reports.update(reportId, { verified: true });
  else if (decision === 'dismiss') await db.reports.update(reportId, { status: 'dismissed' });
  else throw new Error('Unknown decision');
  await audit(leaderId, `report.${decision}`, reportId);
}

/**
 * Leader weighs the kafo's produce for an order on the scale, kg per member.
 * Creates the collection (the buyer confirms accepted kg in Phase 5) and one delivery per member.
 */
export async function recordDelivery(orderId, kafoId, perMember, leaderId) {
  await assertLeader(leaderId, kafoId);
  const rows = perMember.map((m) => ({ member_id: m.member_id, kg: Math.round(Number(m.kg)) })).filter((m) => m.kg > 0);
  if (!rows.length) throw new Error('Enter the weighed kg for at least one member');
  const [acc, linked, ts] = await Promise.all([
    db.order_acceptances.where('order_id').equals(orderId).filter((a) => a.kafo_id === kafoId).toArray(),
    db.plantings.where('kafo_id').equals(kafoId).filter((p) => p.order_id === orderId).toArray(),
    now(),
  ]);
  if (!acc.length) throw new Error('This kafo has not accepted that order');
  const weighed = rows.reduce((s, m) => s + m.kg, 0);
  const collection = {
    id: newId('col'), order_id: orderId, kafo_id: kafoId, kg_weighed: weighed,
    kg_accepted: null, kg_rejected: null, reject_reason: null, collected_at: ts,
  };
  await db.transaction('rw', db.collections, db.deliveries, async () => {
    await db.collections.add(collection);
    await db.deliveries.bulkAdd(rows.map((m) => ({ id: newId('del'), collection_id: collection.id, order_id: orderId, member_id: m.member_id, kg: m.kg })));
  });
  await audit(leaderId, 'delivery.record', collection.id);
  const expectedKg = linked.length
    ? linked.reduce((s, p) => s + p.expected_kg - (p.lost_kg || 0), 0)
    : acc.reduce((s, a) => s + a.kg_committed, 0);
  const flags = await raiseFlags('collection', collection.id, deliveryFlags({ expectedKg, weighedKg: weighed }));
  return { collection, flags };
}

/** Leader registers a member (Option A). She gets a welcome SMS and a welcome call. */
export async function addMember(f, leaderId) {
  await assertLeader(leaderId, f.kafo_id);
  required(f, ['kafo_id', 'name', 'language']);
  const hasPhone = Boolean(f.has_phone);
  if (hasPhone && !PHONE_RE.test(f.phone ?? '')) throw new Error('Phone must be 7 digits');
  if (hasPhone && (await db.users.where('phone').equals(f.phone).first())) throw new Error('That phone number is already registered');
  if (!f.crops?.length) throw new Error('Choose at least one crop');

  const id = await uniqueId('users', `user_${slug(f.name.split(' ')[0])}`, 'user');
  const ts = await now();
  const user = { id, name: f.name.trim(), phone: hasPhone ? f.phone : '', role: 'farmer', language: f.language, kafo_id: f.kafo_id, buyer_id: null, verified: true, pin: null, created_at: ts };
  const farmer = { user_id: id, kafo_id: f.kafo_id, crops: f.crops, has_phone: hasPhone, shared_phone_slot: null, name_clip: null, sms_alerts: hasPhone, voice_alerts: false };
  await db.transaction('rw', db.users, db.farmers, async () => {
    await db.users.add(user);
    await db.farmers.add(farmer);
  });
  await audit(leaderId, 'member.add', id);
  if (hasPhone) {
    const kafo = await db.kafos.get(f.kafo_id);
    await sendSms(id, 'sms.welcome', { name: user.name.split(' ')[0], kafo: kafo.name });
    await placeOutboundCall(id, 'welcome');
  }
  return { user, farmer };
}

// ---------------------------------------------------------------- buyer

/** A buyer user acting for their own business. Writes also need a verified, active buyer. */
async function assertBuyer(userId, buyerId, { write = true } = {}) {
  const user = await db.users.get(userId);
  if (user?.role === 'admin') return user;
  if (user?.role !== 'buyer' || user.buyer_id !== buyerId) throw new Error('Only this buyer can do that');
  if (write) {
    const buyer = await db.buyers.get(buyerId);
    if (!buyer?.verified) throw new Error('Your business is awaiting verification');
    if (buyer.suspended) throw new Error('Your account is suspended');
  }
  return user;
}

/** Buyer cancels an order. Only while it is still open and no kafo has committed. */
export async function cancelOrder(orderId, userId, reason = 'Cancelled by buyer') {
  const order = await db.orders.get(orderId);
  await assertBuyer(userId, order.buyer_id, { write: false });
  const acc = await db.order_acceptances.where('order_id').equals(orderId).count();
  if (order.status !== 'open' || acc > 0) throw new Error('Only open orders that no kafo has accepted can be cancelled');
  await db.orders.update(orderId, { status: 'cancelled', cancelled_reason: reason });
  await audit(userId, 'order.cancel', orderId);
}

/** Buyer wants a kafo's confirmed spot offer. Creates a spot order the leader must confirm. */
export async function buyOffer(offerId, { price_per_kg }, userId) {
  const user = await db.users.get(userId);
  const offer = await db.produce_offers.get(offerId);
  if (offer?.status !== 'available') throw new Error('This offer is no longer available');
  const pending = await db.orders.where('type').equals('spot').filter((o) => o.offer_id === offerId && o.status === 'open').count();
  if (pending) throw new Error('Another buyer is already waiting for this offer');
  const day = await today();
  return postOrder(user?.buyer_id, {
    type: 'spot', offer_id: offerId, crop: offer.crop, kg: offer.kg, price_per_kg,
    window_start: day, window_end: addDays(day, offer.ready_when === 'today' ? 2 : 7),
  }, userId);
}

/** Leader confirms selling a spot offer to the buyer who asked. Members who put produce in get an SMS. */
export async function confirmSpotSale(orderId, leaderId) {
  const order = await db.orders.get(orderId);
  const offer = order?.offer_id && (await db.produce_offers.get(order.offer_id));
  if (!offer || order.status !== 'open') throw new Error('This request is no longer open');
  await assertLeader(leaderId, offer.kafo_id);
  const ts = await now();
  await db.transaction('rw', db.orders, db.order_acceptances, db.produce_offers, async () => {
    await db.order_acceptances.add({ id: newId('acc'), order_id: orderId, kafo_id: offer.kafo_id, kg_committed: order.kg, accepted_by: leaderId, accepted_at: ts });
    await db.orders.update(orderId, { status: 'filled' });
    await db.produce_offers.update(offer.id, { status: 'sold' });
  });
  await audit(leaderId, 'offer.sell', orderId);
  const [kafo, requests] = await Promise.all([db.kafos.get(offer.kafo_id), db.produce_requests.bulkGet(offer.request_ids)]);
  for (const r of requests.filter(Boolean)) {
    await sendSms(r.farmer_id, 'sms.order_taken', (lang) => ({ crop: cropName(offer.crop, lang).toLowerCase(), kafo: kafo.name, day: formatDate(order.window_start), time: '9:00' }));
  }
}

export async function declineSpotSale(orderId, leaderId) {
  const order = await db.orders.get(orderId);
  const offer = await db.produce_offers.get(order.offer_id);
  await assertLeader(leaderId, offer.kafo_id);
  if (order.status !== 'open') throw new Error('This request is no longer open');
  await db.orders.update(orderId, { status: 'cancelled', cancelled_reason: 'Declined by kafo' });
  await audit(leaderId, 'offer.decline', orderId);
}

/** Buyer confirms what was collected: accepted kg, and why any kg were rejected. */
export async function confirmCollection(collectionId, { kg_accepted, reject_reason }, userId) {
  const col = await db.collections.get(collectionId);
  const order = await db.orders.get(col.order_id);
  await assertBuyer(userId, order.buyer_id);
  if (col.kg_accepted != null) throw new Error('Already confirmed');
  const accepted = Math.round(Number(kg_accepted));
  if (!(accepted >= 0 && accepted <= col.kg_weighed)) throw new Error(`Accepted kg must be between 0 and ${col.kg_weighed}`);
  const rejected = col.kg_weighed - accepted;
  if (rejected > 0 && !reject_reason) throw new Error('Say why kg were rejected');
  await db.collections.update(collectionId, { kg_accepted: accepted, kg_rejected: rejected, reject_reason: rejected > 0 ? reject_reason : null });
  if (order.status !== 'paid') await db.orders.update(order.id, { status: 'collected' });
  await audit(userId, 'collection.confirm', collectionId);
}

/**
 * Buyer pays (mock Wave / QMoney / Afrimoney). One payment per member, straight to her
 * wallet, for her weighed kg × price scaled by the accepted share. The leader never holds
 * group money. Every member gets a PAID SMS. Held while the order has an open dispute.
 */
export async function payCollection(collectionId, method, userId) {
  const col = await db.collections.get(collectionId);
  const order = await db.orders.get(col.order_id);
  await assertBuyer(userId, order.buyer_id);
  if (col.kg_accepted == null) throw new Error('Confirm the collected kg first');
  if (!['wave', 'qmoney', 'afrimoney'].includes(method)) throw new Error('Choose a payment method');
  if (await db.payments.filter((p) => p.collection_id === collectionId).count()) throw new Error('Already paid');
  if (await db.disputes.where('order_id').equals(order.id).filter((d) => d.status === 'open').count()) {
    throw new Error('Payment is on hold: an issue on this order is open with the admin');
  }
  const [deliveries, config, ts] = await Promise.all([db.deliveries.where('collection_id').equals(collectionId).toArray(), db.config.get('main'), now()]);
  const payouts = memberPayouts({ deliveries, kgWeighed: col.kg_weighed, kgAccepted: col.kg_accepted, pricePerKg: order.price_per_kg, feePercent: config.fee_percent });
  const dueBy = new Date(Date.parse(col.collected_at) + config.payment_due_hours * 3_600_000).toISOString();
  const rows = payouts.map((p) => ({
    id: newId('pay'), order_id: order.id, collection_id: collectionId, member_id: p.member_id, amount: p.amount,
    method, status: 'paid', due_by: dueBy, paid_at: ts, platform_fee: p.platform_fee,
  }));
  await db.payments.bulkAdd(rows);

  // Paid in full once every kafo that committed has a confirmed, paid collection.
  const [acc, cols, pays] = await Promise.all([
    db.order_acceptances.where('order_id').equals(order.id).toArray(),
    db.collections.where('order_id').equals(order.id).toArray(),
    db.payments.where('order_id').equals(order.id).toArray(),
  ]);
  const paidCols = new Set(pays.map((p) => p.collection_id));
  const allPaid = acc.every((a) => cols.some((c) => c.kafo_id === a.kafo_id && paidCols.has(c.id)));
  await db.orders.update(order.id, { status: allPaid ? 'paid' : 'collected' });
  await audit(userId, 'payment.pay', collectionId);

  for (const p of payouts) {
    await sendSms(p.member_id, 'sms.paid', (lang) => ({ kg: p.kg, crop: cropName(order.crop, lang).toLowerCase(), amount: p.amount, wallet: t(`wallet.${method}`, lang) }));
  }
  return { payments: rows, total: rows.reduce((s, r) => s + r.amount, 0), fee: rows.reduce((s, r) => s + r.platform_fee, 0) };
}

/** Buyer or leader reports a problem with an order. Payment waits until the admin resolves it. */
export async function reportIssue(orderId, { issue, description }, userId) {
  const [order, user] = await Promise.all([db.orders.get(orderId), db.users.get(userId)]);
  const leaderOk = user?.role === 'leader'
    && (await db.order_acceptances.where('order_id').equals(orderId).filter((a) => a.kafo_id === user.kafo_id).count()) > 0;
  if (!(user?.role === 'admin' || leaderOk || (user?.role === 'buyer' && user.buyer_id === order.buyer_id))) throw new Error('You are not part of this order');
  if (!issue) throw new Error('Choose what went wrong');
  const row = { id: newId('disp'), order_id: orderId, raised_by: userId, issue, description: description?.trim() ?? '', status: 'open', resolution_note: null };
  await db.disputes.add(row);
  await audit(userId, 'dispute.create', row.id);
  return row;
}
