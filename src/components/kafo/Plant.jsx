import { useState } from 'preact/hooks';
import { logPlanting, setPlantingStage, reportLoss, STAGES } from '../../lib/actions.js';
import { addDays, formatDate } from '../../lib/dates.js';
import { cropName, t } from '../../lib/i18n.js';
import Button from '../ui/Button.jsx';
import { Field, Input, Select, ChipPicker, Notice, inputClass } from '../ui/Field.jsx';
import { useAction } from '../ui/useAction.js';
import CropIcon from '../shared/CropIcon.jsx';

const LOST_REASONS = ['pests', 'disease', 'flood', 'drought', 'animals', 'other'];

function LogForm({ view, leaderId, preset }) {
  // Opened from an order ("Assign members & plant"): crop, order and beds come pre-filled.
  const presetOrder = preset?.order ? view.ourOrders.find((o) => o.id === preset.order) : null;
  const blank = (crop) => {
    const forOrder = presetOrder && presetOrder.crop === crop;
    const missing = forOrder ? Math.max(0, presetOrder.kg_committed - presetOrder.planted_kg) : 0;
    return {
      crop, beds: forOrder && missing ? String(Math.ceil(missing / presetOrder.kg_per_bed)) : '', planted_on: view.today, harvest: '', kg: '',
      order_id: forOrder ? presetOrder.id : '',
      member_ids: crop ? view.members.filter((m) => m.crops.includes(crop) || m.id === preset?.member).map((m) => m.id) : [],
    };
  };
  const [f, setF] = useState(() => blank(presetOrder?.crop ?? preset?.crop ?? ''));
  const [run, notice, busy] = useAction();
  const cal = view.calendar.find((c) => c.crop === f.crop);
  const beds = Number(f.beds) || 0;
  const autoHarvest = cal ? addDays(f.planted_on || view.today, cal.days_to_harvest) : '';
  const autoKg = cal ? beds * cal.kg_per_bed : 0;
  const orders = view.ourOrders.filter((o) => o.crop === f.crop && !o.collections.length && (o.planted_kg < o.kg_committed || o.id === f.order_id));
  const set = (k) => (e) => { const v = e.currentTarget.value; setF((x) => ({ ...x, [k]: v })); };

  async function save() {
    const r = await run(() => logPlanting({
      kafo_id: view.kafo.id, crop: f.crop, beds: f.beds, planted_on: f.planted_on, member_ids: f.member_ids,
      expected_harvest: f.harvest || autoHarvest, expected_kg: f.kg === '' ? autoKg : f.kg, order_id: f.order_id,
    }, leaderId), (res) => `Saved ${res.planting.beds} beds ${cropName(res.planting.crop).toLowerCase()}, ~${res.planting.expected_kg} kg by ${formatDate(res.planting.expected_harvest)}.`
      + (res.flags.length ? ' ⚠ More than this kafo can grow: the admin will check it.' : ''));
    if (r) setF(blank(''));
  }

  return (
    <section class="rounded-xl border border-line bg-surface p-3 shadow-sm">
      <h2 class="mb-2 font-semibold">Log planting</h2>
      {presetOrder && f.order_id === presetOrder.id && (
        <p class="mb-2 rounded-lg bg-go-soft px-2 py-1 text-xs">
          For <span class="font-semibold">{presetOrder.buyer?.business_name}</span>: {presetOrder.kg_committed} kg {cropName(presetOrder.crop).toLowerCase()}, deliver {formatDate(presetOrder.window_start)}. Plant by {formatDate(presetOrder.plant_by)}.
        </p>
      )}
      <p class="mb-1 text-xs text-muted">1. Which crop?</p>
      <div class="mb-3 grid grid-cols-4 gap-2">
        {view.calendar.map(({ crop }) => (
          <button type="button" onClick={() => setF((x) => ({ ...blank(crop), beds: x.beds, planted_on: x.planted_on }))} aria-pressed={f.crop === crop}
            class={`flex flex-col items-center rounded-xl border p-2 text-xs ${f.crop === crop ? 'border-brand bg-soft font-semibold ring-2 ring-brand' : 'border-line'}`}>
            <CropIcon crop={crop} size="text-3xl" />
            {cropName(crop)}
          </button>
        ))}
      </div>

      {f.crop && (
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-2">
            <Field label="2. Beds"><Input type="number" min="1" inputMode="numeric" value={f.beds} onInput={set('beds')} placeholder="20" /></Field>
            <Field label="Planted on"><Input type="date" value={f.planted_on} onInput={set('planted_on')} /></Field>
          </div>
          <div>
            <p class="mb-1 text-sm font-medium">3. Members growing it</p>
            <ChipPicker options={view.members.map((m) => ({ value: m.id, label: m.name.split(' ')[0] }))} value={f.member_ids}
              onChange={(ids) => setF((x) => ({ ...x, member_ids: ids }))} />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <Field label="Harvest from" hint={`Auto: ${cal.days_to_harvest} days`}>
              <Input type="date" value={f.harvest || autoHarvest} onInput={set('harvest')} />
            </Field>
            <Field label="Expected kg" hint={`Auto: ${cal.kg_per_bed} kg per bed`}>
              <Input type="number" min="0" inputMode="numeric" value={f.kg === '' ? (autoKg || '') : f.kg} onInput={set('kg')} />
            </Field>
          </div>
          {orders.length > 0 && (
            <Field label="Growing for a buyer order?">
              <Select value={f.order_id} onChange={set('order_id')} options={[{ value: '', label: 'No, general planting' },
                ...orders.map((o) => ({ value: o.id, label: `${o.buyer?.business_name}: ${o.kg_committed} kg` }))]} />
            </Field>
          )}
          <Button variant="go" class="w-full" disabled={busy || !beds} onClick={save}>Save planting</Button>
        </div>
      )}
      <Notice notice={notice} />
    </section>
  );
}

