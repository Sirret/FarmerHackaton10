import { useState } from 'preact/hooks';
import clips from '../../data/ivr/clips.json';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';

// Recording guide (spec §9.6), generated from docs/clips.csv (`npm run clips:build`).
// Unrecorded clips are normal: calls show the words and read the English aloud.
export default function VoiceClips() {
  const [showAll, setShowAll] = useState(false);
  const first = clips.filter((c) => c.priority === 1);
  const list = showAll ? clips : first;

  return (
    <Card title="Voice clips: recording guide">
      <p class="mb-3 text-sm text-muted">
        {clips.length} clips in docs/clips.csv ({first.length} to record first). Save each as
        <code class="mx-1 break-all rounded bg-soft px-1">{'public/audio/{lang}/{clip_id}.mp3'}</code>
        (ogg, m4a, wav and webm also work; run <code class="rounded bg-soft px-1">npm run audio</code> to convert them to small mp3s).
        Names go in <code class="break-all rounded bg-soft px-1">public/audio/names/</code>. Anything not recorded yet is shown as text and read in English during calls.
      </p>
      <details class="text-sm">
        <summary class="min-h-11 cursor-pointer py-2 font-medium">What to say</summary>
        <ul class="max-h-72 divide-y divide-line overflow-y-auto">
          {list.map((c) => (
            <li class="flex gap-3 py-1.5">
              <code class="w-44 shrink-0 text-xs">{c.id}</code>
              <span class="text-xs">{c.en_script}</span>
            </li>
          ))}
        </ul>
        <Button variant="ghost" class="mt-2" onClick={() => setShowAll(!showAll)}>{showAll ? 'Record-first clips only' : `Show all ${clips.length}`}</Button>
      </details>
    </Card>
  );
}
