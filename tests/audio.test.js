// Audio engine: pure parts (URLs, item normalisation, fallback grouping, voice choice).
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/data/ivr/clips.json', () => ({
  default: [
    { id: 'greet_hello', group: 'greet', en_script: 'Hello', priority: 1, scripts: { wo: 'Salaam aleekum' }, note: '' },
    { id: 'greet_from_kafo', en_script: 'from', starter: true, langs_done: [] }, // old shape
    { id: 'menu_main', en_script: 'For what to plant, press 1.', scripts: {} },
    { id: 'num_17', en_script: 'seventeen', scripts: { wo: 'fukk ak juróom ñaar' } },
  ],
}));

const {
  EXTENSIONS, clipUrls, normalizeItem, groupFallbacks, wordWaitMs, clampRate, pickVoice,
} = await import('../src/lib/audio.js');

describe('clipUrls', () => {
  it('lists one URL per extension, in order', () => {
    expect(EXTENSIONS).toEqual(['mp3', 'ogg', 'm4a', 'wav', 'webm']);
    expect(clipUrls('mnk/greet_hello', '/FarmerHackaton10/')).toEqual(
      EXTENSIONS.map((e) => `/FarmerHackaton10/audio/mnk/greet_hello.${e}`),
    );
  });
  it('handles base with or without trailing slash, and root base', () => {
    expect(clipUrls('wo/x', '/FarmerHackaton10')[0]).toBe('/FarmerHackaton10/audio/wo/x.mp3');
    expect(clipUrls('wo/x', '/')[0]).toBe('/audio/wo/x.mp3');
    expect(clipUrls('wo/x', '')[0]).toBe('/audio/wo/x.mp3');
  });
  it('builds names paths and never doubles slashes (except http://)', () => {
    const urls = clipUrls('names/farmer_awa', 'http://localhost:4321/FarmerHackaton10/');
    expect(urls[0]).toBe('http://localhost:4321/FarmerHackaton10/audio/names/farmer_awa.mp3');
    for (const u of urls) expect(u.replace('http://', '')).not.toContain('//');
  });
});

describe('normalizeItem', () => {
  it('string id → clip in the language folder with local + English text', () => {
    expect(normalizeItem('greet_hello', 'wo')).toEqual({
      id: 'greet_hello', paths: ['wo/greet_hello'], text: 'Salaam aleekum', textEn: 'Hello', kind: 'clip',
    });
  });
  it('old-shape entry and missing translation → text null', () => {
    expect(normalizeItem('greet_from_kafo', 'wo')).toMatchObject({ text: null, textEn: 'from' });
    expect(normalizeItem('menu_main', 'mnk').text).toBeNull();
  });
  it('unknown id → textEn null', () => {
    expect(normalizeItem('nope_nothing', 'ff')).toMatchObject({ paths: ['ff/nope_nothing'], text: null, textEn: null });
  });
  it('multi-file clip maps every file into the language folder', () => {
    const p = normalizeItem({ id: 'num_17', files: ['num_10', 'num_7'], textEn: '17' }, 'dyo');
    expect(p.paths).toEqual(['dyo/num_10', 'dyo/num_7']);
    expect(p.textEn).toBe('17');
    expect(p.kind).toBe('clip');
  });
  it('name object keeps its path with no language folder', () => {
    const p = normalizeItem({ kind: 'name', path: 'names/farmer_awa', text: 'Awa' }, 'wo');
    expect(p).toMatchObject({ paths: ['names/farmer_awa'], text: 'Awa', kind: 'name' });
  });
});

