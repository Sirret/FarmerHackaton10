import { useState } from 'preact/hooks';
import { db } from '../../lib/db.js';
import { formatDate } from '../../lib/dates.js';
import { loadKafoView } from '../../lib/kafoView.js';
import { getSession } from '../../lib/session.js';
import { useLive } from '../../lib/useLive.js';
import Home from './Home.jsx';
import Plant from './Plant.jsx';
import Sell from './Sell.jsx';
import Members from './Members.jsx';
import Alerts from './Alerts.jsx';
import Profile from './Profile.jsx';

const TABS = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'plant', label: 'Plant', icon: '🌱' },
  { id: 'sell', label: 'Sell', icon: '🧺' },
  { id: 'members', label: 'Members', icon: '👥' },
  { id: 'alerts', label: 'Alerts', icon: '⚠️' },
];

// Kafo leader app (spec §6), rendered inside the smartphone frame on /kafo.
export default function KafoApp() {
  const leaderId = getSession('leader');
  const [tab, setTab] = useState('home');
  const [preset, setPreset] = useState(null); // e.g. { crop, member } from an inbox item

  const view = useLive(async () => {
    const leader = leaderId ? await db.users.get(leaderId) : null;
    if (!leader || leader.role !== 'leader') return null;
    return loadKafoView(leader.kafo_id);
  }, [leaderId]);

  if (view === undefined) return <p class="p-4 text-sm text-muted">Loading…</p>;
  if (view === null) return <p class="p-4 text-sm text-muted">Choose a kafo leader account above the phone.</p>;

  const go = (id, p = null) => {
    setPreset(p);
    setTab(id);
  };
  const props = { view, leaderId, go, preset };

  return (
    <div class="flex min-h-full flex-col">
      <header class="sticky top-0 z-10 flex items-center gap-2 bg-brand px-4 py-3 text-brand-ink">
        <div class="min-w-0 flex-1">
          <p class="truncate text-base font-semibold leading-tight">{view.kafo.name}</p>
          <p class="text-xs opacity-80">Code {view.kafo.code} · {formatDate(view.today)}</p>
        </div>
        <button type="button" onClick={() => go('profile')} aria-label="Kafo profile"
          class="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-sm font-bold">
          {view.leader?.name?.[0] ?? '?'}
        </button>
      </header>

      <main class="flex-1 p-3">
        {tab === 'home' && <Home {...props} />}
        {tab === 'plant' && <Plant {...props} />}
        {tab === 'sell' && <Sell {...props} />}
        {tab === 'members' && <Members {...props} />}
        {tab === 'alerts' && <Alerts {...props} />}
        {tab === 'profile' && <Profile {...props} />}
      </main>

      <nav class="sticky bottom-0 z-10 grid grid-cols-5 border-t border-line bg-surface">
        {TABS.map((t) => {
          const badge = t.id === 'home' ? view.inbox.count : t.id === 'alerts' ? view.alerts.length : 0;
          return (
            <button type="button" onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}
              class={`relative flex min-h-14 flex-col items-center justify-center text-[11px] ${tab === t.id ? 'font-semibold text-ink' : 'text-muted'}`}>
              <span class="text-lg" aria-hidden="true">{t.icon}</span>
              {t.label}
              {badge > 0 && (
                <span class="absolute right-3 top-1 min-w-5 rounded-full bg-stop px-1 text-[10px] font-bold text-stop-ink">{badge}</span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
