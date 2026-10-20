// The only place where signals meet colours. rules.js returns
// 'green' | 'yellow' | 'red' | 'none'; components call signalStyle(signal).
// Class names are written out in full so Tailwind can detect them.

const STYLES = {
  green: { bg: 'bg-go', ink: 'text-go-ink', soft: 'bg-go-soft', border: 'border-go', text: 'text-go', icon: '✓' },
  yellow: { bg: 'bg-careful', ink: 'text-careful-ink', soft: 'bg-careful-soft', border: 'border-careful', text: 'text-careful', icon: '!' },
  red: { bg: 'bg-stop', ink: 'text-stop-ink', soft: 'bg-stop-soft', border: 'border-stop', text: 'text-stop', icon: '✕' },
  none: { bg: 'bg-stale', ink: 'text-stale-ink', soft: 'bg-stale-soft', border: 'border-stale', text: 'text-stale', icon: '–' },
};

export const SIGNALS = Object.keys(STYLES);

/** @param {'green'|'yellow'|'red'|'none'} signal */
export function signalStyle(signal) {
  return STYLES[signal] ?? STYLES.none;
}
