// Simulated SMS (from short code 1234) and voice calls. Writes to the sms / calls
// tables; the farmer phone (Phases 7–8) shows them. Text comes from i18n.json.
import { db, newId } from './db.js';
import { now } from './clock.js';
import { t, toPlainLatin, cropName } from './i18n.js';
import { daysBetween } from './dates.js';

export const SHORT_CODE = '1234';
export const SMS_MAX = 160;

/** Render an SMS: template in the farmer's language, plain Latin, ≤160 chars. Pure. */
export function smsBody(templateKey, lang, vars = {}) {
  const body = toPlainLatin(t(templateKey, lang, vars));
  if (body.length > SMS_MAX) {
    console.warn(`SMS ${templateKey}/${lang} is ${body.length} chars (max ${SMS_MAX})`);
    return body.slice(0, SMS_MAX);
  }
  return body;
}

/** Variables for an alert SMS template. Pure. */
export function alertSmsVars(alert, today, lang) {
  const n = Math.max(0, daysBetween(today, alert.starts_on));
  const when = n === 0 ? t('sms.when.today', lang) : n === 1 ? t('sms.when.tomorrow', lang) : t('sms.when.days', lang, { n });
  const crop = alert.crops.length ? alert.crops.map((c) => cropName(c, lang).toLowerCase()).join('/') : t('sms.all_crops', lang);
  const verdict = t(`ussd.verdict.risk.${alert.level}`, lang);
  return { verdict, when, crop };
}

/**
 * Farmers an alert or warning should reach. Pure.
 * @param {{ districts: string[], crops: string[] }} target
 * @param {'sms'|'voice'} channel  sms → has_phone && sms_alerts · voice → has_phone && voice_alerts
 */
export function farmersIn({ districts, crops }, { farmers, kafos }, channel = 'sms') {
  const kafoIds = new Set(kafos.filter((k) => districts.includes(k.district)).map((k) => k.id));
  return farmers.filter((f) => kafoIds.has(f.kafo_id) && f.has_phone
    && (channel === 'sms' ? f.sms_alerts : f.voice_alerts)
    && (crops.length === 0 || f.crops.some((c) => crops.includes(c))));
}

/** Send one simulated SMS. Returns the sms row, or null if the user has no phone. */
export async function sendSms(userId, templateKey, vars = {}) {
  const user = await db.users.get(userId);
  if (!user?.phone) return null;
  const row = {
    id: newId('sms'), to_user_id: userId, from: SHORT_CODE, template_key: templateKey,
    body: smsBody(templateKey, user.language, typeof vars === 'function' ? vars(user.language) : vars),
    lang: user.language, read: false, sent_at: await now(),
  };
  await db.sms.add(row);
  return row;
}

/** Ring a farmer's phone (outbound alert or welcome call). */
export async function placeOutboundCall(userId, direction = 'outbound_alert', alertId = null) {
  const row = { id: newId('call'), user_id: userId, direction, status: 'ringing', alert_id: alertId, started_at: await now(), ended_at: null };
  await db.calls.add(row);
  return row;
}
