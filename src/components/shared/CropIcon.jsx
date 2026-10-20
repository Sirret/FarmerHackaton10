// Crop pictures for the kafo app (smartphone, so emoji render). New crops fall back to a sprout.
const ICONS = { tomato: '🍅', onion: '🧅', pepper: '🌶️', okra: '🫛' };

export default function CropIcon({ crop, size = 'text-2xl' }) {
  return <span class={size} aria-hidden="true">{ICONS[crop] ?? '🌱'}</span>;
}
