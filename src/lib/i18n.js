// t(key, lang, vars): text from src/data/i18n.json in the farmer's language.
// Missing translations fall back to English, then to the key itself.
import strings from '../data/i18n.json';

export const LANGS = ['en', 'mnk', 'wo', 'ff', 'dyo'];

/**
 * @param {string} key
 * @param {string} [lang]
 * @param {Record<string, string|number>} [vars] replaces {name} placeholders
 */
export function t(key, lang = 'en', vars = {}) {
  const entry = strings[key];
  let text = entry?.[lang] ?? entry?.en ?? key;
  for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

/** Crop display name, falling back to the crop id for crops added later. */
export function cropName(crop, lang = 'en') {
  const text = t(`crop.${crop}`, lang);
  return text === `crop.${crop}` ? crop.charAt(0).toUpperCase() + crop.slice(1) : text;
}

/** Basic phones: plain Latin letters only (ŋ → ng, ñ → ny, accents dropped). */
export function toPlainLatin(text) {
  return text
    .replaceAll('ŋ', 'ng').replaceAll('Ŋ', 'NG')
    .replaceAll('ñ', 'ny').replaceAll('Ñ', 'NY')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E\n]/g, '');
}
