// Demo clock. "Today" is config.demo_date, so the demo can jump forward in time.
// App code uses these instead of new Date().
import { db } from './db.js';
import { addDays, atTime } from './dates.js';

/** Current demo date, e.g. '2026-10-20'. */
export async function today() {
  const config = await db.config.get('main');
  return config.demo_date;
}

/** Current demo timestamp: the demo date plus the real time of day. */
export async function now() {
  return atTime(await today());
}

/** Move the demo date forward (or back with a negative number). Returns the new date. */
export async function jump(days) {
  return db.transaction('rw', db.config, async () => {
    const config = await db.config.get('main');
    const demo_date = addDays(config.demo_date, days);
    await db.config.update('main', { demo_date });
    return demo_date;
  });
}
