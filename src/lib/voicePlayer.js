// Plays voice-note clips in order (spec §9.6). For each clip it tries
//   public/audio/{lang}/{clip}.mp3|.ogg → public/audio/en/{clip}.mp3|.ogg → browser text-to-speech (English script).
// Nothing lists which files exist: dropping a file into public/audio/wo/ is picked up on the next load.
// Missing recordings are remembered (per browser) for the admin clip checklist.

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const FORMATS = ['mp3', 'ogg']; // tried in this order for every clip
const MISSING_KEY = 'ks.missing_clips';
const found = new Map(); // url → true (plays) | false (missing), for this page load

function store(fn) {
  try { return fn(window.localStorage); } catch { return undefined; }
}

/** Clips that had no recording in this browser: ["wo/crop_okra", "names/farmer_binta", …]. */
export function missingClips() {
  return store((s) => JSON.parse(s.getItem(MISSING_KEY) || '[]')) ?? [];
}

export function clearMissingClips() {
  store((s) => s.removeItem(MISSING_KEY));
}

function logMissing(key) {
  const list = missingClips();
  if (!list.includes(key)) store((s) => s.setItem(MISSING_KEY, JSON.stringify([...list, key].sort())));
}

/** Test/demo switch: localStorage ks.voice.fast = "1" skips audio and speech (each clip ~0.1 s). */
const fast = () => store((s) => s.getItem('ks.voice.fast') === '1') === true;

const wait = (ms, signal) => new Promise((resolve) => {
  const id = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(id); resolve(); }, { once: true });
});

/**
 * Play one mp3. Resolves true when it played to the end (or was stopped), false when the
 * file is missing, 'blocked' when the browser refused to play without a click (autoplay rules).
 */
function playUrl(url, signal) {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    const done = (ok) => { audio.onended = audio.onerror = null; resolve(ok); };
    audio.onended = () => done(true);
    audio.onerror = () => done(false);
    signal.addEventListener('abort', () => { audio.pause(); done(true); }, { once: true });
    audio.play().catch((err) => done(err?.name === 'NotAllowedError' ? 'blocked' : false));
  });
}

/** Browser speech for a missing clip, with a time limit (some browsers never fire "end"). */
function speak(text, signal) {
  const estimate = Math.max(900, text.split(/\s+/).length * 420);
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  if (!synth) return wait(estimate, signal);
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    u.rate = 0.95;
    const finish = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(finish, estimate + 2500);
    u.onend = finish;
    u.onerror = finish;
    signal.addEventListener('abort', () => { synth.cancel(); finish(); }, { once: true });
    synth.speak(u);
  });
}

/** Short beep before recording (Web Audio; silent where unavailable). */
export function beep(signal) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => ctx.close();
  } catch { /* no audio */ }
  return wait(350, signal ?? new AbortController().signal);
}

/**
 * player.play(clips, lang, onClip) → 'done' | 'stopped'. onClip(index) fires as each clip starts.
 * player.stop() interrupts at once (a key press during a call).
 */
export function createPlayer() {
  let controller = null;
  return {
    async play(clips, lang, onClip) {
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      for (let i = 0; i < clips.length; i++) {
        if (signal.aborted) return 'stopped';
        const c = clips[i];
        onClip?.(i);
        if (fast()) { await wait(100, signal); continue; }
        // Each folder may hold .mp3 (plays everywhere) or .ogg (not on iPhone Safari).
        const folders = c.shared
          ? [{ path: `${BASE}/audio/${c.file}`, key: c.file }]
          : [{ path: `${BASE}/audio/${lang}/${c.file}`, key: `${lang}/${c.id}` },
            ...(lang !== 'en' ? [{ path: `${BASE}/audio/en/${c.file}`, key: `en/${c.id}` }] : [])];
        let played = false;
        let blocked = false;
        for (const { path, key } of folders) {
          for (const ext of FORMATS) {
            const url = `${path}.${ext}`;
            if (found.get(url) === false) continue;
            const ok = await playUrl(url, signal);
            if (signal.aborted) return 'stopped';
            if (ok === 'blocked') { blocked = true; break; } // file may exist; speak instead, don't log it missing
            found.set(url, ok);
            if (ok) { played = true; break; }
          }
          if (played || blocked) break;
          logMissing(key);
        }
        if (!played) await speak(c.textEn, signal);
      }
      return signal.aborted ? 'stopped' : 'done';
    },
    stop() {
      controller?.abort();
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    },
  };
}

/**
 * Record a voice note (report "9 Other", unregistered callers). Stops after maxMs or when
 * stop() is called (# key). Resolves to a Blob, or null where recording is not possible.
 */
export function startRecording(maxMs = 8000) {
  let stopFn = () => {};
  const promise = (async () => {
    if (fast() || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return null;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return null; }
    return new Promise((resolve) => {
      const rec = new MediaRecorder(stream);
      const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); resolve(chunks.length ? new Blob(chunks, { type: rec.mimeType }) : null); };
      const timer = setTimeout(() => rec.state === 'recording' && rec.stop(), maxMs);
      stopFn = () => { clearTimeout(timer); if (rec.state === 'recording') rec.stop(); };
      rec.start();
    });
  })();
  return { promise, stop: () => stopFn() };
}
