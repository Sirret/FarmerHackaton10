import { useState } from 'preact/hooks';
import { LANGS, t } from '../../lib/i18n.js';
import { loadPhoneSnapshot } from '../../lib/phoneData.js';
import { getSession, setSession, UNREGISTERED } from '../../lib/session.js';
import { useLive } from '../../lib/useLive.js';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import { Field, Select } from '../ui/Field.jsx';
import BasicPhone from './BasicPhone.jsx';

const DEMO = ['user_awa', 'user_binta'];

// /farmer: the basic phone in the middle and the demo controls beside it (spec §9.1).
export default function FarmerSim() {
  const snap = useLive(loadPhoneSnapshot);
  const [userId, setUserId] = useState(() => getSession('farmer') || 'user_awa');
  const [lang, setLang] = useState('');
  const [subtitles, setSubtitles] = useState(true);
  const [dialRequest, setDialRequest] = useState(null);
  const [voiceNote, setVoiceNote] = useState(null); // { clips, index } while a voice note plays

  if (!snap) return <p class="text-sm text-muted">Loading…</p>;

  const farmers = snap.users
    .filter((u) => u.role === 'farmer' && u.phone)
    .sort((a, b) => Number(DEMO.includes(b.id)) - Number(DEMO.includes(a.id)) || a.name.localeCompare(b.name));
  const holder = snap.users.find((u) => u.id === userId);
  const choose = (id) => { setUserId(id); setSession('farmer', id); };
  const quick = (code) => setDialRequest({ code, n: Date.now() });

  return (
    <div class="grid items-start gap-6 lg:grid-cols-[1fr_auto_1fr]">
      <div class="hidden lg:block"></div>
      <div>
        <BasicPhone snap={snap} userId={userId} lang={lang || null} dialRequest={dialRequest} onSubtitle={setVoiceNote} />
        <p class="mt-3 text-center text-xs text-muted">Keyboard works too: digits, * #, Enter = OK/Call, Esc = End.</p>
        {subtitles && voiceNote && <Subtitles note={voiceNote} lang={lang || holder?.language || 'en'} />}
      </div>

      <Card title="Demo controls" class="w-full lg:max-w-xs">
        <div class="space-y-4 text-sm">
          <Field label="Who is using the phone">
            <Select value={userId} onChange={(e) => choose(e.currentTarget.value)} options={[
              ...farmers.map((u) => ({ value: u.id, label: `${u.name} · ${t(`lang.${u.language}`)} · ${u.phone}` })),
              { value: UNREGISTERED, label: 'Unregistered number (7999999)' },
            ]} />
          </Field>
          {holder && <p class="text-xs text-muted">{holder.name}'s phone. Numbers are made up for the demo.</p>}

          <div>
            <p class="mb-1 font-medium">Quick dial</p>
            <div class="flex gap-2">
              <Button variant="ghost" onClick={() => quick('*1234#')}>*1234#</Button>
              <Button variant="ghost" onClick={() => quick('*4321#')}>*4321#</Button>
            </div>
            <p class="mt-1 text-xs text-muted">Types the code; press the green CALL key. *1234# = text menu, *4321# = voice call-back.</p>
          </div>

          <Field label="Language" hint="Screens show English until the team adds Mandinka, Wolof, Fula and Jola text to i18n.json.">
            <Select value={lang} onChange={(e) => setLang(e.currentTarget.value)} options={[
              { value: '', label: 'Farmer’s own language' }, ...LANGS.map((l) => ({ value: l, label: t(`lang.${l}`) })),
            ]} />
          </Field>

          <label class="flex min-h-11 items-center gap-2">
            <input type="checkbox" class="h-5 w-5" checked={subtitles} onChange={(e) => setSubtitles(e.currentTarget.checked)} />
            Subtitles for voice calls
          </label>
          <p class="-mt-3 text-xs text-muted">Shows the words of each voice note under the phone during *4321# calls.</p>
        </div>
      </Card>
    </div>
  );
}

/** Words of the voice note playing (spec §9.1 subtitles), current clip highlighted. */
function Subtitles({ note, lang }) {
  const { clips, index } = note;
  const translated = clips.some((c) => c.text !== c.textEn);
  return (
    <div class="mx-auto mt-3 w-75 rounded-xl border border-line bg-surface p-3 text-sm shadow-sm" aria-live="polite" data-subtitles>
      <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">🔊 4321 Kafo Signal · {t(`lang.${lang}`)}</p>
      <p>{clips.map((c, i) => <span class={i === index ? 'rounded bg-soft font-semibold' : i < index ? 'text-ink' : 'text-muted'}>{c.text} </span>)}</p>
      {translated && <p class="mt-1 text-xs text-muted">EN: {clips.map((c) => c.textEn).join(' ')}</p>}
      {!translated && lang !== 'en' && <p class="mt-1 text-xs text-muted">{t(`lang.${lang}`)} text not added yet, so subtitles show English. Clips recorded in public/audio/{lang}/ play in {t(`lang.${lang}`)}; the rest play in English.</p>}
    </div>
  );
}
