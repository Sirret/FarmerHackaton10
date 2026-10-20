// The *1234# menu on real seed data, as Awa would use it (spec §9.2).
import { describe, it, expect, beforeEach } from 'vitest';
import { makeContext, startSession, renderScreen, reply } from '../src/lib/ussd.js';
import menu from '../src/data/ussd/menu.json';
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
  // IndexedDB hands rows back sorted by key (okra, onion, pepper, tomato), not seed order.
  snap.crop_calendar.sort((a, b) => a.crop.localeCompare(b.crop));
});

/** Dial, then press keys in order; returns the last screen and every effect. */
function session(userId, keys, lang) {
  const ctx = makeContext(snap, userId, lang);
  let state = startSession(ctx);
  const effects = [];
  for (const k of keys) {
    const r = reply(state, k, ctx);
    state = r.state;
    if (r.effect) effects.push(r.effect);
  }
  return { state, screen: renderScreen(state, ctx), effects, text: renderScreen(state, ctx).lines.join('\n') };
}

describe('USSD *1234#', () => {
  it('greets Awa with the main menu', () => {
    const { text } = session('user_awa', []);
    expect(text).toContain("Hi Awa (Brikama Kafo)");
    expect(text).toContain('1 What to plant');
    expect(text).toContain('0 Help');
  });

  it('1 What to plant: verdicts in words, okra has a buyer waiting', () => {
    const { text } = session('user_awa', ['1']);
    expect(text).toContain('PLANT NOW - Brikama');
    expect(text).toContain("1 Tomato: DON'T PLANT");
    expect(text).toContain('2 Onion: CAREFUL');
    expect(text).toContain('3 Pepper: GOOD TO PLANT');
    expect(text).toContain('4 Okra: GOOD-buyer waiting');
  });

  it('okra detail explains the buyer and lets her tell the leader', () => {
    const detail = session('user_awa', ['1', '4']).text;
    expect(detail).toContain('OKRA: GOOD TO PLANT');
    expect(detail).toContain('Hotel needs 150kg in 10 wks.');
    expect(detail).toContain('Plant this week.');
    const done = session('user_awa', ['1', '4', '1']);
    expect(done.effects).toEqual([{ type: 'interest', crop: 'okra' }]);
    expect(done.text).toContain('Fatou knows you want to plant okra');
  });

  it('2 Where to sell: markets ranked, transport counted', () => {
    const { text } = session('user_awa', ['2', '3']);
    expect(text).toContain('PEPPER today');
    expect(text).toMatch(/1 Serekunda: BEST D70\/kg/);
    expect(text).toContain('(transport counted)');
  });

  it('4 I have produce: crop → amount → ready → request for the leader', () => {
    const r = session('user_awa', ['4', '3', '2', '1']);
    expect(r.effects).toEqual([{ type: 'produce', crop: 'pepper', amount: 'bag', ready: 'today' }]);
    expect(r.text).toContain('Sent to your leader Fatou');
  });

  it('5 Report a problem: crop → problem → report', () => {
    const r = session('user_awa', ['5', '4', '1']);
    expect(r.effects).toEqual([{ type: 'report', crop: 'okra', problem: 'insects' }]);
    expect(r.text).toContain('Check under leaves.');
  });

  it('counts other farmers who reported the same thing nearby', () => {
    snap.reports.push({ id: 'r1', reporter_id: 'user_binta', kafo_id: 'kafo_brikama', district: 'Kombo Central', crop: 'okra', problem: 'insects', verified: false, status: 'open', created_at: '2026-10-20T08:00:00Z' });
    snap.reports.push({ id: 'r2', reporter_id: 'user_musu', kafo_id: 'kafo_kembujeh', district: 'Kombo Central', crop: 'okra', problem: 'insects', verified: false, status: 'open', created_at: '2026-10-19T08:00:00Z' });
    expect(session('user_awa', ['5', '4', '1']).text).toContain('2 others near you reported this.');
  });

  it('3 Alerts shows area alerts and lets her switch SMS / calls', () => {
    snap.alerts.push({ id: 'a', template_type: 'heavy_rain', level: 'red', crops: [], districts: ['Kombo Central'], starts_on: '2026-10-22', ends_on: '2026-10-25' });
    const r = session('user_awa', ['3']);
    expect(r.text).toContain('ALL: ACT NOW');
    expect(r.text).toContain('Heavy rain in 2 days');
    expect(r.text).toContain('1 SMS alerts: ON');
    expect(r.text).toContain('2 Alerts by call: OFF');
    expect(session('user_awa', ['3', '2']).effects).toEqual([{ type: 'toggle_voice' }]);
  });

  it('0 goes back, 00 goes to the main menu, wrong keys say so', () => {
    expect(session('user_awa', ['1', '4', '0']).state.screen).toBe('PLANT');
    expect(session('user_awa', ['1', '4', '00']).state.screen).toBe('MAIN');
    expect(session('user_awa', ['8']).text).toContain('Wrong choice');
  });

  it('final screens only accept 00, so a request is never sent twice', () => {
    const r = session('user_awa', ['4', '3', '2', '1', '0', '1']);
    expect(r.effects).toHaveLength(1);
    expect(r.state.screen).toBe('PRODUCE_DONE');
  });

  it('6 Call me asks for a callback and closes', () => {
    const r = session('user_awa', ['6']);
    expect(r.effects).toEqual([{ type: 'callback' }]);
    expect(r.screen.close).toBe(true);
  });

  it('unregistered numbers can leave their details', () => {
    const r = session('nobody', []);
    expect(r.text).toContain('not registered. Ask your kafo leader to add you.');
    expect(session('nobody', ['1']).effects).toEqual([{ type: 'lead' }]);
  });

  it('a shared phone asks who is using it', () => {
    const r = session('user_musu', []);
    expect(r.state.screen).toBe('WHO');
    expect(r.text).toContain('1 Musu Kinteh');
    expect(r.text).toContain('2 Adama Saidy');
    expect(session('user_musu', ['2']).effects).toEqual([{ type: 'switch_user', profile: 'user_adama' }]);
  });

  it('every screen is plain Latin with no colour symbols', () => {
    for (const screen of Object.keys(menu).filter((k) => !k.startsWith('_'))) {
      const ctx = makeContext(snap, screen === 'UNREGISTERED' || screen === 'LEAD_DONE' ? 'nobody' : 'user_awa');
      const { lines } = renderScreen({ screen, params: { crop: 'okra', problem: 'insects' }, history: [], error: null }, ctx);
      for (const line of lines) expect(line).toMatch(/^[\x20-\x7E]*$/);
    }
  });

  it('every basic-phone string (phone.*, ussd.*) is plain ASCII in every language', async () => {
    const strings = (await import('../src/data/i18n.json')).default;
    for (const [key, langs] of Object.entries(strings)) {
      if (!key.startsWith('phone.') && !key.startsWith('ussd.')) continue;
      for (const text of Object.values(langs)) expect(text, key).toMatch(/^[\x20-\x7E]*$/);
    }
  });

  it('uses the farmer language, falling back to English until translations exist', () => {
    expect(session('user_binta', [], 'wo').text).toContain('Hi Binta');
  });
});
