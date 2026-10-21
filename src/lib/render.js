// render(signal, channel, lang, context): one signal → what each channel shows.
//   'tile'  → { signal, label, icon, classes } for the kafo app / buyer dashboard
//   'ussd'  → verdict word for basic phones (no colours, plain Latin)
//   'voice' → ordered clip IDs, e.g. ['crop_okra', 'verdict_good_plant', 'why_buyer']
// context: { kind: 'plant' | 'sell' | 'risk', crop?, reason? }
import { signalStyle } from './signalStyle.js';
import { t, toPlainLatin } from './i18n.js';

// Voice: only clip ids from src/data/ivr/clips.json (generated from docs/clips.csv).
// A missing entry means "say nothing" (e.g. plant 'none': no data, no verdict clip).
const VERDICT_CLIPS = {
  plant: { green: 'verdict_good_plant', yellow: 'verdict_careful', red: 'verdict_dont_plant' },
  sell: { green: 'why_good_price', yellow: 'verdict_ok_market', red: 'verdict_avoid_market', none: 'no_recent_price' },
  risk: { green: 'verdict_all_ok', yellow: 'verdict_watch_out', red: 'verdict_act_now' },
};

// Reason code → clip that explains it. Alerts map to alert_{type}. Reports have no clip.
const REASON_CLIPS = {
  buyer_waiting: 'why_buyer',
  order_confirmed: 'why_buyer',
  few_planting: 'why_few_planting',
  some_planting: 'why_price_drop',
  many_planting: 'why_many_planting',
  price_low: 'why_low_price',
  alert_heavy_rain: 'alert_heavy_rain',
  alert_dry_spell: 'alert_dry_spell',
  alert_pest_outbreak: 'alert_pest_outbreak',
  alert_disease: 'alert_disease',
};

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
      return [...new Set([
        context.crop && `crop_${context.crop}`,
        VERDICT_CLIPS[kind]?.[signal],
        REASON_CLIPS[context.reason],
      ].filter(Boolean))];
    default:
      throw new Error(`Unknown channel: ${channel}`);
  }
}
