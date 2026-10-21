// Voice line *4321# on real seed data, following the spec §9.7 Wolof demo path.
// Every clip id must come from src/data/ivr/clips.json (generated from docs/clips.csv).
import { describe, it, expect, beforeEach } from 'vitest';
import { startCall, nodeClips, afterPlay, onSilence, pressKey, numberClips, flowClipIds, itemId, itemFiles, CLIPS } from '../src/lib/ivr.js';
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

const ids = (state, ctx) => nodeClips(state, ctx).map(itemId);

/** Answer the call and follow the automatic steps until the first menu (or the hang-up). */
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

const MAIN = ['menu_1_plant', 'menu_2_sell', 'menu_3_alerts', 'menu_4_produce', 'menu_5_report', 'menu_9_repeat'];
const TAIL = ['menu_9_repeat', 'menu_back', 'menu_main_star'];

describe('Binta calls *4321# (spec §9.7)', () => {
  it('greets her by name and kafo, then plays the main menu chain', () => {
    const ctx = makeContext(snap, 'user_binta', 'wo');
    const { state, heard } = answer(ctx, 'callback');
    expect(heard).toEqual(['greet_hello', 'names/farmer_binta', 'greet_from_kafo', 'names/kafo_brikama', ...MAIN]);
    expect(state.node).toBe('main');
    expect(afterPlay(state).kind).toBe('wait');
    const names = nodeClips(startCall(ctx), ctx).filter((i) => i.kind === 'name');
    expect(names).toEqual([
      { kind: 'name', path: 'names/farmer_binta', text: 'Binta' },
      { kind: 'name', path: 'names/kafo_brikama', text: expect.any(String) },
    ]);
  });

  it('Mandinka caller hears the same chain (Awa)', () => {
    const ctx = makeContext(snap, 'user_awa', 'mnk');
    expect(answer(ctx).heard).toEqual(['greet_hello', 'names/farmer_awa', 'greet_from_kafo', 'names/kafo_brikama', ...MAIN]);
  });

  it('name paths fall back to names/farmer_<id> and names/kafo_<id> without name_clip', () => {
    for (const f of snap.farmers) delete f.name_clip;
    for (const k of snap.kafos) delete k.name_clip;
    const ctx = makeContext(snap, 'user_binta', 'wo');
    const kafoId = ctx.kafo.id.replace(/^kafo_/, '');
    expect(answer(ctx).heard.slice(0, 4)).toEqual(['greet_hello', 'names/farmer_binta', 'greet_from_kafo', `names/kafo_${kafoId}`]);
  });

  it('1 → each crop: name, verdict, reason, press N', () => {
    const ctx = makeContext(snap, 'user_binta', 'wo');
    const heard = ids(pressKey(answer(ctx).state, '1', ctx).state, ctx);
    expect(heard.slice(0, 4)).toEqual(['crop_tomato', 'verdict_dont_plant', 'why_many_planting', 'press_1']);
    expect(heard).toEqual(expect.arrayContaining(['crop_okra', 'verdict_good_plant', 'why_buyer', 'press_4']));
    expect(heard.at(-1)).toBe('menu_back');
  });

  it('4 → okra detail with spoken numbers, 1 → tell the leader', () => {
    const ctx = makeContext(snap, 'user_binta', 'wo');
    const detail = pressKey(pressKey(answer(ctx).state, '1', ctx).state, '4', ctx).state;
    expect(ids(detail, ctx)).toEqual(['crop_okra', 'verdict_good_plant', 'why_buyer', 'buyer_needs', 'num_150', 'unit_kilos', 'in', 'num_10', 'unit_weeks', 'advice_plant_this_week', 'menu_tell_leader', 'menu_back']);
    const told = pressKey(detail, '1', ctx);
    expect(told.effect).toEqual({ type: 'interest', crop: 'okra' });
    expect(ids(told.state, ctx)).toEqual(['leader_told']);
    expect(afterPlay(told.state).state.node).toBe('main');
  });

  it('outbound alert call: alert_call_intro, the alert, then the main menu', () => {
    snap.alerts.push({ id: 'a', template_type: 'heavy_rain', level: 'red', crops: [], districts: ['Kombo Central'], starts_on: '2026-10-22', ends_on: '2026-10-25' });
    const ctx = makeContext(snap, 'user_binta', 'wo');
    const { heard, state } = answer(ctx, 'outbound_alert');
    expect(heard).toEqual(['alert_call_intro', 'alert_heavy_rain', 'verdict_act_now', 'advice_harvest_early', ...MAIN]);
    expect(state.node).toBe('main');
  });

  it('welcome call (leader registered the farmer): welcome_call, goodbye, hang up', () => {
    const ctx = makeContext(snap, 'user_binta', 'wo');
    const { heard, state } = answer(ctx, 'welcome');
    expect(heard).toEqual(['welcome_call', 'goodbye']);
    expect(afterPlay(state).kind).toBe('hangup');
  });
});

