// Voice line *4321# state machine (spec §9.4–9.5). PURE: nodes and keys come from
// src/data/ivr/flow.json, clip scripts from src/data/ivr/clips.json, verdicts from
// rules.js via render(…, 'voice'). The phone plays the clips and runs effects.
//
// state = { node, params, history, replays, prefix }
// ctx   = makeContext() from ussd.js (same farmer, kafo, signals and alerts).
import flow from '../data/ivr/flow.json';
import clipList from '../data/ivr/clips.json';
import { render } from './render.js';

export const SILENCE_MS = 8000;
export const CLIPS = new Map(clipList.map((c) => [c.id, c]));

const ADVICE = { heavy_rain: 'advice_harvest_early', dry_spell: 'advice_dry_spell', pest_outbreak: 'advice_pest_outbreak', disease: 'advice_disease' };
const PLANT_ADVICE = { green: 'advice_plant_this_week', yellow: 'advice_plant_little', red: 'advice_plant_other' };
const LEVEL_VERDICT = { yellow: 'verdict_watch_out', red: 'verdict_act_now' };

/** Number → clip IDs, using whole-number recordings when they exist (num_150), else chaining (num_100 + num_50). */
export function numberClips(value) {
  let n = Math.round(Math.abs(value));
  if (n === 0) return [];
  if (CLIPS.has(`num_${n}`)) return [`num_${n}`];
  const out = [];
  if (n >= 1000) {
    const th = Math.floor(n / 1000);
    out.push(...(th === 1 ? ['num_1000'] : [...numberClips(th), 'num_thousand']));
    n %= 1000;
  }
  if (n >= 100) { out.push(`num_${Math.floor(n / 100) * 100}`); n %= 100; }
  if (n > 0) {
    if (CLIPS.has(`num_${n}`)) out.push(`num_${n}`);
    else { out.push(`num_${Math.floor(n / 10) * 10}`); if (n % 10) out.push(`num_${n % 10}`); }
  }
  return out;
}

/** A playable clip: { id, file, shared, text (farmer language), textEn }. */
function clip(id, lang) {
  const c = CLIPS.get(id);
  return { id, file: id, shared: false, text: c?.scripts?.[lang] ?? c?.en_script ?? id, textEn: c?.en_script ?? id };
}

/** Name recordings live in audio/names/ (no language folder). Spoken by text-to-speech until recorded. */
function nameClip(path, name) {
  const file = path.replace(/\.mp3$/, '');
  return { id: file, file, shared: true, text: name, textEn: name };
}

const TOKENS = {
  $farmer_name: (ctx) => nameClip(ctx.farmer.name_clip ?? `names/farmer_${ctx.user.id.replace(/^user_/, '')}`, ctx.user.name.split(' ')[0]),
  $kafo_name: (ctx) => nameClip(ctx.kafo.name_clip ?? `names/${ctx.kafo.id}`, ctx.kafo.name),
};

const BUILDERS = {
  plant_list: (ctx) => ctx.crops.flatMap((crop, i) => {
    const p = ctx.signals[crop].plant;
    return [`press_${i + 1}`, ...render(p.signal, 'voice', ctx.lang, { kind: 'plant', crop, reason: p.reason })];
  }),

  plant_detail: (ctx, { crop }) => {
    const p = ctx.signals[crop].plant;
    const ids = render(p.signal, 'voice', ctx.lang, { kind: 'plant', crop, reason: p.reason });
    const o = p.numbers.next_order;
    if (p.reason === 'buyer_waiting' && o) ids.push('buyer_needs', ...numberClips(o.kg), 'kilos', 'in', ...numberClips(o.weeks), 'weeks');
    if (PLANT_ADVICE[p.signal]) ids.push(PLANT_ADVICE[p.signal]);
    return ids;
  },

  sell_result: (ctx, { crop }) => {
    const best = ctx.signals[crop].sell.options[0];
    if (best?.order_id) return [`crop_${crop}`, 'your_buyer_pays', ...numberClips(best.price), 'dalasi_per_kilo'];
    if (!best || best.signal === 'none') return [`crop_${crop}`, 'verdict_no_price'];
    return [`crop_${crop}`, 'best_market_is', `market_${best.market_town_id.replace(/^town_/, '')}`, 'about', ...numberClips(best.net), 'dalasi_per_kilo', 'after_transport'];
  },

  alerts: (ctx) => {
    const ids = [];
    for (const a of ctx.alerts) {
      ids.push(`alert_${a.template_type}`, ...(a.crops.length ? a.crops.map((c) => `crop_${c}`) : ['all_crops']), LEVEL_VERDICT[a.level], ADVICE[a.template_type]);
    }
    for (const crop of ctx.crops) {
      const r = ctx.signals[crop].risk;
      if (r.signal === 'green' || r.reason.startsWith('alert_')) continue;
      ids.push(...render(r.signal, 'voice', ctx.lang, { kind: 'risk', crop, reason: r.reason }), 'advice_check_leaves');
    }
    return ids.length ? ids : ['verdict_all_ok'];
  },
};

