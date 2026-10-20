import { useState } from 'preact/hooks';
import { addDays, formatDate } from '../../lib/dates.js';
import { cropName } from '../../lib/i18n.js';
import { weeklyOutlook } from '../../lib/orders.js';
import Card from '../ui/Card.jsx';
import { Select } from '../ui/Field.jsx';
import Button from '../ui/Button.jsx';
import { OrderSummary } from './Orders.jsx';

const WEEKS = 8;

export default function Outlook({ view, go }) {
  const [area, setArea] = useState('');
  const kafoIds = new Set(view.kafos.filter((k) => !area || k.district === area).map((k) => k.id));
  const rows = weeklyOutlook({ plantings: view.plantings, calendar: view.calendar, kafoIds, today: view.today, weeks: WEEKS });
  const max = Math.max(1, ...rows.flatMap((r) => r.weeks));
  const live = view.orders.filter((o) => !['paid', 'cancelled'].includes(o.status));

  return (
    <div class="space-y-4">
      <Card
        title="Expected harvest, next 8 weeks (kg per week)"
        actions={<Select aria-label="Area" value={area} onChange={(e) => setArea(e.currentTarget.value)}
          options={[{ value: '', label: 'All areas' }, ...view.districts.map((d) => ({ value: d, label: d }))]} />}
      >
        <p class="mb-3 text-xs text-muted">From kafo leaders' planting logs: estimates until weighed at delivery. Demo data.</p>
        <div class="space-y-4">
          {rows.map((r) => {
            const total = r.weeks.reduce((s, n) => s + n, 0);
            return (
              <div>
                <div class="mb-1 flex items-baseline gap-2 text-sm">
                  <span class="font-semibold">{cropName(r.crop)}</span>
                  <span class="text-muted">{total.toLocaleString('en-GB')} kg · market ~D{view.reference[r.crop] ?? '–'}/kg</span>
                </div>
                <div class="grid h-18 grid-cols-8 items-end gap-1">
                  {r.weeks.map((kg, i) => (
                    <div class="flex h-full flex-col justify-end" title={`Week of ${formatDate(addDays(view.today, i * 7))}: ${kg} kg`}>
                      <div class="rounded-t bg-accent" style={`height: ${Math.round((kg / max) * 100)}%`}></div>
                    </div>
                  ))}
                </div>
                <div class="mt-0.5 grid grid-cols-8 gap-1 text-center text-[10px] text-muted">
                  {r.weeks.map((kg, i) => <span>{kg > 0 ? kg : ''}<span class="block">{i === 0 ? 'now' : `+${i}w`}</span></span>)}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title={`My orders (${live.length})`} actions={<Button onClick={() => go('post')}>Post an order</Button>}>
        {live.length === 0 ? <p class="text-sm text-muted">No orders yet. Post one before planting so kafos can grow for you.</p> : (
          <ul class="divide-y divide-line">{live.map((o) => <li class="py-3"><OrderSummary o={o} /></li>)}</ul>
        )}
      </Card>
    </div>
  );
}
