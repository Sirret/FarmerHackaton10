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
- Forms: update state with `setForm((f) => ({ ...f, [k]: v }))`, never from the render closure.
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
- Next: Phase 4 (kafo leader app in the phone frame). Use `getSession('leader')` for the current leader and add its writes (log planting, accept order, confirm produce/reports, add member) to `actions.js`.