/**
 * Move a planting to its next stage. Ready asks how many kg are expected now and Harvested
 * how many were picked, so the buyer's projection stays true. Used here and on Sell.
 */
export function StageControl({ p, leaderId }) {
  const [asking, setAsking] = useState(null);
  const [kg, setKg] = useState('');
  const [run, notice, busy] = useAction();
  const net = p.expected_kg - (p.lost_kg || 0);
  const pick = (s) => {
    if (s === p.stage) return;
    if (s === 'ready' || s === 'harvested') { setAsking(s); setKg(String(p.harvested_kg ?? net)); return; }
    run(() => setPlantingStage(p.id, s, leaderId), `Marked ${t(`stage.${s}`).toLowerCase()}`);
  };
  async function confirm() {
    const r = await run(() => setPlantingStage(p.id, asking, leaderId, { kg }), (res) => asking === 'ready'
      ? `Ready: about ${res.expected_kg - (res.lost_kg || 0)} kg expected now`
      : `Harvested ${res.harvested_kg} kg` + (res.harvested_kg < net ? ` (${net - res.harvested_kg} kg less than expected)` : ''));
    if (r) setAsking(null);
  }
  return (
    <div>
      <div class="mt-2 grid grid-cols-4 gap-1">
        {STAGES.map((s) => (
          <button type="button" aria-pressed={p.stage === s} disabled={busy} onClick={() => pick(s)}
            class={`min-h-11 rounded-lg border text-[11px] ${p.stage === s ? 'border-brand bg-brand font-semibold text-brand-ink' : 'border-line hover:bg-soft'}`}>
            {p.stage_dates?.[s] && p.stage !== s ? '✓ ' : ''}{t(`stage.${s}`)}
          </button>
        ))}
      </div>
      {asking && (
        <div class="mt-1 flex flex-wrap items-center gap-2 rounded-lg bg-soft p-2 text-xs">
          <span class="flex-1">{asking === 'ready' ? 'Check: how many kg do you expect now?' : 'Check: how many kg were harvested?'}</span>
          <input type="number" min="0" inputMode="numeric" aria-label="Kg" class={`${inputClass} w-20`} value={kg} onInput={(e) => setKg(e.currentTarget.value)} />
          <Button variant="ghost" onClick={() => setAsking(null)}>Cancel</Button>
          <Button variant="go" disabled={busy || kg === ''} onClick={confirm}>Confirm</Button>
        </div>
      )}
      <Notice notice={notice} />
    </div>
  );
}

