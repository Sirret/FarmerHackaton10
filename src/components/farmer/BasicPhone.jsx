import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createInterest, createProduceRequest, createReport, createLead, setFarmerAlerts } from '../../lib/actions.js';
import { placeOutboundCall } from '../../lib/notify.js';
import { t } from '../../lib/i18n.js';
import { formatDate } from '../../lib/dates.js';
import { makeContext, startSession, renderScreen, reply, IDLE_TIMEOUT_MS } from '../../lib/ussd.js';

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

/** Run a USSD effect through the shared actions (same as every other channel). */
async function runEffect(effect, ctx) {
  const me = ctx.user?.id;
  switch (effect.type) {
    case 'interest': return createInterest({ farmerId: me, crop: effect.crop });
    case 'produce': return createProduceRequest({ farmerId: me, crop: effect.crop, amount_unit: effect.amount, ready_when: effect.ready });
    case 'report': return createReport({ reporterId: me, crop: effect.crop, problem: effect.problem });
    case 'toggle_sms': return setFarmerAlerts(me, { sms_alerts: !ctx.farmer.sms_alerts });
    case 'toggle_voice': return setFarmerAlerts(me, { voice_alerts: !ctx.farmer.voice_alerts });
    case 'callback': return placeOutboundCall(me, 'callback');
    case 'lead': return createLead({ phone: ctx.phone });
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
 */
export default function BasicPhone({ snap, userId, lang, dialRequest }) {
  const [app, setApp] = useState('home');
  const [homeSel, setHomeSel] = useState(0);
  const [number, setNumber] = useState('');
  const [session, setSession] = useState(null); // { state, reply, scroll, busy }
  const [popup, setPopup] = useState(null); // string[]
  const [profile, setProfile] = useState(null); // shared phone: who is using it
  const popupTimer = useRef(null);
  const idleTimer = useRef(null);

  // Holder changes (side panel) → back to Home with a fresh session. Layout effects run
  // straight away, even in a background tab (plain effects wait for an animation frame).
  useLayoutEffect(() => { setApp('home'); setSession(null); setProfile(null); setNumber(''); }, [userId]);
  useLayoutEffect(() => { if (dialRequest) { setApp('dial'); setNumber(dialRequest.code); setSession(null); } }, [dialRequest]);

  const ctx = useMemo(() => makeContext(snap, profile ?? userId, lang), [snap, userId, profile, lang]);
  const myCalls = ctx.user ? snap.calls.filter((c) => c.user_id === ctx.user.id).sort((a, b) => b.started_at.localeCompare(a.started_at)) : [];
  const unread = ctx.user ? snap.sms.filter((s) => s.to_user_id === ctx.user.id && !s.read).length : 0;
  const L = ctx.lang;

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
  useEffect(() => () => { clearTimeout(idleTimer.current); clearTimeout(popupTimer.current); }, []);

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
    if (popup) { if (k === 'end') { clearTimeout(popupTimer.current); setPopup(null); setApp('home'); } return; }
    if (k === 'end') { if (app === 'ussd') endSession(); else { setApp('home'); setNumber(''); } return; }
    const digit = /^[0-9*#]$/.test(k);
    if (app === 'home') {
      if (k === '1' || ((k === 'ok' || k === 'call') && homeSel === 0)) setApp('dial');
      else if (k === '2' || ((k === 'ok' || k === 'call') && homeSel === 1)) setApp('messages');
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
  if (popup) {
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
    const history = myCalls.slice(0, 3).map((c) => `${t(c.status === 'missed' ? 'phone.call.missed' : 'phone.call.in', L)} 4321 ${c.started_at.slice(11, 16)}`);
    body = (
      <div>
        <div class="text-[11px]">{t('phone.enter_number', L)}</div>
        <div class="mb-1 h-[22px] border-b border-lcd-ink text-right text-base tracking-wider">{number}</div>
        <div class="text-[11px]">{t('phone.recent', L)}</div>
        <Rows rows={history.length ? history : [t('phone.no_calls', L)]} />
      </div>
    );
  } else if (app === 'messages') {
    body = <Rows rows={wrap([`${t('phone.app.messages', L)}${unread ? ` - ${t('phone.unread', L, { n: unread })}` : ''}`, t('phone.messages_soon', L)])} />;
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
        <div class="pt-1">{body}</div>
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
