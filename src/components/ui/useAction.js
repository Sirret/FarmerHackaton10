import { useState } from 'preact/hooks';

/**
 * Run an action and keep a success/error notice for <Notice>.
 * const [run, notice] = useAction();
 * run(() => acceptOrder(...), (row) => `Accepted ${row.kg_committed} kg`)
 */
export function useAction() {
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  async function run(fn, success) {
    setBusy(true);
    try {
      const result = await fn();
      const text = typeof success === 'function' ? success(result) : success;
      setNotice(text ? { text } : null);
      return result;
    } catch (err) {
      setNotice({ error: true, text: err.message });
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return [run, notice, busy, setNotice];
}
