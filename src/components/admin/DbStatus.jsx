import { db } from '../../lib/db.js';
import { jump } from '../../lib/clock.js';
import { formatDate } from '../../lib/dates.js';
import { useLive } from '../../lib/useLive.js';

// Live view of the in-browser database. Open it in two tabs to see changes sync.
export default function DbStatus() {
  const counts = useLive(
    () => Promise.all(db.tables.map(async (t) => [t.name, await t.count()])),
    [],
    [],
  );
  const date = useLive(async () => (await db.config.get('main'))?.demo_date);

  return (
    <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <h2 class="font-semibold">Database</h2>
        <span class="text-sm text-muted">Demo date: {date ? formatDate(date) : '…'}</span>
        <div class="ml-auto flex gap-2">
          <button type="button" onClick={() => jump(-7)} class="min-h-11 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-soft">−1 week</button>
          <button type="button" onClick={() => jump(7)} class="min-h-11 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-ink hover:opacity-90">+1 week</button>
        </div>
      </div>
      <ul class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-5">
        {counts.map(([name, n]) => (
          <li class="flex justify-between border-b border-line py-1">
            <span class="font-mono text-xs">{name}</span>
            <span class={n ? 'font-semibold' : 'text-muted'}>{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