// ------------------------------------------------------------------ engine

const fresh = (node, history = []) => ({ node, params: {}, history, replays: 0, prefix: [] });

/** First node when the farmer answers. direction: callback | outbound_alert | welcome. */
export function startCall(ctx, direction = 'callback') {
  if (!ctx.registered) return fresh('unregistered');
  return fresh(direction === 'outbound_alert' ? 'alert_call' : direction === 'welcome' ? 'welcome' : 'greet');
}

/** Clips to play for this node, in order. */
export function nodeClips(state, ctx) {
  const def = flow[state.node];
  const L = ctx.lang;
  const out = (state.prefix ?? []).map((id) => clip(id, L));
  for (const id of def.clips ?? []) out.push(TOKENS[id] ? TOKENS[id](ctx) : clip(id, L));
  if (def.build) out.push(...BUILDERS[def.build](ctx, state.params).map((id) => clip(id, L)));
  for (const id of def.clips_after ?? []) out.push(clip(id, L));
  return out;
}

/**
 * After a node finished playing: what next?
 * { kind: 'next', state } go on by itself · { kind: 'hangup' } · { kind: 'record', action, state }
 * { kind: 'wait' } wait for a key (silence → onSilence).
 */
export function afterPlay(state) {
  const def = flow[state.node];
  if (def.hangup) return { kind: 'hangup' };
  if (def.record) return { kind: 'record', action: def.action, state: { ...fresh(def.to, state.history), params: state.params } };
  if (def.next) return { kind: 'next', state: { ...fresh(def.next, def.next === 'main' ? [] : state.history), params: def.next === 'main' ? {} : state.params } };
  return { kind: 'wait' };
}

/** No key for SILENCE_MS: replay the menu once, then say goodbye. */
export function onSilence(state) {
  return state.replays < 1 ? { ...state, replays: state.replays + 1, prefix: [] } : fresh('goodbye');
}

/** A key (DTMF) during the call. Returns { state, effect } ; invalid keys replay the node after "sorry". */
export function pressKey(state, key, ctx) {
  const def = flow[state.node];
  const k = String(key);
  let item = def.keys?.[k];
  if (!item && def.pick && /^[1-9]$/.test(k)) {
    const list = def.pick.list === 'crops' ? ctx.crops : [];
    const value = list[Number(k) - 1];
    if (value) item = { set: { [def.pick.param]: value }, to: def.pick.to };
  }
  if (item) {
    const params = { ...state.params, ...(item.set ?? {}) };
    const next = { ...fresh(item.to, [...state.history, state.node]), params };
    return { state: next, effect: item.action ? { type: item.action, ...params } : null };
  }
  if (k === '9') return { state: { ...state, replays: 0, prefix: [] }, effect: null };
  if (k === '0' && state.history.length) {
    return { state: { ...fresh(state.history.at(-1), state.history.slice(0, -1)), params: state.params }, effect: null };
  }
  if (k === '*' && ctx.registered) return { state: fresh('main'), effect: null };
  return { state: { ...state, replays: 0, prefix: ['invalid_key'] }, effect: null, invalid: true };
}

/** Every clip ID the flow and builders can ask for (the recording guide must cover these). */
export function flowClipIds() {
  return [...new Set(Object.entries(flow).filter(([k]) => !k.startsWith('_')).flatMap(([, d]) => [...(d.clips ?? []), ...(d.clips_after ?? [])]).filter((id) => !id.startsWith('$')))];
}
