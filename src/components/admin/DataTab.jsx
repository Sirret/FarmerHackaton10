import { useState } from 'preact/hooks';
import { db } from '../../lib/db.js';
import { savePrices, saveTransport } from '../../lib/actions.js';
import { daysBetween, formatDate } from '../../lib/dates.js';
import { cropName } from '../../lib/i18n.js';
import { useLive } from '../../lib/useLive.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import { inputClass, Notice } from '../ui/Field.jsx';

const key = (m, c) => `${m}|${c}`;

export default function DataTab() {
  const data = useLive(async () => {
    const [prices, towns, crops, transport, kafos, config] = await Promise.all([
      db.prices.toArray(), db.market_towns.toArray(), db.crop_calendar.toArray(), db.transport_costs.toArray(), db.kafos.toArray(), db.config.get('main'),
    ]);
    const latest = new Map();
    for (const p of prices) {
      const k = key(p.market_town_id, p.crop);
      if (!latest.has(k) || p.date > latest.get(k).date) latest.set(k, p);
    }
    const fromTowns = [...new Set([...kafos.map((k) => k.market_town_id), ...transport.map((t) => t.from_town_id)])];
    return { latest, towns, markets: towns.filter((m) => m.is_market), crops: crops.map((c) => c.crop), transport, fromTowns, config };
  });
  const [drafts, setDrafts] = useState({});
  const [notice, setNotice] = useState(null);

  if (!data) return <p class="text-sm text-muted">Loading…</p>;
  const today = data.config.demo_date;
  const townName = (id) => data.towns.find((m) => m.id === id)?.name ?? id;

  async function save() {
    const entries = [];
    for (const m of data.markets) for (const c of data.crops) {
      const k = key(m.id, c);
      const value = drafts[k] ?? data.latest.get(k)?.price_per_kg;
      if (value !== undefined && value !== '') entries.push({ market_town_id: m.id, crop: c, price_per_kg: value });
    }
    const n = await savePrices(entries);
    setDrafts({});
    setNotice({ text: `Saved ${n} prices for the week of ${formatDate(today)}.` });
  }

  return (
    <div class="space-y-4">
      <Card
        title="Weekly prices (D per kg)"
        actions={<Button onClick={save}>Save prices for {formatDate(today)}</Button>}
      >
        <p class="mb-3 text-xs text-muted">
          Each box starts with the latest price. Change what moved and save; every market gets a fresh price dated today.
          Prices older than {data.config.price_stale_days} days show “no recent price” to farmers. Demo data.
        </p>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[560px] text-sm">
            <thead>
              <tr class="text-left text-xs text-muted">
                <th class="py-2 pr-3 font-medium">Market</th>
                {data.crops.map((c) => <th class="py-2 pr-3 font-medium">{cropName(c)}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.markets.map((m) => (
                <tr class="border-t border-line align-top">
                  <td class="py-2 pr-3 font-medium">{m.name}</td>
                  {data.crops.map((c) => {
                    const k = key(m.id, c);
                    const p = data.latest.get(k);
                    const age = p ? daysBetween(p.date, today) : null;
                    const stale = !p || age > data.config.price_stale_days;
                    return (
                      <td class="py-2 pr-3">
                        <input
                          type="number" min="0" inputMode="numeric" aria-label={`${m.name} ${c} price`}
                          class={`${inputClass} w-24`}
                          value={drafts[k] ?? p?.price_per_kg ?? ''}
                          onInput={(e) => { const v = e.currentTarget.value; setDrafts((d) => ({ ...d, [k]: v })); }}
                        />
                        <span class={`mt-1 inline-block rounded px-1.5 text-xs ${stale ? 'bg-stale-soft text-ink' : 'text-muted'}`}>
                          {!p ? 'no price' : stale ? `no recent price (${age}d)` : age === 0 ? 'today' : `${age}d ago`}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Notice notice={notice} />
      </Card>

      <Card title="Transport cost per bag (D)">
        <p class="mb-3 text-xs text-muted">From the kafo's market town to each market. Saved when you leave the box. Used for “price after transport”.</p>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[560px] text-sm">
            <thead>
              <tr class="text-left text-xs text-muted">
                <th class="py-2 pr-3 font-medium">From \ to</th>
                {data.markets.map((m) => <th class="py-2 pr-3 font-medium">{m.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.fromTowns.map((from) => (
                <tr class="border-t border-line">
                  <td class="py-2 pr-3 font-medium">{townName(from)}</td>
                  {data.markets.map((m) => {
                    const row = data.transport.find((t) => t.from_town_id === from && t.to_market_id === m.id);
                    return (
                      <td class="py-2 pr-3">
                        <input
                          type="number" min="0" inputMode="numeric" aria-label={`${townName(from)} to ${m.name}`}
                          class={`${inputClass} w-24`}
                          value={row?.cost_per_bag ?? ''}
                          onChange={(e) => e.currentTarget.value !== '' && saveTransport(from, m.id, e.currentTarget.value)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
