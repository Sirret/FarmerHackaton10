import { useState } from 'preact/hooks';
import { db } from '../../lib/db.js';
import { getSession, UNREGISTERED } from '../../lib/session.js';
import { useLive } from '../../lib/useLive.js';
import AccountTiles from './AccountTiles.jsx';

const NOUN = { farmer: 'farmer', leader: 'kafo leader', buyer: 'buyer' };

// "Logged in as …" strip for a role page, with one-click switching.
// With no account chosen yet, it shows the account squares straight away.
export default function SessionBar({ role }) {
  const [open, setOpen] = useState(false);
  const id = getSession(role);
  const user = useLive(async () => (id && id !== UNREGISTERED ? (await db.users.get(id)) ?? null : null), [id]);

  const name = id === UNREGISTERED ? 'Unregistered number' : user?.name;
  const valid = id === UNREGISTERED || user;

  if (!id || (user === null && id !== UNREGISTERED) || open) {
    return (
      <div class="mb-6 rounded-xl border border-line bg-soft p-4">
        <div class="mb-3 flex items-center gap-2">
          <p class="text-sm font-medium">Choose a {NOUN[role]} account</p>
          {valid && <button type="button" onClick={() => setOpen(false)} class="ml-auto min-h-11 text-sm text-muted underline">Cancel</button>}
        </div>
        <AccountTiles role={role} limit={role === 'farmer' ? 6 : 0} />
      </div>
    );
  }

  return (
    <div class="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm">
      <span class="text-muted">Logged in as</span>
      <span class="font-semibold">{name ?? '…'}</span>
      <button type="button" onClick={() => setOpen(true)} class="ml-auto min-h-11 rounded-lg px-2 text-accent underline">
        Switch account
      </button>
    </div>
  );
}
