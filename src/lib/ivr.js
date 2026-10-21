// Voice line *4321# state machine (spec §9.4–9.5). PURE: nodes and keys come from
// src/data/ivr/flow.json, clip ids from src/data/ivr/clips.json (generated from
// docs/clips.csv, the single source of truth), verdicts from rules.js via render(…, 'voice').
// The phone plays the chain with src/lib/audio.js (playChain) and runs the effects.
//
// nodeClips() returns a CHAIN of audio.js items:
//   'greet_hello'                                          one clip from clips.json
//   { id: 'num_17', files: ['num_10', 'num_7'], textEn }   several clips played as one (numbers)
//   { kind: 'name', path: 'names/farmer_awa', text }       a name recording (public/audio/names/)
//   { id: 'market_gunjur', files: [], textEn, extra: true } a word the CSV has no clip for
//                                                          (data added later): spoken in English
//
// state = { node, params, history, replays }
// ctx   = makeContext() from ussd.js (same farmer, kafo, signals and alerts).
import flow from '../data/ivr/flow.json';
import clipList from '../data/ivr/clips.json';
import { render } from './render.js';
import { cropName } from './i18n.js';

export const SILENCE_MS = 8000;
export const CLIPS = new Map(clipList.map((c) => [c.id, c]));

const ADVICE = { heavy_rain: 'advice_harvest_early', pest_outbreak: 'advice_check_leaves', disease: 'advice_check_leaves' };
const LEVEL_VERDICT = { yellow: 'verdict_watch_out', red: 'verdict_act_now' };

/**
 * Number → chain items. Recorded numbers: num_1..num_10, num_20..num_90, num_100, num_150,
 * num_200, num_500, num_1000. A number with its own clip is that clip ('num_150'). Any other
 * number is ONE multi-file item, built by adding up recorded parts from the biggest down
 * (17 → num_10 + num_7, 300 → num_200 + num_100, 1469 → num_1000 + num_200 + num_200 + num_60 + num_9),
 * with textEn = the digits, so the English fallback says "seventeen" naturally.
 * 0 or not a number → nothing.
 */
export function numberClips(value) {
  const n = Math.round(Math.abs(Number(value)));
  if (!n) return [];
  if (CLIPS.has(`num_${n}`)) return [`num_${n}`];
  const files = [];
  let r = n;
  while (r >= 1000) { files.push('num_1000'); r -= 1000; }
  if (r >= 100 && !CLIPS.has(`num_${r}`)) {
    let h = Math.floor(r / 100) * 100;
    r -= h;
    for (const part of [500, 200, 100]) while (h >= part) { files.push(`num_${part}`); h -= part; }
  }
  if (r > 0) {
    if (CLIPS.has(`num_${r}`)) files.push(`num_${r}`);
    else { files.push(`num_${Math.floor(r / 10) * 10}`); if (r % 10) files.push(`num_${r % 10}`); }
  }
  return [{ id: `num_${n}`, files, textEn: String(n) }];
}

/** A clip id when the CSV has it, else a spoken-only English item (crops/markets added later). */
function word(id, textEn) {
  return CLIPS.has(id) ? id : { id, files: [], textEn, extra: true };
}
const crop = (c) => word(`crop_${c}`, cropName(c, 'en'));
const market = (ctx, townId) => word(`market_${townId.replace(/^town_/, '')}`, ctx.towns?.[townId] ?? townId.replace(/^town_/, ''));

/** Name recordings live in audio/names/ (no language folder); the engine shows them in subtitles when missing. */
function nameItem(path, text) {
  return { kind: 'name', path: String(path).replace(/\.(mp3|ogg|m4a|wav|webm)$/i, ''), text };
}

const TOKENS = {
  $farmer_name: (ctx) => nameItem(ctx.farmer.name_clip || `names/farmer_${ctx.user.id.replace(/^user_/, '')}`, ctx.user.name.split(' ')[0]),
  $kafo_name: (ctx) => nameItem(ctx.kafo.name_clip || `names/kafo_${ctx.kafo.id.replace(/^kafo_/, '')}`, ctx.kafo.name),
};

/** "Tomato, press 1. Onion, press 2. …" */
const cropChoices = (ctx) => ctx.crops.slice(0, 9).flatMap((c, i) => [crop(c), `press_${i + 1}`]);