function PlantingCard({ p, view, leaderId }) {
  const [lossOpen, setLossOpen] = useState(false);
  const [loss, setLoss] = useState({ kg: '', reason: 'pests' });
  const [run, notice] = useAction();
  const net = p.expected_kg - (p.lost_kg || 0);
  const members = p.member_ids.map((id) => view.members.find((m) => m.id === id)?.name.split(' ')[0]).filter(Boolean);
  const order = p.order_id && view.ourOrders.find((o) => o.id === p.order_id);

  return (
    <li class="rounded-xl border border-line bg-surface p-3 text-sm shadow-sm">
      <div class="flex items-start gap-2">
        <CropIcon crop={p.crop} />
        <div class="flex-1">
          <p class="font-semibold">{cropName(p.crop)} · {p.beds} beds · ~{net} kg</p>
          <p class="text-xs text-muted">
            Planted {formatDate(p.planted_on)} · harvest {formatDate(p.expected_harvest)}
            {members.length > 0 && ` · ${members.join(', ')}`}
          </p>
          {order && (
            <p class="mt-1 rounded bg-go-soft px-2 py-0.5 text-xs">
              For <span class="font-semibold">{order.buyer?.business_name}</span>: {order.kg_committed} kg, {order.fulfilment === 'delivery' ? 'deliver' : 'pick-up'} {formatDate(order.window_start)}
            </p>
          )}
          {p.lost_kg > 0 && <p class="text-xs font-medium">Lost {p.lost_kg} kg ({t(`lost.${p.lost_reason}`).toLowerCase()})</p>}
          {p.harvested_kg != null && <p class="text-xs">Harvested {p.harvested_kg} kg{p.stage_dates?.harvested ? ` on ${formatDate(p.stage_dates.harvested)}` : ''}</p>}
        </div>
      </div>
      <StageControl p={p} leaderId={leaderId} />
      {p.stage !== 'harvested' && (
        <button type="button" onClick={() => setLossOpen(!lossOpen)} class="mt-2 min-h-11 text-xs font-medium text-muted underline">Lost some / all</button>
      )}
      {lossOpen && (
        <div class="mt-1 flex flex-wrap items-center gap-2 rounded-lg bg-soft p-2">
          <input type="number" min="0" inputMode="numeric" aria-label="Kg lost" placeholder="kg" class={`${inputClass} w-20`} value={loss.kg}
            onInput={(e) => { const v = e.currentTarget.value; setLoss((l) => ({ ...l, kg: v })); }} />
          <select aria-label="Reason" class={`${inputClass} w-auto flex-1`} value={loss.reason}
            onChange={(e) => { const v = e.currentTarget.value; setLoss((l) => ({ ...l, reason: v })); }}>
            {LOST_REASONS.map((r) => <option value={r}>{t(`lost.${r}`)}</option>)}
          </select>
          <Button variant="ghost" onClick={async () => { await run(() => reportLoss(p.id, { lost_kg: p.expected_kg, lost_reason: loss.reason }, leaderId), 'Marked all lost'); setLossOpen(false); }}>All</Button>
          <Button variant="stop" onClick={async () => { await run(() => reportLoss(p.id, { lost_kg: (p.lost_kg || 0) + Number(loss.kg || 0), lost_reason: loss.reason }, leaderId), 'Loss saved'); setLossOpen(false); }}>Save</Button>
        </div>
      )}
      <Notice notice={notice} />
    </li>
  );
}

export default function Plant({ view, leaderId, preset }) {
  const active = view.plantings.filter((p) => p.stage !== 'harvested');
  const done = view.plantings.filter((p) => p.stage === 'harvested');
  const l = view.loss;
  return (
    <div class="space-y-4">
      <LogForm key={preset?.order ?? preset?.crop ?? 'none'} view={view} leaderId={leaderId} preset={preset} />
      {l.total > 0 && (
        <section class="rounded-xl border border-line bg-surface p-3 text-sm shadow-sm">
          <h2 class="font-semibold">Lost so far: {l.total} kg ({l.percent}% of {l.expected} kg planted)</h2>
          <p class="mt-1 text-xs text-muted">
            {[...Object.entries(l.byReason).map(([r, kg]) => `${t(`lost.${r}`)} ${kg} kg`),
              l.shortHarvest ? `smaller harvest ${l.shortHarvest} kg` : null, l.rejected ? `rejected by buyers ${l.rejected} kg` : null].filter(Boolean).join(' · ')}
          </p>
        </section>
      )}
      <section>
        <h2 class="mb-2 text-sm font-semibold">Our plantings ({active.length})</h2>
        <ul class="space-y-2">{active.map((p) => <PlantingCard key={p.id} p={p} view={view} leaderId={leaderId} />)}</ul>
      </section>
      {done.length > 0 && (
        <details class="text-sm">
          <summary class="min-h-11 cursor-pointer py-2 font-semibold">Harvested ({done.length})</summary>
          <ul class="space-y-2">{done.map((p) => <PlantingCard key={p.id} p={p} view={view} leaderId={leaderId} />)}</ul>
        </details>
      )}
    </div>
  );
}
