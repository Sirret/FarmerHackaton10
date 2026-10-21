import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createInterest, createProduceRequest, createReport, createLead, setFarmerAlerts, markSmsRead } from '../../lib/actions.js';
import { placeOutboundCall } from '../../lib/notify.js';
import { t } from '../../lib/i18n.js';
import { formatDate } from '../../lib/dates.js';
import { makeContext, startSession, renderScreen, reply, IDLE_TIMEOUT_MS } from '../../lib/ussd.js';
import { useVoiceCall } from './useVoiceCall.js';
import { unlock } from '../../lib/audio.js';

const COLS = 22; // characters per screen row
const ROWS = 6; // content rows under the status bar
const USSD_CODE = '*1234#';
const VOICE_CODE = '*4321#';
const KEYS = [['1', ''], ['2', 'abc'], ['3', 'def'], ['4', 'ghi'], ['5', 'jkl'], ['6', 'mno'], ['7', 'pqrs'], ['8', 'tuv'], ['9', 'wxyz'], ['*', ''], ['0', '+'], ['#', '']];

/** Word-wrap lines to the screen width. */
export function wrap(lines, width = COLS) {
  const rows = [];
  for (const line of lines) {
    let row = '';
    for (const w of line.split(' ')) {
      let word = w;
      while (word.length > width) { if (row) { rows.push(row); row = ''; } rows.push(word.slice(0, width)); word = word.slice(width); }
      if (!row) row = word;
      else if (row.length + 1 + word.length <= width) row += ` ${word}`;
      else { rows.push(row); row = word; }
    }
    rows.push(row);
  }
  return rows;
}

/** Run a USSD or voice effect through the shared actions (same as every other channel). */
async function runEffect(effect, ctx) {
  const me = ctx.user?.id;
  switch (effect.type) {
    case 'interest': return createInterest({ farmerId: me, crop: effect.crop });
    case 'produce': return createProduceRequest({ farmerId: me, crop: effect.crop, amount_unit: effect.amount, ready_when: effect.ready });
    case 'report': return createReport({ reporterId: me, crop: effect.crop, problem: effect.problem, voice_note: effect.voice_note ?? null });
    case 'toggle_sms': return setFarmerAlerts(me, { sms_alerts: !ctx.farmer.sms_alerts });
    case 'toggle_voice': return setFarmerAlerts(me, { voice_alerts: !ctx.farmer.voice_alerts });
    case 'callback': return placeOutboundCall(me, 'callback');
    case 'lead': return createLead({ phone: ctx.phone, voice_note: effect.voice_note ?? null });
    default: return null;
  }
}

function StatusBar({ lang }) {
  const [clock, setClock] = useState(() => new Date().toISOString().slice(11, 16));
  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toISOString().slice(11, 16)), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div class="flex items-end justify-between border-b border-lcd-ink pb-0.5 text-[11px]">
      <span class="flex items-end gap-1">
        <span class="flex items-end gap-px" aria-hidden="true">
          <span class="h-1 w-0.5 bg-lcd-ink"></span><span class="h-1.5 w-0.5 bg-lcd-ink"></span><span class="h-2 w-0.5 bg-lcd-ink"></span>
        </span>
        {t('phone.network', lang)}
      </span>
      <span>{clock}</span>
      <span class="flex h-2.5 w-5 items-center border border-lcd-ink p-px" aria-label="Battery"><span class="h-full w-3/4 bg-lcd-ink"></span></span>
    </div>
  );
}

function Rows({ rows }) {
  return <div class="whitespace-pre">{rows.map((r) => <div class="h-[18px] overflow-hidden">{r || ' '}</div>)}</div>;
}

/**
 * The farmer's basic phone. snap = live data (loadPhoneSnapshot), userId = who holds the
 * phone, lang = language override or null. dialRequest = { code, n } from a quick-dial button.
 * onSubtitle({ pieces, index } | null) reports the voice chain playing (audio.js), for the subtitles panel.
 */
