import { useState } from 'preact/hooks';
import { postOrder } from '../../lib/actions.js';
import { addDays, formatDate } from '../../lib/dates.js';
import { cropName, t } from '../../lib/i18n.js';
import { fairPriceSignal } from '../../lib/rules.js';
import { signalStyle } from '../../lib/signalStyle.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import { Field, Input, Select, Notice } from '../ui/Field.jsx';
import { useAction } from '../ui/useAction.js';

export default function PostOrder({ view, userId, go }) {
  const crops = view.calendar.map((c) => c.crop);
  const blank = (crop = crops[0]) => ({
    crop, kg: '', window_start: addDays(view.today, 70), window_end: addDays(view.today, 76),
    price_per_kg: String(view.reference[crop] ?? ''), grade: 'A', fulfilment: 'pickup', delivery_fee: '0', repeat_weekly: false,
  });
  const [f, setF] = useState(blank);
  const [run, notice, busy] = useAction();
  const set = (k) => (e) => {
    const v = e.currentTarget.type === 'checkbox' ? e.currentTarget.checked : e.currentTarget.value;
    setF((x) => (k === 'crop' ? { ...x, crop: v, price_per_kg: String(view.reference[v] ?? x.price_per_kg) } : { ...x, [k]: v }));
  };

  const b = view.buyer;
  if (!b.verified || b.suspended) {
    return (
      <Card title={b.suspended ? 'Account suspended' : 'Awaiting verification'}>
        <p class="text-sm text-muted">
          {b.suspended
            ? 'Posting orders is paused. Please contact the Kafo Signal team.'
            : 'The Kafo Signal team will call you to confirm your business. Until then you can see the harvest outlook and the market, but not post orders.'}
        </p>
        <Button variant="ghost" class="mt-3" onClick={() => go('outlook')}>See the harvest outlook</Button>
      </Card>
    );
  }

  const kg = Number(f.kg) || 0;
  const price = Number(f.price_per_kg) || 0;
  const value = kg * price + (f.fulfilment === 'delivery' ? Number(f.delivery_fee) || 0 : 0);
  const fee = Math.round((kg * price * view.config.fee_percent) / 100);
  const fair = price ? fairPriceSignal({ crop: f.crop, price, today: view.today, data: view.priceData }) : null;
  const s = fair && signalStyle(fair.signal);
  const weeks = Math.round((Date.parse(f.window_start) - Date.parse(view.today)) / 604_800_000);

  async function submit(e) {
    e.preventDefault();
    const order = await run(() => postOrder(b.id, { ...f, type: 'forward' }, userId),
      (o) => `Order posted: ${o.kg} kg ${cropName(o.crop).toLowerCase()} for ${formatDate(o.window_start)}. Kafo leaders see it now.`);
    if (order) setF(blank(f.crop));
  }

  return (
    <div class="grid gap-4 lg:grid-cols-3">
      <Card title="Post a forward order" class="lg:col-span-2">
        <p class="mb-3 text-sm text-muted">Order before planting: kafos grow for you, and you pay each farmer on delivery.</p>
        <form onSubmit={submit} class="grid gap-3 sm:grid-cols-2">
          <Field label="Crop"><Select value={f.crop} onChange={set('crop')} options={crops.map((c) => ({ value: c, label: cropName(c) }))} /></Field>
          <Field label="Kg"><Input type="number" min="1" inputMode="numeric" value={f.kg} onInput={set('kg')} placeholder="150" /></Field>
          <Field label="Deliver from" hint={weeks > 0 ? `About ${weeks} weeks from now` : 'Soon: kafos may not have time to grow it'}>
            <Input type="date" value={f.window_start} onInput={set('window_start')} />
          </Field>
          <Field label="Deliver by"><Input type="date" value={f.window_end} onInput={set('window_end')} /></Field>
          <Field label="Price per kg (D)" hint={`Market reference ~D${view.reference[f.crop] ?? '–'}/kg (4-week average, demo data)`}>
            <Input type="number" min="1" inputMode="numeric" value={f.price_per_kg} onInput={set('price_per_kg')} />
          </Field>
          <Field label="Grade"><Select value={f.grade} onChange={set('grade')} options={[{ value: 'A', label: 'A: best quality' }, { value: 'B', label: 'B: standard' }]} /></Field>
          <Field label="Collection"><Select value={f.fulfilment} onChange={set('fulfilment')} options={[{ value: 'pickup', label: 'I pick up at the kafo' }, { value: 'delivery', label: 'Kafo delivers to me' }]} /></Field>
          {f.fulfilment === 'delivery' && <Field label="Delivery fee (D)"><Input type="number" min="0" value={f.delivery_fee} onInput={set('delivery_fee')} /></Field>}
          <label class="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" class="h-5 w-5" checked={f.repeat_weekly} onChange={set('repeat_weekly')} /> Repeat every week
          </label>
          <div class="sm:col-span-2">
            <Button type="submit" disabled={busy}>Post order</Button>
            <Notice notice={notice} />
          </div>
        </form>
      </Card>

      <Card title="Summary">
        <dl class="space-y-2 text-sm">
          <div class="flex justify-between"><dt class="text-muted">Order value</dt><dd class="font-semibold">D{value.toLocaleString('en-GB')}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Platform fee ({view.config.fee_percent}%)</dt><dd class="font-semibold">D{fee.toLocaleString('en-GB')}</dd></div>
          <div class="flex justify-between border-t border-line pt-2"><dt class="font-semibold">You pay on delivery</dt><dd class="font-bold">D{(value + fee).toLocaleString('en-GB')}</dd></div>
        </dl>
        {fair && (
          <p class={`mt-3 rounded-lg px-3 py-2 text-sm ${s.soft}`}>
            <span aria-hidden="true">{s.icon}</span> {t(`reason.${fair.reason}`)}
            {fair.average && <span class="block text-xs text-muted">Farmers see your price next to the market (~D{fair.average}/kg). A fair price gets accepted faster.</span>}
          </p>
        )}
        <p class="mt-3 text-xs text-muted">Farmers are paid directly (Wave / QMoney / Afrimoney) for the kg weighed and accepted. Mock payments only.</p>
      </Card>
    </div>
  );
}
