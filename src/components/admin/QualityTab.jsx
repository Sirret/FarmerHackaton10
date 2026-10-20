import { useState } from 'preact/hooks';
import { db } from '../../lib/db.js';
import { reviewReport, resolveFlag, resolveDispute, ADMIN_ID } from '../../lib/actions.js';
import { atTime, formatDate } from '../../lib/dates.js';
import { cropName, t } from '../../lib/i18n.js';
import { useLive } from '../../lib/useLive.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import { inputClass, Notice } from '../ui/Field.jsx';
import { useAction } from '../ui/useAction.js';

const QUEUE_HOURS = 48; // spec §8.10: unverified reports older than 48 h need the admin
const REASON = { kg_over_capacity: 'Far more kg or beds than the kafo can grow', update_burst: 'Many stage changes in a short time', estimate_gap: 'Weighed kg very different from the estimate' };
const ISSUE = (k) => t(`issue.${k}`);

function FlagRow({ f, data }) {
  const [kg, setKg] = useState('');
  const [run, notice] = useAction();
  const planting = f.entity === 'planting' ? data.plantings.get(f.entity_id) : null;
  const collection = f.entity === 'collection' ? data.collections.get(f.entity_id) : null;
  const kafo = data.kafos.get(planting?.kafo_id ?? collection?.kafo_id);
  const cal = planting && data.calendar.get(planting.crop);
  return (
    <li class="rounded-lg border border-line p-3 text-sm">
      <p class="font-medium">{REASON[f.reason] ?? f.reason}</p>
      <p class="text-muted">
        {kafo?.name}
        {planting && ` · ${cropName(planting.crop)} · ${planting.beds} beds · logged ${planting.expected_kg} kg (normal ~${planting.beds * cal.kg_per_bed} kg) · kafo has ${kafo?.total_beds} beds`}
        {collection && ` · weighed ${collection.kg_weighed} kg on ${formatDate(collection.collected_at)}`}
      </p>
      {f.status === 'open' ? (
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => run(() => resolveFlag(f.id, { status: 'approved' }), 'Approved as it is')}>Approve</Button>
          {planting && <>
            <input type="number" min="1" aria-label="Corrected kg" placeholder="kg" class={`${inputClass} w-24`} value={kg} onInput={(e) => setKg(e.currentTarget.value)} />
            <Button disabled={!kg} onClick={() => run(() => resolveFlag(f.id, { status: 'corrected', correct_kg: kg }), `Corrected to ${kg} kg`)}>Correct kg</Button>
          </>}
        </div>
      ) : <p class="mt-1 text-xs text-muted">{f.status === 'approved' ? '✓ Approved' : '✓ Corrected'}</p>}
      <Notice notice={notice} />
    </li>
  );
}

function DisputeRow({ d, data }) {
  const [note, setNote] = useState('');
  const [run, notice] = useAction();
  const order = data.orders.get(d.order_id);
  return (
    <li class="rounded-lg border border-line p-3 text-sm">
      <p><span class="font-medium">{ISSUE(d.issue)}</span> on {order ? `${order.kg} kg ${cropName(order.crop).toLowerCase()} for ${data.buyers.get(order.buyer_id)?.business_name}` : d.order_id}</p>
      <p class="text-muted">Raised by {data.users.get(d.raised_by)?.name ?? d.raised_by}{d.description && `: “${d.description}”`}</p>
      {d.status === 'open' ? (
        <div class="mt-2 flex flex-wrap gap-2">
          <input aria-label="Decision" placeholder="What was decided (payment is held until then)" class={`${inputClass} flex-1`} value={note} onInput={(e) => setNote(e.currentTarget.value)} />
          <Button onClick={() => run(() => resolveDispute(d.id, note), 'Resolved: the buyer can pay now')}>Resolve</Button>
        </div>
      ) : <p class="mt-1 text-xs">✓ Resolved: {d.resolution_note}</p>}
      <Notice notice={notice} />
    </li>
  );
}

