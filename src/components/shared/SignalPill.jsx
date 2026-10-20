import { render } from '../../lib/render.js';

// Preact twin of SignalBadge.astro: colour + icon + word, via render(..., 'tile').
export default function SignalPill({ signal, kind = 'plant', lang = 'en' }) {
  const tile = render(signal, 'tile', lang, { kind });
  return (
    <span class={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tile.classes.bg} ${tile.classes.ink}`}>
      <span aria-hidden="true">{tile.icon}</span>
      {tile.label}
    </span>
  );
}
