import { useState } from 'preact/hooks';
import { cancelOrder, confirmCollection, payCollection, reportIssue } from '../../lib/actions.js';
import { formatDate } from '../../lib/dates.js';
import { cropName, t } from '../../lib/i18n.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import { Notice, Select, inputClass } from '../ui/Field.jsx';
import { useAction } from '../ui/useAction.js';

const STEPS = ['open', 'filled', 'growing', 'ready', 'collected', 'paid'];
const stepIndex = (stage) => (stage === 'partly_filled' ? 0 : STEPS.indexOf(stage));

/** Kafo as buyers see it: never farmer names or phones. */
export function KafoBadge({ kafo, kg }) {
  return (
    <p class="text-sm">
      <span class="font-medium">{kafo.name}</span>
      <span class="text-muted"> · {kafo.district}{kafo.leader_verified && ' · ✓ verified leader'} · {kafo.reliability == null ? 'new partner' : `${kafo.reliability}% delivered as promised`}</span>
      {kg != null && <span class="font-medium"> · {kg} kg</span>}
    </p>
  );
}

/** One-line order summary with a fill bar (committed / ordered kg). */
export function OrderSummary({ o }) {
  const pct = Math.min(100, Math.round((o.committed / o.kg) * 100));
  return (
    <div>
      <div class="flex flex-wrap items-baseline gap-x-2">
        <span class="font-semibold">{o.kg} kg {cropName(o.crop).toLowerCase()}</span>
        <span class="text-sm text-muted">{o.type === 'spot' ? 'spot buy' : 'forward'} · D{o.price_per_kg}/kg · {formatDate(o.window_start)} – {formatDate(o.window_end)}</span>
        <span class="ml-auto rounded-full bg-soft px-2 py-0.5 text-xs font-semibold">{t(`order_stage.${o.stage}`)}</span>
      </div>
      <div class="mt-2 h-2 overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuenow={o.committed} aria-valuemax={o.kg} aria-label="Kg committed by kafos">
        <div class="h-full rounded-full bg-go" style={`width: ${pct}%`}></div>
      </div>
      <p class="mt-1 text-xs text-muted">{o.committed} / {o.kg} kg committed by kafos</p>
    </div>
  );
}

function CollectionCard({ c, o, userId }) {
  const [accepted, setAccepted] = useState(String(c.kg_weighed));
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('wave');
  const [run, notice, busy] = useAction();
  const acc = Number(accepted);
  const toPay = Math.round((c.kg_accepted ?? 0) * o.price_per_kg);

  return (
    <li class="rounded-lg bg-soft p-3 text-sm">
      <p><span class="font-medium">{c.kafo.name}</span> weighed <span class="font-semibold">{c.kg_weighed} kg</span> on {formatDate(c.collected_at)} ({c.members} farmers)</p>
      {c.kg_accepted == null ? (
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <label class="flex items-center gap-2">Accepted
            <input type="number" min="0" max={c.kg_weighed} inputMode="numeric" aria-label="Accepted kg" class={`${inputClass} w-24`} value={accepted}
              onInput={(e) => setAccepted(e.currentTarget.value)} /> kg
          </label>
          {acc < c.kg_weighed && (
            <Select aria-label="Why rejected" value={reason} onChange={(e) => setReason(e.currentTarget.value)} class="w-auto"
              options={[{ value: '', label: `Why ${c.kg_weighed - acc} kg rejected?` }, ...['size', 'ripeness', 'damage', 'other'].map((r) => ({ value: r, label: t(`reject.${r}`) }))]} />
          )}
          <Button disabled={busy} onClick={() => run(() => confirmCollection(c.id, { kg_accepted: accepted, reject_reason: reason }, userId), 'Collection confirmed')}>Confirm collection</Button>
        </div>
      ) : (
        <p class="mt-1">Accepted {c.kg_accepted} kg{c.kg_rejected > 0 && `, rejected ${c.kg_rejected} kg (${t(`reject.${c.reject_reason}`).toLowerCase()})`}</p>
      )}
      {c.kg_accepted != null && !c.paid && (
        o.open_dispute ? (
          <p class="mt-2 rounded bg-careful-soft px-2 py-1">On hold: you reported “{t(`issue.${o.open_dispute.issue}`)}”. The admin will resolve it before payment.</p>
        ) : (
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <Select aria-label="Pay with" value={method} onChange={(e) => setMethod(e.currentTarget.value)} class="w-auto"
              options={['wave', 'qmoney', 'afrimoney'].map((m) => ({ value: m, label: t(`wallet.${m}`) }))} />
            <Button variant="go" disabled={busy} onClick={() => run(() => payCollection(c.id, method, userId), (r) => `Paid D${r.total.toLocaleString('en-GB')} to ${r.payments.length} farmers. Each got a PAID SMS.`)}>
              Pay D{toPay.toLocaleString('en-GB')} (mock)
            </Button>
          </div>
        )
      )}
      {c.paid && <p class="mt-1 font-medium">✓ Paid D{c.paid_total.toLocaleString('en-GB')} directly to {c.members} farmers by {t(`wallet.${c.method}`)} · platform fee D{c.fee_total}</p>}
      <Notice notice={notice} />
    </li>
  );
}

