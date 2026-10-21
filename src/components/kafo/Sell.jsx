import { useState } from 'preact/hooks';
import { acceptOrder, recordDelivery, withdrawOffer, dispatchCollection, confirmHandover } from '../../lib/actions.js';
import { formatDate } from '../../lib/dates.js';
import { cropName, t } from '../../lib/i18n.js';
import { expectedCash } from '../../lib/orders.js';
import { sampleProofPhoto, photoToDataUrl } from '../../lib/proof.js';
import { signalStyle } from '../../lib/signalStyle.js';
import Button from '../ui/Button.jsx';
import { Notice, inputClass } from '../ui/Field.jsx';
import { useAction } from '../ui/useAction.js';
import CropIcon from '../shared/CropIcon.jsx';
import OrderTimeline from '../shared/OrderTimeline.jsx';
import { StageControl } from './Plant.jsx';

const cardClass = 'rounded-xl border bg-surface p-3 text-sm shadow-sm';
const money = (n) => `D${n.toLocaleString('en-GB')}`;

/** Buyer name + who to call. Shown on every order so nobody forgets who it is for. */
function BuyerLine({ o }) {
  return (
    <p class="text-xs text-muted">
      {o.buyer?.location} · {o.buyer?.contact_name}{' '}
      <a href={`tel:${o.buyer?.contact_phone}`} class="font-medium text-accent underline">{o.buyer?.contact_phone}</a>
    </p>
  );
}