export default function BasicPhone({ snap, userId, lang, dialRequest, onSubtitle }) {
  const [app, setApp] = useState('home');
  const [homeSel, setHomeSel] = useState(0);
  const [number, setNumber] = useState('');
  const [session, setSession] = useState(null); // { state, reply, scroll, busy }
  const [popup, setPopup] = useState(null); // string[]
  const [profile, setProfile] = useState(null); // shared phone: who is using it
  const [msgScroll, setMsgScroll] = useState(0);
  const [banner, setBanner] = useState(0); // number of new SMS to announce
  const popupTimer = useRef(null);
  const idleTimer = useRef(null);
  const bannerTimer = useRef(null);
  const seenSms = useRef(null); // SMS ids already on this phone

  // Holder changes (side panel) → back to Home with a fresh session. Layout effects run
  // straight away, even in a background tab (plain effects wait for an animation frame).
  useLayoutEffect(() => { setApp('home'); setSession(null); setProfile(null); setNumber(''); }, [userId]);
  useLayoutEffect(() => { if (dialRequest) { setApp('dial'); setNumber(dialRequest.code); setSession(null); } }, [dialRequest]);

  const ctx = useMemo(() => makeContext(snap, profile ?? userId, lang), [snap, userId, profile, lang]);
  const myCalls = ctx.user ? snap.calls.filter((c) => c.user_id === ctx.user.id).sort((a, b) => b.started_at.localeCompare(a.started_at)) : [];
  const mySms = ctx.user ? snap.sms.filter((s) => s.to_user_id === ctx.user.id).sort((a, b) => a.sent_at.localeCompare(b.sent_at)) : [];
  const unread = mySms.filter((s) => !s.read).length;
  const L = ctx.lang;

  const voice = useVoiceCall({
    snap, userId, lang, runEffect, onSubtitle,
    onEnded: (length) => { setApp('home'); showPopup([t('phone.call_ended', L, { time: length })], 1800); },
  });
  // An incoming call takes over the screen (a USSD session closes, like on a real phone).
  useLayoutEffect(() => {
    if (!voice.incoming) return;
    clearTimeout(idleTimer.current);
    clearTimeout(popupTimer.current);
    setSession(null);
    setPopup(null);
    setBanner(0);
  }, [voice.incoming]);
  // Call timer on screen.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!voice.call) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [voice.call?.startedAt]);

  // New SMS → "1 new message · 1234" banner on whatever screen is open (spec §9.1).
  // Reading the thread while it arrives marks it read instead.
  useLayoutEffect(() => { seenSms.current = null; setBanner(0); }, [ctx.user?.id]);
  useLayoutEffect(() => {
    if (seenSms.current === null) { seenSms.current = new Set(mySms.map((s) => s.id)); return; }
    const fresh = mySms.filter((s) => !seenSms.current.has(s.id));
    if (!fresh.length) return;
    fresh.forEach((s) => seenSms.current.add(s.id));
    if (app === 'thread') { markSmsRead(ctx.user.id); setMsgScroll(1e6); return; }
    setBanner((n) => n + fresh.length);
    clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(0), 5000);
  }, [mySms.length, ctx.user?.id]);

  function openThread() {
    setBanner(0);
    setApp('thread');
    setMsgScroll(1e6); // newest message at the bottom
    if (ctx.user && unread) markSmsRead(ctx.user.id);
  }

  function showPopup(lines, ms = 2500) {
    clearTimeout(popupTimer.current);
    setPopup(lines);
    popupTimer.current = setTimeout(() => { setPopup(null); setApp('home'); }, ms);
  }

  function endSession(lines) {
    clearTimeout(idleTimer.current);
    setSession(null);
    setProfile(null);
    if (lines) showPopup(lines); else setApp('home');
  }

  // 120 s without a key ends the USSD session (spec §9.2).
  function touch() {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => endSession([t('ussd.ended', L)]), IDLE_TIMEOUT_MS);
  }
  useEffect(() => () => { clearTimeout(idleTimer.current); clearTimeout(popupTimer.current); clearTimeout(bannerTimer.current); }, []);

  async function dial() {
    const code = number;
    setNumber('');
    if (code === USSD_CODE) {
      setSession({ state: startSession(ctx), reply: '', scroll: 0, busy: false });
      setApp('ussd');
      touch();
    } else if (code === VOICE_CODE) {
      // Phase 8 rings back and plays voice notes; the request is logged now.
      setApp('popup');
      showPopup([t('ussd.call_me', L)]);
      if (ctx.registered) await placeOutboundCall(ctx.user.id, 'callback');
      else voice.ringBack(); // unknown number: rings back with the 'not registered' voice menu
    } else if (code) {
      setApp('popup');
      showPopup([t('phone.not_reachable', L)]);
    }
  }

  async function send() {
    if (!session?.reply || session.busy) return;
    touch();
    const r = reply(session.state, session.reply, ctx);
    setSession({ ...session, busy: true });
    if (r.effect?.type === 'switch_user') setProfile(r.effect.profile);
    else if (r.effect) {
      try { await runEffect(r.effect, ctx); } catch (err) { endSession([err.message]); return; }
    }
    setSession({ state: r.state, reply: '', scroll: 0, busy: false });
    if (renderScreen(r.state, ctx).close) setTimeout(() => endSession(), 3500);
  }

  function press(k) {
    // press() runs inside the click / keydown handler, so unlock() here counts as a user
    // gesture: browsers only let the call play audio after it (must come before answer()).
    if (voice.incoming) { if (k === 'call' || k === 'ok') { unlock(); voice.answer(); } else if (k === 'end') voice.decline(); return; }
    if (voice.call) { unlock(); if (k === 'end') voice.hangUp(); else if (/^[0-9*#]$/.test(k)) voice.dtmf(k); return; }
    if (popup) { if (k === 'end') { clearTimeout(popupTimer.current); setPopup(null); setApp('home'); } return; }
    if (banner && k === 'ok' && app !== 'ussd') { openThread(); return; }
    if (k === 'end') { setBanner(0); if (app === 'ussd') endSession(); else { setApp('home'); setNumber(''); } return; }
    const digit = /^[0-9*#]$/.test(k);
    if (app === 'home') {
      if (k === '1' || ((k === 'ok' || k === 'call') && homeSel === 0)) setApp('dial');
      else if (k === '2' || ((k === 'ok' || k === 'call') && homeSel === 1)) setApp('messages');
    } else if (app === 'messages') {
      if ((k === '1' || k === 'ok' || k === 'call') && mySms.length) openThread();
      else if (k === '0') setApp('home');
    } else if (app === 'thread') {
      if (k === 'up') setMsgScroll((n) => Math.max(0, n - 1));
      else if (k === 'down') setMsgScroll((n) => n + 1);
      else if (k === '0' || k === 'del') setApp('messages');
      else if (k === 'up' || k === 'down') setHomeSel((s) => 1 - s);
    } else if (app === 'dial') {
      if (digit) setNumber((n) => (n.length < 15 ? n + k : n));
      else if (k === 'del' || k === 'up') setNumber((n) => n.slice(0, -1));
      else if (k === 'call' || k === 'ok') dial();
    } else if (app === 'ussd' && session && !session.busy) {
      touch();
      if (digit) setSession((s) => ({ ...s, reply: s.reply.length < 6 ? s.reply + k : s.reply }));
      else if (k === 'del') setSession((s) => ({ ...s, reply: s.reply.slice(0, -1) }));
      else if (k === 'up') setSession((s) => ({ ...s, scroll: Math.max(0, s.scroll - 1) }));
      else if (k === 'down') setSession((s) => ({ ...s, scroll: s.scroll + 1 }));
      else if (k === 'call' || k === 'ok') send();
    }
  }

  // Physical keyboard: digits * #, Enter = OK/Call, Esc = End, Backspace = delete, arrows scroll.
  const pressRef = useRef(press);
  pressRef.current = press;
  useEffect(() => {
    const onKey = (e) => {
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      const map = { Enter: 'ok', Escape: 'end', Backspace: 'del', ArrowUp: 'up', ArrowDown: 'down' };
      const k = /^[0-9*#]$/.test(e.key) ? e.key : map[e.key];
      if (!k) return;
      e.preventDefault();
      pressRef.current(k);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---------------------------------------------------------------- screen
  let body;
  if (voice.incoming) {
    body = (
      <div class="text-center">
        <div class="text-lg font-bold">4321</div>
        <div>{t('phone.incoming', L)}</div>
        <div class="mb-2 animate-pulse">{t('phone.calling', L)}</div>
        <div class="text-[11px]">{t('phone.answer_hint', L)}</div>
        <div class="text-[11px]">{t('phone.decline_hint', L)}</div>
      </div>
    );
  } else if (voice.call) {
    const sec = Math.round((Date.now() - voice.call.startedAt) / 1000);
    const clock = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    body = (
      <div>
        <div class="flex justify-between"><span>{t('phone.in_call', L)}</span><span>{clock}</span></div>
        <div class="my-1 border-y border-lcd-ink py-1 text-center">{voice.call.recording ? t('phone.recording', L) : 'Kafo Signal'}</div>
        <Rows rows={wrap([t('phone.keys_hint', L)])} />
        {voice.call.lastKey && <div class="text-[11px]">{t('phone.you_pressed', L, { key: voice.call.lastKey })}</div>}
      </div>
    );
  } else if (popup) {
    body = <Rows rows={wrap(popup).slice(0, ROWS + 1)} />;
  } else if (app === 'home') {
    body = (
      <div>
        <div class="mb-2 text-[11px]">{formatDate(snap.config.demo_date)}</div>
        {[t('phone.app.phone', L), `${t('phone.app.messages', L)}${unread ? ` (${unread})` : ''}`].map((label, i) => (
          <div class={`mb-1 px-1 ${homeSel === i ? 'bg-lcd-ink text-lcd' : ''}`}>{i + 1} {label}</div>
        ))}
      </div>
    );
  } else if (app === 'dial') {
    const history = myCalls.filter((c) => c.status !== 'ringing').slice(0, 3).map((c) => `${t(c.status === 'missed' ? 'phone.call.missed' : 'phone.call.in', L)} 4321 ${c.started_at.slice(11, 16)}`);
    body = (
      <div>
        <div class="text-[11px]">{t('phone.enter_number', L)}</div>
        <div class="mb-1 h-[22px] border-b border-lcd-ink text-right text-base tracking-wider">{number}</div>
        <div class="text-[11px]">{t('phone.recent', L)}</div>
        <Rows rows={history.length ? history : [t('phone.no_calls', L)]} />
      </div>
    );
  } else if (app === 'messages') {
    const last = mySms.at(-1);
    body = (
      <div>
        <div class="text-[11px]">{t('phone.inbox', L)}</div>
        {last ? (
          <div class="bg-lcd-ink px-1 text-lcd">
            <div>1 {t('phone.thread_name', L)}{unread ? ` (${unread})` : ''}</div>
            <div class="truncate text-[11px]">{last.body}</div>
          </div>
        ) : <div>{t('phone.no_messages', L)}</div>}
        <div class="mt-1 text-[11px]">0 {t('ussd.back', L)}</div>
      </div>
    );
  } else if (app === 'thread') {
    const rows = mySms.flatMap((m) => [`-- ${m.sent_at.slice(8, 10)}/${m.sent_at.slice(5, 7)} ${m.sent_at.slice(11, 16)} --`, ...wrap([m.body])]);
    const maxScroll = Math.max(0, rows.length - ROWS);
    const scroll = Math.min(msgScroll, maxScroll);
    body = (
      <div>
        <Rows rows={rows.slice(scroll, scroll + ROWS)} />
        <div class="flex justify-between border-t border-lcd-ink text-[11px]">
          <span>1234 - 0 {t('ussd.back', L)}</span>
          <span>{scroll > 0 ? '^' : ' '}{scroll < maxScroll ? 'v' : ' '}</span>
        </div>
      </div>
    );
  } else if (app === 'ussd' && session) {
    const rows = wrap(renderScreen(session.state, ctx).lines);
    const maxScroll = Math.max(0, rows.length - ROWS);
    const scroll = Math.min(session.scroll, maxScroll);
    body = (
      <div>
        <Rows rows={rows.slice(scroll, scroll + ROWS)} />
        <div class="flex justify-between border-t border-lcd-ink text-[11px]">
          <span>{session.busy ? t('phone.sending', L) : `${t('phone.reply', L)} ${session.reply}_`}</span>
          <span>{scroll > 0 ? '^' : ' '}{scroll < maxScroll ? 'v' : ' '}</span>
        </div>
      </div>
    );
  }

  const keyClass = 'flex h-11 flex-col items-center justify-center rounded-xl bg-phone-key text-phone-key-ink shadow active:translate-y-px';
  return (
    <div class="mx-auto w-[260px] select-none rounded-[2.5rem] bg-phone-body px-5 pb-6 pt-8 shadow-xl">
      <div class="mb-4 h-[178px] overflow-hidden rounded-md border-4 border-phone-key bg-lcd p-2 font-mono text-[13px] leading-[18px] text-lcd-ink" aria-live="polite" data-screen>
        <StatusBar lang={L} />
        <div class="relative pt-1">
          {body}
          {banner > 0 && !popup && !voice.incoming && !voice.call && (
            <div role="alert" class="absolute inset-x-0 top-1 border-2 border-lcd-ink bg-lcd px-1 py-0.5">
              <div class="font-bold">{t(banner === 1 ? 'phone.banner.one' : 'phone.banner.many', L, { n: banner })}</div>
              <div class="text-[11px]">OK = {t('phone.read', L)}</div>
            </div>
          )}
        </div>
      </div>

      <div class="mb-3 grid grid-cols-3 items-center gap-2">
        <button type="button" aria-label="Call" onClick={() => press('call')} class="h-11 rounded-full bg-call-green text-xs font-bold text-go-ink shadow">CALL</button>
        <div class="grid grid-cols-1 gap-1">
          <button type="button" aria-label="Up" onClick={() => press('up')} class="h-6 rounded-t-xl bg-phone-key text-xs text-phone-key-ink">▲</button>
          <button type="button" aria-label="OK" onClick={() => press('ok')} class="h-7 rounded bg-phone-key text-xs font-bold text-phone-key-ink">OK</button>
          <button type="button" aria-label="Down" onClick={() => press('down')} class="h-6 rounded-b-xl bg-phone-key text-xs text-phone-key-ink">▼</button>
        </div>
        <button type="button" aria-label="End" onClick={() => press('end')} class="h-11 rounded-full bg-call-red text-xs font-bold text-stop-ink shadow">END</button>
      </div>

      <div class="grid grid-cols-3 gap-2">
        {KEYS.map(([k, letters]) => (
          <button type="button" aria-label={`Key ${k}`} onClick={() => press(k)} class={keyClass}>
            <span class="text-base font-semibold leading-none">{k}</span>
            <span class="text-[9px] uppercase leading-none opacity-70">{letters || ' '}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
