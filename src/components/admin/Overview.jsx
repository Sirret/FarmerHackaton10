import { db } from '../../lib/db.js';
import { t } from '../../lib/i18n.js';
import { useLive } from '../../lib/useLive.js';
import SignalsPanel from './SignalsPanel.jsx';
import Card from '../ui/Card.jsx';

// Counts at a glance + which kafos are under an alert + live signals.
export default function Overview() {
  const view = useLive(async () => {
    const config = await db.config.get('main');
    const day = config.demo_date;
    const [kafos, farmers, orders, alerts, sms, leads, flags, reports] = await Promise.all([
      db.kafos.toArray(), db.farmers.count(), db.orders.toArray(), db.alerts.toArray(),
      db.sms.count(), db.leads.toArray(), db.flags.toArray(), db.reports.toArray(),
    ]);
    const active = alerts.filter((a) => a.ends_on >= day);
    const [audit, users] = await Promise.all([db.audit.orderBy('at').reverse().limit(12).toArray(), db.users.toArray()]);
    const name = new Map(users.map((u) => [u.id, u.name]));
    return {
      activity: audit.map((a) => ({ ...a, who: name.get(a.user_id) ?? a.user_id })),
      stats: [
        ['Kafos', kafos.length],
        ['Farmers', farmers],
        ['Open orders', orders.filter((o) => o.status === 'open' || o.status === 'partly_filled').length],
        ['Active alerts', active.length],
        ['Open reports', reports.filter((r) => r.status === 'open').length],
        ['SMS sent', sms],
        ['New leads', leads.filter((l) => l.status === 'new').length],
        ['Open flags', flags.filter((f) => f.status === 'open').length],
      ],
      alerted: kafos
        .map((k) => ({ kafo: k, alerts: active.filter((a) => a.districts.includes(k.district)) }))
        .filter((x) => x.alerts.length),
    };
  });

  if (!view) return <p class="text-sm text-muted">Loading…</p>;
  return (
    <div class="space-y-4">
      <ul class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {view.stats.map(([label, n]) => (
          <li class="rounded-xl border border-line bg-surface p-4 shadow-sm">
            <p class="text-2xl font-bold">{n}</p>
            <p class="text-sm text-muted">{label}</p>
          </li>
        ))}
      </ul>

      <Card title="Kafos under an alert">
        {view.alerted.length === 0 ? <p class="text-sm text-muted">No active alerts.</p> : (
          <ul class="divide-y divide-line text-sm">
            {view.alerted.map(({ kafo, alerts }) => (
              <li class="flex flex-wrap gap-x-3 py-2">
                <span class="font-medium">{kafo.name}</span>
                <span class="text-muted">{kafo.district}</span>
                <span class="ml-auto">{alerts.map((a) => t(`alert.${a.template_type}`)).join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SignalsPanel />

      <Card title="Recent activity (audit log)">
        {view.activity.length === 0 ? <p class="text-sm text-muted">Nothing yet. Every leader, buyer and admin action is logged here.</p> : (
          <ul class="divide-y divide-line text-sm">
            {view.activity.map((a) => (
              <li class="flex flex-wrap gap-x-3 py-1.5">
                <span class="w-12 text-muted">{a.at.slice(11, 16)}</span>
                <span class="font-medium">{a.who}</span>
                <span class="font-mono text-xs leading-5 text-muted">{a.action}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
