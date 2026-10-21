// 🔊 Plays a clip chain (the same one the farmer hears on the voice line) through the
// audio engine. Missing recordings are handled by the engine (subtitle + English speech).
// Only one button plays at a time; a small caption shows what is being said.
// Returns [button, caption]: put it in a `flex flex-wrap` row, the caption takes a full line.
import { useEffect, useRef, useState } from 'preact/hooks';
import { playChain, stop, unlock } from '../../lib/audio.js';

// Module-level "current player": starting one button resets every other one.
let current = null;
const listeners = new Set();
const setCurrent = (token) => {
  current = token;
  listeners.forEach((fn) => fn(token));
};

export default function AudioButton({ items, lang = 'en', label = 'Listen' }) {
  const token = useRef({});
  const [playing, setPlaying] = useState(false);
  const [sub, setSub] = useState(null);

  useEffect(() => {
    const onChange = (owner) => {
      if (owner !== token.current) { setPlaying(false); setSub(null); }
    };
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
      if (current === token.current) { stop(); current = null; }
    };
  }, []);

  if (typeof window === 'undefined' || !items?.length) return null;

  const onClick = () => {
    unlock();
    if (playing && current === token.current) {
      stop();
      setCurrent(null);
      setPlaying(false);
      setSub(null);
      return;
    }
    const me = token.current;
    setCurrent(me);
    setPlaying(true);
    playChain(items, {
      lang,
      onSubtitle: (s) => { if (current === me) setSub(s); },
    }).then(() => {
      if (current === me) { setCurrent(null); setPlaying(false); setSub(null); }
    });
  };

  return (
    <>
      <button type="button" onClick={onClick} aria-label={playing ? `Stop: ${label}` : label}
        title={label} aria-pressed={playing}
        class={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line ${playing ? 'bg-brand text-brand-ink' : 'bg-surface hover:bg-soft'}`}>
        {playing ? '■' : '🔊'}
      </button>
      {playing && sub?.pieces?.length > 0 && (
        <p class="w-full basis-full rounded-lg bg-soft px-2 py-1 text-xs leading-snug text-muted" aria-live="polite">
          {sub.pieces.map((p, i) => {
            const text = p.text || p.textEn;
            if (!text) return null;
            return (
              <span key={i} class={i === sub.index ? 'font-semibold text-ink' : ''}>{text} </span>
            );
          })}
        </p>
      )}
    </>
  );
}
