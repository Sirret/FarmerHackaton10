// Audio engine for the voice line: plays a chain of recorded clips, and speaks the
// unrecorded ones with browser text-to-speech (consecutive ones merged into one sentence).
// Files live at public/audio/<lang>/<clip_id>.<ext> and public/audio/names/<name>.<ext>.
// Nothing lists which files exist: availability is probed (HEAD) when a chain starts and
// cached for the page session. A missing clip is normal, never an error, never logged.
// Safe to import in Node: no window access at module top level.

import clips from '../data/ivr/clips.json';

export const EXTENSIONS = ['mp3', 'ogg', 'm4a', 'wav', 'webm'];

const SPEECH_KEY = 'ks.speech.enabled';
const RATE_KEY = 'ks.speech.rate';
const FAST_KEY = 'ks.voice.fast';
const DEFAULT_RATE = 1.35;

const CLIPS = new Map((Array.isArray(clips) ? clips : []).map((c) => [c.id, c]));

// ---------- small helpers ----------

function store(fn) {
  try { return fn(window.localStorage); } catch { return undefined; }
}

const hasWindow = () => typeof window !== 'undefined';
const synth = () => (hasWindow() && window.speechSynthesis) || null;
const fast = () => store((s) => s.getItem(FAST_KEY) === '1') === true;

function wait(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(id); resolve(); }, { once: true });
  });
}

// ---------- pure helpers (tested) ----------

/** URLs for one clip path ('mnk/greet_hello', 'names/farmer_awa'), one per extension, in order. */
export function clipUrls(path, base = import.meta.env.BASE_URL) {
  const b = String(base ?? '/').replace(/\/+$/, '');
  const p = String(path).replace(/^\/+/, '');
  return EXTENSIONS.map((ext) => `${b}/audio/${p}.${ext}`);
}

/** Clamp a speech rate to 0.8..2.0 (default 1.35 for anything that is not a number). */
export function clampRate(n) {
  const x = Number(n);
  if (n === null || n === '' || !Number.isFinite(x)) return DEFAULT_RATE;
  return Math.min(2, Math.max(0.8, x));
}

/** Roughly how long a sentence takes to say: ~300 ms per word, at least 300 ms. */
export function wordWaitMs(text) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(300, words * 300);
}

/** Best English voice: Google UK English, then Natural, then Online (en-GB/en-US); else any en; else null. */
export function pickVoice(voices) {
  const list = Array.from(voices ?? []);
  const isEn = (v) => /^en/i.test(v?.lang ?? '');
  const gbUs = list.filter((v) => /^en[-_](GB|US)$/i.test(v?.lang ?? ''));
  for (const word of ['Google UK English', 'Natural', 'Online']) {
    const v = gbUs.find((x) => (x.name ?? '').includes(word));
    if (v) return v;
  }
  return list.find(isEn) ?? null;
}

/**
 * Turn one chain item into a piece:
 *   'greet_hello'                                    → one clip in the caller's language
 *   { id, files: ['num_10','num_7'], text?, textEn? } → several files played as one clip
 *   { kind: 'name', path: 'names/farmer_awa', text }  → a name recording (no language folder)
 */
export function normalizeItem(item, lang) {
  if (typeof item === 'string') {
    const c = CLIPS.get(item);
    return {
      id: item,
      paths: [`${lang}/${item}`],
      text: c?.scripts?.[lang] || null,
      textEn: c?.en_script ?? null,
      kind: 'clip',
    };
  }
  if (item && item.kind === 'name') {
    return {
      id: item.id ?? item.path,
      paths: [item.path],
      text: item.text ?? null,
      textEn: item.textEn ?? item.text ?? null,
      kind: 'name',
    };
  }
  const c = item?.id != null ? CLIPS.get(item.id) : undefined;
  const files = Array.isArray(item?.files) && item.files.length ? item.files : [item?.id];
  return {
    id: item?.id ?? files.join('+'),
    paths: files.map((f) => `${lang}/${f}`),
    text: item?.text ?? c?.scripts?.[lang] ?? null,
    textEn: item?.textEn ?? c?.en_script ?? null,
    kind: 'clip',
  };
}

