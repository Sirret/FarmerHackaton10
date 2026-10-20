import { useState } from 'preact/hooks';
import { db } from '../../lib/db.js';
import { createAlert, endAlert, callFarmersWithAlert } from '../../lib/actions.js';
import { addDays, formatDate } from '../../lib/dates.js';
import { cropName, t } from '../../lib/i18n.js';
import { useLive } from '../../lib/useLive.js';
import { sortCrops } from '../../lib/crops.js';
import districts from '../../data/districts.json';
import templates from '../../data/alert_templates.json';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import { Field, Input, Select, ChipPicker, Notice } from '../ui/Field.jsx';
import SignalPill from '../shared/SignalPill.jsx';
import weather from '../../data/weather.json';

const HEAVY_RAIN_MM = 30; // a day at or above this suggests a heavy-rain alert

/** Real forecast (Open-Meteo, cached by `npm run weather`). "Use" fills in the alert form. */
function WeatherCard({ onUse }) {
  const max = Math.max(1, ...weather.places.flatMap((p) => p.days.map((d) => d.rain_mm)));
  return (
    <Card title="Weather forecast (real data)">
      <p class="mb-3 text-xs text-muted">
        {weather.source}, cached {formatDate(weather.fetched_at)}. Refresh with <code class="rounded bg-soft px-1">npm run weather</code>.
        Days with {HEAVY_RAIN_MM} mm or more suggest a heavy-rain alert.
      </p>
      <div class="space-y-3">
        {weather.places.map((p) => (
          <div>
            <p class="mb-1 text-sm font-medium">{p.name} <span class="font-normal text-muted">· {p.district}</span></p>
            <ul class="grid grid-cols-7 gap-1 text-center text-[11px]">
              {p.days.map((d) => {
                const heavy = d.rain_mm >= HEAVY_RAIN_MM;
                return (
                  <li class={`rounded-lg p-1 ${heavy ? 'bg-stop-soft' : 'bg-soft'}`}>
                    <p class="font-medium">{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</p>
                    <div class="mx-auto my-1 flex h-8 w-3 items-end rounded bg-surface">
                      <div class="w-full rounded bg-accent" style={`height: ${Math.round((d.rain_mm / max) * 100)}%`}></div>
                    </div>
                    <p>{heavy ? '! ' : ''}{Math.round(d.rain_mm)} mm</p>
                    <p class="text-muted">{Math.round(d.tmax_c)}°</p>
                    {heavy && <button type="button" onClick={() => onUse(p.district, d.date)} class="mt-1 min-h-11 w-full rounded bg-stop text-[10px] font-semibold text-stop-ink">Use</button>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function AlertsTab() {
  const data = useLive(async () => {
    const [alerts, sms, users, crops, config] = await Promise.all([
      db.alerts.toArray(), db.sms.orderBy('sent_at').reverse().limit(12).toArray(), db.users.toArray(), db.crop_calendar.toArray().then(sortCrops), db.config.get('main'),
    ]);
    return { alerts, sms, users: new Map(users.map((u) => [u.id, u])), crops: crops.map((c) => c.crop), today: config.demo_date };
  });
  const [form, setForm] = useState({ template_type: 'heavy_rain', level: '', crops: [], districts: ['Kombo Central'], starts_on: '', ends_on: '', note: '' });
  const [notice, setNotice] = useState(null);

  if (!data) return <p class="text-sm text-muted">Loading…</p>;
  const tpl = templates[form.template_type];
  const level = form.level || tpl.level;
  const starts = form.starts_on || data.today;
  const ends = form.ends_on || addDays(starts, tpl.days);
  const active = data.alerts.filter((a) => a.ends_on >= data.today).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const set = (k) => (e) => {
    const v = e.currentTarget.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  async function submit(e) {
    e.preventDefault();
    try {
      const { sent } = await createAlert({ ...form, level, starts_on: starts, ends_on: ends });
      setNotice({ text: `Alert created. SMS sent to ${sent} farmer${sent === 1 ? '' : 's'}.` });
      setForm((f) => ({ ...f, note: '', starts_on: '', ends_on: '' }));
    } catch (err) {
      setNotice({ error: true, text: err.message });
    }
  }

  async function call(alertId) {
    try {
      const { called } = await callFarmersWithAlert(alertId);
      setNotice({ text: `Calling ${called} farmer${called === 1 ? '' : 's'} with voice alerts on.` });
    } catch (err) {
      setNotice({ error: true, text: err.message });
    }
  }

  return (
    <div class="grid gap-4 lg:grid-cols-2">
      <Card title="New alert from a template">
        <form onSubmit={submit} class="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <Select value={form.template_type} onChange={(e) => { const v = e.currentTarget.value; setForm((f) => ({ ...f, template_type: v, level: '', ends_on: '' })); }}
              options={Object.keys(templates).map((k) => ({ value: k, label: t(`alert.${k}`) }))} />
          </Field>
          <Field label="Level">
            <Select value={level} onChange={set('level')} options={[{ value: 'yellow', label: 'Watch out (yellow)' }, { value: 'red', label: 'Act now (red)' }]} />
          </Field>
          <Field label="Starts"><Input type="date" value={starts} onInput={set('starts_on')} /></Field>
          <Field label="Ends"><Input type="date" value={ends} onInput={set('ends_on')} /></Field>
          <div class="text-sm sm:col-span-2">
            <p class="mb-1 font-medium">Crops <span class="font-normal text-muted">(none = all crops)</span></p>
            <ChipPicker options={data.crops.map((c) => ({ value: c, label: cropName(c) }))} value={form.crops} onChange={(crops) => setForm((f) => ({ ...f, crops }))} />
          </div>
          <div class="text-sm sm:col-span-2">
            <p class="mb-1 font-medium">Districts</p>
            <ChipPicker options={districts.map((d) => ({ value: d, label: d }))} value={form.districts} onChange={(ds) => setForm((f) => ({ ...f, districts: ds }))} />
          </div>
          <Field label="Note for kafo leaders" hint="Shown in the kafo app only, not in SMS" class="sm:col-span-2">
            <Input value={form.note} onInput={set('note')} placeholder="From DWR bulletin 12" />
          </Field>
          <div class="sm:col-span-2">
            <Button type="submit">Send alert</Button>
            <Notice notice={notice} />
          </div>
        </form>
      </Card>

      <div class="space-y-4">
        <WeatherCard onUse={(district, date) => {
          setForm((f) => ({ ...f, template_type: 'heavy_rain', level: 'red', districts: [district], starts_on: date, ends_on: '', note: `Open-Meteo forecast: heavy rain ${formatDate(date)}` }));
          setNotice({ text: `Form filled for heavy rain in ${district} on ${formatDate(date)}. Check it and press Send alert.` });
        }} />
        <Card title={`Active alerts (${active.length})`}>
          {active.length === 0 ? <p class="text-sm text-muted">None.</p> : (
            <ul class="divide-y divide-line text-sm">
              {active.map((a) => (
                <li class="py-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <SignalPill signal={a.level} kind="risk" />
                    <span class="font-medium">{t(`alert.${a.template_type}`)}</span>
                    <span class="text-muted">{formatDate(a.starts_on)} – {formatDate(a.ends_on)}</span>
                  </div>
                  <p class="mt-1 text-xs text-muted">
                    {a.districts.join(', ')} · {a.crops.length ? a.crops.map((c) => cropName(c)).join(', ') : 'all crops'}{a.note && ` · ${a.note}`}
                  </p>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <Button variant="ghost" onClick={() => call(a.id)}>Call farmers</Button>
                    <Button variant="ghost" onClick={() => endAlert(a.id)}>End now</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Latest SMS sent (from 1234)">
          {data.sms.length === 0 ? <p class="text-sm text-muted">No SMS yet.</p> : (
            <ul class="divide-y divide-line text-sm">
              {data.sms.map((s) => (
                <li class="py-2">
                  <p class="text-xs text-muted">To {data.users.get(s.to_user_id)?.name} · {t(`lang.${s.lang}`)} · {s.body.length} chars</p>
                  <p class="font-mono text-xs">{s.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
