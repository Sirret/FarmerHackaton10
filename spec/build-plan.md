# Kafo Signal: phase-by-phase build plan (for Claude Code)

## How to use this plan
- The full product spec is in **`spec/spec.md`**. Read it before starting. If this plan and the spec disagree, **the spec wins**.
- The database is defined in **`spec/data-dictionary.md`**. Use **exactly** those table names, field names and enums. Any schema change must update the dictionary in the same commit.
- Build **one phase at a time**. At the end of each phase: run the app, check every "Done when" item, then **commit** with message `phase N: <title>`.
- Do not start the next phase until the current phase's "Done when" list passes.
- Keep it **simple and demo-first**: no auth servers, no real SMS/USSD, no backend. Everything runs in the browser.
- Ask before adding any dependency not listed here.

## Fixed technical decisions
| Area | Decision |
|---|---|
| Framework | **Astro** (static output) + **Tailwind CSS** |
| Interactivity | **Preact islands** via `@astrojs/preact` (small, React-like) |
| Database | **Dexie (IndexedDB)** in the browser. Seed from JSON. Use `liveQuery` so changes in one tab show in other tabs (farmer, kafo, buyer, admin open side by side). |
| Tests | **Vitest** for `src/lib/rules.js` and other pure logic |
| Hosting | **GitHub Pages** via GitHub Actions; set `site` and `base` in `astro.config.mjs` (repo name as base). All internal links and asset paths must respect `import.meta.env.BASE_URL`. |
| Languages | `en`, `mnk` (Mandinka), `wo` (Wolof), `ff` (Fula), `dyo` (Jola) |
| Money | Dalasi (D). All prices in demo data are **labelled "demo data"** in the UI. |

## Styling: Tailwind only
- Install with `npx astro add tailwind` (**Tailwind CSS v4** via `@tailwindcss/vite`). No `tailwind.config.js` needed; the theme is defined in CSS.
- **All styling is Tailwind utility classes** in components. No separate per-component CSS files, no inline `style=""` (except dynamic widths like fill bars), no UI kits.
- The **only** CSS file with custom rules is `src/styles/theme.css` (colour tokens below) + `src/styles/global.css` (imports Tailwind and the theme, base font).
- Repeated class groups become small components (`<Button variant="go">`, `<Card>`, `<SignalBadge>`), not `@apply` blocks.
- Mobile-first: the kafo app is designed at 390 px wide; the buyer/admin sites are responsive from 360 px to desktop.

## Colour system: themeable (change colours in ONE file)
**Rule: components never use raw hex values or Tailwind palette colours** (no `bg-green-600`, no `#1f9d55`). They only use the **semantic token classes** below. To recolour the whole app, edit only `src/styles/theme.css`.

**How it works (Tailwind v4):** see `src/styles/theme.css` — (1) raw `--ks-*` values per `[data-theme]` block (the ONLY place hex codes live), (2) an `@theme inline` block mapping them to Tailwind token names.

This gives classes like `bg-go`, `text-go-ink`, `bg-careful-soft`, `border-line`, `bg-lcd`, `text-ink`, `bg-brand`.

**Token meanings:**
| Token | Used for |
|---|---|
| `go / careful / stop / stale` (+ `-ink` text on top, `-soft` light background) | Signals: green / yellow / red / none (no recent price). The `none` signal uses the `stale` token because Tailwind already has `bg-none` / `border-none` utilities. |
| `brand`, `brand-ink`, `accent` | Header, primary buttons, links |
| `ink`, `muted` | Main text, secondary text |
| `surface`, `page`, `soft`, `line` | Cards, page background, subtle panels, borders |
| `phone-*`, `lcd*`, `call-*` | Basic-phone simulator body, keys, screen, call buttons |