/**
 * Split pieces into play steps. found[i] is the list of resolved URLs for piece i (one per
 * path) when ALL its paths are recorded, else null. Returns steps:
 *   { type: 'audio',  start, piece, urls }
 *   { type: 'speech', start, pieces, textEn, text }   (consecutive unrecorded pieces merged)
 * Missing names stay in `pieces` (for subtitles) but are left out of the spoken text.
 */
export function groupFallbacks(pieces, found) {
  const steps = [];
  let group = null;
  const close = () => {
    if (!group) return;
    const spoken = group.pieces.filter((p) => p.kind !== 'name');
    const en = spoken.map((p) => p.textEn).filter(Boolean);
    const local = spoken.map((p) => p.text).filter(Boolean);
    steps.push({
      type: 'speech',
      start: group.start,
      pieces: group.pieces,
      textEn: en.join(' '),
      text: local.length ? local.join(' ') : null,
    });
    group = null;
  };
  pieces.forEach((piece, i) => {
    const urls = found?.[i];
    if (Array.isArray(urls) && urls.length && urls.every(Boolean)) {
      close();
      steps.push({ type: 'audio', start: i, piece, urls });
    } else {
      if (!group) group = { start: i, pieces: [] };
      group.pieces.push(piece);
    }
  });
  close();
  return steps;
}

// ---------- settings ----------

export function getSpeechEnabled() {
  const v = store((s) => s.getItem(SPEECH_KEY));
  return v == null ? true : v !== '0' && v !== 'false';
}

export function setSpeechEnabled(on) {
  store((s) => s.setItem(SPEECH_KEY, on ? '1' : '0'));
  if (!on) synth()?.cancel?.();
}

export function getSpeechRate() {
  return clampRate(store((s) => s.getItem(RATE_KEY)));
}

export function setSpeechRate(n) {
  const r = clampRate(n);
  store((s) => s.setItem(RATE_KEY, String(r)));
  return r;
}

// ---------- availability probes (session cache, no missing list) ----------

const probes = new Map(); // url → Promise<boolean>

function exists(url) {
  if (!probes.has(url)) {
    const p = (typeof fetch === 'function'
      ? fetch(url, { method: 'HEAD', cache: 'force-cache' }).then((r) => !!r.ok, () => false)
      : Promise.resolve(false));
    probes.set(url, p);
  }
  return probes.get(url);
}

/** First existing URL for a path (extensions in order), or null. */
async function resolvePath(path) {
  for (const url of clipUrls(path)) {
    if (await exists(url)) return url;
  }
  return null;
}

async function resolvePiece(piece) {
  const urls = await Promise.all(piece.paths.map(resolvePath));
  return urls.every(Boolean) ? urls : null;
}

// ---------- shared audio element + speech ----------

let audioEl = null;
let silentUri = null;
let voice = null;
let voicesHooked = false;

function getAudio() {
  if (!audioEl && hasWindow() && typeof window.Audio === 'function') {
    audioEl = new window.Audio();
    audioEl.preload = 'auto';
  }
  return audioEl;
}

function silentWav() {
  if (silentUri) return silentUri;
  const n = 400; // 50 ms of 8-bit silence at 8 kHz
  const bytes = new Uint8Array(44 + n);
  const dv = new DataView(bytes.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true);
  dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); str(36, 'data'); dv.setUint32(40, n, true);
  bytes.fill(128, 44);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  silentUri = `data:audio/wav;base64,${btoa(bin)}`;
  return silentUri;
}

function hookVoices() {
  const s = synth();
  if (!s) return;
  if (!voice) voice = pickVoice(s.getVoices?.() ?? []);
  if (voicesHooked) return;
  voicesHooked = true;
  try {
    s.addEventListener?.('voiceschanged', () => { voice = pickVoice(s.getVoices?.() ?? []) ?? voice; });
  } catch { /* old browsers */ }
}

/** Call inside a click handler (e.g. "Answer"): unlocks audio and speech on mobile/Safari. */
export function unlock() {
  try {
    const a = getAudio();
    if (a && !chainActive) {
      a.muted = false;
      a.src = silentWav();
      const p = a.play();
      p?.catch?.(() => {});
    }
  } catch { /* ignore */ }
  try {
    const s = synth();
    if (s && typeof window.SpeechSynthesisUtterance === 'function' && !s.speaking) {
      hookVoices();
      const u = new window.SpeechSynthesisUtterance(' ');
      u.volume = 0;
      s.speak(u);
    }
  } catch { /* ignore */ }
}