const BUILDERS = {
  crop_choices: cropChoices,

  plant_list: (ctx) => ctx.crops.slice(0, 9).flatMap((c, i) => {
    const p = ctx.signals[c].plant;
    return [crop(c), ...render(p.signal, 'voice', ctx.lang, { kind: 'plant', reason: p.reason }), `press_${i + 1}`];
  }),

  plant_detail: (ctx, { crop: c }) => {
    const p = ctx.signals[c].plant;
    const out = [crop(c), ...render(p.signal, 'voice', ctx.lang, { kind: 'plant', reason: p.reason })];
    const o = p.numbers?.next_order;
    if (p.reason === 'buyer_waiting' && o) out.push('buyer_needs', ...numberClips(o.kg), 'unit_kilos', 'in', ...numberClips(o.weeks), 'unit_weeks');
    if (p.signal === 'green') out.push('advice_plant_this_week');
    return out;
  },

  sell_result: (ctx, { crop: c }) => {
    const best = ctx.signals[c].sell.options[0];
    if (best?.order_id) return [crop(c), 'why_buyer', 'about', ...numberClips(best.price), 'dalasi_per_kilo'];
    if (!best || best.signal === 'none' || best.net == null) return [crop(c), 'no_recent_price'];
    return [crop(c), 'best_market_is', market(ctx, best.market_town_id), 'about', ...numberClips(best.net), 'dalasi_per_kilo', 'after_transport'];
  },

  alerts: (ctx) => {
    const out = [];
    for (const a of ctx.alerts) {
      out.push(word(`alert_${a.template_type}`, a.template_type.replace(/_/g, ' ')), ...a.crops.map(crop));
      if (LEVEL_VERDICT[a.level]) out.push(LEVEL_VERDICT[a.level]);
      if (ADVICE[a.template_type]) out.push(ADVICE[a.template_type]);
    }
    for (const c of ctx.crops) {
      const r = ctx.signals[c].risk;
      if (r.signal === 'green' || r.signal === 'none' || r.reason.startsWith('alert_')) continue;
      out.push(crop(c), ...render(r.signal, 'voice', ctx.lang, { kind: 'risk', reason: r.reason }), 'advice_check_leaves');
    }
    return out.length ? out : ['alert_none'];
  },
};

// ------------------------------------------------------------------ engine

const fresh = (node, history = []) => ({ node, params: {}, history, replays: 0 });

/** First node when the farmer answers. direction: callback | outbound_alert | welcome. */
export function startCall(ctx, direction = 'callback') {
  if (!ctx.registered) return fresh('unregistered');
  return fresh(direction === 'outbound_alert' ? 'alert_call' : direction === 'welcome' ? 'welcome' : 'greet');
}

/** The chain to play for this node, in order (audio.js items, see top of file). */
export function nodeClips(state, ctx) {
  const def = flow[state.node];
  const out = [];
  for (const id of def.clips ?? []) out.push(TOKENS[id] ? TOKENS[id](ctx) : id);
  if (def.build) out.push(...BUILDERS[def.build](ctx, state.params));
  for (const id of def.clips_after ?? []) out.push(id);
  return out;
}

/** Readable id of one chain item ('greet_hello', 'names/farmer_awa', 'num_17'). */
export function itemId(item) {
  if (typeof item === 'string') return item;
  return item.kind === 'name' ? item.path : item.id;
}

/** Clip files one chain item plays from public/audio/<lang>/ (names and extra words: none). */
export function itemFiles(item) {
  if (typeof item === 'string') return [item];
  if (item.kind === 'name' || item.extra) return [];
  return item.files?.length ? item.files : [item.id];
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
  return state.replays < 1 ? { ...state, replays: state.replays + 1 } : fresh('goodbye');
}

/** A key (DTMF) during the call. Returns { state, effect }; an invalid key just replays the node. */
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
  if (k === '9') return { state: { ...state, replays: 0 }, effect: null };
  if (k === '0' && state.history.length) {
    return { state: { ...fresh(state.history.at(-1), state.history.slice(0, -1)), params: state.params }, effect: null };
  }
  if (k === '*' && ctx.registered) return { state: fresh('main'), effect: null };
  return { state: { ...state, replays: 0 }, effect: null, invalid: true };
}

/** Every fixed clip id in flow.json (the dynamic ones come from the builders and render()). */
export function flowClipIds() {
  return [...new Set(Object.entries(flow).filter(([k]) => !k.startsWith('_')).flatMap(([, d]) => [...(d.clips ?? []), ...(d.clips_after ?? [])]).filter((id) => !id.startsWith('$')))];
}
