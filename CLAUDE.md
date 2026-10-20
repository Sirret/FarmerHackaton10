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

## Status
- Phase 0 (setup & shell): done. Role pages are stubs; `/styleguide` (unlinked) shows all tokens with a high-contrast toggle; Reset demo button is a placeholder.
- Next: Phase 1 (Dexie data layer, seed JSON, demo clock, wire Reset).
