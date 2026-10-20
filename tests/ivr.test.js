// Voice line *4321# on real seed data, following the spec §9.7 Wolof demo path.
import { describe, it, expect, beforeEach } from 'vitest';
import { startCall, nodeClips, afterPlay, onSilence, pressKey, numberClips, flowClipIds, CLIPS } from '../src/lib/ivr.js';
import { makeContext } from '../src/lib/ussd.js';
import { render } from '../src/lib/render.js';
import flow from '../src/data/ivr/flow.json';
import users from '../src/data/seed/users.json';
import farmers from '../src/data/seed/farmers.json';
import kafos from '../src/data/seed/kafos.json';
import buyers from '../src/data/seed/buyers.json';
import market_towns from '../src/data/seed/market_towns.json';
import crop_calendar from '../src/data/seed/crop_calendar.json';
import plantings from '../src/data/seed/plantings.json';
import alerts from '../src/data/seed/alerts.json';
import prices from '../src/data/seed/prices.json';
import transport_costs from '../src/data/seed/transport_costs.json';
import orders from '../src/data/seed/orders.json';
import config from '../src/data/seed/config.json';

let snap;
beforeEach(() => {
  snap = structuredClone({
    users, farmers, kafos, buyers, market_towns, crop_calendar, plantings, alerts, prices, transport_costs, orders, config,
    order_acceptances: [], reports: [], deliveries: [], payments: [],
  });
  snap.crop_calendar.sort((a, b) => a.crop.localeCompare(b.crop)); // IndexedDB order
});

const ids = (state, ctx) => nodeClips(state, ctx).map((c) => c.id);

/** Answer the call and follow the automatic steps until the first menu. */
function answer(ctx, direction) {
  let state = startCall(ctx, direction);
  const heard = [];
  for (;;) {
    heard.push(...ids(state, ctx));
    const a = afterPlay(state);
    if (a.kind !== 'next') return { state, heard };
    state = a.state;
  }
}

describe('Binta calls *4321# (spec §9.7)', () => {
  it('greets her by name and kafo, then plays the main menu', () => {
    const ctx = makeContext(snap, 'user_binta', 'wo');
    const { state, heard } = answer(ctx, 'callback');
    expect(heard).toEqual(['greet_hello', 'names/farmer_binta', 'greet_from_kafo', 'names/kafo_brikama', 'menu_main']);
    expect(state.node).toBe('main');
    expect(afterPlay(state).kind).toBe('wait');
  });

  it('1 → tomato: better not to plant … okra: good choice, a buyer is waiting', () => {
    const ctx = makeContext(snap, 'user_binta', 'wo');
    const plant = pressKey(answer(ctx).state, '1', ctx).state;
    const heard = ids(plant, ctx);
    expect(heard.slice(0, 4)).toEqual(['press_1', 'crop_tomato', 'verdict_dont_plant', 'why_many_planting']);
    expect(heard).toEqual(expect.arrayContaining(['press_4', 'crop_okra', 'verdict_good_plant', 'why_buyer']));
    expect(heard.at(-1)).toBe('menu_crop_detail');
  });

  it('4 → okra detail with spoken numbers, 1 → tell the leader', () => {
    const ctx = makeContext(snap, 'user_binta', 'wo');
    const detail = pressKey(pressKey(answer(ctx).state, '1', ctx).state, '4', ctx).state;
    expect(ids(detail, ctx)).toEqual(['crop_okra', 'verdict_good_plant', 'why_buyer', 'buyer_needs', 'num_150', 'kilos', 'in', 'num_10', 'weeks', 'advice_plant_this_week', 'menu_tell_leader']);
    const told = pressKey(detail, '1', ctx);
    expect(told.effect).toEqual({ type: 'interest', crop: 'okra' });
    expect(ids(told.state, ctx)).toEqual(['leader_told']);
    expect(afterPlay(told.state).state.node).toBe('main');
  });

  it('outbound alert call: "Act now: heavy rain…" then the main menu', () => {
    snap.alerts.push({ id: 'a', template_type: 'heavy_rain', level: 'red', crops: [], districts: ['Kombo Central'], starts_on: '2026-10-22', ends_on: '2026-10-25' });
    const ctx = makeContext(snap, 'user_binta', 'wo');
    const { heard, state } = answer(ctx, 'outbound_alert');
    expect(heard).toEqual(['greet_hello', 'names/farmer_binta', 'alert_heavy_rain', 'all_crops', 'verdict_act_now', 'advice_harvest_early', 'menu_main']);
    expect(state.node).toBe('main');
  });
});

