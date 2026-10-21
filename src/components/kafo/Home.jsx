import { formatDate } from '../../lib/dates.js';
import { cropName, t } from '../../lib/i18n.js';
import { render } from '../../lib/render.js';
import AudioButton from '../shared/AudioButton.jsx';
import CropIcon from '../shared/CropIcon.jsx';
import Inbox from './Inbox.jsx';

function MiniTile({ title, signal, kind, detail }) {
  const tile = render(signal, 'tile', 'en', { kind });
  return (
    <div class={`rounded-lg border-l-4 px-2 py-1.5 ${tile.classes.border} ${tile.classes.soft}`}>
      <p class="text-[10px] uppercase tracking-wide text-muted">{title}</p>
      <p class="text-xs font-semibold leading-tight"><span aria-hidden="true">{tile.icon}</span> {tile.label}</p>
      {detail && <p class="mt-0.5 text-[10px] leading-tight text-muted">{detail}</p>}
    </div>
  );
}

export default function Home({ view, leaderId, go }) {
  const lang = view.leader?.language ?? 'en';
  const upcoming = view.plantings.filter((p) => p.stage !== 'harvested').slice(0, 5);
  return (
    <div class="space-y-4">
      <section>
        <h2 class="mb-2 text-sm font-semibold">Signals · {view.kafo.district}</h2>
        <ul class="space-y-2">
          {view.crops.map(({ crop, plant, sell, risk }) => {
            const best = sell.options[0];
            const sellDetail = best?.order_id ? 'Buyer order' : best?.net != null ? `${view.towns[best.market_town_id]} D${best.net}/kg` : null;
            const items = [
              ...render(plant.signal, 'voice', lang, { kind: 'plant', crop, reason: plant.reason }),
              ...render(best?.signal ?? 'none', 'voice', lang, { kind: 'sell' }),
              ...render(risk.signal, 'voice', lang, { kind: 'risk', reason: risk.reason }),
            ];
            return (
              <li class="rounded-xl border border-line bg-surface p-2 shadow-sm">
                <div class="mb-1.5 flex flex-wrap items-center gap-2">
                  <CropIcon crop={crop} />
                  <span class="flex-1 font-semibold">{cropName(crop)}</span>
                  <AudioButton items={items} lang={lang} label={`Listen: ${cropName(crop)}`} />
                </div>
                <div class="grid grid-cols-3 gap-1.5">
                  <MiniTile title="Plant" signal={plant.signal} kind="plant" detail={t(`reason.${plant.reason}`)} />
                  <MiniTile title="Sell" signal={best?.signal ?? 'none'} kind="sell" detail={sellDetail} />
                  <MiniTile title="Risk" signal={risk.signal} kind="risk" detail={risk.signal === 'green' ? null : t(`reason.${risk.reason}`)} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 class="mb-2 text-sm font-semibold">To do {view.inbox.count > 0 && <span class="ml-1 rounded-full bg-stop px-1.5 text-xs text-stop-ink">{view.inbox.count}</span>}</h2>
        <Inbox view={view} leaderId={leaderId} go={go} />
      </section>

      <section>
        <h2 class="mb-2 text-sm font-semibold">Upcoming harvests</h2>
        {upcoming.length === 0 ? <p class="text-sm text-muted">Nothing planted yet.</p> : (
          <ul class="divide-y divide-line rounded-xl border border-line bg-surface text-sm">
            {upcoming.map((p) => (
              <li class="flex items-center gap-2 px-3 py-2">
                <CropIcon crop={p.crop} size="text-lg" />
                <span class="flex-1">{cropName(p.crop)} · {p.beds} beds · ~{p.expected_kg - p.lost_kg} kg</span>
                <span class="text-xs text-muted">{t(`stage.${p.stage}`)} · {formatDate(p.expected_harvest)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
