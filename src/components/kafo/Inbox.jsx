import { useState } from 'preact/hooks';
import { confirmProduce, rejectProduceRequest, reviewReport, markInterestSeen, confirmSpotSale, declineSpotSale } from '../../lib/actions.js';
import { formatDate } from '../../lib/dates.js';
import { cropName, t } from '../../lib/i18n.js';
import Button from '../ui/Button.jsx';
import { inputClass, Notice } from '../ui/Field.jsx';
import { useAction } from '../ui/useAction.js';
import CropIcon from '../shared/CropIcon.jsx';

const itemClass = 'rounded-xl border border-line bg-surface p-3 text-sm shadow-sm';

/** Produce requests for one crop: tick, correct kg, and offer them to buyers as one. */
function ProduceGroup({ crop, requests, leaderId, run, busy }) {
  const [picked, setPicked] = useState(requests.map((r) => r.id));
  const [kg, setKg] = useState('');
  const chosen = requests.filter((r) => picked.includes(r.id));
  const sum = chosen.reduce((s, r) => s + r.est_kg, 0);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <li class={itemClass}>
      <p class="mb-2 flex items-center gap-2 font-semibold"><CropIcon crop={crop} size="text-lg" /> {cropName(crop)}: members have produce</p>
      <ul class="mb-2 space-y-1">
        {requests.map((r) => (
          <li class="flex items-center gap-2">
            <label class="flex min-h-11 flex-1 items-center gap-2">
              <input type="checkbox" class="h-5 w-5" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} />
              <span>{r.farmer} · {t(`unit.${r.amount_unit}`)} (~{r.est_kg} kg) · {t(`ready.${r.ready_when}`).toLowerCase()}</span>
            </label>
            <button type="button" aria-label={`Reject ${r.farmer}`} onClick={() => run(() => rejectProduceRequest(r.id, leaderId), 'Request rejected')}
              class="h-11 w-11 rounded-lg border border-line text-muted hover:bg-soft">✕</button>
          </li>
        ))}
      </ul>
      <div class="flex items-center gap-2">
        <input type="number" min="1" inputMode="numeric" aria-label="Total kg" class={`${inputClass} w-24`} placeholder={String(sum)} value={kg}
          onInput={(e) => setKg(e.currentTarget.value)} />
        <span class="text-xs text-muted">kg</span>
        <Button variant="go" class="ml-auto" disabled={busy || !chosen.length}
          onClick={() => run(() => confirmProduce(picked, kg, leaderId), (o) => `Offered ${o.kg} kg to buyers. Members get an SMS.`)}>
          {chosen.length > 1 ? `Merge ${chosen.length} & offer` : 'Confirm & offer'}
        </Button>
      </div>
    </li>
  );
}

export default function Inbox({ view, leaderId, go }) {
  // One notice for the whole inbox: handled items disappear from the list.
  const [run, notice, busy] = useAction();
  const { spot, interests, requests, reports, orders } = view.inbox;
  const byCrop = {};
  for (const r of requests) (byCrop[r.crop] ??= []).push(r);

  if (view.inbox.count === 0) {
    return (
      <div>
        <p class="rounded-xl border border-line bg-surface p-3 text-sm text-muted">Nothing to do. ✓</p>
        <Notice notice={notice} />
      </div>
    );
  }

  return (
    <div>
      <ul class="space-y-2">
        {spot.map((o) => (
          <li class="rounded-xl border-2 border-go bg-surface p-3 text-sm shadow-sm">
            <p><span class="font-semibold">{o.buyer?.business_name}</span> wants to buy our {o.kg} kg {cropName(o.crop).toLowerCase()} at <span class="font-semibold">D{o.price_per_kg}/kg</span> (D{o.kg * o.price_per_kg} in total).</p>
            <div class="mt-2 flex gap-2">
              <Button variant="go" onClick={() => run(() => confirmSpotSale(o.id, leaderId), 'Sale confirmed. Members who gave produce get an SMS.')}>Confirm sale</Button>
              <Button variant="ghost" onClick={() => run(() => declineSpotSale(o.id, leaderId), 'Declined. The offer stays open for other buyers.')}>Decline</Button>
            </div>
          </li>
        ))}

        {interests.map((i) => (
          <li class={itemClass}>
            <p><span class="font-semibold">{i.farmer}</span> is interested in planting <span class="font-semibold">{cropName(i.crop).toLowerCase()}</span>.</p>
            <div class="mt-2 flex gap-2">
              <Button variant="go" onClick={async () => { await run(() => markInterestSeen(i.id, leaderId)); go('plant', { crop: i.crop, member: i.farmer_id }); }}>Log planting</Button>
              <Button variant="ghost" onClick={() => run(() => markInterestSeen(i.id, leaderId))}>OK, seen</Button>
            </div>
          </li>
        ))}

        {Object.entries(byCrop).map(([crop, rs]) => <ProduceGroup key={crop + rs.length} crop={crop} requests={rs} leaderId={leaderId} run={run} busy={busy} />)}

        {reports.map((r) => (
          <li class={itemClass}>
            <p><span class="font-semibold">{r.reporter}</span> reported <span class="font-semibold">{t(`problem.${r.problem}`).toLowerCase()}</span> on {cropName(r.crop).toLowerCase()}. <span class="text-muted">Not checked yet.</span></p>
            <div class="mt-2 flex gap-2">
              <Button variant="stop" onClick={() => run(() => reviewReport(r.id, 'verify', leaderId), 'Report confirmed')}>Confirm problem</Button>
              <Button variant="ghost" onClick={() => run(() => reviewReport(r.id, 'dismiss', leaderId), 'Report dismissed')}>Dismiss</Button>
            </div>
          </li>
        ))}

        {orders.map((o) => (
          <li class={itemClass}>
            <p><span class="font-semibold">{o.buyer?.business_name}</span> wants {o.remaining} kg {cropName(o.crop).toLowerCase()} · D{o.price_per_kg}/kg · by {formatDate(o.window_start)}</p>
            <div class="mt-2"><Button variant="ghost" onClick={() => go('sell')}>See order</Button></div>
          </li>
        ))}
      </ul>
      <Notice notice={notice} />
    </div>
  );
}
