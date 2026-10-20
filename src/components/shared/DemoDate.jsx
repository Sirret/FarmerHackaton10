import { db } from '../../lib/db.js';
import { formatDate } from '../../lib/dates.js';
import { useLive } from '../../lib/useLive.js';

// Live demo date shown in the header; updates when any tab jumps the clock.
export default function DemoDate() {
  const date = useLive(async () => (await db.config.get('main'))?.demo_date);
  return (
    <span class="rounded-md bg-accent px-2 py-1 text-xs font-medium" title="Demo date">
      {date ? formatDate(date) : '…'}
    </span>
  );
}
