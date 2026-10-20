import { useState } from 'preact/hooks';
import { db, newId } from '../../lib/db.js';
import { now } from '../../lib/clock.js';
import { addDays } from '../../lib/dates.js';
import { cropName, t } from '../../lib/i18n.js';
import { kafoSignals } from '../../lib/signals.js';
import { useLive } from '../../lib/useLive.js';
import SignalPill from '../shared/SignalPill.jsx';

// Live engine output for one kafo. Temporary check panel until the kafo app (Phase 4).
export default function SignalsPanel() {
  const [kafoId, setKafoId] = useState('kafo_brikama');
  const kafos = useLive(() => db.kafos.toArray(), [], []);
  const view = useLive(() => kafoSignals(kafoId), [kafoId]);

  // Same auto-fill the leader app will use: harvest date and kg from the crop calendar.
  async function addBeds(crop, beds) {
    const [cal, kafo, ts] = await Promise.all([db.crop_calendar.get(crop), db.kafos.get(kafoId), now()]);
    const today = ts.slice(0, 10);
    await db.plantings.add({
      id: newId('plant'), kafo_id: kafoId, crop, beds, member_ids: [], planted_on: today,
      expected_harvest: addDays(today, cal.days_to_harvest), expected_kg: beds * cal.kg_per_bed,
      stage: 'planted', lost_kg: 0, lost_reason: null, order_id: null,
      logged_by: kafo.leader_id, logged_at: ts, updated_at: ts,
    });
  }

  return (
    <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <h2 class="font-semibold">Signals</h2>
        <select
          class="min-h-11 rounded-lg border border-line bg-surface px-2 text-sm"
          value={kafoId}
          onChange={(e) => setKafoId(e.currentTarget.value)}
        >
          {kafos.map((k) => <option value={k.id}>{k.name} · {k.district}</option>)}
        </select>
      </div>

      {!view ? <p class="text-sm text-muted">Loading…</p> : (
        <div class="overflow-x-auto">
          <table class="w-full min-w-[640px] text-left text-sm">
            <thead class="text-xs text-muted">
              <tr>
                <th class="py-2 pr-3 font-medium">Crop</th>
                <th class="py-2 pr-3 font-medium">Plant (supply ÷ demand, {view.kafo.district})</th>
                <th class="py-2 pr-3 font-medium">Best place to sell</th>
                <th class="py-2 pr-3 font-medium">Risk</th>
                <th class="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {view.crops.map(({ crop, plant, sell, risk }) => {
                const best = sell.options[0];
                return (
                  <tr class="border-t border-line align-top">
                    <td class="py-2 pr-3 font-semibold">{cropName(crop)}</td>
                    <td class="py-2 pr-3">
                      <SignalPill signal={plant.signal} kind="plant" />
                      <div class="mt-1 text-xs text-muted">
                        {plant.ratio == null ? '–' : plant.ratio.toFixed(2)} = {plant.numbers.supply_kg} ÷ {plant.numbers.demand_kg} kg
                        {plant.numbers.open_order_kg > 0 && ` · ${plant.numbers.open_order_kg} kg ordered`}
                      </div>
                    </td>
                    <td class="py-2 pr-3">
                      <SignalPill signal={best?.signal ?? 'none'} kind="sell" />
                      <div class="mt-1 text-xs text-muted">
                        {best?.order_id ? `Buyer order · D${best.price}/kg`
                          : best?.net != null ? `${view.towns[best.market_town_id]} · D${best.net}/kg after transport`
                          : t('reason.no_recent_price')}
                      </div>
                    </td>
                    <td class="py-2 pr-3">
                      <SignalPill signal={risk.signal} kind="risk" />
                      <div class="mt-1 text-xs text-muted">{t(`reason.${risk.reason}`)}</div>
                    </td>
                    <td class="py-2">
                      <button type="button" onClick={() => addBeds(crop, 10)} class="min-h-11 whitespace-nowrap rounded-lg border border-line bg-surface px-3 text-xs hover:bg-soft">
                        + 10 beds
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p class="mt-3 text-xs text-muted">Test tool: “+ 10 beds” logs a planting today for this kafo, like the leader app will. Reset demo undoes it.</p>
    </div>
  );
}
