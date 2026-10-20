import { useState } from 'preact/hooks';
import { addMember, broadcastToMembers } from '../../lib/actions.js';
import { SMS_MAX } from '../../lib/notify.js';
import { cropName, LANGS, t, toPlainLatin } from '../../lib/i18n.js';
import Button from '../ui/Button.jsx';
import { Field, Input, Select, ChipPicker, Notice } from '../ui/Field.jsx';
import { useAction } from '../ui/useAction.js';
import CropIcon from '../shared/CropIcon.jsx';

const EMPTY = { name: '', phone: '', has_phone: true, language: 'mnk', crops: [] };

/** Message every member with a phone, as one SMS from 1234 (spec §6.11). */
function Broadcast({ view, leaderId }) {
  const [text, setText] = useState('');
  const [run, notice, busy] = useAction();
  const withPhone = view.members.filter((m) => m.has_phone).length;
  const full = toPlainLatin(t('sms.broadcast', 'en', { kafo: view.kafo.name, text, leader: view.leader?.name.split(' ')[0] ?? '' }));
  const left = SMS_MAX - full.length;
  async function send() {
    if (await run(() => broadcastToMembers(view.kafo.id, text, leaderId), (r) => 'Sent to ' + r.sent + ' members by SMS.')) setText('');
  }
  return (
    <section class="rounded-xl border border-line bg-surface p-3 shadow-sm">
      <h2 class="mb-2 font-semibold">Message all members</h2>
      <textarea aria-label="Message to all members" rows={3} class="w-full rounded-lg border border-line bg-surface p-2 text-sm" placeholder="Meeting at the garden on Saturday 9:00"
        value={text} onInput={(e) => setText(e.currentTarget.value)} />
      <div class="mt-1 flex items-center gap-2 text-xs text-muted">
        <span class={left < 0 ? 'font-semibold text-ink' : ''}>{left < 0 ? (-left) + ' characters too long' : left + ' characters left'} · {withPhone} members with a phone</span>
        <Button variant="go" class="ml-auto" disabled={busy || !text.trim() || left < 0} onClick={send}>Send SMS</Button>
      </div>
      <Notice notice={notice} />
    </section>
  );
}

export default function Members({ view, leaderId }) {
  const [f, setF] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [run, notice, busy] = useAction();
  const set = (k) => (e) => { const v = e.currentTarget.type === 'checkbox' ? e.currentTarget.checked : e.currentTarget.value; setF((x) => ({ ...x, [k]: v })); };

  async function save() {
    const r = await run(() => addMember({ ...f, kafo_id: view.kafo.id }, leaderId),
      (res) => (res.farmer.has_phone ? `${res.user.name} added. Welcome SMS and welcome call sent.` : `${res.user.name} added. You will pass on her signals.`));
    if (r) { setF(EMPTY); setOpen(false); }
  }

  return (
    <div class="space-y-4">
      {!open ? (
        <Button variant="go" class="w-full" onClick={() => setOpen(true)}>+ Add member</Button>
      ) : (
        <section class="space-y-3 rounded-xl border border-line bg-surface p-3 shadow-sm">
          <h2 class="font-semibold">Add member</h2>
          <Field label="Name"><Input value={f.name} onInput={set('name')} placeholder="Fatoumatta Jarju" /></Field>
          <label class="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" class="h-5 w-5" checked={f.has_phone} onChange={set('has_phone')} /> Has a phone
          </label>
          {f.has_phone && <Field label="Phone" hint="7 digits (demo number)"><Input inputMode="numeric" maxLength={7} value={f.phone} onInput={set('phone')} placeholder="7123456" /></Field>}
          <Field label="Language">
            <Select value={f.language} onChange={set('language')} options={LANGS.map((l) => ({ value: l, label: t(`lang.${l}`) }))} />
          </Field>
          <div class="text-sm">
            <p class="mb-1 font-medium">Crops she grows</p>
            <ChipPicker options={view.calendar.map(({ crop }) => ({ value: crop, label: cropName(crop) }))} value={f.crops}
              onChange={(crops) => setF((x) => ({ ...x, crops }))} />
          </div>
          <div class="flex gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="go" class="flex-1" disabled={busy} onClick={save}>Add member</Button>
          </div>
        </section>
      )}
      <Notice notice={notice} />

      <Broadcast view={view} leaderId={leaderId} />

      <section>
        <h2 class="mb-2 text-sm font-semibold">Members ({view.members.length})</h2>
        <ul class="divide-y divide-line rounded-xl border border-line bg-surface text-sm">
          {view.members.map((m) => (
            <li class="px-3 py-2">
              <div class="flex items-center gap-2">
                <span class="flex-1 font-medium">{m.name}</span>
                <span class="flex gap-0.5">{m.crops.map((c) => <CropIcon crop={c} size="text-base" />)}</span>
              </div>
              <p class="text-xs text-muted">
                {t(`lang.${m.language}`)} · {m.has_phone ? m.phone : 'no phone (through leader)'}
                {(m.delivered_kg > 0 || m.paid > 0) && ` · delivered ${m.delivered_kg} kg · paid D${m.paid}`}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
