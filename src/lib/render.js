// render(signal, channel, lang, context): one signal → what each channel shows.
//   'tile'  → { signal, label, icon, classes } for the kafo app / buyer dashboard
//   'ussd'  → verdict word for basic phones (no colours, plain Latin)
//   'voice' → ordered clip IDs, e.g. ['crop_okra', 'verdict_good_plant', 'why_buyer']
// context: { kind: 'plant' | 'sell' | 'risk', crop?, reason? }
import { signalStyle } from './signalStyle.js';
import { t, toPlainLatin } from './i18n.js';

const VERDICT_CLIPS = {
  plant: { green: 'verdict_good_plant', yellow: 'verdict_careful', red: 'verdict_dont_plant', none: 'verdict_no_data' },
  sell: { green: 'verdict_best_market', yellow: 'verdict_ok_market', red: 'verdict_avoid_market', none: 'verdict_no_price' },
  risk: { green: 'verdict_all_ok', yellow: 'verdict_watch_out', red: 'verdict_act_now', none: 'verdict_no_data' },
};

// Reason code → clip that explains it. Alerts map to alert_{type}.
const REASON_CLIPS = {
  buyer_waiting: 'why_buyer',
  few_planting: 'why_few_planting',
  some_planting: 'why_some_planting',
  many_planting: 'why_many_planting',
  reports_unverified: 'why_reports',
  reports_verified: 'why_reports',
};

const reasonClip = (reason) =>
  reason?.startsWith('alert_') ? reason : REASON_CLIPS[reason];

/**
 * @param {'green'|'yellow'|'red'|'none'} signal
 * @param {'tile'|'ussd'|'voice'} channel
 * @param {string} [lang]
 * @param {{ kind?: 'plant'|'sell'|'risk', crop?: string, reason?: string }} [context]
 */
export function render(signal, channel, lang = 'en', context = {}) {
  const kind = context.kind ?? 'plant';
  switch (channel) {
    case 'tile': {
      const style = signalStyle(signal);
      return { signal, label: t(`verdict.${kind}.${signal}`, lang), icon: style.icon, classes: style };
    }
    case 'ussd':
      return toPlainLatin(t(`ussd.verdict.${kind}.${signal}`, lang));
    case 'voice':
      return [
        context.crop && `crop_${context.crop}`,
        VERDICT_CLIPS[kind][signal] ?? VERDICT_CLIPS[kind].none,
        reasonClip(context.reason),
      ].filter(Boolean);
    default:
      throw new Error(`Unknown channel: ${channel}`);
  }
}