/** Play one URL on the shared element. Resolves true when it ended, false if it could not play. */
function playUrl(url, signal) {
  const a = getAudio();
  if (!a) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('error', onErr);
      signal.removeEventListener('abort', onAbort);
      resolve(ok);
    };
    const onEnd = () => done(true);
    const onErr = () => done(false);
    const onAbort = () => { try { a.pause(); } catch { /* ignore */ } done(true); };
    a.addEventListener('ended', onEnd);
    a.addEventListener('error', onErr);
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      a.src = url;
      const p = a.play();
      p?.catch?.(() => done(false));
    } catch { done(false); }
  });
}

/** Speak English text (or just wait when speech is off/unavailable). */
function speak(text, signal) {
  if (!text) return Promise.resolve();
  const s = synth();
  if (!getSpeechEnabled() || !s || typeof window.SpeechSynthesisUtterance !== 'function') {
    return wait(wordWaitMs(text), signal);
  }
  hookVoices();
  return new Promise((resolve) => {
    let timer;
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); resolve(); };
    const onAbort = () => { try { s.cancel(); } catch { /* ignore */ } finish(); };
    try {
      const u = new window.SpeechSynthesisUtterance(text);
      u.rate = getSpeechRate();
      u.pitch = 1;
      u.volume = 1;
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-GB';
      u.onend = finish;
      u.onerror = finish;
      timer = setTimeout(finish, wordWaitMs(text) * 2 + 2000);
      signal.addEventListener('abort', onAbort, { once: true });
      s.speak(u);
    } catch { finish(); }
  });
}

// ---------- chain playback ----------

let controller = null;
let chainActive = false;

function halt() {
  controller?.abort();
  controller = null;
  chainActive = false;
  try { audioEl?.pause(); } catch { /* ignore */ }
  try { synth()?.cancel(); } catch { /* ignore */ }
}

/** Stop audio and speech at once; a running playChain resolves 'stopped'. */
export function stop() {
  halt();
}

/**
 * Play items in order. Resolves 'done' or 'stopped'.
 * onSubtitle({ pieces: [{ text, textEn, kind }], index }) on start and each step; onSubtitle(null) at the end.
 */
export async function playChain(items, { lang = 'en', onSubtitle } = {}) {
  if (chainActive) halt();
  const ctrl = new AbortController();
  controller = ctrl;
  chainActive = true;
  const { signal } = ctrl;
  const sub = (v) => { try { onSubtitle?.(v); } catch { /* caller's problem */ } };

  const pieces = (items ?? []).map((it) => normalizeItem(it, lang));
  const subPieces = pieces.map(({ text, textEn, kind }) => ({ text, textEn, kind }));
  const finish = (result) => {
    if (controller === ctrl) { controller = null; chainActive = false; }
    if (!chainActive) sub(null); // a newer chain owns the subtitle otherwise
    return result;
  };

  sub({ pieces: subPieces, index: 0 });
  try {
    const isFast = fast();
    const found = isFast ? pieces.map(() => null) : await Promise.all(pieces.map(resolvePiece));
    if (signal.aborted) return finish('stopped');
    const steps = groupFallbacks(pieces, found);

    for (const step of steps) {
      if (signal.aborted) return finish('stopped');
      sub({ pieces: subPieces, index: step.start });
      if (isFast) { await wait(100, signal); continue; }
      if (step.type === 'audio') {
        for (const url of step.urls) {
          if (signal.aborted) break;
          const ok = await playUrl(url, signal);
          if (!ok && !signal.aborted) {
            // Could not play (autoplay block, decode error): say it instead.
            if (step.piece.kind !== 'name') await speak(step.piece.textEn, signal);
            break;
          }
        }
      } else {
        await speak(step.textEn, signal);
      }
    }
    return finish(signal.aborted ? 'stopped' : 'done');
  } catch {
    return finish(signal.aborted ? 'stopped' : 'done');
  }
}