describe('call behaviour', () => {
  const ctxOf = () => makeContext(snap, 'user_awa');

  it('9 repeats, 0 goes back, * goes to the main menu, wrong keys replay the node', () => {
    const ctx = ctxOf();
    const plant = pressKey(answer(ctx).state, '1', ctx).state;
    expect(pressKey(plant, '9', ctx).state.node).toBe('plant');
    expect(pressKey(plant, '0', ctx).state.node).toBe('main');
    const detail = pressKey(plant, '2', ctx).state;
    expect(pressKey(detail, '*', ctx).state.node).toBe('main');
    const wrong = pressKey(answer(ctx).state, '7', ctx);
    expect(wrong.invalid).toBe(true);
    expect(ids(wrong.state, ctx)).toEqual(MAIN);
  });

  it('silence replays the menu once, then says goodbye and hangs up', () => {
    const ctx = ctxOf();
    const main = answer(ctx).state;
    const replay = onSilence(main);
    expect(replay.node).toBe('main');
    const bye = onSilence(replay);
    expect(bye.node).toBe('goodbye');
    expect(ids(bye, ctx)).toEqual(['goodbye']);
    expect(afterPlay(bye).kind).toBe('hangup');
  });

  it('2 → crop list, then pepper: best market with the price after transport', () => {
    const ctx = ctxOf();
    const sell = pressKey(answer(ctx).state, '2', ctx).state;
    expect(ids(sell, ctx)).toEqual(['ask_crop', 'crop_tomato', 'press_1', 'crop_onion', 'press_2', 'crop_pepper', 'press_3', 'crop_okra', 'press_4']);
    expect(ids(pressKey(sell, '3', ctx).state, ctx)).toEqual(['crop_pepper', 'best_market_is', 'market_banjul', 'about', 'num_448', 'dalasi_per_kilo', 'after_transport', ...TAIL]);
    // 53 has no clip of its own: one item made of num_50 + num_3
    expect(nodeClips(pressKey(sell, '4', ctx).state, ctx)).toContainEqual({ id: 'num_53', files: ['num_50', 'num_3'], textEn: '53' });
  });

  it('sell: no recent price, and a confirmed order', () => {
    const ctx = ctxOf();
    const sell = pressKey(answer(ctx).state, '2', ctx).state;
    ctx.signals.pepper.sell.options = [{ market_town_id: 'town_banjul', signal: 'none', net: null }];
    expect(ids(pressKey(sell, '3', ctx).state, ctx)).toEqual(['crop_pepper', 'no_recent_price', ...TAIL]);
    ctx.signals.pepper.sell.options = [{ order_id: 'o1', signal: 'green', price: 80, net: 80 }];
    expect(ids(pressKey(sell, '3', ctx).state, ctx)).toEqual(['crop_pepper', 'why_buyer', 'about', 'num_80', 'dalasi_per_kilo', ...TAIL]);
  });

  it('4 → I have produce: crop, amount, ready → request for the leader', () => {
    const ctx = ctxOf();
    let s = pressKey(answer(ctx).state, '4', ctx).state;
    expect(ids(s, ctx)[0]).toBe('ask_crop');
    s = pressKey(s, '3', ctx).state;
    expect(ids(s, ctx)).toEqual(['ask_amount', 'amount_bucket', 'press_1', 'amount_bag', 'press_2', 'amount_bags_2_4', 'press_3', 'amount_bags_5_plus', 'press_4']);
    s = pressKey(s, '2', ctx).state;
    expect(ids(s, ctx)).toEqual(['ask_ready', 'today', 'press_1', 'this_week', 'press_2']);
    const r = pressKey(s, '1', ctx);
    expect(r.effect).toEqual({ type: 'produce', crop: 'pepper', amount: 'bag', ready: 'today' });
    expect(ids(r.state, ctx)).toEqual(['produce_sent_to_leader']);
  });

  it('5 → report: 1–5 report straight away, 9 records a voice note first', () => {
    const ctx = ctxOf();
    let s = pressKey(pressKey(answer(ctx).state, '5', ctx).state, '4', ctx).state;
    expect(ids(s, ctx)).toEqual(['ask_problem', 'problem_insects', 'press_1', 'problem_leaf_spots', 'press_2', 'problem_wilting', 'press_3', 'problem_animals', 'press_4', 'problem_flooding', 'press_5', 'record_after_beep']);
    expect(pressKey(s, '1', ctx).effect).toEqual({ type: 'report', crop: 'okra', problem: 'insects' });
    s = pressKey(s, '9', ctx).state;
    expect(s.node).toBe('report_record');
    const a = afterPlay(s);
    expect(a).toMatchObject({ kind: 'record', action: 'report' });
    expect(a.state.node).toBe('report_done');
    expect(a.state.params).toMatchObject({ crop: 'okra', problem: 'other' });
    expect(ids(a.state, ctx)).toEqual(['report_thanks']);
  });

  it('unregistered callers can record their name and village', () => {
    const ctx = makeContext(snap, 'nobody');
    const s = startCall(ctx, 'callback');
    expect(ids(s, ctx)).toEqual(['not_registered', 'press1_record_name_village']);
    const rec = pressKey(s, '1', ctx).state;
    expect(ids(rec, ctx)).toEqual(['record_name_village']);
    const a = afterPlay(rec);
    expect(a).toMatchObject({ kind: 'record', action: 'lead' });
    expect(ids(a.state, ctx)).toEqual(['thanks_admin_will_call']);
    const bye = afterPlay(a.state).state;
    expect(ids(bye, ctx)).toEqual(['goodbye']);
    expect(afterPlay(bye).kind).toBe('hangup');
    expect(pressKey(s, '*', ctx).invalid).toBe(true); // no main menu for unknown numbers
  });

  it('alerts: "no warnings" when nothing is happening', () => {
    const ctx = ctxOf();
    expect(ids(pressKey(answer(ctx).state, '3', ctx).state, ctx)).toEqual(['alert_none', ...TAIL]);
  });

  it('alerts: a crop-specific pest alert names the crop; reports add "check under the leaves"', () => {
    snap.alerts.push({ id: 'p', template_type: 'pest_outbreak', level: 'yellow', crops: ['okra'], districts: ['Kombo Central'], starts_on: '2026-10-20', ends_on: '2026-10-25' });
    const ctx = ctxOf();
    ctx.signals.tomato.risk = { signal: 'red', reason: 'reports_verified' };
    const heard = ids(pressKey(answer(ctx).state, '3', ctx).state, ctx);
    expect(heard.slice(0, 4)).toEqual(['alert_pest_outbreak', 'crop_okra', 'verdict_watch_out', 'advice_check_leaves']);
    const i = heard.indexOf('crop_tomato');
    expect(heard.slice(i, i + 3)).toEqual(['crop_tomato', 'verdict_act_now', 'advice_check_leaves']);
  });

  it('a market the CSV has no clip for is spoken in English, not a missing clip id', () => {
    const ctx = ctxOf();
    ctx.signals.okra.sell.options = [{ market_town_id: 'town_gunjur', signal: 'green', net: 40 }];
    const items = nodeClips(pressKey(pressKey(answer(ctx).state, '2', ctx).state, '4', ctx).state, ctx);
    expect(items).toContainEqual(expect.objectContaining({ id: 'market_gunjur', files: [], extra: true }));
  });
});

