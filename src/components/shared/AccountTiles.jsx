import { useState } from 'preact/hooks';
import { db } from '../../lib/db.js';
import { t } from '../../lib/i18n.js';
import { getSession, loginAs, UNREGISTERED } from '../../lib/session.js';
import { useLive } from '../../lib/useLive.js';

const DEMO_FARMERS = ['user_awa', 'user_binta'];
const initials = (name) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

// Click-to-login squares for one role, read live from the database, so accounts the
// admin registers appear here straight away.
export default function AccountTiles({ role, limit = 0 }) {
  const [showAll, setShowAll] = useState(false);
  const current = getSession(role);
  const data = useLive(async () => {
    const [users, kafos, buyers, farmers] = await Promise.all([
      db.users.where('role').equals(role).toArray(), db.kafos.toArray(), db.buyers.toArray(), db.farmers.toArray(),
    ]);
    return { users, kafos: new Map(kafos.map((k) => [k.id, k])), buyers: new Map(buyers.map((b) => [b.id, b])), farmers: new Map(farmers.map((f) => [f.user_id, f])) };
  }, [role]);

  if (!data) return <p class="text-sm text-muted">Loading accounts…</p>;

  let tiles = data.users.map((u) => tileFor(role, u, data));
  if (role === 'farmer') {
    tiles = tiles.filter((x) => x.usable)
      .sort((a, b) => Number(DEMO_FARMERS.includes(b.id)) - Number(DEMO_FARMERS.includes(a.id)) || a.title.localeCompare(b.title));
    tiles.push({ id: UNREGISTERED, title: 'Unregistered number', line: 'Not in any kafo', tag: 'Demo', initials: '?' });
  }
  const hidden = limit && !showAll ? Math.max(0, tiles.length - limit) : 0;
  const shown = hidden ? tiles.slice(0, limit) : tiles;

  return (
    <div>
      <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {shown.map((x) => (
          <li>
            <button
              type="button"
              onClick={() => loginAs(role, x.id)}
              class={`flex aspect-square w-full flex-col justify-between rounded-xl border bg-surface p-3 text-left shadow-sm transition hover:border-accent hover:shadow ${x.id === current ? 'border-brand ring-2 ring-brand' : 'border-line'}`}
            >
              <span class="flex items-start justify-between gap-1">
                <span class="flex h-10 w-10 items-center justify-center rounded-full bg-soft text-sm font-bold">{x.initials}</span>
                {x.tag && <span class={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${x.warn ? 'bg-careful-soft text-ink' : 'bg-go-soft text-ink'}`}>{x.tag}</span>}
              </span>
              <span>
                <span class="block text-sm font-semibold leading-tight">{x.title}</span>
                <span class="mt-0.5 block text-xs leading-tight text-muted">{x.line}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button type="button" onClick={() => setShowAll(true)} class="mt-3 min-h-11 text-sm font-medium text-accent underline">
          Show {hidden} more
        </button>
      )}
    </div>
  );
}

function tileFor(role, u, { kafos, buyers, farmers }) {
  if (role === 'buyer') {
    const b = buyers.get(u.buyer_id);
    return {
      id: u.id, title: b?.business_name ?? u.name, line: `${u.name} · ${t(`buyer_type.${b?.type}`)}`, initials: initials(b?.business_name ?? u.name),
      tag: b?.suspended ? 'Suspended' : b?.verified ? 'Verified' : 'Awaiting check', warn: !b?.verified || b?.suspended,
    };
  }
  if (role === 'leader') {
    const k = kafos.get(u.kafo_id);
    return { id: u.id, title: u.name, line: k ? `${k.name} · ${k.district}` : 'No kafo', initials: initials(u.name), tag: 'Leader' };
  }
  if (role === 'farmer') {
    const k = kafos.get(u.kafo_id);
    const f = farmers.get(u.id);
    return {
      id: u.id, title: u.name, line: `${k?.village ?? ''} · ${t(`lang.${u.language}`)}`, initials: initials(u.name),
      tag: DEMO_FARMERS.includes(u.id) ? 'Demo' : null, usable: Boolean(f?.has_phone && u.phone),
    };
  }
  return { id: u.id, title: u.name, line: 'Platform operator', initials: initials(u.name) };
}
