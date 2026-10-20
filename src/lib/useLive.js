// Preact hook: re-runs a Dexie query whenever its data changes, in this tab or any other.
import { useEffect, useState } from 'preact/hooks';
import { liveQuery } from 'dexie';
import { ready } from './db.js';

/**
 * @template T
 * @param {() => Promise<T>} querier
 * @param {unknown[]} [deps]
 * @param {T} [initial]
 * @returns {T}
 */
export function useLive(querier, deps = [], initial = undefined) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    // Wait for seeding so a stale copy of the data never flashes on screen.
    let sub;
    let cancelled = false;
    ready().then(() => {
      if (cancelled) return;
      sub = liveQuery(querier).subscribe({
        next: setValue,
        error: (err) => console.error('liveQuery failed', err),
      });
    });
    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  }, deps);
  return value;
}
