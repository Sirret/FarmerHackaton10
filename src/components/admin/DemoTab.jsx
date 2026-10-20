import { useState } from 'preact/hooks';
import { resetDemo } from '../../lib/db.js';
import { demoPestReports, demoHeavyRain, demoPostOrder, callFarmersWithAlert, jumpDemo, demoProduceRequests, demoInterest } from '../../lib/actions.js';
import { formatDate } from '../../lib/dates.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import { Notice } from '../ui/Field.jsx';
import DbStatus from './DbStatus.jsx';
import VoiceClips from './VoiceClips.jsx';

// Demo scenario panel (spec §8.14). Each button runs the same actions the real
// screens use, so signals, SMS and other open tabs update exactly as they would live.
const STEPS = [
  {
    label: 'Add 3 pest reports',
    desc: 'Three Brikama farmers report insects on okra. Okra risk → WATCH OUT, nearby okra growers get an SMS.',
    run: async () => {
      const r = await demoPestReports('okra');
      return `Okra risk ${r.before} → ${r.after}. ${r.warned} farmers warned by SMS.`;
    },
  },
  {
    label: 'Trigger heavy rain in Brikama',
    desc: 'Red alert for Kombo Central starting in 2 days. Every crop → ACT NOW; SMS to every farmer there.',
    run: async () => {
      const { sent } = await demoHeavyRain();
      return `Heavy rain alert sent by SMS to ${sent} farmers.`;
    },
  },
  {
    label: 'Post buyer order',
    desc: 'Westfield Wholesale orders 200 kg pepper for delivery in 10 weeks. Pepper demand goes up.',
    run: async () => {
      const o = await demoPostOrder();
      return `Order posted: ${o.kg} kg ${o.crop}, D${o.price_per_kg}/kg, ${formatDate(o.window_start)}.`;
    },
  },
  {
    label: 'Call farmers with alert',
    desc: 'Rings every farmer with voice alerts on (Binta) about the most serious active alert. Her phone on /farmer rings; answer to hear it.',
    run: async () => {
      const { called } = await callFarmersWithAlert();
      return `Calling ${called} farmer${called === 1 ? '' : 's'}.`;
    },
  },
  {
    label: 'Binta: interested in okra',
    desc: 'Binta tells her leader she wants to plant okra (what *1234# → 1 → 4 → 1 will do). Shows in the Brikama leader inbox.',
    run: async () => {
      await demoInterest();
      return 'Brikama leader inbox: “Binta is interested in okra”.';
    },
  },
  {
    label: 'Farmers: I have produce',
    desc: 'Awa (1 bag) and Binta (2–4 bags) say they have pepper. The Brikama leader can merge them into one offer.',
    run: async () => {
      const made = await demoProduceRequests();
      return `${made.length} produce requests sent to the Brikama leader.`;
    },
  },
  {
    label: 'Jump +8 weeks',
    desc: 'Moves the demo date forward 8 weeks and carries the latest prices forward.',
    run: async () => {
      const { date, pricesCarried } = await jumpDemo(56);
      return `Demo date is now ${formatDate(date)}. ${pricesCarried} prices carried forward.`;
    },
  },
  {
    label: 'Reset demo',
    desc: 'Puts every table back to the starting data.',
    variant: 'stop',
    run: async () => {
      if (!confirm('Reset all demo data to the starting state?')) return null;
      await resetDemo();
      return 'Demo reset.';
    },
  },
];

export default function DemoTab() {
  const [notices, setNotices] = useState({});
  // Only the running button is disabled, so a presenter can click the next step straight away.
  const [busy, setBusy] = useState(() => new Set());

  async function run(i) {
    setBusy((b) => new Set(b).add(i));
    setNotices((n) => ({ ...n, [i]: { pending: true, text: 'Working…' } }));
    try {
      const text = await STEPS[i].run();
      setNotices((n) => ({ ...n, [i]: text ? { text } : null }));
    } catch (err) {
      setNotices((n) => ({ ...n, [i]: { error: true, text: err.message } }));
    } finally {
      setBusy((b) => { const next = new Set(b); next.delete(i); return next; });
    }
  }

  return (
    <div class="space-y-4">
      <Card title="Demo scenario">
        <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li class="flex flex-col rounded-lg border border-line p-3">
              <Button variant={s.variant ?? 'brand'} disabled={busy.has(i)} onClick={() => run(i)}>{s.label}</Button>
              <p class="mt-2 text-xs text-muted">{s.desc}</p>
              <Notice notice={notices[i]} />
            </li>
          ))}
        </ul>
      </Card>
      <VoiceClips />
      <DbStatus />
    </div>
  );
}