**Signals → classes in one place:** `src/lib/signalStyle.js` maps `green → { bg: 'bg-go', ink: 'text-go-ink', soft: 'bg-go-soft', border: 'border-go', icon: '✓' }` (and yellow → careful, red → stop, none → stale). Components call `signalStyle(signal)`; **no component decides colours itself**. `rules.js` returns only `green|yellow|red|none`, never class names or colours.

**Theme switching:** `config.theme` sets `<html data-theme="…">` on load. An optional Admin → Settings dropdown switches the theme live (`default`, `high-contrast`). Adding a new theme = add one `[data-theme="name"]` block in `theme.css`.

**Check before each commit:** search the codebase for `#[0-9a-fA-F]{3,6}` and `-(red|green|yellow|emerald|amber|gray|slate)-[0-9]` in `src/components` and `src/pages`. Both searches must return nothing.

## Target repo structure
```
FarmerHackaton10/
├─ spec/spec.md, spec/data-dictionary.md, spec/build-plan.md   # committed source of truth
├─ docs/                                   # local-only reference PDFs (gitignored)
├─ public/audio/{en,mnk,wo,ff,dyo}/        # voice-note mp3s (added later by the team)
├─ public/audio/names/                     # kafo & farmer name clips
├─ src/
│  ├─ layouts/Base.astro                   # shared shell + role switcher
│  ├─ pages/index.astro                    # landing: 4 role cards + "Reset demo"
│  ├─ pages/farmer.astro                   # basic-phone simulator
│  ├─ pages/kafo.astro                     # smartphone frame + leader app
│  ├─ pages/buyer.astro                    # buyer website
│  ├─ pages/admin.astro                    # admin website
│  ├─ components/
│  │  ├─ shared/      SignalBadge, CropIcon, PhoneFrame, AudioButton
│  │  ├─ farmer/      BasicPhone, HomeScreen, PhoneApp, UssdSession, MessagesApp, CallScreen
│  │  ├─ kafo/        Home, Plant, Sell, Members, Alerts, Profile, Inbox
│  │  ├─ buyer/       Outlook, PostOrder, Market, Orders, Collect, Payments, Profile
│  │  └─ admin/       Overview, Register, Leads, Data, Alerts, Quality, Money, Demo
│  ├─ styles/
│  │  ├─ theme.css        # ALL colour values + @theme token mapping (edit here to recolour)
│  │  └─ global.css       # @import "tailwindcss"; @import "./theme.css"; base font
│  ├─ lib/
│  │  ├─ signalStyle.js   # signal → token classes + icon (only place signals meet colours)
│  │  ├─ db.js            # Dexie schema (matches spec/data-dictionary.md), seed, reset
│  │  ├─ clock.js         # demo clock (current date from config, can jump forward)
│  │  ├─ rules.js         # PURE colour engine: plant / sell / risk → green|yellow|red + reason
│  │  ├─ render.js        # render(signal, channel, lang) → tile | ussd word | voice clips
│  │  ├─ i18n.js          # t(key, lang) using src/data/i18n.json
│  │  ├─ notify.js        # sendSms(), placeOutboundCall(), notifyLeader(), notifyBuyer()
│  │  ├─ ussd.js          # USSD state machine (driven by src/data/ussd/menu.json)
│  │  └─ ivr.js           # IVR state machine (driven by src/data/ivr/flow.json)
│  └─ data/
│     ├─ seed/            users.json, farmers.json, kafos.json, buyers.json, plantings.json,
│     │                   orders.json, prices.json, market_towns.json, transport_costs.json,
│     │                   crop_calendar.json, alerts.json, config.json
│     ├─ i18n.json
│     ├─ ussd/menu.json
│     └─ ivr/flow.json, clips.json
└─ tests/rules.test.js
```

---

## Phase 0: Project setup & shell
**Goal:** an empty but deployable app with the 4 role pages and a shared look.

