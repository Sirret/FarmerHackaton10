// 🔊 Reads a verdict aloud. Until the voice clips exist (Phase 8) it uses the
// browser's English text-to-speech; without speech support the button hides.
export default function AudioButton({ text, label = 'Listen' }) {
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  if (!canSpeak) return null;
  const speak = () => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    window.speechSynthesis.speak(u);
  };
  return (
    <button type="button" onClick={speak} aria-label={label} title={label}
      class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface hover:bg-soft">
      🔊
    </button>
  );
}
