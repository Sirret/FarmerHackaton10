import { useState } from 'preact/hooks';
import clips from '../../data/ivr/clips.json';
import { LANGS, t } from '../../lib/i18n.js';
import { missingClips, clearMissingClips } from '../../lib/voicePlayer.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';

// Recording checklist (spec §9.6): what to record, and which clips calls in this browser
// had to replace with text-to-speech. Recordings go in public/audio/{lang}/{clip_id}.mp3.
export default function VoiceClips() {
  const [missing, setMissing] = useState(missingClips);
  const [showAll, setShowAll] = useState(false);
  const starter = clips.filter((c) => c.starter);
  const byLang = Object.fromEntries(LANGS.map((l) => [l, missing.filter((m) => m.startsWith(`${l}/`)).map((m) => m.slice(l.length + 1))]));
  const names = missing.filter((m) => m.startsWith('names/'));
  const list = showAll ? clips : starter;

  return (
    <Card
      title="Voice clips"
      actions={<>
        <Button variant="ghost" onClick={() => setMissing(missingClips())}>Refresh</Button>
        <Button variant="ghost" onClick={() => { clearMissingClips(); setMissing([]); }}>Clear list</Button>
      </>}
    >
      <p class="mb-3 text-sm text-muted">
        {clips.length} clips in the recording guide ({starter.length} starter clips for the Wolof demo). Save each as
        <code class="mx-1 rounded bg-soft px-1">public/audio/&#123;lang&#125;/&#123;clip_id&#125;.mp3</code>
        (names in <code class="rounded bg-soft px-1">public/audio/names/</code>); calls pick them up on the next page load. Until then calls play English or read the script aloud.
      </p>
      <div class="mb-3 grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
        {LANGS.map((l) => (
          <div class="rounded-lg bg-soft px-3 py-2">
            <p class="font-medium">{t(`lang.${l}`)}</p>
            <p class="text-xs text-muted">{byLang[l].length ? `${byLang[l].length} missing in calls` : 'none missing in calls yet'}</p>
          </div>
        ))}
        <div class="rounded-lg bg-soft px-3 py-2">
          <p class="font-medium">Names</p>
          <p class="text-xs text-muted">{names.length ? `${names.length} missing` : 'none missing in calls yet'}</p>
        </div>
      </div>
      {missing.length > 0 && (
        <details class="mb-3 text-sm">
          <summary class="min-h-11 cursor-pointer py-2 font-medium">Missing in calls so far ({missing.length})</summary>
          <p class="font-mono text-xs leading-relaxed">{missing.join(' · ')}</p>
        </details>
      )}
      <details class="text-sm">
        <summary class="min-h-11 cursor-pointer py-2 font-medium">Recording guide: what to say</summary>
        <ul class="max-h-72 divide-y divide-line overflow-y-auto">
          {list.map((c) => (
            <li class="flex gap-3 py-1.5">
              <code class="w-44 shrink-0 text-xs">{c.id}</code>
              <span class="text-xs">{c.en_script}</span>
            </li>
          ))}
        </ul>
        <Button variant="ghost" class="mt-2" onClick={() => setShowAll(!showAll)}>{showAll ? 'Starter clips only' : `Show all ${clips.length}`}</Button>
      </details>
    </Card>
  );
}