function IssueForm({ o, userId, onDone }) {
  const [issue, setIssue] = useState('');
  const [text, setText] = useState('');
  const [run, notice, busy] = useAction();
  return (
    <div class="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-soft p-2">
      <Select aria-label="What went wrong" value={issue} onChange={(e) => setIssue(e.currentTarget.value)} class="w-auto"
        options={[{ value: '', label: 'What went wrong?' }, ...['short_delivery', 'quality', 'late_payment', 'other'].map((x) => ({ value: x, label: t(`issue.${x}`) }))]} />
      <input aria-label="Details" placeholder="Details (optional)" class={`${inputClass} w-auto flex-1`} value={text} onInput={(e) => setText(e.currentTarget.value)} />
      <Button variant="stop" disabled={busy} onClick={async () => { if (await run(() => reportIssue(o.id, { issue, description: text }, userId), 'Issue sent to the admin')) onDone(); }}>Send</Button>
      <Notice notice={notice} />
    </div>
  );
}

function OrderCard({ o, userId }) {
  const [issueOpen, setIssueOpen] = useState(false);
  const [run, notice] = useAction();
  const idx = stepIndex(o.stage);
  return (
    <li class="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <OrderSummary o={o} />
      {o.stage !== 'cancelled' && (
        <ol class="mt-3 grid grid-cols-6 gap-1 text-center text-[11px]">
          {STEPS.map((s, i) => (
            <li class={`rounded px-1 py-1 ${i <= idx ? 'bg-go-soft font-semibold text-ink' : 'bg-soft text-muted'}`}>
              {i === 0 && o.stage === 'partly_filled' ? t('order_stage.partly_filled') : t(`order_stage.${s}`)}
            </li>
          ))}
        </ol>
      )}
      {o.cancelled_reason && <p class="mt-2 text-sm text-muted">{o.cancelled_reason}</p>}

      {o.kafos.length > 0 && (
        <div class="mt-3">
          <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Kafos growing it</p>
          {o.kafos.map((k) => <KafoBadge kafo={k} kg={k.kg} />)}
        </div>
      )}
      {o.collections.length > 0 && (
        <div class="mt-3">
          <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Collection & payment</p>
          <ul class="space-y-2">{o.collections.map((c) => <CollectionCard key={c.id} c={c} o={o} userId={userId} />)}</ul>
        </div>
      )}
      {o.open_dispute && !o.collections.some((c) => c.kg_accepted != null && !c.paid) && (
        <p class="mt-2 rounded bg-careful-soft px-2 py-1 text-sm">Issue reported: {t(`issue.${o.open_dispute.issue}`)}. The admin is looking at it.</p>
      )}

      <div class="mt-3 flex flex-wrap gap-2">
        {o.status === 'open' && o.committed === 0 && (
          <Button variant="ghost" onClick={() => confirm('Cancel this order?') && run(() => cancelOrder(o.id, userId), 'Order cancelled')}>Cancel order</Button>
        )}
        {!['open', 'cancelled'].includes(o.status) && !o.open_dispute && !issueOpen && (
          <Button variant="ghost" onClick={() => setIssueOpen(true)}>Report issue</Button>
        )}
      </div>
      {issueOpen && <IssueForm o={o} userId={userId} onDone={() => setIssueOpen(false)} />}
      <Notice notice={notice} />
    </li>
  );
}

export default function Orders({ view, userId }) {
  return (
    <Card title={`My orders (${view.orders.length})`}>
      {view.orders.length === 0 ? <p class="text-sm text-muted">No orders yet.</p> : (
        <ul class="space-y-3">{view.orders.map((o) => <OrderCard key={o.id} o={o} userId={userId} />)}</ul>
      )}
    </Card>
  );
}
