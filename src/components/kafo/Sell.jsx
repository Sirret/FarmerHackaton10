import { useState } from 'preact/hooks';
import { acceptOrder, recordDelivery, withdrawOffer } from '../../lib/actions.js';
import { formatDate } from '../../lib/dates.js';
import { cropName, t } from '../../lib/i18n.js';
import { signalStyle } from '../../lib/signalStyle.js';
import Button from '../ui/Button.jsx';
import { Notice, inputClass } from '../ui/Field.jsx';
import { useAction } from '../ui/useAction.js';
import CropIcon from '../shared/CropIcon.jsx';

const cardClass = 'rounded-xl border bg-surface p-3 text-sm shadow-sm';

function OrderCard({ o, view, leaderId, run, busy }) {
  const [kg, setKg] = useState('');
  const s = signalStyle(o.fair.signal);
  const accept = (amount) => run(() => acceptOrder(o.id, view.kafo.id, amount, leaderId), (a) => `Accepted ${a.kg_committed} kg ${cropName(o.crop).toLowerCase()} for ${o.buyer?.business_name}. See “Our orders”.`);

  return (
    <li class={`${cardClass} border-l-4 ${s.border}`}>
      <div class="flex items-start gap-2">
        <CropIcon crop={o.crop} />
        <div class="flex-1">
          <p class="font-semibold">{o.buyer?.business_name} {o.buyer?.verified && <span class="text-xs font-normal text-muted">✓ verified</span>}</p>
          <p>{o.kg} kg {cropName(o.crop).toLowerCase()} · <span class="font-semibold">D{o.price_per_kg}/kg</span> · grade {o.grade}</p>
          <p class="text-xs text-muted">
            Deliver {formatDate(o.window_start)} – {formatDate(o.window_end)} · {o.fulfilment === 'delivery' ? `kafo delivers (+D${o.delivery_fee} to members)` : 'buyer picks up'}
            {o.repeat_weekly && ' · repeats weekly'}
          </p>
          <p class="text-xs text-muted">{o.buyer_reliability == null ? 'New buyer: no payments yet' : `Pays on time: ${o.buyer_reliability}%`}</p>
        </div>
      </div>
      <p class={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${s.soft}`}>
        <span aria-hidden="true">{s.icon}</span> {t(`reason.${o.fair.reason}`)}{o.fair.average ? ` (market ~D${o.fair.average}/kg)` : ''}
      </p>
      <p class="mt-1 text-xs">Still open: <span class="font-semibold">{o.remaining} kg</span>{o.ours > 0 && ` · we committed ${o.ours} kg`}</p>
      <div class="mt-2 flex items-center gap-2">
        <Button variant="go" disabled={busy} onClick={() => accept(o.remaining)}>Accept {o.remaining} kg</Button>
        <input type="number" min="1" max={o.remaining} inputMode="numeric" aria-label="Kg to accept" placeholder="kg" class={`${inputClass} w-20`}
          value={kg} onInput={(e) => setKg(e.currentTarget.value)} />
        <Button variant="ghost" disabled={busy || !kg} onClick={() => accept(kg)}>Part</Button>
      </div>
    </li>
  );
}

function OurOrder({ o, view, leaderId }) {
  const [open, setOpen] = useState(false);
  const [kgs, setKgs] = useState({});
  const [run, notice, busy] = useAction();
  const candidates = view.members.filter((m) => o.planted_members.includes(m.id) || m.crops.includes(o.crop));
  const total = Object.values(kgs).reduce((s, v) => s + (Number(v) || 0), 0);
  const delivered = o.collections.reduce((s, c) => s + c.kg_weighed, 0);

  async function save() {
    const r = await run(() => recordDelivery(o.id, view.kafo.id, Object.entries(kgs).map(([member_id, kg]) => ({ member_id, kg })), leaderId),
      (res) => `Delivery saved: ${res.collection.kg_weighed} kg weighed.` + (res.flags.length ? ' ⚠ Very different from the estimate: the admin will check it.' : ''));
    if (r) { setKgs({}); setOpen(false); }
  }

  return (
    <li class={`${cardClass} border-line`}>
      <div class="flex items-start gap-2">
        <CropIcon crop={o.crop} />
        <div class="flex-1">
          <p class="font-semibold">{o.kg_committed} kg {cropName(o.crop).toLowerCase()} for {o.buyer?.business_name}</p>
          <p class="text-xs text-muted">D{o.price_per_kg}/kg · deliver {formatDate(o.window_start)} – {formatDate(o.window_end)}</p>
          <p class="text-xs">Planted for it: {o.planted_kg} kg · delivered: {delivered} kg</p>
        </div>
      </div>
      {o.collections.map((c) => (
        <p class="mt-1 rounded bg-soft px-2 py-1 text-xs">
          Weighed {c.kg_weighed} kg on {formatDate(c.collected_at)}: {c.deliveries.map((d) => `${d.name.split(' ')[0]} ${d.kg}`).join(', ')}
          {c.kg_accepted != null ? ` · buyer accepted ${c.kg_accepted} kg` : ' · waiting for buyer'}
        </p>
      ))}
      {!open ? (
        <Button variant="ghost" class="mt-2" onClick={() => setOpen(true)}>Record delivery (weighed kg)</Button>
      ) : (
        <div class="mt-2 space-y-1 rounded-lg bg-soft p-2">
          {candidates.map((m) => (
            <label class="flex items-center gap-2">
              <span class="flex-1">{m.name}</span>
              <input type="number" min="0" inputMode="numeric" aria-label={`${m.name} kg`} class={`${inputClass} w-20`} value={kgs[m.id] ?? ''}
                onInput={(e) => { const v = e.currentTarget.value; setKgs((k) => ({ ...k, [m.id]: v })); }} />
              <span class="text-xs text-muted">kg</span>
            </label>
          ))}
          <div class="flex items-center gap-2 pt-1">
            <span class="flex-1 font-semibold">Total {total} kg</span>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="go" disabled={busy || !total} onClick={save}>Save</Button>
          </div>
        </div>
      )}
      <Notice notice={notice} />
    </li>
  );
}

export default function Sell({ view, leaderId }) {
  const [run, notice] = useAction();
  // Accept messages live here: a fully accepted order card disappears from the list.
  const [acceptRun, acceptNotice, acceptBusy] = useAction();
  return (
    <div class="space-y-4">
      <section>
        <h2 class="mb-2 text-sm font-semibold">Buyer orders ({view.openOrders.length})</h2>
        {view.openOrders.length === 0 ? <p class="text-sm text-muted">No open orders right now.</p> : (
          <ul class="space-y-2">{view.openOrders.map((o) => <OrderCard key={o.id} o={o} view={view} leaderId={leaderId} run={acceptRun} busy={acceptBusy} />)}</ul>
        )}
        <Notice notice={acceptNotice} />
      </section>

      <section>
        <h2 class="mb-2 text-sm font-semibold">Our orders ({view.ourOrders.length})</h2>
        {view.ourOrders.length === 0 ? <p class="text-sm text-muted">Accept a buyer order to see it here.</p> : (
          <ul class="space-y-2">{view.ourOrders.map((o) => <OurOrder key={o.id} o={o} view={view} leaderId={leaderId} />)}</ul>
        )}
      </section>

      <section>
        <h2 class="mb-2 text-sm font-semibold">Our offers to buyers</h2>
        {view.offers.length === 0 ? <p class="text-sm text-muted">Confirm members' “I have produce” requests on Home to offer them.</p> : (
          <ul class="divide-y divide-line rounded-xl border border-line bg-surface text-sm">
            {view.offers.map((o) => (
              <li class="flex items-center gap-2 px-3 py-2">
                <CropIcon crop={o.crop} size="text-lg" />
                <span class="flex-1">{o.kg} kg {cropName(o.crop).toLowerCase()} · {t(`ready.${o.ready_when}`).toLowerCase()}</span>
                <span class="text-xs text-muted">{o.status}</span>
                {o.status === 'available' && <Button variant="ghost" onClick={() => run(() => withdrawOffer(o.id, leaderId), 'Offer withdrawn')}>Withdraw</Button>}
              </li>
            ))}
          </ul>
        )}
        <Notice notice={notice} />
      </section>
    </div>
  );
}
