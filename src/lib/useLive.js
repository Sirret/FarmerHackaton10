// Preact hook: re-runs a Dexie query whenever its data changes, in this tab or any other.
import { useEffect, useState } from 'preact/hooks';
import { liveQuery } from 'dexie';

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
    const sub = liveQuery(querier).subscribe({
      next: setValue,
      error: (err) => console.error('liveQuery failed', err),
    });
    return () => sub.unsubscribe();
  }, deps);
  return value;
}
