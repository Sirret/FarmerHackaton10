// Pure date helpers on ISO date strings ('2026-10-20'). All UTC (The Gambia is UTC+0).

const DAY_MS = 86_400_000;
const toMs = (date) => Date.parse(`${date.slice(0, 10)}T00:00:00Z`);

/** '2026-10-20' + 3 → '2026-10-23' */
export function addDays(date, days) {
  return new Date(toMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from a to b (b − a). Accepts dates or timestamps. */
export function daysBetween(a, b) {
  return Math.round((toMs(b) - toMs(a)) / DAY_MS);
}

/** Combine a demo date with a wall-clock time → ISO timestamp. */
export function atTime(date, time = new Date()) {
  return `${date.slice(0, 10)}T${time.toISOString().slice(11)}`;
}

/** '2026-10-20' → '20 Oct 2026' */
export function formatDate(date) {
  return new Date(toMs(date)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