// Quality (spec §8.10–8.12): report queue, data-quality flags, disputes.
export default function QualityTab() {
  const [run, notice] = useAction();
  const data = useLive(async () => {
    const [config, reports, flags, disputes, plantings, collections, kafos, users, orders, buyers, calendar] = await Promise.all([
      db.config.get('main'), db.reports.toArray(), db.flags.toArray(), db.disputes.toArray(), db.plantings.toArray(),
      db.collections.toArray(), db.kafos.toArray(), db.users.toArray(), db.orders.toArray(), db.buyers.toArray(), db.crop_calendar.toArray(),
    ]);
    const map = (rows, k = 'id') => new Map(rows.map((r) => [r[k], r]));
    return {
      now: Date.parse(atTime(config.demo_date)), reports, flags, disputes,
      plantings: map(plantings), collections: map(collections), kafos: map(kafos), users: map(users), orders: map(orders), buyers: map(buyers), calendar: map(calendar, 'crop'),
    };
  });
  if (!data) return <p class="text-sm text-muted">Loading…</p>;

  const queue = data.reports
    .filter((r) => r.status === 'open' && !r.verified)
    .map((r) => ({ ...r, hours: Math.round((data.now - Date.parse(r.created_at)) / 3_600_000) }))
    .sort((a, b) => b.hours - a.hours);
  const late = queue.filter((r) => r.hours >= QUEUE_HOURS);
  const openFlags = data.flags.filter((f) => f.status === 'open');
  const openDisputes = data.disputes.filter((d) => d.status === 'open');

  return (
    <div class="grid gap-4 lg:grid-cols-2">
      <Card title={`Report queue (${queue.length} unchecked, ${late.length} over ${QUEUE_HOURS} h)`} class="lg:col-span-2">
        <p class="mb-3 text-sm text-muted">Farmer reports no leader has checked yet. Ones older than {QUEUE_HOURS} hours need you: verify, dismiss, or escalate to the plant protection officer.</p>
        {queue.length === 0 ? <p class="text-sm text-muted">Nothing waiting. ✓</p> : (
          <ul class="divide-y divide-line text-sm">
            {queue.map((r) => (
              <li class="flex flex-wrap items-center gap-2 py-2">
                <span class={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.hours >= QUEUE_HOURS ? 'bg-stop-soft' : 'bg-soft'}`}>{r.hours >= QUEUE_HOURS ? '! ' : ''}{r.hours} h</span>
                <span class="min-w-0 flex-1">{t(`problem.${r.problem}`)} on {cropName(r.crop).toLowerCase()} · {data.users.get(r.reporter_id)?.name} · {data.kafos.get(r.kafo_id)?.name}</span>
                <Button variant="ghost" onClick={() => run(() => reviewReport(r.id, 'verify', ADMIN_ID), 'Verified')}>Verify</Button>
                <Button variant="ghost" onClick={() => run(() => reviewReport(r.id, 'dismiss', ADMIN_ID), 'Dismissed')}>Dismiss</Button>
                <Button variant="stop" onClick={() => run(() => reviewReport(r.id, 'escalate', ADMIN_ID), 'Escalated to the plant protection officer')}>Escalate</Button>
              </li>
            ))}
          </ul>
        )}
        <Notice notice={notice} />
      </Card>

      <Card title={`Data-quality flags (${openFlags.length} open)`}>
        {data.flags.length === 0 ? <p class="text-sm text-muted">No flags. Logging far more kg than a kafo's beds can grow, or weighing very different kg from the estimate, raises one.</p> : (
          <ul class="space-y-2">{[...openFlags, ...data.flags.filter((f) => f.status !== 'open')].map((f) => <FlagRow key={f.id} f={f} data={data} />)}</ul>
        )}
      </Card>

      <Card title={`Disputes (${openDisputes.length} open)`}>
        {data.disputes.length === 0 ? <p class="text-sm text-muted">No disputes. Buyers and leaders can “Report issue” on an order.</p> : (
          <ul class="space-y-2">{[...openDisputes, ...data.disputes.filter((d) => d.status !== 'open')].map((d) => <DisputeRow key={d.id} d={d} data={data} />)}</ul>
        )}
      </Card>
    </div>
  );
}
