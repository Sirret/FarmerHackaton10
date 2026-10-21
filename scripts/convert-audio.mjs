// Converts voice recordings in public/audio/<lang>/ to small mp3s and moves the
// originals to audio-originals/<lang>/. Usage: npm run audio
import { readdirSync, existsSync, statSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, basename } from 'node:path';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = join(root, 'public', 'audio');
const ORIGINALS = join(root, 'audio-originals');
const EXTS = new Set(['.ogg', '.wav', '.m4a', '.webm', '.opus', '.aac']);
const MIN_BYTES = 1024;
const threshold = process.env.SILENCE_DB || '-45dB';

function findFfmpeg() {
  try {
    const p = createRequire(import.meta.url)('ffmpeg-static');
    if (p && existsSync(p)) return p;
  } catch { /* not installed */ }
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  return r.status === 0 ? 'ffmpeg' : null;
}

const ffmpeg = findFfmpeg();
if (!ffmpeg) {
  console.error('ffmpeg not found. Run `npm install` (installs ffmpeg-static) or install ffmpeg.');
  process.exit(1);
}

const trim = `silenceremove=start_periods=1:start_threshold=${threshold}:start_silence=0.05`;
const filter = `${trim},areverse,${trim},areverse,loudnorm=I=-16:TP=-1.5:LRA=11`;

function freeName(dir, file) {
  let target = join(dir, file);
  const ext = extname(file);
  const base = basename(file, ext);
  for (let n = 1; existsSync(target); n++) target = join(dir, `${base}-${n}${ext}`);
  return target;
}

let converted = 0, skipped = 0, failed = 0;
if (!existsSync(AUDIO)) {
  console.log('No public/audio folder; nothing to do.');
  process.exit(0);
}

for (const sub of readdirSync(AUDIO, { withFileTypes: true })) {
  if (!sub.isDirectory()) continue;
  const dir = join(AUDIO, sub.name);
  for (const file of readdirSync(dir)) {
    const ext = extname(file);
    if (!EXTS.has(ext.toLowerCase())) continue;
    const base = basename(file, ext);
    const label = `${sub.name}/${file}`;
    const mp3 = join(dir, `${base}.mp3`);
    if (existsSync(mp3)) { skipped++; console.log(`skip     ${label} (mp3 exists)`); continue; }
    const tmp = join(dir, `${base}.converting.tmp.mp3`);
    const r = spawnSync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-i', join(dir, file),
      '-af', filter, '-ac', '1', '-ar', '22050', '-c:a', 'libmp3lame', '-b:a', '64k',
      '-f', 'mp3', '-y', tmp,
    ], { encoding: 'utf8' });
    const size = existsSync(tmp) ? statSync(tmp).size : 0;
    if (r.status !== 0 || size <= MIN_BYTES) {
      failed++;
      if (existsSync(tmp)) unlinkSync(tmp); // our own temp file, never the original
      const why = r.status !== 0 ? (r.stderr || r.error?.message || 'ffmpeg error').trim().split('\n').pop() : `output too small (${size} bytes)`;
      console.log(`FAILED   ${label}: ${why}`);
      continue;
    }
    renameSync(tmp, mp3);
    const outDir = join(ORIGINALS, sub.name);
    mkdirSync(outDir, { recursive: true });
    const moved = freeName(outDir, file);
    renameSync(join(dir, file), moved);
    converted++;
    console.log(`convert  ${label} -> ${sub.name}/${base}.mp3 (${(size / 1024).toFixed(1)} KB), original -> audio-originals/${sub.name}/${basename(moved)}`);
  }
}

console.log(`\nconverted ${converted}, skipped ${skipped}, failed ${failed}`);
