import { useEffect, useState } from 'preact/hooks';
import Overview from './Overview.jsx';
import RegisterTab from './RegisterTab.jsx';
import DataTab from './DataTab.jsx';
import AlertsTab from './AlertsTab.jsx';
import DemoTab from './DemoTab.jsx';
import LeadsTab from './LeadsTab.jsx';
import QualityTab from './QualityTab.jsx';
import MoneyTab from './MoneyTab.jsx';

const TABS = [
  { id: 'overview', label: 'Overview', Comp: Overview },
  { id: 'register', label: 'Register', Comp: RegisterTab },
  { id: 'leads', label: 'Leads', Comp: LeadsTab },
  { id: 'data', label: 'Prices & transport', Comp: DataTab },
  { id: 'alerts', label: 'Alerts', Comp: AlertsTab },
  { id: 'quality', label: 'Quality', Comp: QualityTab },
  { id: 'money', label: 'Money', Comp: MoneyTab },
  { id: 'demo', label: 'Demo', Comp: DemoTab },
];

// '#register?phone=7999999&lead=lead_x' → tab 'register' (the query pre-fills that tab).
const fromHash = (hash) => {
  const id = hash.slice(1).split('?')[0];
  return TABS.some((t) => t.id === id) ? id : 'overview';
};

// Admin website (spec §8). The tab lives in the URL hash so links and reloads keep it.
export default function AdminApp() {
  const [hash, setHash] = useState(() => window.location.hash);
  const tab = fromHash(hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const { Comp } = TABS.find((t) => t.id === tab);

  return (
    <div>
      <nav class="-mx-4 mb-6 overflow-x-auto border-b border-line px-4">
        <ul class="flex gap-1">
          {TABS.map((t) => (
            <li>
              <a
                href={`#${t.id}`}
                aria-current={t.id === tab ? 'page' : undefined}
                class={`block whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ${t.id === tab ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'}`}
              >
                {t.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <Comp key={hash} />
    </div>
  );
}
