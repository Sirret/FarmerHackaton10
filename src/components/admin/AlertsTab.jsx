import { useState } from 'preact/hooks';
import { db } from '../../lib/db.js';
import { createAlert, endAlert, callFarmersWithAlert } from '../../lib/actions.js';
import { addDays, formatDate } from '../../lib/dates.js';
import { cropName, t } from '../../lib/i18n.js';
import { useLive } from '../../lib/useLive.js';
import districts from '../../data/districts.json';
import templates from '../../data/alert_templates.json';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import { Field, Input, Select, ChipPicker, Notice } from '../ui/Field.jsx';
import SignalPill from '../shared/SignalPill.jsx';

export default function AlertsTab() {
  const data = useLive(async () => {
    const [alerts, sms, users, crops, config] = await Promise.all([
      db.alerts.toArray(), db.sms.orderBy('sent_at').reverse().limit(12).toArray(), db.users.toArray(), db.crop_calendar.toArray(), db.config.get('main'),
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
