import { useState } from 'preact/hooks';
import { buyOffer } from '../../lib/actions.js';
import { cropName, t } from '../../lib/i18n.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import { inputClass, Notice } from '../ui/Field.jsx';
import { useAction } from '../ui/useAction.js';
import { KafoBadge } from './Orders.jsx';

function OfferCard({ o, view, userId, run, busy }) {
  const [price, setPrice] = useState(String(o.reference ?? ''));
  const canBuy = view.buyer.verified && !view.buyer.suspended;
  return (
    <li class="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <p class="text-lg font-semibold">{o.kg} kg {cropName(o.crop).toLowerCase()}</p>
      <p class="text-sm text-muted">{t(`ready.${o.ready_when}`)} · market ~D{o.reference ?? '–'}/kg</p>
      <div class="mt-2"><KafoBadge kafo={o.kafo} /></div>
      {o.requested ? (
        <p class="mt-3 rounded-lg bg-careful-soft px-3 py-2 text-sm">Waiting for the kafo leader to confirm a sale.</p>
      ) : canBuy ? (
        <div class="mt-3 flex items-center gap-2">
          <span class="text-sm">D</span>
          <input type="number" min="1" inputMode="numeric" aria-label="Your price per kg" class={`${inputClass} w-24`} value={price}
            onInput={(e) => setPrice(e.currentTarget.value)} />
          <span class="text-sm text-muted">/kg</span>
          <Button variant="go" class="ml-auto" disabled={busy || !Number(price)}
            onClick={() => run(() => buyOffer(o.id, { price_per_kg: Number(price) }, userId), (ord) => `Request sent for ${ord.kg} kg (D${(ord.kg * ord.price_per_kg).toLocaleString('en-GB')}). The kafo leader confirms.`)}>
            Buy
          </Button>
        </div>
      ) : (
        <p class="mt-3 text-sm text-muted">Buying opens once your business is verified.</p>
      )}
    </li>
  );
}

export default function Market({ view, userId }) {
  // Notice lives here: a bought offer can leave the list.
  const [run, notice, busy] = useAction();
  return (
    <Card title={`Produce ready now (${view.market.length})`}>
      <p class="mb-3 text-sm text-muted">Extra produce kafo leaders have checked and confirmed. Your request goes to the leader, who confirms the sale.</p>
      <Notice notice={notice} />
      {view.market.length === 0 ? <p class="mt-2 text-sm text-muted">Nothing on offer right now.</p> : (
        <ul class="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {view.market.map((o) => <OfferCard key={o.id} o={o} view={view} userId={userId} run={run} busy={busy} />)}
        </ul>
      )}
    </Card>
  );
}
