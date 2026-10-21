import { formatDate } from '../../lib/dates.js';
import { t } from '../../lib/i18n.js';

/**
 * Every step of an order (orderTimeline in src/lib/orders.js): ticked when done, with the
 * date it happened; the next step is highlighted. Leaders and buyers see the same record.
 * `hidden` drops steps that don't apply to this viewer.
 */
export default function OrderTimeline({ timeline, hidden = [] }) {
  const next = timeline.find((s) => !s.done)?.key;
  return (
    <ol class="mt-2 space-y-0.5 text-xs">
      {timeline.filter((s) => !hidden.includes(s.key)).map((s) => (
        <li class={`flex items-center gap-2 rounded px-1.5 py-1 ${s.key === next ? 'bg-careful-soft font-semibold' : ''}`}>
          <span aria-hidden="true" class={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${s.done ? 'bg-go text-go-ink' : 'border border-line'}`}>{s.done ? '✓' : ''}</span>
          <span class={`flex-1 ${s.done || s.key === next ? 'text-ink' : 'text-muted'}`}>
            {t(`timeline.${s.key}`)}{s.detail ? ` · ${s.detail}` : ''}
            <span class="sr-only">{s.done ? ' (done)' : s.key === next ? ' (next)' : ' (to do)'}</span>
          </span>
          {s.at && s.done && <span class="text-muted">{formatDate(s.at)}</span>}
          {s.key === next && <span class="text-[10px] uppercase tracking-wide">Next</span>}
        </li>
      ))}
    </ol>
  );
}
