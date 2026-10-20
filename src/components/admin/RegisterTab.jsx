import { useState } from 'preact/hooks';
import { db } from '../../lib/db.js';
import { registerKafo, setBuyerStatus } from '../../lib/actions.js';
import { LANGS, t } from '../../lib/i18n.js';
import { useLive } from '../../lib/useLive.js';
import districts from '../../data/districts.json';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import { Field, Input, Select, Notice } from '../ui/Field.jsx';

const EMPTY = {
  name: '', village: '', district: 'Kombo Central', market_town_id: 'town_brikama', lat: '', lng: '', total_beds: '',
  contract_ref: '', contract_signed_on: '', consent_confirmed: false,
  leader_name: '', leader_phone: '', leader_language: 'mnk',
};

export default function RegisterTab() {
  const data = useLive(async () => {
    const [kafos, users, towns, buyers, config] = await Promise.all([
      db.kafos.toArray(), db.users.toArray(), db.market_towns.toArray(), db.buyers.toArray(), db.config.get('main'),
    ]);
    return { kafos, users: new Map(users.map((u) => [u.id, u])), towns, buyers, today: config.demo_date };
  });
  const [form, setForm] = useState(EMPTY);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!data) return <p class="text-sm text-muted">Loading…</p>;
  const set = (k) => (e) => {
    const v = e.currentTarget.type === 'checkbox' ? e.currentTarget.checked : e.currentTarget.value;
    setForm((f) => ({ ...f, [k]: v }));
  };
  const nextRef = `KS-2026-${String(data.kafos.length + 1).padStart(3, '0')}`;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { kafo, leader } = await registerKafo({
        ...form, contract_ref: form.contract_ref || nextRef, contract_signed_on: form.contract_signed_on || data.today,
      });
      setNotice({ text: `Registered ${kafo.name} (kafo code ${kafo.code}). ${leader.name} can now log in from the home page.` });
      setForm(EMPTY);
    } catch (err) {
      setNotice({ error: true, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="grid gap-4 lg:grid-cols-2">
      <Card title="Register a kafo and its leader">
        <form onSubmit={submit} class="grid gap-3 sm:grid-cols-2">
          <Field label="Kafo name" class="sm:col-span-2"><Input value={form.name} onInput={set('name')} placeholder="Sanyang Women's Kafo" /></Field>
          <Field label="Village"><Input value={form.village} onInput={set('village')} placeholder="Sanyang" /></Field>
          <Field label="District">
            <Select value={form.district} onChange={set('district')} options={districts.map((d) => ({ value: d, label: d }))} />
          </Field>
          <Field label="Market town">
            <Select value={form.market_town_id} onChange={set('market_town_id')} options={data.towns.map((m) => ({ value: m.id, label: m.name }))} />
          </Field>
          <Field label="Total beds"><Input type="number" min="1" value={form.total_beds} onInput={set('total_beds')} /></Field>
          <Field label="GPS latitude" hint="Optional"><Input type="number" step="any" value={form.lat} onInput={set('lat')} placeholder="13.27" /></Field>
          <Field label="GPS longitude" hint="Optional"><Input type="number" step="any" value={form.lng} onInput={set('lng')} placeholder="-16.65" /></Field>
          <Field label="Contract ref"><Input value={form.contract_ref} onInput={set('contract_ref')} placeholder={nextRef} /></Field>
          <Field label="Date signed"><Input type="date" value={form.contract_signed_on || data.today} onInput={set('contract_signed_on')} /></Field>

          <p class="pt-2 text-sm font-semibold sm:col-span-2">Leader</p>
          <Field label="Leader name"><Input value={form.leader_name} onInput={set('leader_name')} placeholder="Jainaba Sanneh" /></Field>
          <Field label="Leader phone" hint="7 digits, demo number"><Input inputMode="numeric" maxLength={7} value={form.leader_phone} onInput={set('leader_phone')} placeholder="7019999" /></Field>
          <Field label="Leader language">
            <Select value={form.leader_language} onChange={set('leader_language')} options={LANGS.map((l) => ({ value: l, label: t(`lang.${l}`) }))} />
          </Field>
          <label class="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" class="h-5 w-5" checked={form.consent_confirmed} onChange={set('consent_confirmed')} />
            Members agreed to data use (consent on the signed contract)
          </label>
          <div class="sm:col-span-2">
            <Button type="submit" disabled={busy}>Register kafo</Button>
            <Notice notice={notice} />
          </div>
        </form>
      </Card>

      <div class="space-y-4">
        <Card title={`Kafos (${data.kafos.length})`}>
          <ul class="divide-y divide-line text-sm">
            {data.kafos.map((k) => {
              const leader = data.users.get(k.leader_id);
              return (
                <li class="py-2">
                  <div class="flex flex-wrap gap-x-2">
                    <span class="font-medium">{k.name}</span>
                    <span class="text-muted">code {k.code}</span>
                    <span class="ml-auto text-muted">{k.total_beds} beds</span>
                  </div>
                  <p class="text-xs text-muted">{k.district} · leader {leader?.name} ({leader?.phone}) · {k.contract_ref}</p>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Buyers">
          <ul class="divide-y divide-line text-sm">
            {data.buyers.map((b) => (
              <li class="flex flex-wrap items-center gap-2 py-2">
                <div class="min-w-0 flex-1">
                  <p class="font-medium">{b.business_name}</p>
                  <p class="text-xs text-muted">{t(`buyer_type.${b.type}`)} · {b.reg_number} · {b.contact_name} ({b.contact_phone}) · {b.location}</p>
                </div>
                <span class={`rounded-full px-2 py-0.5 text-xs font-semibold ${b.suspended ? 'bg-stop-soft' : b.verified ? 'bg-go-soft' : 'bg-careful-soft'}`}>
                  {b.suspended ? 'Suspended' : b.verified ? 'Verified' : 'Awaiting check'}
                </span>
                <Button variant="ghost" onClick={() => setBuyerStatus(b.id, { verified: !b.verified })}>{b.verified ? 'Unverify' : 'Verify'}</Button>
                <Button variant={b.suspended ? 'ghost' : 'stop'} onClick={() => setBuyerStatus(b.id, { suspended: !b.suspended })}>{b.suspended ? 'Unsuspend' : 'Suspend'}</Button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
