import { describe, it, expect } from 'vitest';
import { smsBody, alertSmsVars, farmersIn, SMS_MAX } from '../src/lib/notify.js';
import strings from '../src/data/i18n.json';
import farmers from '../src/data/seed/farmers.json';
import kafos from '../src/data/seed/kafos.json';

const LONGEST = {
  name: 'Ramatoulie Jallow', kafo: kafos.reduce((a, k) => (k.name.length > a.length ? k.name : a), ''),
  amount: '5+ bags', crop: 'tomato/onion/pepper/okra', CROP: 'TOMATO', problem: 'Leaf spots', town: 'Busumbala',
  verdict: 'WATCH OUT', when: 'from tomorrow', day: '22 Oct 2026', time: '10:00', kg: 999, amount_d: 99999, wallet: 'Afrimoney',
  leader: 'Mariama', text: 'Meeting at the garden on Saturday 9:00. Bring your seeds and the scale book. Water early, rain is coming',
};

describe('SMS templates', () => {
  const keys = Object.keys(strings).filter((k) => k.startsWith('sms.') && !k.startsWith('sms.when') && k !== 'sms.all_crops');

  it.each(keys)('%s fits in 160 plain-Latin characters with long values', (key) => {
    const body = smsBody(key, 'en', { ...LONGEST, amount: key === 'sms.paid' ? LONGEST.amount_d : LONGEST.amount });
    expect(body.length).toBeLessThanOrEqual(SMS_MAX);
    expect(body).toMatch(/^[\x20-\x7E]+$/);
    expect(body).not.toMatch(/\{\w+\}/); // every placeholder filled
  });
});

describe('alertSmsVars', () => {
  const alert = { level: 'red', crops: [], starts_on: '2026-10-22' };
  it('says when, which crops, and the verdict word', () => {
    expect(alertSmsVars(alert, '2026-10-20', 'en')).toEqual({ verdict: 'ACT NOW', when: 'in 2 days', crop: 'crops' });
    expect(alertSmsVars({ ...alert, starts_on: '2026-10-20', crops: ['okra', 'pepper'], level: 'yellow' }, '2026-10-20', 'en'))
      .toEqual({ verdict: 'WATCH OUT', when: 'from today', crop: 'okra/pepper' });
    expect(alertSmsVars({ ...alert, starts_on: '2026-10-21' }, '2026-10-20', 'en').when).toBe('from tomorrow');
  });

  it('renders the spec heavy-rain message', () => {
    expect(smsBody('sms.alert.heavy_rain', 'en', alertSmsVars(alert, '2026-10-20', 'en')))
      .toBe('ACT NOW: Heavy rain in 2 days. Harvest ripe crops early. Dial *4321# to hear. -Kafo Signal');
  });
});

describe('farmersIn', () => {
  const data = { farmers, kafos };
  it('reaches farmers with phones and SMS on, in the districts, growing the crops', () => {
    const all = farmersIn({ districts: ['Kombo Central'], crops: [] }, data, 'sms');
    const ids = all.map((f) => f.user_id);
    expect(ids).toContain('user_awa');
    expect(ids).toContain('user_musu'); // Kembujeh is also Kombo Central
    expect(ids).not.toContain('user_nyima'); // no phone
    expect(ids).not.toContain('user_aminata'); // Kombo South
    const okra = farmersIn({ districts: ['Kombo Central'], crops: ['okra'] }, data, 'sms').map((f) => f.user_id);
    expect(okra).toContain('user_binta');
    expect(okra).not.toContain('user_jainaba'); // grows tomato/onion
  });

  it('calls only farmers who turned voice alerts on', () => {
    expect(farmersIn({ districts: ['Kombo Central'], crops: [] }, data, 'voice').map((f) => f.user_id)).toEqual(['user_binta']);
  });
});
