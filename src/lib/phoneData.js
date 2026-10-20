// Data for the farmer's basic phone, as one live snapshot.
import { db } from './db.js';
import { loadSignalData } from './signals.js';

/** Everything makeContext() in ussd.js needs, plus the phone's call log and SMS. */
export async function loadPhoneSnapshot() {
  const [data, users, farmers, buyers, deliveries, payments, calls, sms] = await Promise.all([
    loadSignalData(), db.users.toArray(), db.farmers.toArray(), db.buyers.toArray(),
    db.deliveries.toArray(), db.payments.toArray(), db.calls.toArray(), db.sms.toArray(),
  ]);
  if (!data.config) return null;
  return { ...data, users, farmers, buyers, deliveries, payments, calls, sms };
}
