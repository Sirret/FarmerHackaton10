# Kafo Signal

Hackathon prototype (UTG ITCA Hackathon 2026, Challenge 02). A decision tool for women's vegetable garden groups (kafos) around Brikama, The Gambia. It gives green / yellow / red signals for **what to plant**, **where to sell** and **what risk is coming**. Four roles: farmer (basic-phone simulator), kafo leader (smartphone app), buyer (website), admin (website). Everything runs in the browser; there is no backend.

## Sources of truth (read before working)
- `spec/spec.md`: the product spec. **If anything disagrees with it, the spec wins.**
- `spec/data-dictionary.md`: every table, field and enum. Use **exactly** these names. A schema change updates this file in the same commit.
- `spec/build-plan.md`: the phases, each with a "Done when" list.
- `docs/`: local-only reference PDFs (gitignored). Don't commit them.

## Commands
- `npm run dev`: dev server at `http://localhost:4321/FarmerHackaton10/`
- `npm run build` / `npm run preview`: static build, previewed under the Pages base path
- `npm test`: Vitest (pure logic in `src/lib/`, tests in `tests/`)

## Stack
Astro (static output) · Tailwind CSS v4 (`@tailwindcss/vite`, no config file) · Preact islands (`@astrojs/preact`) · Dexie (IndexedDB, `liveQuery` for cross-tab updates) · Vitest. Deployed to GitHub Pages by `.github/workflows/deploy.yml` on push to `main`.

`base` is `/FarmerHackaton10`. **Every internal link and asset path goes through `href()` from `src/lib/url.js`** (or `import.meta.env.BASE_URL`). Never write a bare `/kafo` or `/audio/...`.

## Hard rules
- **Colours:** only theme token classes (`bg-go`, `text-ink`, `border-line`, `bg-lcd`, …) defined in `src/styles/theme.css`, which is the only file with hex values. Signal → classes only via `signalStyle()` in `src/lib/signalStyle.js`. The `none` signal uses the **`stale`** token (`bg-stale`), because Tailwind already has `bg-none` and `border-none` utilities.
- **Before each commit**, both searches must return nothing in `src/components` and `src/pages`:
  `#[0-9a-fA-F]{3,6}` and `-(red|green|yellow|emerald|amber|gray|slate)-[0-9]`
- **Styling:** Tailwind utilities only. No per-component CSS, no `@apply`, no inline `style=""` except dynamic widths. Repeated class groups become small components (`Button`, `Card`, `SignalBadge` in `src/components/shared/`). The kafo app is designed at 390 px wide; buyer and admin sites work from 360 px up.
- **Text:** never hard-code menu, SMS or voice text in components. It lives in `src/data/i18n.json`, `ussd/menu.json`, `ivr/flow.json`, `ivr/clips.json`. Languages: `en | mnk | wo | ff | dyo`.
- **Signals:** all logic in `src/lib/rules.js` (pure, returns `green|yellow|red|none`, never classes). Components call it plus `render(signal, channel, lang)`.
- **Time:** use `clock.now()` (demo clock), never `new Date()` directly for app logic.
- **Permissions:** only leaders (and admin) write plantings, order acceptances and produce offers. Farmers create only requests and reports. Unverified reports can raise risk only to yellow.
- **Basic phone:** no colour or special symbols on the screen. SMS ≤160 chars, plain Latin letters (ng/ny instead of ŋ/ñ).
- **Data conventions:** prefixed string IDs (`kafo_brikama`), ISO dates, money as whole dalasi, weights as whole kg. Demo prices are labelled "demo data".
- **Dependencies:** ask before adding anything not listed in the stack.

## Workflow
- Build one phase at a time from `spec/build-plan.md`. Check every "Done when" item, then commit `phase N: <title>`.
- After each phase, update `README.md` (how to run, what works) and the status below.