function OrderCard({ o, view, leaderId, run, busy }) {
  const [kg, setKg] = useState(String(o.remaining));
  const s = signalStyle(o.fair.signal);
  const cash = expectedCash(o, kg);
  const beds = o.kg_per_bed ? Math.ceil(cash.kg / o.kg_per_bed) : null;
  const accept = () => run(() => acceptOrder(o.id, view.kafo.id, kg, leaderId),
    (a) => `Accepted ${a.kg_committed} kg ${cropName(o.crop).toLowerCase()} for ${o.buyer?.business_name} (about ${money(expectedCash(o, a.kg_committed).total)} for members). Next: assign members under “Our orders”.`);

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
          <BuyerLine o={o} />
          <p class="text-xs text-muted">{o.buyer_reliability == null ? 'New buyer: no payments yet' : `Pays on time: ${o.buyer_reliability}%`}</p>
        </div>
      </div>
      <p class={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${s.soft}`}>
        <span aria-hidden="true">{s.icon}</span> {t(`reason.${o.fair.reason}`)}{o.fair.average ? ` (market ~D${o.fair.average}/kg)` : ''}
      </p>
      <p class="mt-1 text-xs">Still open: <span class="font-semibold">{o.remaining} kg</span>{o.ours > 0 && ` · we committed ${o.ours} kg`}</p>

      <div class="mt-2 rounded-lg bg-soft p-2">
        <label class="flex items-center gap-2 text-xs font-medium">
          How many kg can we grow?
          <input type="number" min="1" max={o.remaining} inputMode="numeric" aria-label="Kg to accept" class={`${inputClass} w-24`}
            value={kg} onInput={(e) => setKg(e.currentTarget.value)} />
        </label>
        <p class="mt-2 text-base font-bold">Expected cash: {money(cash.total)}</p>
        <p class="text-xs text-muted">
          {cash.kg} kg × D{o.price_per_kg}{cash.delivery ? ` + ${money(cash.delivery)} delivery` : ''} · paid straight to members' wallets, before any losses
        </p>
        {beds != null && cash.kg > 0 && <p class="text-xs text-muted">Needs about {beds} beds · plant by {formatDate(o.plant_by)}</p>}
        <Button variant="go" class="mt-2 w-full" disabled={busy || !(cash.kg > 0) || cash.kg > o.remaining} onClick={accept}>
          Accept {cash.kg} kg → {money(cash.total)}
        </Button>
        {cash.kg > o.remaining && <p class="mt-1 text-xs font-medium">Only {o.remaining} kg is still open.</p>}
      </div>
    </li>
  );
}

/** Weigh each member's produce for an order (creates a collection). */
function WeighForm({ o, view, leaderId, onDone }) {
  const [kgs, setKgs] = useState({});
  const [run, notice, busy] = useAction();
  const candidates = view.members.filter((m) => o.planted_members.includes(m.id) || m.crops.includes(o.crop));
  const total = Object.values(kgs).reduce((s, v) => s + (Number(v) || 0), 0);
  async function save() {
    const r = await run(() => recordDelivery(o.id, view.kafo.id, Object.entries(kgs).map(([member_id, kg]) => ({ member_id, kg })), leaderId),
      (res) => `Weighed ${res.collection.kg_weighed} kg. Next: send it with a proof photo.` + (res.flags.length ? ' ⚠ Very different from the estimate: the admin will check it.' : ''));
    if (r) onDone();
  }
  return (
    <div class="mt-2 space-y-1 rounded-lg bg-soft p-2">
      <p class="text-xs font-semibold">Weigh each member's {cropName(o.crop).toLowerCase()} for {o.buyer?.business_name}</p>
      {candidates.map((m) => (
        <label class="flex items-center gap-2">
          <span class="flex-1">{m.name}{o.planted_members.includes(m.id) && <span class="text-xs text-muted"> · grew it</span>}</span>
          <input type="number" min="0" inputMode="numeric" aria-label={`${m.name} kg`} class={`${inputClass} w-20`} value={kgs[m.id] ?? ''}
            onInput={(e) => { const v = e.currentTarget.value; setKgs((k) => ({ ...k, [m.id]: v })); }} />
          <span class="text-xs text-muted">kg</span>
        </label>
      ))}
      <div class="flex items-center gap-2 pt-1">
        <span class="flex-1 font-semibold">Total {total} kg · {money(total * o.price_per_kg)}</span>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="go" disabled={busy || !total} onClick={save}>Save</Button>
      </div>
      <Notice notice={notice} />
    </div>
  );
}

/** Send a weighed collection: proof photo + who carries it. */
function DispatchForm({ c, o, view, leaderId }) {
  const pickup = o.fulfilment !== 'delivery';
  const [f, setF] = useState({
    transporter_name: pickup ? `${o.buyer?.contact_name ?? ''} (${o.buyer?.business_name ?? 'buyer'})` : '',
    transporter_phone: pickup ? o.buyer?.contact_phone ?? '' : '', proof_photo: '', proof_note: '',
  });
  const [run, notice, busy] = useAction();
  const set = (k) => (e) => { const v = e.currentTarget.value; setF((x) => ({ ...x, [k]: v })); };
  async function onPhoto(e) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    const url = await run(() => photoToDataUrl(file));
    if (url) setF((x) => ({ ...x, proof_photo: url }));
  }
  const demoPhoto = () => setF((x) => ({
    ...x, proof_photo: sampleProofPhoto({ kafo: view.kafo.name, crop: cropName(o.crop), kg: c.kg_weighed, date: formatDate(view.today), slip: String(Math.floor(100 + Math.random() * 900)) }),
  }));
  return (
    <div class="mt-2 space-y-2 rounded-lg bg-soft p-2 text-xs">
      <p class="font-semibold">{pickup ? 'Hand over to the buyer’s pick-up' : 'Send to the buyer'}: proof needed</p>
      <div class="grid grid-cols-2 gap-2">
        <input aria-label="Driver or carrier name" placeholder={pickup ? 'Pick-up driver' : 'Driver name'} class={inputClass} value={f.transporter_name} onInput={set('transporter_name')} />
        <input aria-label="Driver phone" placeholder="Phone (7 digits)" inputMode="numeric" class={inputClass} value={f.transporter_phone} onInput={set('transporter_phone')} />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <label class="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line bg-surface px-3 font-semibold hover:bg-soft">
          📷 Photo of weighed bags
          <input type="file" accept="image/*" capture="environment" class="sr-only" onChange={onPhoto} />
        </label>
        <button type="button" onClick={demoPhoto} class="min-h-11 font-medium text-accent underline">Use demo photo</button>
      </div>
      {f.proof_photo && <img src={f.proof_photo} alt="Proof photo" class="h-24 rounded border border-line" />}
      <input aria-label="Weigh slip number or note" placeholder="Weigh slip no. / note (optional)" class={inputClass} value={f.proof_note} onInput={set('proof_note')} />
      <Button variant="go" class="w-full" disabled={busy || !f.proof_photo}
        onClick={() => run(() => dispatchCollection(c.id, f, leaderId), 'Sent. The buyer sees the photo and has a 4-digit handover code: enter it when you hand over.')}>
        {f.proof_photo ? 'Send with proof' : 'Add a proof photo first'}
      </Button>
      <Notice notice={notice} />
    </div>
  );
}

/** At the buyer's gate: the buyer gives the driver the code, the leader enters it. */
function HandoverForm({ ship, leaderId, run, busy }) {
  const [code, setCode] = useState('');
  return (
    <div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
      <span class="flex-1">At handover, ask the buyer for their 4-digit code:</span>
      <input aria-label="Handover code" inputMode="numeric" maxLength={4} placeholder="0000" class={`${inputClass} w-20`} value={code} onInput={(e) => setCode(e.currentTarget.value)} />
      <Button variant="go" disabled={busy || code.length !== 4} onClick={() => run(() => confirmHandover(ship.id, code, leaderId), 'Handed over: proof saved')}>Confirm</Button>
    </div>
  );
}

function CollectionRow({ c, o, view, leaderId }) {
  const ship = c.shipment;
  // Lives here, not in HandoverForm: the form disappears once the code is accepted.
  const [run, notice, busy] = useAction();
  return (
    <li class="mt-2 rounded-lg border border-line p-2 text-xs">
      <p>
        <span class="font-semibold">Weighed {c.kg_weighed} kg</span> on {formatDate(c.collected_at)}: {c.deliveries.map((d) => `${d.name.split(' ')[0]} ${d.kg}`).join(', ')}
      </p>
      {!ship && <DispatchForm c={c} o={o} view={view} leaderId={leaderId} />}
      {ship && (
        <div class="mt-1 flex gap-2">
          <img src={ship.proof_photo} alt="Proof photo of the weighed produce" class="h-14 w-20 shrink-0 rounded border border-line object-cover" />
          <div class="flex-1">
            <p>Sent {formatDate(ship.dispatched_at)} with {ship.transporter_name} ({ship.transporter_phone}){ship.proof_note ? ` · ${ship.proof_note}` : ''}</p>
            <p class="font-medium">{ship.status === 'delivered' ? `✓ Handed over ${formatDate(ship.delivered_at)}` : 'On the way'}</p>
          </div>
        </div>
      )}
      {ship?.status === 'in_transit' && <HandoverForm ship={ship} leaderId={leaderId} run={run} busy={busy} />}
      <Notice notice={notice} />
      {c.kg_accepted != null
        ? <p class="mt-1">Buyer accepted {c.kg_accepted} kg{c.kg_rejected > 0 && `, rejected ${c.kg_rejected} kg (${t(`reject.${c.reject_reason}`).toLowerCase()})`}{c.paid ? ' · ✓ paid' : ' · waiting for payment'}</p>
        : ship && <p class="mt-1 text-muted">Waiting for the buyer to check the kg</p>}
    </li>
  );
}

const NEXT_HINT = {
  assigned: 'Assign members and log the planting',
  growing: 'Mark Growing when the seedlings are up',
  ready: 'Mark Ready and check the kg',
  harvested: 'Mark Harvested and enter the kg picked',
  weighed: 'Weigh each member’s produce',
  shipped: 'Send it with a proof photo',
  delivered: 'Enter the buyer’s handover code at delivery',
  checked: 'Buyer checks the kg',
  paid: 'Buyer pays each member',
};

function OurOrder({ o, view, leaderId, go }) {
  const [weighing, setWeighing] = useState(false);
  const finished = o.status === 'paid';
  const growingNow = o.plantings.filter((p) => p.stage !== 'harvested');
  // Weighing comes after the harvest check (or straight away when nothing was logged for it).
  const harvestDone = o.plantings.length === 0 || o.plantings.every((p) => p.stage === 'harvested');
  const canWeigh = !finished && !weighing && harvestDone && !o.collections.some((c) => !c.shipment)
    && o.collections.reduce((s, c) => s + c.kg_weighed, 0) < o.kg_committed;

  return (
    <li class={`${cardClass} border-line`}>
      <div class="flex items-start gap-2">
        <CropIcon crop={o.crop} />
        <div class="flex-1">
          <p class="font-semibold">{o.kg_committed} kg {cropName(o.crop).toLowerCase()} for {o.buyer?.business_name}</p>
          <p class="text-xs text-muted">D{o.price_per_kg}/kg · {o.fulfilment === 'delivery' ? 'we deliver' : 'buyer picks up'} {formatDate(o.window_start)} – {formatDate(o.window_end)}</p>
          <BuyerLine o={o} />
          <p class="text-xs">Expected cash: <span class="font-semibold">{money(o.expected_cash.total)}</span>{o.accepted_at && ` · accepted ${formatDate(o.accepted_at)} by ${o.accepted_by}`}</p>
        </div>
      </div>

      {o.plantings.length > 0 && (
        <div class="mt-2">
          <p class="text-xs font-semibold">Growing it for {o.buyer?.business_name}:</p>
          {o.plantings.map((p) => (
            <div class="mt-1 rounded-lg bg-soft p-2 text-xs">
              <p>{p.members.join(', ')} · {p.beds} beds · ~{p.harvested_kg ?? p.expected_kg - (p.lost_kg || 0)} kg · harvest {formatDate(p.expected_harvest)}</p>
              {!finished && !o.collections.length && <StageControl p={p} leaderId={leaderId} />}
            </div>
          ))}
        </div>
      )}
      {o.loss.total > 0 && (
        <p class="mt-2 text-xs font-medium">
          Lost: {o.loss.total} kg ({o.loss.percent}%){o.loss.reported ? ` · ${o.loss.reported} kg in the field` : ''}{o.loss.shortHarvest ? ` · ${o.loss.shortHarvest} kg smaller harvest` : ''}{o.loss.rejected ? ` · ${o.loss.rejected} kg rejected` : ''}
        </p>
      )}

      {o.next && !finished && <p class="mt-2 rounded-lg bg-careful-soft px-2 py-1 text-xs font-semibold">Next: {NEXT_HINT[o.next] ?? t(`timeline.${o.next}`)}</p>}
      {o.next === 'assigned' && (
        <Button variant="go" class="mt-2 w-full" onClick={() => go('plant', { order: o.id, crop: o.crop })}>Assign members & log planting</Button>
      )}
      {o.plantings.length > 0 && o.planted_kg < o.kg_committed && growingNow.length > 0 && (
        <button type="button" class="mt-1 min-h-11 text-xs font-medium text-accent underline" onClick={() => go('plant', { order: o.id, crop: o.crop })}>
          Planted {o.planted_kg} of {o.kg_committed} kg: plant more for this order
        </button>
      )}

      <ul>{o.collections.map((c) => <CollectionRow key={c.id} c={c} o={o} view={view} leaderId={leaderId} />)}</ul>
      {weighing && <WeighForm o={o} view={view} leaderId={leaderId} onDone={() => setWeighing(false)} />}
      {canWeigh && (
        <Button variant="ghost" class="mt-2" onClick={() => setWeighing(true)}>Weigh produce (kg per member)</Button>
      )}

      <details class="mt-2" open={!finished}>
        <summary class="min-h-11 cursor-pointer py-2 text-xs font-semibold">Order log</summary>
        <OrderTimeline timeline={o.timeline} hidden={['posted']} />
      </details>
    </li>
  );
}

export default function Sell({ view, leaderId, go }) {
  const [run, notice] = useAction();
  // Accept messages live here: a fully accepted order card disappears from the list.
  const [acceptRun, acceptNotice, acceptBusy] = useAction();
  const active = view.ourOrders.filter((o) => o.status !== 'paid');
  const done = view.ourOrders.filter((o) => o.status === 'paid');
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
        <h2 class="mb-2 text-sm font-semibold">Our orders ({active.length})</h2>
        {active.length === 0 ? <p class="text-sm text-muted">Accept a buyer order to see it here.</p> : (
          <ul class="space-y-2">{active.map((o) => <OurOrder key={o.id} o={o} view={view} leaderId={leaderId} go={go} />)}</ul>
        )}
      </section>

      {done.length > 0 && (
        <details class="text-sm">
          <summary class="min-h-11 cursor-pointer py-2 font-semibold">
            Finished & paid ({done.length}) · {money(view.earned)} to members
          </summary>
          <ul class="space-y-2">{done.map((o) => <OurOrder key={o.id} o={o} view={view} leaderId={leaderId} go={go} />)}</ul>
        </details>
      )}

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
