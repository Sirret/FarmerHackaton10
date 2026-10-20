import { useEffect, useMemo, useState } from 'preact/hooks';
import { db } from '../../lib/db.js';
import { updateLead } from '../../lib/actions.js';
import { formatDate } from '../../lib/dates.js';
import { useLive } from '../../lib/useLive.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import { Select, inputClass, Notice } from '../ui/Field.jsx';
import { useAction } from '../ui/useAction.js';

const STATUS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'registered', label: 'Registered' },
  { value: 'not_suitable', label: 'Not suitable' },
];
const TONE = { new: 'bg-careful-soft', contacted: 'bg-soft', registered: 'bg-go-soft', not_suitable: 'bg-stale-soft' };

/** Play a recorded voice note (Blob from IndexedDB). */
function VoiceNote({ blob }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  if (!url) return <span class="text-xs text-muted">No recording (microphone not available)</span>;
  return <audio controls src={url} class="h-9 w-full max-w-xs" aria-label="Voice note: name and village" />;
}

function LeadRow({ lead, towns }) {
  const [notes, setNotes] = useState(lead.notes ?? '');
  const [run, notice] = useAction();
  const register = () => {
    window.location.hash = `register?phone=${encodeURIComponent(lead.phone)}&lead=${lead.id}`;
  };
  return (
    <li class="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div class="flex flex-wrap items-center gap-2">
        <span class="font-mono font-semibold">{lead.phone}</span>
        <span class={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[lead.status]}`}>{STATUS.find((s) => s.value === lead.status)?.label}</span>
        <span class="text-sm text-muted">called {formatDate(lead.created_at)} at {lead.created_at.slice(11, 16)}</span>
      </div>
      <div class="mt-2"><VoiceNote blob={lead.voice_note} /></div>
      <div class="mt-3 grid gap-2 sm:grid-cols-[auto_auto_1fr]">
        <Select aria-label="Status" value={lead.status} onChange={(e) => run(() => updateLead(lead.id, { status: e.currentTarget.value }), 'Status saved')} options={STATUS} />
        <Select aria-label="Market town" value={lead.market_town_id ?? ''} onChange={(e) => run(() => updateLead(lead.id, { market_town_id: e.currentTarget.value }), 'Market town saved')}
          options={[{ value: '', label: 'Market town: not given' }, ...towns.map((t) => ({ value: t.id, label: t.name }))]} />
        <input aria-label="Notes" placeholder="Notes: who called, what they grow, next step" class={inputClass} value={notes}
          onInput={(e) => setNotes(e.currentTarget.value)}
          onBlur={(e) => { const v = e.currentTarget.value; if (v !== (lead.notes ?? '')) run(() => updateLead(lead.id, { notes: v }), 'Notes saved'); }} />
      </div>
      {lead.status !== 'registered' && lead.status !== 'not_suitable' && (
        <Button class="mt-3" onClick={register}>Register their kafo</Button>
      )}
      <Notice notice={notice} />
    </li>
  );
}

// Leads inbox (spec §8.3): unregistered callers who left their name and village.
export default function LeadsTab() {
  const data = useLive(async () => ({
    leads: (await db.leads.toArray()).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    towns: await db.market_towns.toArray(),
  }));
  if (!data) return <p class="text-sm text-muted">Loading…</p>;
  const open = data.leads.filter((l) => l.status === 'new' || l.status === 'contacted');
  const closed = data.leads.filter((l) => !open.includes(l));
  return (
    <div class="space-y-4">
      <Card title={`Leads to follow up (${open.length})`}>
        <p class="mb-3 text-sm text-muted">People who dialled *1234# or *4321# from a number that is not registered and left their name and village. Call them back, then register their kafo under a contract.</p>
        {open.length === 0 ? <p class="text-sm text-muted">No new leads. Try the farmer phone with “Unregistered number”.</p> : (
          <ul class="space-y-3">{open.map((l) => <LeadRow key={l.id} lead={l} towns={data.towns} />)}</ul>
        )}
      </Card>
      {closed.length > 0 && (
        <Card title={`Closed (${closed.length})`}>
          <ul class="space-y-3">{closed.map((l) => <LeadRow key={l.id} lead={l} towns={data.towns} />)}</ul>
        </Card>
      )}
    </div>
  );
}