Tasks:
1. Scaffold Astro, add Tailwind v4 (`npx astro add tailwind`), Preact integration, Dexie, Vitest.
2. Configure `astro.config.mjs` for static output + GitHub Pages `site`/`base`.
3. Create `src/styles/theme.css` **exactly as in the Colour system section** (raw values + `@theme inline` mapping + a `high-contrast` example theme), `global.css`, and `src/lib/signalStyle.js`. Font: Inter (fallback system sans).
4. Build a hidden `/styleguide` page that shows every token swatch, the 4 signal badges, buttons and cards, so a colour change can be checked at a glance.
5. Copy `spec/spec.md` and `spec/data-dictionary.md` into the repo.
6. `Base.astro` layout with a slim top **role switcher** (Farmer · Kafo leader · Buyer · Admin) and a **Reset demo** button (wired in Phase 1).
7. `index.astro`: 4 role cards with one-line descriptions.
8. Stub pages for `/farmer`, `/kafo`, `/buyer`, `/admin`.
9. `PhoneFrame` component (smartphone outline) used by `/kafo`. `/buyer` and `/admin` are normal full-width websites.
10. GitHub Actions workflow to build and deploy to Pages.

**Done when:**
- `npm run dev` shows all 4 pages and the role switcher works.
- Changing `--ks-go` in `theme.css` changes every green on `/styleguide`; setting `data-theme="high-contrast"` switches the whole palette.
- `npm run build` succeeds, and links work under the GitHub Pages base path (test with `npm run preview`).

---

## Phase 1: Data layer, seed data & demo clock
**Goal:** all tables exist, seeded with a believable Brikama-area demo world.

