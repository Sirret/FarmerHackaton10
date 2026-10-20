// Caches a real 7-day forecast for the kafo area from Open-Meteo (free, no key) into
// src/data/weather.json. The app reads only the JSON, so the demo never depends on the network.
// Usage: npm run weather
import { writeFileSync } from 'node:fs';

const PLACES = [
  { name: 'Brikama', district: 'Kombo Central', lat: 13.271, lng: -16.649 },
  { name: 'Gunjur', district: 'Kombo South', lat: 13.183, lng: -16.758 },
];

const out = { source: 'Open-Meteo (open-meteo.com)', fetched_at: new Date().toISOString(), places: [] };
for (const p of PLACES) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lng}`
    + '&daily=precipitation_sum,temperature_2m_max&forecast_days=7&timezone=Africa%2FBanjul';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status} for ${p.name}`);
  const { daily } = await res.json();
  out.places.push({
    ...p,
    days: daily.time.map((date, i) => ({ date, rain_mm: daily.precipitation_sum[i] ?? 0, tmax_c: daily.temperature_2m_max[i] })),
  });
}
writeFileSync(new URL('../src/data/weather.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(`Saved ${out.places.length} places × 7 days to src/data/weather.json`);
