import { useEffect, useState } from 'preact/hooks';
import { loadBuyerView } from '../../lib/buyerView.js';
import { t } from '../../lib/i18n.js';
import { getSession } from '../../lib/session.js';
import { useLive } from '../../lib/useLive.js';
import Outlook from './Outlook.jsx';
import PostOrder from './PostOrder.jsx';
import Market from './Market.jsx';
import Orders from './Orders.jsx';

const TABS = [
  { id: 'outlook', label: 'Harvest outlook' },
  { id: 'post', label: 'Post order' },
  { id: 'market', label: 'Market' },
  { id: 'orders', label: 'My orders' },
];
const fromHash = () => {
  const id = window.location.hash.slice(1);
  return TABS.some((x) => x.id === id) ? id : 'outlook';
};

// Buyer website (plan Phase 5). Full-width, responsive.
export default function BuyerApp() {
  const userId = getSession('buyer');
  const [tab, setTab] = useState(fromHash);
  useEffect(() => {
    const onHash = () => setTab(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const view = useLive(() => (userId ? loadBuyerView(userId) : Promise.resolve(null)), [userId]);

  if (view === undefined) return <p class="text-sm text-muted">Loading…</p>;
  if (view === null) return null; // the session bar above asks for an account

  const b = view.buyer;
  const status = b.suspended ? ['Suspended', 'bg-stop-soft'] : b.verified ? ['✓ Verified buyer', 'bg-go-soft'] : ['Awaiting verification', 'bg-careful-soft'];
  const openCount = view.orders.filter((o) => !['paid', 'cancelled'].includes(o.status)).length;
  const go = (id) => { window.location.hash = id; };

  return (
    <div>
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <h1 class="text-2xl font-bold">{b.business_name}</h1>
        <span class={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status[1]}`}>{status[0]}</span>
        <span class="text-sm text-muted">{t(`buyer_type.${b.type}`)} · {b.location}</span>
      </div>
      <nav class="-mx-4 mb-6 overflow-x-auto border-b border-line px-4">
        <ul class="flex gap-1">
          {TABS.map((x) => (
            <li>
              <a href={`#${x.id}`} aria-current={x.id === tab ? 'page' : undefined}
                class={`block whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ${x.id === tab ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
                {x.label}
                {x.id === 'orders' && openCount > 0 && <span class="ml-1 rounded-full bg-soft px-1.5 text-xs">{openCount}</span>}
                {x.id === 'market' && view.market.length > 0 && <span class="ml-1 rounded-full bg-soft px-1.5 text-xs">{view.market.length}</span>}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {tab === 'outlook' && <Outlook view={view} go={go} />}
      {tab === 'post' && <PostOrder view={view} userId={userId} go={go} />}
      {tab === 'market' && <Market view={view} userId={userId} />}
      {tab === 'orders' && <Orders view={view} userId={userId} />}
    </div>
  );
}
