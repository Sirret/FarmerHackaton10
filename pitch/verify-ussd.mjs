// Checks the slide-7 UX claim on the real seed data (read-only).
// Run from the repo root:  npx vite-node pitch/verify-ussd.mjs
import { makeContext, startSession, renderScreen, reply } from '../src/lib/ussd.js';
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

const snap = structuredClone({ users, farmers, kafos, buyers, market_towns, crop_calendar, plantings, alerts, prices, transport_costs, orders, config, order_acceptances: [], reports: [], deliveries: [], payments: [] });
snap.crop_calendar.sort((a, b) => a.crop.localeCompare(b.crop));
if (process.env.WITH_ALERT) { // worst case: an active heavy-rain alert + an extra pest alert in Awa's district
  snap.alerts.push({ id: 'alert_x1', template_type: 'heavy_rain', level: 'red', crops: [], districts: ['Kombo Central'], starts_on: '2026-10-22', ends_on: '2026-10-24', note: 'test', created_by: 'user_admin' });
  snap.alerts.push({ id: 'alert_x2', template_type: 'pest', level: 'yellow', crops: ['okra'], districts: ['Kombo Central'], starts_on: '2026-10-19', ends_on: '2026-10-30', note: 'test', created_by: 'user_admin' });
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
for (const lang of [null, 'en', 'mnk', 'wo', 'ff', 'dyo']) {
  const ctx = makeContext(snap, 'user_awa', lang);
  const start = startSession(ctx);
  const seen = new Map(); // key = screen+params -> { depth, len, path }
  const queue = [{ state: start, path: [] }];
  let maxLen = 0, maxAt = '';
  while (queue.length) {
    const { state, path } = queue.shift();
    const id = state.screen + JSON.stringify(state.params);
    if (seen.has(id)) continue;
    const text = renderScreen(state, ctx).lines.join('\n');
    seen.set(id, { depth: path.length, len: text.length, path, screen: state.screen, first: text.split('\n').slice(0, 2).join(' / ') });
    if (text.length > maxLen) { maxLen = text.length; maxAt = `${state.screen} via [${path.join(',')}]`; }
    if (path.length >= 6) continue;
    for (const k of KEYS) {
      const r = reply(state, k, ctx);
      if (r.state.error || r.state.screen === state.screen && JSON.stringify(r.state.params) === JSON.stringify(state.params)) continue;
      queue.push({ state: r.state, path: [...path, k] });
    }
  }
  console.log(`\n== lang ${lang ?? 'default'}: ${seen.size} screens, max ${maxLen} chars at ${maxAt}`);
  if (lang === null) for (const v of seen.values()) console.log(`  d${v.depth} [${v.path.join(',')}] ${v.screen} ${v.len}ch :: ${v.first}`);
}
