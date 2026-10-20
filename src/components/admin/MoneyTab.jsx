import { db } from '../../lib/db.js';
import { formatDate } from '../../lib/dates.js';
import { cropName, t } from '../../lib/i18n.js';
import { buyerReliability } from '../../lib/orders.js';
import { useLive } from '../../lib/useLive.js';
import Card from '../ui/Card.jsx';

const D = (n) => `D${Math.round(n).toLocaleString('en-GB')}`;

// Money (spec §8.13): completed orders, what farmers were paid, the platform fee owed by buyers. Mock only.
export default function MoneyTab() {
  const data = useLive(async () => {
    const [orders, payments, buyers, config] = await Promise.all([db.orders.toArray(), db.payments.toArray(), db.buyers.toArray(), db.config.get('main')]);
    return { orders, payments, buyers, config };
  });
  if (!data) return <p class="text-sm text-muted">Loading…</p>;

  const rows = data.orders
    .map((o) => {
      const pays = data.payments.filter((p) => p.order_id === o.id && p.status === 'paid');
      return {
        o, buyer: data.buyers.find((b) => b.id === o.buyer_id),
        farmers: new Set(pays.map((p) => p.member_id)).size,
        paid: pays.reduce((s, p) => s + p.amount, 0),
        fee: pays.reduce((s, p) => s + p.platform_fee, 0),
        last: pays.map((p) => p.paid_at).sort().at(-1),
      };
    })
    .filter((r) => r.paid > 0)
    .sort((a, b) => b.last.localeCompare(a.last));
  const total = { paid: rows.reduce((s, r) => s + r.paid, 0), fee: rows.reduce((s, r) => s + r.fee, 0), farmers: new Set(data.payments.filter((p) => p.status === 'paid').map((p) => p.member_id)).size };

  return (
    <div class="space-y-4">
      <ul class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Paid to farmers', D(total.paid)], ['Farmers paid', total.farmers], [`Platform fee (${data.config.fee_percent}%)`, D(total.fee)], ['Orders paid', rows.length]].map(([label, value]) => (
          <li class="rounded-xl border border-line bg-surface p-4 shadow-sm">
            <p class="text-2xl font-bold">{value}</p>
            <p class="text-sm text-muted">{label}</p>
          </li>
        ))}
      </ul>

      <Card title="Paid orders">
        <p class="mb-3 text-xs text-muted">Farmers get the full price for their kg; the platform fee is charged to the buyer on top. Mock payments, demo data.</p>
        {rows.length === 0 ? <p class="text-sm text-muted">No payments yet. Buyers pay on the Buyer page after collection.</p> : (
          <div class="overflow-x-auto">
            <table class="w-full min-w-[560px] text-left text-sm">
              <thead class="text-xs text-muted">
                <tr><th class="py-2 pr-3 font-medium">Paid</th><th class="py-2 pr-3 font-medium">Buyer</th><th class="py-2 pr-3 font-medium">Order</th><th class="py-2 pr-3 text-right font-medium">To farmers</th><th class="py-2 text-right font-medium">Fee</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr class="border-t border-line">
                    <td class="py-2 pr-3">{formatDate(r.last)}</td>
                    <td class="py-2 pr-3">{r.buyer?.business_name}</td>
                    <td class="py-2 pr-3">{r.o.kg} kg {cropName(r.o.crop).toLowerCase()} · {r.farmers} farmers · {t(`order_stage.${r.o.status}`)}</td>
                    <td class="py-2 pr-3 text-right">{D(r.paid)}</td>
                    <td class="py-2 text-right">{D(r.fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Buyers: paying on time">
        <ul class="divide-y divide-line text-sm">
          {data.buyers.map((b) => {
            const pct = buyerReliability(b.id, data);
            return (
              <li class="flex justify-between py-2">
                <span>{b.business_name}</span>
                <span class="text-muted">{pct == null ? 'no payments yet' : `${pct}% on time (within ${data.config.payment_due_hours} h)`}</span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
