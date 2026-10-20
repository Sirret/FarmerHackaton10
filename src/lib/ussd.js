// USSD *1234# state machine (spec §9.2). PURE: screens and key routing come from
// src/data/ussd/menu.json, words from i18n.json, verdicts from rules.js + render().
// It never writes data: a key press returns { state, effect } and the phone runs the
// effect through actions.js (the same functions every other channel uses).
//
// state = { screen, params, history, error }
// ctx   = makeContext(snapshot, userId, lang): everything one farmer's menu needs.
import menu from '../data/ussd/menu.json';
import { t, cropName, toPlainLatin } from './i18n.js';
import { render } from './render.js';
import { plantSignal, sellSignal, riskSignal } from './rules.js';
import { addDays, daysBetween } from './dates.js';
import { sortCrops } from './crops.js';

export const IDLE_TIMEOUT_MS = 120_000;
export const UNREGISTERED_PHONE = '7999999'; // demo "unknown number"

// ------------------------------------------------------------------ context

/**
 * Build the farmer's menu context from a data snapshot (see loadUssdSnapshot in phoneData.js).
 * Pure, so tests can feed it seed data directly.
 */
export function makeContext(snap, userId, langOverride = null) {
  const user = snap.users.find((u) => u.id === userId) ?? null;
  const farmer = user ? snap.farmers.find((f) => f.user_id === user.id) ?? null : null;
  const lang = langOverride || user?.language || 'en';
  if (!farmer) return { registered: false, lang, phone: user?.phone || UNREGISTERED_PHONE, profiles: [] };

  const today = snap.config.demo_date;
  const kafo = snap.kafos.find((k) => k.id === farmer.kafo_id);
  const leader = snap.users.find((u) => u.id === kafo.leader_id);
  const crops = sortCrops([...snap.crop_calendar]).map((c) => c.crop);
  const signals = Object.fromEntries(crops.map((crop) => [crop, {
    plant: plantSignal({ crop, district: kafo.district, today, data: snap }),
    sell: sellSignal({ crop, fromTown: kafo.market_town_id, kafoId: kafo.id, today, data: snap }),
    risk: riskSignal({ crop, district: kafo.district, today, data: snap }),
  }]));
  const slot = (id) => snap.farmers.find((f) => f.user_id === id)?.shared_phone_slot ?? 9;
  const profiles = snap.users
    .filter((u) => u.role === 'farmer' && u.phone && u.phone === user.phone)
    .sort((a, b) => slot(a.id) - slot(b.id))
    .map((u) => ({ id: u.id, name: u.name }));
  const windowStart = addDays(today, -(snap.config.report_window_days - 1));

  return {
    registered: true, lang, today, user, farmer, kafo, leader, crops, signals, profiles,
    phone: user.phone,
    towns: Object.fromEntries(snap.market_towns.map((m) => [m.id, m.name])),
    buyers: Object.fromEntries(snap.buyers.map((b) => [b.id, b])),
    alerts: snap.alerts.filter((a) => a.ends_on >= today && a.starts_on <= addDays(today, snap.config.alert_lead_days ?? 7) && a.districts.includes(kafo.district)),
    recentReports: snap.reports.filter((r) => r.district === kafo.district && r.status !== 'dismissed' && r.created_at.slice(0, 10) >= windowStart),
    delivered: snap.deliveries.filter((d) => d.member_id === user.id).reduce((s, d) => s + d.kg, 0),
    paid: snap.payments.filter((p) => p.member_id === user.id && p.status === 'paid').reduce((s, p) => s + p.amount, 0),
  };
}

// ------------------------------------------------------------------ builders

const first = (name) => name.split(' ')[0];
const upper = (crop, lang) => cropName(crop, lang).toUpperCase();
const word = (signal, kind, lang) => render(signal, 'ussd', lang, { kind });
const onOff = (v, lang) => t(v ? 'ussd.on' : 'ussd.off', lang);

const LISTS = {
  crops: (ctx) => ctx.crops.map((c) => ({ value: c, label: cropName(c, ctx.lang) })),
  profiles: (ctx) => ctx.profiles.map((p) => ({ value: p.id, label: p.name })),
};