Tasks:
1. `db.js`: use the **Dexie schema string from `spec/data-dictionary.md`** exactly. Every table, field and enum must match the dictionary. Add JSDoc typedefs per table (copied from the dictionary) so editors autocomplete the fields.
2. Seed JSON:
   - **6 kafos** in West Coast Region villages (e.g. Brikama, Kembujeh, Sifoe, Gunjur, Busumbala, Kafuta), each with a 4-digit code, leader, total beds, lat/lng, market town.
   - **About 25 farmers** across the kafos, each with a language. Include **Awa (Mandinka, Brikama Women's Kafo)** and **Binta (Wolof)** as the demo farmers, plus one farmer with `has_phone: false`.
   - **Crops:** tomato, onion, pepper, okra in `crop_calendar.json` with `days_to_harvest`, `kg_per_bed`, `pest_risk_months`.
   - **Plantings** tuned so the Brikama district shows: tomato heavily planted (ratio ≈ 1.9 → red), onion medium (≈ 1.0 → yellow), pepper low (green), okra low (green).
   - **Buyers:** 1 verified hotel, 1 verified wholesaler, 1 pending school-feeding supplier.
   - **One open forward order:** 150 kg okra, delivery window ~10 weeks out, from the hotel.
   - **Prices:** weekly prices for 4 markets (Serekunda, Brikama, Sukuta, Banjul) × 4 crops for the last 5 weeks; one market/crop deliberately older than 14 days to show "no recent price".
   - **Transport costs:** per bag, village → market.
   - `config.json`: thresholds 0.8/1.3, baseline demand per crop, report_count 3, report_window_days 7, price_stale_days 14, fee_percent 2.5, demo date.
3. `seedIfEmpty()` on first load and `resetDemo()`, which wipes and reseeds; wire it to the Reset button.
4. `clock.js`: `now()` reads the demo date from config; `jump(days)` moves it forward.

**Done when:**
- First visit seeds the DB; Reset restores the original state.
- A change made in one tab appears in another tab without a refresh (liveQuery check).

---

## Phase 2: Colour engine (`rules.js`) + rendering
**Goal:** one pure, tested module that decides every signal.

Tasks:
1. `plantSignal(crop, district, db)` → `{signal, ratio, reason, numbers}`. Supply = sum of expected kg of plantings harvesting in the coming window (excluding lost kg); demand = open forward orders + baseline. Thresholds from config.
2. `sellSignal(crop, fromTown, db)` → per market: `(price − transport per kg)` vs the 4-week average; **a confirmed order is always green**; a stale price gives `"no_recent_price"`.
3. `riskSignal(crop, district, db)` → admin alerts + reports in the window. **Unverified reports can only raise the signal to yellow; red needs a verified report or an admin alert.**
4. `render(signal, channel, lang, context)`:
   - `tile` → colour class + icon (✓ ! ✕) + label
   - `ussd` → word: GOOD TO PLANT / CAREFUL / DON'T PLANT · BEST / OK / AVOID · ALL OK / WATCH OUT / ACT NOW (no colours, no special symbols)
   - `voice` → ordered list of clip IDs (e.g. `crop_okra, verdict_good_plant, why_buyer`)
5. Vitest tests covering every threshold boundary, stale price, the verified/unverified risk rule, and the confirmed-order override.

**Done when:** `npm test` passes, and seeded data gives tomato red, onion yellow, pepper and okra green for Brikama.

---

## Phase 3: Admin website (must-haves)
**Goal:** the admin can set up the world and drive the demo.

Tasks (spec §8):
1. **Register:** form to create a kafo + leader (contract ref, signed date, consent checkbox, beds, village, market town, GPS). Buyers list with **Verify / Suspend**.
2. **Data:** weekly price entry table (market × crop) with the staleness indicator; transport cost table.
3. **Alerts:** create an alert from a **template** (heavy rain, dry spell, pest outbreak, disease) with crops, districts, level and end date; active alerts list. Creating one calls `notify.js` to send SMS to affected farmers.
4. **Demo panel:** buttons for *Add 3 pest reports (okra, Brikama)* · *Trigger heavy rain in Brikama* · *Post buyer order* · *Call farmers with alert* · *Jump +8 weeks* · *Reset demo*.
5. **Overview:** counts (kafos, farmers, open orders, leads, flags).

**Done when:** each demo button visibly changes data, and alerts appear in the `sms` table.

---

## Phase 4: Kafo leader app (inside a phone frame)
**Goal:** the leader can do everything in spec §6 must-haves on a smartphone-sized screen.

Tasks:
1. `/kafo` shows a **smartphone frame** with the app inside; bottom tab bar: Home · Plant · Sell · Members · Alerts. Leader picker above the frame (demo).
2. **Home:** signal tiles per crop (Plant / Sell / Risk) with 🔊 `AudioButton`, a **To-do inbox** (produce requests, problem reports, new orders) with a badge count, and an upcoming-harvests list.
3. **Plant:** log planting by tapping a crop picture → beds → tick members → **auto-filled** harvest date + kg from the crop calendar (editable) → Save. The list shows stage controls **Planted → Growing → Ready → Harvested** and a **Lost some / all** button with a reason.
4. **Sell:** buyer orders as colour cards with a **fair-price verdict** → **Accept full / Accept partial (kg)**. "Our offers" from merged produce requests. Deliveries: enter **kg per member (weighed)** → Mark delivered.
5. **Inbox actions:** produce requests → Confirm / Edit / **Merge** / Reject; reports → Confirm (verified) / Dismiss.
6. **Members:** add member (name, phone, language, crop pictures, has phone) → triggers the welcome SMS + welcome call via `notify.js`. Member list with contributions and payments.
7. Every leader write stores `logged_by` and a timestamp; a data-quality flag is raised if kg exceeds bed capacity.

**Done when:** accepting the okra order turns okra to about 1.0 (yellow) for *other* kafos, and adding a member sends a welcome SMS to the `sms` table.

---

## Phase 5: Buyer website
**Goal:** buyers post demand and complete orders (buyer section defaults).

Tasks:
1. **Status gate:** a pending buyer can view the outlook but sees "Awaiting verification" instead of the order form.
2. **Home / Outlook:** next 8 weeks of expected harvest by crop as colour bars, area filter; "My orders" with a **fill bar** (e.g. 80 / 150 kg) and stage.
3. **Post order:** crop, kg, delivery window, price/kg (with the **market reference** shown beside it), grade A/B, pickup/delivery, repeat weekly (should-have) → fee preview (2.5%).
4. **Market:** confirmed kafo spot offers → **Buy** (the leader confirms).
5. **Orders:** status flow `Open → Partly filled → Filled → Growing → Ready → Collected → Paid`; Growing and Ready are derived from linked planting stages. Cancel is allowed only while Open. **Report issue** creates a dispute.
6. **Collect:** confirm accepted kg / rejected kg + reason → **Pay (mock Wave / QMoney / Afrimoney)** → creates a `payments` row **per member** proportional to their delivered kg → sends each member a PAID SMS.
7. Buyers **never see farmer names or phone numbers**, only kafo name, area, verified leader and reliability %.

**Done when:** the full okra order can go from posted to paid, and each contributing member receives a PAID SMS.

---

## Phase 6: Farmer phone: shell, Phone app, USSD `*1234#`
**Goal:** a believable basic phone running the text menu (spec §9.1–9.2).

Tasks:
1. `BasicPhone`: drawn handset, monochrome screen (about 20 chars × 8 lines, monospace, green-grey), keypad 1–9 * 0 #, green Call, red End, up/down/OK. Physical keyboard input also works (digits, *, #, Enter = OK/Call, Esc = End).
2. **Home screen:** network bars "Africell", demo clock time, battery; **1 Phone · 2 Messages (unread)**. Red End always returns Home.
3. **Phone app:** dial pad + Call; call history.
   - `*1234#` → `UssdSession` overlay
   - `*4321#` → "Kafo Signal will call you now" (Phase 8)
   - other numbers → "Number not reachable"
4. `ussd.js` state machine driven by `src/data/ussd/menu.json`, with all screens in spec §9.2: MAIN, PLANT, PLANT_DETAIL, SELL, SELL_RESULT, ALERTS, PRODUCE 1/2/3 → DONE, REPORT → DONE, PROFILE, HELP, UNREGISTERED. `0` back, `00` main, **120 s idle timeout**. Text comes from `i18n.json` in the farmer's language, and verdict words come from `render(…, 'ussd', lang)`.
5. Actions write to the DB: "Tell my leader" → leader inbox; "I have produce" → `produce_requests` (pending_leader); "Report a problem" → `reports` (unverified).
6. **Side panel (outside the phone):** farmer dropdown (Awa · Binta · unregistered number), quick-dial buttons for `*1234#` / `*4321#`, subtitles toggle, language override.

**Done when:** Awa can dial `*1234#`, see the plant verdicts in words, submit produce and a report, and those items appear in the kafo leader's inbox in another tab.

---

## Phase 7: Messages app + notifications
**Goal:** every SMS the system sends shows up on the farmer phone (spec §9.3).

Tasks:
1. `notify.js`: `sendSms(farmerId, templateKey, vars)` writes to `sms` (from `1234`) using templates from `i18n.json`. Enforce **≤160 chars** and plain Latin characters (warn in the console if a template breaks this).
2. Wire the triggers: registration welcome, leader confirmed produce, buyer took order/offer, pest warning (unverified), admin alert, paid.
3. **Messages app:** inbox list → thread view (from 1234), unread badge on Home, and a **"1 new message · 1234" banner** pop-up on any screen.
4. Messages is read-only.

**Done when:** triggering heavy rain in Admin makes a banner appear on Binta's phone in the other tab, and the message is readable in her inbox.

---

## Phase 8: Voice line `*4321#`: call simulation + IVR + voice notes
**Goal:** the callback flow with voice notes and subtitles (spec §9.4–9.7).

Tasks:
1. Dialling `*4321#` shows the USSD pop-up "Kafo Signal will call you now" (2 s) → Home → wait ~3 s → **INCOMING** full screen "4321 · Kafo Signal calling…" with Answer / Decline → **IN_CALL** with a timer.
2. `ivr.js` state machine driven by `src/data/ivr/flow.json` with the nodes in spec §9.5 (`greet, main, plant, plant_detail, sell, sell_result, alerts, produce, report, unregistered, goodbye`). Keypad presses = DTMF.
3. **Audio player:** plays clip lists from `render(…, 'voice', lang)` in sequence from `public/audio/{lang}/{clip}.mp3`. A key press **interrupts** playback. After 8 s of silence the menu replays once, then goodbye + hang up. `9` repeat, `0` back, `*` main.
4. **Missing clip fallback:** show the subtitle and play the English clip, or use browser `speechSynthesis` for English; record the missing clip ID for the admin clip checklist.
5. **Subtitles:** under the phone, show the text of the clip currently playing (in the farmer's language plus English).
6. `clips.json`: every clip ID with its English script (the recording guide). Include the starter list in spec §9.6. Add placeholder silent mp3s or rely on the fallback so the demo runs before recordings exist.
7. **Outbound alert call:** the Admin "Call farmers with alert" button rings the farmer's phone without dialling.
8. "Report a problem" option 9 records voice with `MediaRecorder` (stored as a blob in Dexie) when the browser allows; otherwise skip gracefully.

**Done when:** the Wolof demo path in spec §9.7 runs end to end, and dropping a new mp3 into `public/audio/wo/` replaces the fallback with no code change.

---

## Phase 9: End-to-end demo, polish & deploy
**Goal:** a reliable 3-minute demo on GitHub Pages.

Tasks:
1. Run the full story across 4 tabs: buyer posts the okra order → Awa or Binta checks what to plant (okra GOOD) → leader accepts and logs planting → pest reports → WATCH OUT → admin heavy rain → ACT NOW SMS + call → **Jump +8 weeks** → stages to Ready → produce request → leader merges → delivery with weighed kg → buyer confirms and pays → PAID SMS.
2. Fix every break found in that run; make sure **Reset demo** restores a clean start.
3. Empty, loading and error states; mobile responsiveness for the buyer and admin sites.
4. Accessibility: every colour is paired with an icon and a word; buttons ≥44 px in the kafo app; keyboard works on the phone.
5. A "demo data" label in the footer; an about/pitch link on the landing page.
6. Deploy to GitHub Pages and test the live URL in a fresh browser profile.

**Done when:** the full story runs twice in a row on the live URL after Reset without errors.

---

## Phase 10 (stretch, only if time remains)
In this order:
1. Leads inbox in Admin (unregistered caller → record → lead → register kafo).
2. Admin report queue (unverified > 48 h) and data-quality flags screen.
3. Reliability scores (buyer pays-on-time %, kafo delivered-as-promised %).
4. Repeat weekly orders, delivery option + fee.
5. Disputes screen, fees view, audit log.
6. Leader broadcast message to members (SMS / voice note).
7. Offline "Saved ✓ / Waiting to send" indicator.
8. Optional real weather via Open-Meteo, cached to JSON.

---

## Rules for Claude Code throughout
- **Never hard-code menu text, SMS text or voice scripts in components.** They live in `i18n.json`, `ussd/menu.json`, `ivr/flow.json` and `clips.json`.
- **All signal logic lives in `rules.js`.** Components only call it and `render()`.
- **Colours only through theme tokens** (`bg-go`, `text-ink`, …) and `signalStyle()`. No hex values or Tailwind palette colours in components or pages.
- **Field names only from `spec/data-dictionary.md`.** Schema changes update the dictionary in the same commit.
- **Only leaders (and admin) can write plantings, accept orders or confirm offers.** Farmers create requests and reports only.
- **Basic-phone screens never use colour or special symbols.**
- Keep components small; prefer plain Preact + Tailwind; no UI kits.
- After each phase, update `README.md` with how to run it and what works so far.