## Data layer
- `src/lib/db.js`: Dexie schema (copied from the dictionary), JSDoc typedefs per table, `seedIfEmpty()`, `resetDemo()`, `newId(prefix)`. `Base.astro` seeds on every page load and wires the Reset button.
- `src/data/seed/*.json`: one file per table; `users.json` holds every role. **Bump `config.seed_version` whenever seed files change**, or browsers that already visited keep the old data. The seed is **tuned** for the demo story: Kombo Central (Brikama + Kembujeh) starts at tomato 1.90 (red), onion 1.00 (yellow), pepper 0.40, okra 0.66 (green); accepting the 150 kg okra order → ≈1.0. Pepper sells best in Serekunda, OK in Brikama, avoid Sukuta. Banjul okra is the one stale price. `tests/demo-scenario.test.js` acts out the demo on the seed; rerun it after editing seed data.
- `src/lib/clock.js`: `today()`, `now()`, `jump(days)` (async, read `config.demo_date`). Pure date helpers live in `src/lib/dates.js`.
- Preact islands read data with `useLive(querier, deps, initial)` from `src/lib/useLive.js` (waits for `ready()` seeding, then Dexie `liveQuery`, syncs across tabs). Mount DB islands with `client:only="preact"` (IndexedDB doesn't exist at build time).

## Writes, notifications, logins
- **All writes go through `src/lib/actions.js`** (registerKafo, setBuyerStatus, savePrices, saveTransport, createAlert, endAlert, callFarmersWithAlert, createReport, postOrder, jumpDemo, demo* helpers). Components never write tables directly, so a farmer USSD report, a leader report and a demo button run the same validation, SMS triggers and audit row. Add new writes there.
- `src/lib/notify.js`: `sendSms(userId, templateKey, vars | (lang) => vars)` → `sms` table; `placeOutboundCall` → `calls`. Pure helpers `smsBody`, `alertSmsVars`, `farmersIn` are unit tested; `tests/notify.test.js` checks every `sms.*` template fits 160 plain-Latin chars.
- Dexie gotchas: inside `db.transaction(...)` only touch the listed tables; `now()` reads `config`, so compute timestamps before the transaction (see `audit(..., at)`). Booleans are not valid IndexedDB keys, so never query `verified`/`read` through `where()`; use `.filter()`.
- Forms: update state with `setForm((f) => ({ ...f, [k]: v }))`, never from the render closure. Buttons use `useAction()` (`src/components/ui/useAction.js`) + `<Notice>`; when the item disappears after the action (accepted order, merged request), keep the notice in the parent list.
- Leader writes call `assertLeader(userId, kafoId)` inside the action (own kafo's leader or admin only). Data-quality checks are pure in `src/lib/quality.js`; actions write `flags` rows.

## Kafo leader app (`/kafo`)
- `KafoApp.jsx` reads `getSession('leader')` and one live snapshot from `loadKafoView(kafoId)` (`src/lib/kafoView.js`: signals, open orders with `fairPriceSignal`, our orders, plantings, members, inbox, alerts). Screens get `{ view, leaderId, go, preset }`; `go('plant', { crop, member })` opens a tab with a preset.
- Inbox = new `interests` + `produce_requests` (grouped by crop: tick, correct kg, merge) + unchecked reports + open orders not yet accepted.
- Inbox also shows spot requests (a buyer wants one of our offers) → `confirmSpotSale` / `declineSpotSale`.
- `interests` table was added in Dexie schema v2 (dictionary updated).

## Buyer website (`/buyer`)
- `BuyerApp.jsx` (tabs in the URL hash: outlook, post, market, orders) reads `getSession('buyer')` and `loadBuyerView(userId)` (`src/lib/buyerView.js`). **Privacy:** buyers get kafo-level data only (name, district, verified leader, reliability %); the loader strips member IDs, never returns farmer names or phones.
- Pure helpers in `src/lib/orders.js` (tested): `orderStage` (Growing/Ready derived from linked plantings), `memberPayouts` (kg × price × accepted ÷ weighed; fee charged to the buyer on top), `kafoReliability`, `weeklyOutlook`.
- Actions: `postOrder(buyerId, f, userId)`, `cancelOrder` (open + nothing accepted), `buyOffer` (spot order, leader confirms), `confirmCollection`, `payCollection` (one `payments` row per member with `collection_id`, PAID SMS each, order → `paid` when every committed kafo is paid; blocked while a dispute is open), `reportIssue` (buyer or leader on the order).
- Unverified or suspended buyers can browse but `assertBuyer` blocks writes; the Post order tab shows "Awaiting verification".
- `loginAs` reloads when already on the role page, so every island switches account.

## Farmer phone (`/farmer`)
- `FarmerSim.jsx` = phone + demo side panel (holder dropdown incl. "Unregistered number" 7999999, quick-dial, language override, subtitles toggle for Phase 8). `BasicPhone.jsx` = drawn handset; apps Home / Phone (dial + recent calls) / Messages (Phase 7); End always returns Home; physical keyboard works.
- **USSD is data-driven**: screens, keys and routing in `src/data/ussd/menu.json`; words in `i18n.json` (`ussd.*`, `phone.*`); `src/lib/ussd.js` is pure (`makeContext(snapshot, userId, lang)`, `startSession`, `renderScreen` → plain-Latin lines, `reply(state, key, ctx)` → `{ state, effect }`). The phone runs effects through `actions.js` (`createInterest`, `createProduceRequest`, `createReport`, `setFarmerAlerts`, `createLead`, `placeOutboundCall`). To change a menu, edit menu.json; add a named builder in ussd.js only for dynamic text.
- **Crop order is fixed by `crop_calendar.sort_order`** (USSD keys depend on it). IndexedDB returns rows alphabetically, so always sort with `sortCrops` (`src/lib/crops.js`); `loadSignalData` and `makeContext` already do.
- Final USSD screens accept only `00` (no double submit). Shared phones (same number, `shared_phone_slot`) get a "Who is using the phone?" screen. 120 s idle ends the session.
- Preact `useEffect` waits for an animation frame (paused in background tabs); use `useLayoutEffect` for state that must apply immediately.
- Messages app: Inbox (one thread from 1234, unread count, preview) → thread (oldest → newest, opens at the newest, up/down scroll, 0 back). Opening it calls `markSmsRead(userId)`. A new SMS shows a "1 new message - 1234" banner over any screen for 5 s (OK opens the thread); while the thread is open it is just marked read. Basic-phone text uses "-" not "·" (no special symbols; `tests/ussd.test.js` checks every `phone.*` / `ussd.*` string is ASCII).
- **Clip list**: `docs/clips.csv` is the single source of truth (the only tracked file in docs/). `npm run clips:build` regenerates `src/data/ivr/clips.json` (`{ id, group, en_script, priority, scripts, note }`). Only use clip ids that exist there; `tests/ivr.test.js` walks every reachable node and fails on unknown ids.
- **Voice (IVR)**: nodes/keys in `src/data/ivr/flow.json` (main menu = chain menu_1_plant…menu_5_report, menu_9_repeat; greet; goodbye; alert_call_intro; welcome_call); `src/lib/ivr.js` is pure (`startCall`, `nodeClips`, `afterPlay`, `onSilence`, `pressKey`, `numberClips`) and reuses `makeContext` from ussd.js. Numbers not recorded as one clip become one multi-file item `{ id, files, textEn }`.
- **Playback**: `src/lib/audio.js` (`playChain(items, { lang, onSubtitle })`, `stop()`, `unlock()`, speech toggle + rate 0.8–2.0 default 1.35 in localStorage `ks.speech.*`). Tries `audio/{farmer lang}/{clip}` as mp3, ogg, m4a, wav, webm (BASE_URL-relative), else subtitle + English speech (consecutive unrecorded pieces are one utterance); missing name clips are skipped silently. Missing clips are normal: never log or list them. Call `unlock()` synchronously in the click that starts audio (Answer, 🔊). `localStorage ks.voice.fast = "1"` skips audio (browser tests).
- `src/components/farmer/useVoiceCall.js`: rings for new `calls` rows with status `ringing` for this handset (callback after ~5.5 s, alert/welcome ~1 s), answer/decline (→ `missed`), hang-up (→ `ended`), runs nodes through `audio.js`, keys `stop()` playback at once, 8 s silence → replay once → goodbye. Recording/beep still come from `voicePlayer.js` (its playback code is no longer used). Unknown numbers ring back locally (no call row).
- Kafo 🔊 (`AudioButton.jsx`) plays `render(…, 'voice', leader.language)` for plant + sell + risk through the same engine. The buyer site has no audio.
- **Recordings**: drop files in `public/audio/{lang}/` or `public/audio/names/`; `npm run audio` (ffmpeg-static) converts to mono 22.05 kHz 64 kbps mp3, trims silence, normalises loudness, and moves originals to `audio-originals/` (repo root, not published).
- SMS triggers (all through `sendSms`): welcome (addMember), produce confirmed (confirmProduce), order taken (confirmSpotSale + logPlanting with an `order_id`, to the planting's members), pest WATCH OUT (createReport, first green → yellow), admin alert (createAlert), PAID (payCollection). Farmer-side writers `createInterest` / `createProduceRequest` already exist in actions.js for Phase 6; the admin Demo tab has buttons that call them.
- Demo login: `src/lib/session.js` (`getSession(role)`, `loginAs(role, id)`, localStorage). `AccountTiles` shows click-to-login squares (live from the DB, so new kafos/buyers appear at once) on the home page; `SessionBar` on each role page shows "Logged in as" + switch. Admin has no login. Phone numbers are fake 7-digit demo numbers; nothing is ever sent.

## Signal engine
- `src/lib/rules.js` is pure: `plantSignal`, `sellSignal`, `riskSignal` take `{ crop, district | fromTown, kafoId, today, data }` and return `{ signal, reason, numbers }`. `src/lib/signals.js` loads the data snapshot from Dexie (`loadSignalData`, `kafoSignals(kafoId)`).
- **Plant horizon is per crop**: today → today + `days_to_harvest` + `harvest_days`, so a planting logged today always counts. Accepted order kg counts as supply until plantings with that `order_id` are logged (no double counting). Orders add demand in a district only for kg committed there plus kg nobody has committed yet.
- **Sell**: latest price − transport (cost per bag ÷ `unit_kg.bag`) vs the 4-week average across all markets; thresholds `sell_green_above` / `sell_red_below`. Confirmed orders are listed first and always green.
- **Risk**: alerts set their own level and count from `alert_lead_days` before they start ("heavy rain in 2 days" shows ACT NOW now); ≥ `report_count` unverified reports → yellow only; red needs ≥1 verified report among ≥ `report_count`.
- `src/lib/render.js`: `render(signal, 'tile' | 'ussd' | 'voice', lang, { kind, crop, reason })`. Words come from `src/data/i18n.json` (English only so far; other languages fall back to English until the team adds translations).
- `jumpDemo(days)` carries current prices forward to the new date (stale ones stay stale), so "where to sell" keeps working after a jump.

## Status
- Phase 0 (setup & shell): done.
- Phase 1 (data layer, seed, demo clock): done. Header shows the live demo date.
- Phase 2 (colour engine + render): done.
- Phase 3 (admin website): done. Tabs: Overview (counts, kafos under alert, live Signals with a "+10 beds" test button), Register (kafo + leader, buyer verify/suspend), Prices & transport, Alerts (template form, active list, call farmers, SMS log), Demo (scenario buttons + table counts). Home page has click-to-login account squares.
- Phase 4 (kafo leader app): done. Home (signal tiles + 🔊 browser speech, to-do inbox, upcoming harvests), Plant (auto-filled log, stages, lost some/all, capacity flag), Sell (orders with fair-price verdict, accept full/part, weighed delivery per member, our offers), Members (add → welcome SMS + call; delivered kg, paid), Alerts (area alerts, confirm/dismiss reports), Profile.
- Phase 5 (buyer website): done. Outlook (8-week harvest bars by crop, area filter, my orders with fill bars), Post order (market reference, fair-price check, fee preview, verification gate), Market (buy confirmed offers), My orders (stage steps, kafos with reliability, confirm collection, mock pay per member, cancel, report issue).
- Phase 6 (farmer phone + USSD *1234#): done. All spec §9.2 screens; *4321# shows "will call you now" and logs a `callback` call (ringing/IVR is Phase 8).
- Phase 7 (Messages + notifications): done.
- Phase 8 (voice line *4321#): done. Spec §9.7 Wolof path runs end to end; dropping `public/audio/wo/greet_hello.mp3` is picked up with no code change (checked).
- Phase 9 (end-to-end demo, polish, deploy): done. The full plan §9.1 story runs twice in a row after Reset on the live URL in a fresh browser. `/about` has the pitch and the 3-minute demo script. Demo buttons only disable themselves while running. A database-blocked banner shows if IndexedDB is unavailable. All pages fit 360 px; kafo-app tap targets are ≥ 44 px.
- Phase 10 (stretch): done. Admin tabs Leads (work a lead, "Register their kafo" opens `#register?phone=…&lead=…` pre-filled and closes the lead), Quality (report queue >48 h with verify/dismiss/escalate, data-quality flags approve/correct kg, disputes resolve → payment released), Money (paid orders, platform fee, buyers paying on time); Overview shows the audit log. Reliability: `buyerReliability` / `kafoReliability` in orders.js. Repeat weekly orders re-post themselves when paid; delivery fee is split to members by kg (`memberPayouts`). Leader broadcast SMS (`sms.broadcast`). Kafo app header shows "Saved ✓" / "Offline · waiting to send". Real weather: `npm run weather` caches Open-Meteo into `src/data/weather.json` (shown on Admin → Alerts; ≥30 mm/day offers to pre-fill a heavy-rain alert).
- Voice files may be `.mp3` or `.ogg` (player tries mp3 then ogg); mp3 is safest because iPhone Safari can't play ogg.
- Browser tests (scratchpad CDP scripts) must wait for confirmations, not fixed sleeps: the machine can be slow (OneDrive), and fixed waits gave false failures.
