// Voice calls on the basic phone (spec §9.4): ringing, answer/decline, the IVR from ivr.js
// played through voicePlayer.js, DTMF keys, silence handling, recording and subtitles.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { setCallStatus } from '../../lib/actions.js';
import { startCall, nodeClips, afterPlay, onSilence, pressKey, SILENCE_MS } from '../../lib/ivr.js';
import { makeContext } from '../../lib/ussd.js';
import { createPlayer, startRecording, beep } from '../../lib/voicePlayer.js';

const RING_DELAY = { callback: 5500, outbound_alert: 800, welcome: 800 }; // callback: after the 2.5 s pop-up + ~3 s
const MISSED_AFTER_MS = 30_000;

/**
 * @param {{ snap, userId, lang, runEffect: (effect, ctx) => Promise, onSubtitle?: (s) => void, onEnded?: (length: string) => void }} p
 * @returns {{ incoming, call, answer, decline, hangUp, dtmf, ringBack }}
 */
export function useVoiceCall({ snap, userId, lang, runEffect, onSubtitle, onEnded }) {
  const [incoming, setIncoming] = useState(null); // call row (or { local: true } for unknown numbers)
  const [call, setCallState] = useState(null); // { id, userId, startedAt, lastKey, recording }
  const setCall = (next) => setCallState((cur) => { const v = typeof next === 'function' ? next(cur) : next; callRef.current = v; return v; });
  const player = useMemo(() => createPlayer(), []);
  const gen = useRef(0); // bumps on every interruption so stale async steps stop
  const timers = useRef({});
  const seen = useRef(null);
  const ivr = useRef(null);
  const recorder = useRef(null);
  const callRef = useRef(null); // latest call, for async steps (goodbye hangs up by itself)

  // Everyone who uses this handset (a shared phone has two profiles).
  const holder = snap.users.find((u) => u.id === userId);
  const phoneUsers = holder?.phone ? snap.users.filter((u) => u.phone === holder.phone).map((u) => u.id) : [];
  const ringing = snap.calls.filter((c) => c.status === 'ringing' && phoneUsers.includes(c.user_id));

  const callCtx = useMemo(() => makeContext(snap, call?.userId ?? userId, lang), [snap, call?.userId, userId, lang]);
  const ctxRef = useRef(callCtx);
  ctxRef.current = callCtx;
  const subtitle = (s) => onSubtitle?.(s);

  const clear = (name) => { clearTimeout(timers.current[name]); delete timers.current[name]; };

  // New phone holder: forget everything; calls already ringing before now do not ring.
  useLayoutEffect(() => {
    seen.current = new Set(ringing.map((c) => c.id));
    stopAll();
    setIncoming(null);
    setCall(null);
  }, [userId]);

  // A new ringing call for this phone → ring after a short delay (spec: "calls back within ~10 s").
  useLayoutEffect(() => {
    for (const c of ringing) {
      if (seen.current.has(c.id)) continue;
      seen.current.add(c.id);
      timers.current[`ring_${c.id}`] = setTimeout(() => ring(c), RING_DELAY[c.direction] ?? 800);
    }
  }, [ringing.map((c) => c.id).join()]);

  useEffect(() => () => stopAll(), []);

  function ring(c) {
    setIncoming((cur) => {
      if (cur || ivr.current) { if (c.id) setCallStatus(c.id, 'missed'); return cur; } // busy
      clear('missed');
      timers.current.missed = setTimeout(() => {
        setIncoming(null);
        if (c.id) setCallStatus(c.id, 'missed');
      }, MISSED_AFTER_MS);
      return c;
    });
  }

  /** Unknown numbers have no call row: ring back locally. */
  function ringBack() {
    timers.current.local = setTimeout(() => ring({ id: null, direction: 'callback', user_id: null, local: true }), RING_DELAY.callback);
  }

  function stopAll() {
    gen.current++;
    player.stop();
    recorder.current?.stop();
    Object.keys(timers.current).forEach(clear);
    ivr.current = null;
    subtitle(null);
  }

  async function runNode(state) {
    const my = ++gen.current;
    clear('silence');
    ivr.current = state;
    const ctx = ctxRef.current;
    const clips = nodeClips(state, ctx);
    subtitle({ clips, index: 0 });
    const res = await player.play(clips, ctx.lang, (index) => subtitle({ clips, index }));
    if (my !== gen.current || res === 'stopped') return;

    const next = afterPlay(state);
    if (next.kind === 'hangup') { hangUp(); return; }
    if (next.kind === 'next') { runNode(next.state); return; }
    if (next.kind === 'record') {
      await beep();
      setCall((c) => c && { ...c, recording: true });
      recorder.current = startRecording(8000);
      const blob = await recorder.current.promise;
      recorder.current = null;
      if (my !== gen.current) return;
      setCall((c) => c && { ...c, recording: false });
      try { await runEffect({ type: next.action, ...state.params, voice_note: blob }, ctxRef.current); } catch (err) { console.error(err); }
      runNode(next.state);
      return;
    }
    // Wait for a key; after 8 s of silence replay once, then goodbye.
    timers.current.silence = setTimeout(() => { if (my === gen.current) runNode(onSilence(state)); }, SILENCE_MS);
  }

  function answer() {
    const c = incoming;
    if (!c) return;
    clear('missed');
    setIncoming(null);
    if (c.id) setCallStatus(c.id, 'answered');
    const who = c.user_id ?? userId;
    const ctx = makeContext(snap, who, lang);
    ctxRef.current = ctx;
    setCall({ id: c.id, userId: who, startedAt: Date.now(), lastKey: null, recording: false });
    runNode(startCall(ctx, c.direction));
  }

  function decline() {
    const c = incoming;
    clear('missed');
    setIncoming(null);
    if (c?.id) setCallStatus(c.id, 'missed');
  }

  /** End the call (red key or the goodbye clip). Tells the phone the call length "mm:ss". */
  function hangUp() {
    const c = callRef.current;
    stopAll();
    setCall(null);
    if (!c) return;
    if (c.id) setCallStatus(c.id, 'ended');
    const s = Math.round((Date.now() - c.startedAt) / 1000);
    onEnded?.(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
  }

  /** A key pressed during the call: interrupts the voice note and moves the menu on. */
  async function dtmf(k) {
    if (!ivr.current) return;
    setCall((c) => c && { ...c, lastKey: k });
    if (recorder.current) { if (k === '#') recorder.current.stop(); return; }
    gen.current++;
    player.stop();
    clear('silence');
    const ctx = ctxRef.current;
    const r = pressKey(ivr.current, k, ctx);
    if (r.effect) {
      try { await runEffect(r.effect, ctx); } catch (err) { console.error(err); }
    }
    runNode(r.state);
  }

  return { incoming, call, answer, decline, hangUp, dtmf, ringBack };
}