describe('numbers and the recording guide', () => {
  it('uses one clip when recorded, else one multi-file item whose English fallback says the digits', () => {
    expect(numberClips(150)).toEqual(['num_150']);
    expect(numberClips(10)).toEqual(['num_10']);
    expect(numberClips(70)).toEqual(['num_70']);
    expect(numberClips(1000)).toEqual(['num_1000']);
    expect(numberClips(0)).toEqual([]);
    expect(numberClips(17)).toEqual([{ id: 'num_17', files: ['num_10', 'num_7'], textEn: '17' }]);
    expect(numberClips(64)).toEqual([{ id: 'num_64', files: ['num_60', 'num_4'], textEn: '64' }]);
    expect(numberClips(300)).toEqual([{ id: 'num_300', files: ['num_200', 'num_100'], textEn: '300' }]);
    expect(numberClips(1150)).toEqual([{ id: 'num_1150', files: ['num_1000', 'num_150'], textEn: '1150' }]);
    expect(numberClips(1469)).toEqual([{ id: 'num_1469', files: ['num_1000', 'num_200', 'num_200', 'num_60', 'num_9'], textEn: '1469' }]);
  });

  it('every clip the flow, builders and render() can ask for is in clips.json', () => {
    const needed = new Set(flowClipIds());
    const add = (items) => items.forEach((it) => itemFiles(it).forEach((f) => needed.add(f)));
    const reasons = ['buyer_waiting', 'few_planting', 'some_planting', 'many_planting', 'reports_unverified', 'reports_verified',
      'alert_heavy_rain', 'alert_dry_spell', 'alert_pest_outbreak', 'alert_disease',
      'price_high', 'price_normal', 'price_low', 'order_confirmed', 'no_recent_price', 'all_ok', 'unknown_crop'];
    for (const kind of ['plant', 'sell', 'risk']) {
      for (const signal of ['green', 'yellow', 'red', 'none']) {
        for (const reason of reasons) {
          for (const crop of ['tomato', 'onion', 'pepper', 'okra']) add(render(signal, 'voice', 'en', { kind, crop, reason }));
        }
      }
    }
    for (let n = 0; n <= 2500; n++) add(numberClips(n));

    // Walk every node reachable on seed data, with each alert type at both levels.
    for (const type of ['heavy_rain', 'dry_spell', 'pest_outbreak', 'disease']) {
      for (const level of ['yellow', 'red']) {
        snap.alerts.push({ id: `${type}_${level}`, template_type: type, level, crops: level === 'red' ? [] : ['okra'], districts: ['Kombo Central'], starts_on: '2026-10-20', ends_on: '2026-10-25' });
      }
    }
    for (const who of ['user_awa', 'user_binta', 'nobody']) {
      const ctx = makeContext(snap, who, 'wo');
      for (const direction of ['callback', 'outbound_alert', 'welcome']) {
        const seen = new Set();
        const todo = [startCall(ctx, direction)];
        while (todo.length) {
          const s = todo.pop();
          const key = `${s.node}|${JSON.stringify(s.params)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          add(nodeClips(s, ctx));
          const a = afterPlay(s);
          if (a.state) todo.push(a.state);
          for (const k of ['1', '2', '3', '4', '5', '9']) todo.push(pressKey(s, k, ctx).state);
        }
        expect(seen.size).toBeGreaterThan(1);
      }
    }
    const missing = [...needed].filter((id) => !CLIPS.has(id));
    expect(missing).toEqual([]);
  });

  it('flow.json uses no clip ids that left the CSV', () => {
    const all = JSON.stringify(flow);
    for (const gone of ['"menu_main"', 'invalid_key', 'ask_leader', 'menu_repeat_back', 'menu_crop_detail', 'welcome_intro']) expect(all).not.toContain(gone);
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