describe('call behaviour', () => {
  const ctxOf = () => makeContext(snap, 'user_awa');

  it('9 repeats, 0 goes back, * goes to the main menu, wrong keys say sorry', () => {
    const ctx = ctxOf();
    const plant = pressKey(answer(ctx).state, '1', ctx).state;
    expect(pressKey(plant, '9', ctx).state.node).toBe('plant');
    expect(pressKey(plant, '0', ctx).state.node).toBe('main');
    const detail = pressKey(plant, '2', ctx).state;
    expect(pressKey(detail, '*', ctx).state.node).toBe('main');
    const wrong = pressKey(answer(ctx).state, '7', ctx);
    expect(wrong.invalid).toBe(true);
    expect(ids(wrong.state, ctx)[0]).toBe('invalid_key');
    expect(ids(wrong.state, ctx)).toContain('menu_main');
  });

  it('silence replays the menu once, then says goodbye and hangs up', () => {
    const ctx = ctxOf();
    const main = answer(ctx).state;
    const replay = onSilence(main);
    expect(replay.node).toBe('main');
    const bye = onSilence(replay);
    expect(bye.node).toBe('goodbye');
    expect(afterPlay(bye).kind).toBe('hangup');
  });

  it('2 → where to sell pepper: best market with the price after transport', () => {
    const ctx = ctxOf();
    const result = pressKey(pressKey(answer(ctx).state, '2', ctx).state, '3', ctx).state;
    expect(ids(result, ctx)).toEqual(['crop_pepper', 'best_market_is', 'market_serekunda', 'about', 'num_70', 'dalasi_per_kilo', 'after_transport', 'menu_repeat_back']);
  });

  it('4 → I have produce: crop, amount, ready → request for the leader', () => {
    const ctx = ctxOf();
    let s = answer(ctx).state;
    for (const k of ['4', '3', '2']) s = pressKey(s, k, ctx).state;
    const r = pressKey(s, '1', ctx);
    expect(r.effect).toEqual({ type: 'produce', crop: 'pepper', amount: 'bag', ready: 'today' });
    expect(ids(r.state, ctx)).toEqual(['produce_sent_to_leader']);
  });

  it('5 → report: 1–5 report straight away, 9 records a voice note first', () => {
    const ctx = ctxOf();
    let s = pressKey(pressKey(answer(ctx).state, '5', ctx).state, '4', ctx).state;
    expect(pressKey(s, '1', ctx).effect).toEqual({ type: 'report', crop: 'okra', problem: 'insects' });
    s = pressKey(s, '9', ctx).state;
    expect(s.node).toBe('report_record');
    const a = afterPlay(s);
    expect(a).toMatchObject({ kind: 'record', action: 'report' });
    expect(a.state.node).toBe('report_done');
    expect(a.state.params).toMatchObject({ crop: 'okra', problem: 'other' });
  });

  it('unregistered callers can record their name and village', () => {
    const ctx = makeContext(snap, 'nobody');
    const s = startCall(ctx, 'callback');
    expect(ids(s, ctx)).toEqual(['not_registered', 'ask_leader', 'press1_record_name_village']);
    const rec = pressKey(s, '1', ctx).state;
    expect(afterPlay(rec)).toMatchObject({ kind: 'record', action: 'lead' });
    expect(pressKey(s, '*', ctx).invalid).toBe(true); // no main menu for unknown numbers
  });

  it('alerts: all OK when nothing is happening', () => {
    const ctx = ctxOf();
    expect(ids(pressKey(answer(ctx).state, '3', ctx).state, ctx)).toEqual(['verdict_all_ok', 'menu_repeat_back']);
  });
});

describe('numbers and the recording guide', () => {
  it('uses whole-number clips when recorded, else chains them', () => {
    expect(numberClips(150)).toEqual(['num_150']);
    expect(numberClips(10)).toEqual(['num_10']);
    expect(numberClips(70)).toEqual(['num_70']);
    expect(numberClips(64)).toEqual(['num_60', 'num_4']);
    expect(numberClips(1469)).toEqual(['num_1000', 'num_400', 'num_60', 'num_9']);
    expect(numberClips(2448)).toEqual(['num_2', 'num_thousand', 'num_400', 'num_40', 'num_8']);
  });

  it('every clip the flow, builders and render() can ask for is in clips.json', () => {
    const needed = new Set(flowClipIds());
    for (const kind of ['plant', 'sell', 'risk']) {
      for (const signal of ['green', 'yellow', 'red', 'none']) {
        for (const reason of ['buyer_waiting', 'few_planting', 'some_planting', 'many_planting', 'reports_unverified', 'reports_verified', 'alert_heavy_rain', 'alert_dry_spell', 'alert_pest_outbreak', 'alert_disease']) {
          for (const crop of ['tomato', 'onion', 'pepper', 'okra']) render(signal, 'voice', 'en', { kind, crop, reason }).forEach((id) => needed.add(id));
        }
      }
    }
    for (const n of [1, 9, 15, 20, 37, 99, 150, 999, 1000, 2448]) numberClips(n).forEach((id) => needed.add(id));
    for (const id of ['buyer_needs', 'kilos', 'in', 'weeks', 'best_market_is', 'about', 'dalasi_per_kilo', 'after_transport', 'your_buyer_pays',
      'all_crops', 'advice_harvest_early', 'advice_dry_spell', 'advice_pest_outbreak', 'advice_disease', 'advice_check_leaves',
      'advice_plant_this_week', 'advice_plant_little', 'advice_plant_other', 'verdict_watch_out', 'verdict_act_now', 'verdict_all_ok',
      'market_serekunda', 'market_brikama', 'market_sukuta', 'market_banjul', 'invalid_key',
      ...[1, 2, 3, 4].map((i) => `press_${i}`)]) needed.add(id);
    const missing = [...needed].filter((id) => !CLIPS.has(id));
    expect(missing).toEqual([]);
  });

  it('every flow node points at nodes that exist', () => {
    const nodes = new Set(Object.keys(flow));
    for (const [name, def] of Object.entries(flow)) {
      if (name.startsWith('_')) continue;
      const targets = [def.next, def.to, def.pick?.to, ...Object.values(def.keys ?? {}).map((k) => k.to)].filter(Boolean);
      for (const t of targets) expect(nodes.has(t), `${name} → ${t}`).toBe(true);
    }
  });
});
