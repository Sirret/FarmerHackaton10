import { formatDate } from '../../lib/dates.js';
import Button from '../ui/Button.jsx';

export default function Profile({ view, go }) {
  const k = view.kafo;
  const active = view.plantings.filter((p) => p.stage !== 'harvested').reduce((s, p) => s + p.beds, 0);
  const rows = [
    ['Kafo code', k.code],
    ['Village', k.village],
    ['District', k.district],
    ['Market town', view.town?.name],
    ['Beds in use', `${active} of ${k.total_beds}`],
    ['Members', view.members.length],
    ['Leader', `${view.leader?.name} (${view.leader?.phone})`],
    ['Deputy', k.deputy_id ?? 'None yet'],
    ['Contract', `${k.contract_ref}, signed ${formatDate(k.contract_signed_on)}`],
    ['PIN login', 'Demo: not needed (role switcher)'],
  ];
  return (
    <div class="space-y-3">
      <h2 class="text-sm font-semibold">Kafo profile</h2>
      <dl class="divide-y divide-line rounded-xl border border-line bg-surface text-sm">
        {rows.map(([label, value]) => (
          <div class="flex gap-3 px-3 py-2">
            <dt class="w-28 shrink-0 text-muted">{label}</dt>
            <dd class="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <Button variant="ghost" class="w-full" onClick={() => go('home')}>Back to Home</Button>
    </div>
  );
}
