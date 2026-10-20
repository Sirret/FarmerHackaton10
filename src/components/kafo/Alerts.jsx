import { reviewReport } from '../../lib/actions.js';
import { formatDate } from '../../lib/dates.js';
import { cropName, t } from '../../lib/i18n.js';
import Button from '../ui/Button.jsx';
import { Notice } from '../ui/Field.jsx';
import { useAction } from '../ui/useAction.js';
import SignalPill from '../shared/SignalPill.jsx';

export default function Alerts({ view, leaderId }) {
  const [run, notice] = useAction();
  return (
    <div class="space-y-4">
      <section>
        <h2 class="mb-2 text-sm font-semibold">Area alerts · {view.kafo.district}</h2>
        {view.alerts.length === 0 ? <p class="text-sm text-muted">No alerts for your area. ✓</p> : (
          <ul class="space-y-2">
            {view.alerts.map((a) => (
              <li class="rounded-xl border border-line bg-surface p-3 text-sm shadow-sm">
                <div class="flex flex-wrap items-center gap-2">
                  <SignalPill signal={a.level} kind="risk" />
                  <span class="font-semibold">{t(`alert.${a.template_type}`)}</span>
                </div>
                <p class="mt-1 text-xs text-muted">
                  {formatDate(a.starts_on)} – {formatDate(a.ends_on)} · {a.crops.length ? a.crops.map((c) => cropName(c)).join(', ') : 'all crops'}
                </p>
                {a.note && <p class="mt-1 rounded bg-soft px-2 py-1 text-xs">Note: {a.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 class="mb-2 text-sm font-semibold">Member reports</h2>
        {view.reports.length === 0 ? <p class="text-sm text-muted">No problems reported.</p> : (
          <ul class="divide-y divide-line rounded-xl border border-line bg-surface text-sm">
            {view.reports.map((r) => (
              <li class="px-3 py-2">
                <p>
                  <span class="font-medium">{r.reporter}</span>: {t(`problem.${r.problem}`).toLowerCase()} on {cropName(r.crop).toLowerCase()}
                  <span class="text-xs text-muted"> · {formatDate(r.created_at)}</span>
                </p>
                <p class="text-xs text-muted">
                  {r.status === 'dismissed' ? 'Dismissed' : r.verified ? '✓ Confirmed by leader' : 'Not checked yet'}
                </p>
                {r.status === 'open' && !r.verified && (
                  <div class="mt-1 flex gap-2">
                    <Button variant="stop" onClick={() => run(() => reviewReport(r.id, 'verify', leaderId), 'Report confirmed')}>Confirm</Button>
                    <Button variant="ghost" onClick={() => run(() => reviewReport(r.id, 'dismiss', leaderId), 'Report dismissed')}>Dismiss</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <Notice notice={notice} />
      </section>
    </div>
  );
}