const LABELS = {
  plant_item: (ctx, crop) => {
    const p = ctx.signals[crop].plant;
    const w = p.signal === 'green' && p.reason === 'buyer_waiting' ? t('ussd.plant.good_buyer', ctx.lang) : word(p.signal, 'plant', ctx.lang);
    return `${cropName(crop, ctx.lang)}: ${w}`;
  },
  sms_toggle: (ctx) => t('ussd.alerts.sms', ctx.lang, { state: onOff(ctx.farmer.sms_alerts, ctx.lang) }),
  voice_toggle: (ctx) => t('ussd.alerts.voice', ctx.lang, { state: onOff(ctx.farmer.voice_alerts, ctx.lang) }),
};

const BODIES = {
  main_title: (ctx) => [t('ussd.main.hi', ctx.lang, { name: first(ctx.user.name), kafo: t('ussd.kafo_short', ctx.lang, { village: ctx.kafo.village }) })],

  plant_title: (ctx) => [t('ussd.plant.title', ctx.lang, { town: ctx.kafo.village })],

  plant_detail: (ctx, { crop }) => {
    const p = ctx.signals[crop].plant;
    const L = ctx.lang;
    const lines = [`${upper(crop, L)}: ${word(p.signal, 'plant', L)}`];
    if (p.reason === 'buyer_waiting' && p.numbers.next_order) {
      const o = p.numbers.next_order;
      const buyer = t(`buyer_type.${ctx.buyers[o.buyer_id]?.type ?? 'other'}`, L);
      lines.push(t('ussd.plant.buyer_needs', L, { buyer, kg: o.kg, weeks: o.weeks }), t('ussd.plant.few', L));
    } else if (p.reason === 'few_planting') lines.push(t('ussd.plant.few', L));
    else if (p.reason === 'some_planting') lines.push(t('ussd.plant.some', L));
    else if (p.reason === 'many_planting') lines.push(t('ussd.plant.many', L));
    lines.push(t(`ussd.plant.advice.${p.signal}`, L));
    return lines;
  },

  interest_done: (ctx, { crop }) => [t('ussd.interest_done', ctx.lang, { leader: first(ctx.leader.name), crop: cropName(crop, ctx.lang).toLowerCase() })],

  sell_result: (ctx, { crop }) => {
    const L = ctx.lang;
    const options = ctx.signals[crop].sell.options.slice(0, 3);
    return [
      t('ussd.sell.title', L, { CROP: upper(crop, L) }),
      ...options.map((o, i) => {
        const n = i + 1;
        if (o.order_id) return t('ussd.sell.order_row', L, { n, word: word('green', 'sell', L), price: o.price });
        if (o.signal === 'none') return t('ussd.sell.row_none', L, { n, market: ctx.towns[o.market_town_id] });
        return t('ussd.sell.row', L, { n, market: ctx.towns[o.market_town_id], word: word(o.signal, 'sell', L), net: o.net });
      }),
      t('ussd.sell.transport', L),
    ];
  },

  alerts: (ctx) => {
    const L = ctx.lang;
    const lines = [];
    // Area alerts first ("ALL: ACT NOW / Heavy rain in 2 days"), then crop risks from reports.
    for (const a of ctx.alerts) {
      const n = Math.max(0, daysBetween(ctx.today, a.starts_on));
      const when = n === 0 ? t('sms.when.today', L) : n === 1 ? t('sms.when.tomorrow', L) : t('sms.when.days', L, { n });
      const target = a.crops.length ? a.crops.map((c) => upper(c, L)).join('/') : t('ussd.alerts.all', L);
      lines.push(`${target}: ${word(a.level, 'risk', L)}`, t('ussd.alerts.when', L, { alert: t(`alert.${a.template_type}`, L), when }));
    }
    for (const crop of ctx.crops) {
      const r = ctx.signals[crop].risk;
      if (r.signal === 'green' || r.reason.startsWith('alert_')) continue;
      lines.push(t('ussd.alerts.row', L, { CROP: upper(crop, L), word: word(r.signal, 'risk', L) }), t(`reason.${r.reason}`, L));
    }
    return lines.length ? lines : [t('ussd.alerts.none', L)];
  },

  produce_done: (ctx) => [t('ussd.produce.done', ctx.lang, { leader: first(ctx.leader.name) })],

  report_done: (ctx, { crop, problem }) => {
    const L = ctx.lang;
    const others = new Set(ctx.recentReports.filter((r) => r.crop === crop && r.reporter_id !== ctx.user.id).map((r) => r.reporter_id)).size;
    return [
      t('ussd.report.thanks', L, { name: first(ctx.user.name) }),
      ...(others > 0 ? [t('ussd.report.others', L, { n: others })] : []),
      t('ussd.report.leader', L),
      t(`ussd.report.advice.${problem}`, L),
    ];
  },

  call_me: (ctx) => [t('ussd.call_me', ctx.lang)],

  profile: (ctx) => {
    const L = ctx.lang;
    return [
      t('ussd.profile.name', L, { name: ctx.user.name }),
      t('ussd.profile.kafo', L, { kafo: ctx.kafo.name }),
      t('ussd.profile.lang', L, { lang: t(`lang.${ctx.user.language}`, L) }),
      t('ussd.profile.crops', L, { crops: ctx.farmer.crops.map((c) => cropName(c, L).toLowerCase()).join(', ') }),
      t('ussd.profile.delivered', L, { kg: ctx.delivered }),
      t('ussd.profile.paid', L, { amount: ctx.paid }),
    ];
  },

  help: (ctx) => [
    t('ussd.help.good', ctx.lang), t('ussd.help.careful', ctx.lang), t('ussd.help.stop', ctx.lang),
    t('ussd.help.leader', ctx.lang, { name: first(ctx.leader.name), phone: ctx.leader.phone }),
  ],

  unregistered: (ctx) => [t('ussd.unreg.text', ctx.lang)],
  lead_done: (ctx) => [t('ussd.lead_done', ctx.lang)],
};