describe('groupFallbacks', () => {
  const P = (id, textEn, text = null, kind = 'clip') => ({ id, paths: [id], text, textEn, kind });
  it('merges consecutive missing pieces into one utterance', () => {
    const pieces = [P('a', 'Hello', 'Salaam'), P('b', 'from'), P('c', 'Kafo Signal.', 'Kafo')];
    const steps = groupFallbacks(pieces, [null, null, null]);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ type: 'speech', start: 0, textEn: 'Hello from Kafo Signal.', text: 'Salaam Kafo' });
    expect(steps[0].pieces).toHaveLength(3);
  });
  it('recorded pieces split speech groups', () => {
    const pieces = [P('a', 'one'), P('b', 'two'), P('c', 'three'), P('d', 'four')];
    const steps = groupFallbacks(pieces, [null, ['/a.mp3'], null, null]);
    expect(steps.map((s) => [s.type, s.start])).toEqual([['speech', 0], ['audio', 1], ['speech', 2]]);
    expect(steps[1].urls).toEqual(['/a.mp3']);
    expect(steps[2].textEn).toBe('three four');
    expect(steps[0].text).toBeNull();
  });
  it('a multi-file piece is audio only when all files were found', () => {
    const pieces = [P('n', 'seventeen')];
    expect(groupFallbacks(pieces, [['/10.mp3', null]])[0].type).toBe('speech');
    expect(groupFallbacks(pieces, [['/10.mp3', '/7.mp3']])[0].type).toBe('audio');
  });
  it('missing names stay in pieces but are not spoken and do not split the group', () => {
    const pieces = [P('a', 'Hello'), P('names/farmer_awa', 'Awa', 'Awa', 'name'), P('b', 'from'), P('x', null)];
    const steps = groupFallbacks(pieces, [null, null, null, null]);
    expect(steps).toHaveLength(1);
    expect(steps[0].pieces.map((p) => p.id)).toEqual(['a', 'names/farmer_awa', 'b', 'x']);
    expect(steps[0].textEn).toBe('Hello from');
  });
  it('a recorded name is an audio step', () => {
    const pieces = [P('a', 'Hello'), P('names/farmer_awa', 'Awa', 'Awa', 'name')];
    const steps = groupFallbacks(pieces, [null, ['/n.mp3']]);
    expect(steps.map((s) => s.type)).toEqual(['speech', 'audio']);
  });
});

describe('timing and rate', () => {
  it('wordWaitMs ≈ 300 ms per word, at least 300', () => {
    expect(wordWaitMs('')).toBe(300);
    expect(wordWaitMs('Hello')).toBe(300);
    expect(wordWaitMs('For what to plant press one')).toBe(1800);
  });
  it('clampRate keeps 0.8..2.0 and defaults to 1.35', () => {
    expect(clampRate(5)).toBe(2);
    expect(clampRate(0.1)).toBe(0.8);
    expect(clampRate('1.5')).toBe(1.5);
    expect(clampRate(undefined)).toBe(1.35);
    expect(clampRate(null)).toBe(1.35);
    expect(clampRate('abc')).toBe(1.35);
  });
});

describe('pickVoice', () => {
  const v = (name, lang) => ({ name, lang });
  it('prefers Google UK English, then Natural, then Online, among en-GB/en-US', () => {
    const fr = v('Google français', 'fr-FR');
    const plain = v('Daniel', 'en-GB');
    const online = v('Microsoft Libby Online', 'en-GB');
    const natural = v('Microsoft Aria Online (Natural)', 'en-US');
    const google = v('Google UK English Female', 'en-GB');
    expect(pickVoice([fr, plain, online, natural, google])).toBe(google);
    expect(pickVoice([fr, plain, online, natural])).toBe(natural);
    expect(pickVoice([fr, plain, online])).toBe(online);
  });
  it('ignores preferred names outside en-GB/en-US, falls back to first English voice', () => {
    const au = v('Natural Karen', 'en-AU');
    const plain = v('Daniel', 'en-GB');
    expect(pickVoice([v('Thomas', 'fr-FR'), au, plain])).toBe(au);
    expect(pickVoice([v('Natural Denise', 'fr-FR'), plain])).toBe(plain);
  });
  it('returns null with no English voice', () => {
    expect(pickVoice([v('Thomas', 'fr-FR')])).toBeNull();
    expect(pickVoice([])).toBeNull();
    expect(pickVoice(undefined)).toBeNull();
  });
});