// ------------------------------------------------------------------ engine

/** Items on a screen, with keys: list screens number their entries 1..n. */
function itemsOf(def, ctx) {
  if (def.list) {
    return LISTS[def.list](ctx).map((x, i) => ({
      key: String(i + 1),
      label: def.labelFn ? LABELS[def.labelFn](ctx, x.value) : x.label,
      set: { [def.param]: x.value }, action: def.action, to: def.to,
    }));
  }
  return (def.items ?? []).map((it) => ({ ...it, label: it.labelFn ? LABELS[it.labelFn](ctx) : t(it.label, ctx.lang) }));
}

/** First screen after dialling *1234#. */
export function startSession(ctx) {
  const screen = !ctx.registered ? 'UNREGISTERED' : ctx.profiles.length > 1 ? 'WHO' : 'MAIN';
  return { screen, params: {}, history: [], error: null };
}

/** What the phone shows: plain-Latin lines (wrapping is the screen's job). */
export function renderScreen(state, ctx) {
  const def = menu[state.screen];
  const L = ctx.lang;
  const lines = [];
  if (state.error) lines.push(t('ussd.invalid', L));
  if (def.title) lines.push(t(def.title, L));
  if (def.body) lines.push(...BODIES[def.body](ctx, state.params));
  for (const it of itemsOf(def, ctx)) lines.push(`${it.key} ${it.label}`);
  if (def.end) lines.push(`00 ${t('ussd.main_menu', L)}`);
  else if (!def.noBack) lines.push(`0 ${t('ussd.back', L)}`);
  return { lines: lines.map(toPlainLatin), end: Boolean(def.end), close: Boolean(def.close) };
}

/**
 * Handle the farmer's reply. Returns the next state and, when the choice does
 * something, an effect: { type, ...params } for the phone to run.
 */
export function reply(state, input, ctx) {
  const key = String(input).trim();
  const def = menu[state.screen];
  // Final messages only accept 00, so going "back" can't send a request twice.
  if (def.end && key !== '00') return { state: { ...state, error: true }, effect: null };
  const item = itemsOf(def, ctx).find((it) => it.key === key);

  if (item) {
    const params = { ...state.params, ...(item.set ?? {}) };
    const next = { screen: item.to, params, history: [...state.history, state.screen], error: null };
    const effect = item.action ? { type: item.action, ...params } : null;
    return { state: next, effect };
  }
  if (key === '00' && ctx.registered) {
    return { state: { screen: ctx.profiles.length > 1 && !state.params.profile ? 'WHO' : 'MAIN', params: { profile: state.params.profile }, history: [], error: null }, effect: null };
  }
  if (key === '0' && !def.noBack && state.history.length) {
    const history = state.history.slice(0, -1);
    return { state: { ...state, screen: state.history.at(-1), history, error: null }, effect: null };
  }
  return { state: { ...state, error: true }, effect: null };
}
