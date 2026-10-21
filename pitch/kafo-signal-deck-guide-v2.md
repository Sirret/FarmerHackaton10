# Kafo Signal — Pitch Deck Build Guide v2 (for Claude Code)

> **How to use this file:** Give Claude Code this file plus the existing deck `kafo-signal-deck.pptx` and say:
> *"Update kafo-signal-deck.pptx using kafo-signal-deck-guide-v2.md. Keep the current design system. Apply every change in Section 2, add the new slides in Section 6, and fill Section 7 from our real code."*
>
> Everything here is researched and checked (21 Oct 2026). **Do not invent numbers.** If a fact isn't in this file or in the repo, leave it out. Anything marked `[FILL]` needs the team's input; ask the team before guessing.

---

## 1. How we are judged (build every slide toward this)

ITCA Hackathon 1.0 is scored out of 100 by four judges. Ties go to **Problem & Impact**, then **Innovation**, then **Pitch**.

| Criterion | Pts | What judges look for | Slides that earn it |
|---|---|---|---|
| Problem & Impact | **20** | Clear problem; who has it and why it matters; real value for users | 2, 3, 13 |
| Idea, Innovation & Creativity | 15 | Original idea or a meaningful improvement on existing solutions. **Not** rewarded just for AI or trendy tech | 4, 5, 6 |
| Pitch & Presentation | 15 | Clear problem → solution story, good use of time, strong Q&A | Whole deck + Section 8 |
| Solution / Prototype | 15 | Shows how it works: a working demo or convincing proof of concept | 7, 8, 9 (+ live demo) |
| Feasibility & Potential | 10 | Implementation, users, adoption, resources, growth | 11, 12 |
| User Experience & Design | 10 | Easy and intuitive for the intended users | 5, 7, 8 |
| Technical Understanding | 15 | Can explain how it works and why these tech choices. Complexity is **not** rewarded | 10 + Section 8 Q&A |

**Rule for the deck:** each slide should clearly earn points for one row of this table. If a slide doesn't, cut it.

---

## 2. What to change in the current deck (review of v1)

The current deck looks good: keep the palette, fonts, traffic-light motif, card layouts and screenshots. Fix these:

| # | Problem in v1 | Fix |
|---|---|---|
| 1 | Slide 1 still says `[TEAM NAME]` | Replace with `[FILL: team name + member names]` and ask the team |
| 2 | **No technical slide** (Technical Understanding is 15 pts) | Add new Slide 10, "How it works under the hood" (Section 6) |
| 3 | **No "who"**: judges never meet the farmer | Add new Slide 2, "Meet Fatou" |
| 4 | No proof that the core idea (buyer order before planting) works | Add the Jahaur quote to Slide 6 |
| 5 | Slide 3 lists existing services but doesn't show *why* our approach is better | Add the evidence strip (price info alone gives small gains, and the gains can go to traders) |
| 6 | No impact or success measures | Add pilot targets to Slide 12 and an impact line to Slide 13 |
| 7 | Slide 9 notes say the demo uses **Africa's Talking's simulator**. **Wrong**: we built our own on-page phone simulator | Change the note to "Our own on-page phone simulator. Africa's Talking is not live in Gambia." |
| 8 | Slide 11 says "Farmer-paid models failed elsewhere (Esoko)" (too loose) | Use: "Esoko stopped selling farmer-paid price services in 2016 after heavy losses" |
| 9 | Business model says "2–3% fee" with no example | Add a unit example: one okra order (Slide 13) |
| 10 | The demo is only screenshots | Plan a **live demo** right after Slide 6. Slides 7–9 become the backup if Wi-Fi fails |

**New order: 13 slides + appendix.** Old slide numbers are in brackets.

1 Title · 2 Meet Fatou *(new)* · 3 Problem [2] · 4 What exists + what we learned [3] · 5 One answer [4] · 6 Order before planting [5] · **LIVE DEMO** · 7 Farmer phone [6] · 8 Leader app [7] · 9 Buyer + payment [8] · 10 Under the hood *(new)* · 11 Partners [9] · 12 Launch, pilot, cost [10] · 13 Model, impact, ask [11] · Appendix [12]

**Timing:** `[FILL: pitch slot length]`. Default plan for 7 minutes: slides 1–6 in 2:30 · live demo 2:30 · slides 10–13 in 2:00. Slides 7–9 only if the live demo fails.

---

## 3. Demo vs. real world: keep these separate

| | What it is | Needs partners / fees? |
|---|---|---|
| **Demo** (live + Slides 7–9) | Working prototype. USSD/SMS run in **our own on-page phone simulator**, voice is simulated, payments are mocked, prices are demo data | **No.** Nothing from Africell, QCell, PURA, Wave or any partner is used |
| **Going live** (Slides 11–12) | What it takes to run Kafo Signal for real farmers **after the hackathon** | **Yes, only then** |

- Tag Slides 7–9: **"Prototype · simulated"**. Tag Slides 11–12: **"Going live · after the hackathon"**.
- Never imply the demo is connected to any operator, payment provider or PURA.

---

## 4. What we are pitching (context)

**Kafo Signal** is a traffic-light tool for women's vegetable garden groups (*kafos*) in The Gambia. It answers **what to plant, where to sell and what risk is coming** with GOOD / CAREFUL / AVOID, and links the answer to **buyers who commit to an order before planting**.

**One-line pitch:** *The Gambia already has price and advice services. What's missing is the step from information to a decision, and from a decision to a buyer who pays.*

| Role | Device | What they do |
|---|---|---|
| Farmer (kafo member) | Basic phone | `*1234#` text menu or `*4321#` free call-back voice (Mandinka, Wolof, Fula, Jola, English) |
| Kafo leader | Smartphone app | Logs plantings, accepts orders, confirms reports, weighs each farmer's share |
| Buyer (hotel, school-meal supplier, wholesaler) | Website | Posts orders before planting, sees harvest outlook, pays by mobile money |
| Admin (team → extension officers) | Website | Signs up kafos/buyers, enters prices, weather and pest warnings |

**Rules engine (no AI):**
| Answer | Rule | GOOD / CAREFUL / AVOID |
|---|---|---|
| Plant | expected supply ÷ buyer demand | < 0.8 / 0.8–1.3 / > 1.3 |
| Sell | (market price − transport) vs 4-week average; a confirmed order is always GOOD; stale prices are hidden ("no recent price") | above / near / well below |
| Risk | heavy rain or dry spell in the 7-day forecast, or ≥ 3 pest reports nearby. Farmer reports alone reach only CAREFUL; ACT NOW needs leader confirmation or an official warning | OK / watch / act now |

Every answer carries a reason line, e.g. *"Avoid tomato: 14 kafos are already growing it."*

**Demo story ("Fatou's season"):** Hotel posts 150 kg okra for ~10 weeks out → farmer dials `*1234#` and sees *Tomato: DON'T PLANT · Okra: GOOD, buyer waiting* → leader accepts and logs 40 beds → insect reports turn okra YELLOW → heavy-rain warning by SMS + call, "ACT NOW, harvest early" → leader weighs each woman's okra → buyer pays each farmer directly (mock Wave) → SMS "PAID 38 kg okra".

---

## 5. Design rules (unchanged, keep the v1 look)

16:9 · max ~30 words on a slide (tables excepted); detail goes in speaker notes · palette: dark green `14402F`, signal green `2E9E4F`, yellow `F2B705`, red `D93B30`, text `1B1B1B`, muted `5F6B66`, surface `F1F5F2` · Cambria headings, Calibri body · signal pills always shape + word (✓ GOOD, ! CAREFUL, ✕ AVOID) · dark title and closing slides · screenshots in phone/browser frames · no company logos · QA: render every slide, check overflow, run `validate.py`.

---

## 6. Slide-by-slide spec

### 1 · Title (dark)
- **Title:** Kafo Signal · **Subtitle:** From farm information to a decision, and a buyer who pays
- Footer: UTG ITCA Hackathon 2026 · Challenge 02 · `[FILL: team name]`
- **Notes (opening hook, 15 s):** "Every dry season, women in The Gambia's garden groups all plant tomato, the price collapses, and the crop rots. They don't need more information. They need a clear answer and a buyer. That's Kafo Signal."

### 2 · Meet Fatou *(NEW: Problem & Impact, "who experiences it")*
- **Title:** Meet Fatou, kafo leader in Brikama
- **Visual:** left: simple illustrated persona card (no real photo of a real person); right: 3 facts with icons
  - **~200 women** share one garden, about 4 beds each
  - **Basic phone** · reads little English · speaks Mandinka
  - Sells at harvest to **whoever shows up**, with no reference price
- **Bottom stat strip:** 6,600 women in 33 NEMA community gardens · women's literacy 47% vs men 67% · phone ownership 76% women vs 86% men
- **Notes:** Fatou is a composite persona built from our research, not a real person. Saruja garden: 200+ women, ~4 beds each, no storage or transport (Gambiana 2020). ROOTS is upgrading 40 gardens and building 30 new ones, so the number of kafos is growing.

### 3 · The problem (was slide 2)
- **Title:** Farmers get numbers, not decisions
- Keep the 3 stat cards (1:3,000 · 22% · up to 50%) and the glut chain.
- **Add a small example line:** *Same week, July 2026: onions D1,200/bag in Jarra Soma, D1,400 in Kerr Jatta. No official source told farmers.*
- **Notes:** 76% of farmers lose part of their harvest every year. The 50% loss figure is regional (Gambia + Sub-Saharan Africa), so say it that way. No storage means vegetables must sell within days, which kills bargaining power at glut time.

### 4 · What exists and what we learned (was slide 3; Innovation)
- **Title:** The pipes exist. The last step is missing
- Keep the 3 cards (Marché Kibaroo · Senenyaa Bantabaa · Jokkalante) and the red GAP card.
- **Add an evidence strip at the bottom: "What the evidence says → what we did":**
  - Price info alone: only **+7–10%** for farmers, and gains can go to traders → *we add a committed buyer*
  - Services grew only through **USSD/operator channels** (MLouma, Viamo) → *we use USSD + voice, not an app for farmers*
  - Women joined when reached **through their groups** (DigiFarm: 10% → 48%) → *we work through the kafo leader*
- **Notes:** Courtois & Subervie (Ghana/Esoko): about +10% maize, +7% groundnut. Mozambique (Zant 2024): producer prices fell 8–14% while traders gained. Esoko stopped selling farmer-paid price services in 2016 after heavy losses. Our improvement is turning information into a decision **and** a guaranteed sale.

### 5 · One answer everyone understands (was slide 4: keep)
- Keep as is. **Add to notes:** why it suits farmers who can't read: colour + shape + one word + spoken sentence, so it still works in black and white, for colour-blind users, and by ear.

### 6 · The buyer's order comes before planting (was slide 5)
- Keep the 6-step flow.
- **Add a proof quote card** (replaces the "Key design choice" box or sits beside it):
  > "We know we have a buyer before we even plant."
  > Kumba Jallow, Jahaur women's group, which supplies school meals weekly (GAFSP, Mar 2026)
- **One line:** *It works when a project arranges it. Kafo Signal makes it the default for every kafo.*
- **Notes:** WFP Home-Grown School Feeding fed 164,194 children in 422 schools in 2025/26 using local suppliers. Hotels met farmers at an ITC/Gambia Hotel Association matchmaking event in early 2026. Demand exists; the problem is coordination.

### ▶ LIVE DEMO (no slide, or a single dark slide "Live demo: Fatou's season")
Run the Section 4 demo story on the site. Planned order: buyer posts order → farmer `*1234#` → leader accepts → admin triggers rain → payment SMS. Keep the backup video `[FILL: path]` ready.

### 7 · Farmer on a basic phone (was slide 6: keep) · tag "Prototype · simulated"
- **Add a UX callout:** *Max 3 key presses to an answer · every screen fits the 182-character USSD limit*
- **Fix notes:** remove any mention of Africa's Talking. Say: "This is our own on-page phone simulator."

### 8 · Leader app (was slide 7: keep) · tag "Prototype · simulated"
- Notes: 200 women is sourced (~6,600 women across 33 gardens ≈ 200 per garden).

### 9 · Buyer + payment (was slide 8: keep) · tag "Prototype · simulated"

### 10 · How it works under the hood *(NEW: Technical Understanding, 15 pts)*
- **Title:** Simple tech, chosen on purpose
- **Visual:** two side-by-side architecture diagrams, boxes and arrows, same rules engine in the middle of both

| Today: prototype | Going live |
|---|---|
| Astro + Tailwind static site | Same front end + a small server |
| Rules engine as one shared JS module | **Same module**, runs on the server |
| Browser database (sql.js or Dexie/IndexedDB) + JSON seed data | Hosted database |
| On-page phone simulator for USSD/SMS | Operator USSD gateway: callback per key press (session ID → reply `CON` / `END`) |
| Recorded audio clips | Same clips in an IVR call-back line |
| Open-Meteo API (free, 7-day forecast) | Open-Meteo + DWR bulletins + Marché Kibaroo prices |
| Mock payment | Wave Payout API / Modem Pay with webhooks |
| GitHub Pages hosting | Cloud host |

- **3 "why" pills under the diagram:** *Rules, not AI: transparent and works with little data* · *No server for the demo: runs on any laptop* · *Same rules module in demo and production*
- **Notes:** Claude Code must check this against the actual repo (Section 7) and correct anything that differs. USSD limits we design for: 182 characters per screen, input timeout ~20–60 s, whole session ~180–300 s, so every answer arrives in under 60 s.

### 11 · Partners to go live (was slide 9: keep) · tag "Going live · after the hackathon"
- Keep content. **Fix notes** (see Section 2, fix #7).

### 12 · Launch path, pilot and cost (was slide 10) · tag "Going live · after the hackathon"
- Keep the 3 steps and the PURA cost box (≈ D47,500 year 1, or a social-service exemption).
- **Add a "Pilot success measures" box** (3 kafos in Brikama, ~600 women, one dry season):
  - ≥ 60% of members use `*1234#` or `*4321#` at least monthly
  - ≥ 50% of harvest sold through pre-agreed orders
  - Farmers paid within 48 h on ≥ 90% of orders
  - Farm-gate price vs the middleman price, measured before and after
- **Add a running-cost line:** SMS ≈ €0.04–0.10 each → ~600 farmers × ~10 SMS a season ≈ **€240–600 a season**
- **Notes:** Targets are our own goals for the pilot, not results. Growth path: ROOTS-supported gardens (40 upgraded + 30 new) → more kafos with no new tech.

### 13 · Free for farmers, paid by sales + ask (was slide 11, dark)
- Keep the business model + trust cards and the ask strip.
- **Add a unit example:** *One 150 kg okra order = D8,250 to 3 farmers → 3% fee ≈ D250* (label "demo prices")
- **Impact line (top or bottom):** *Success = Fatou plants what's needed, sells before harvest, and is paid on her phone.*
- **Notes:** Honest maths: to cover the year-1 PURA fees (D47,500) from a 3% fee alone takes about D1.6M of orders (≈190 orders this size), so pilot year 1 needs a partner or grant (ROOTS, ITC, WFP) and the fee covers costs as volume grows. Close: "She didn't get more data. She got an answer, a buyer, and her money on her phone."

### Appendix · Facts we checked
Update the table: add Jahaur quote (GAFSP 2026), WFP 164,194 children / 422 schools (2025/26), 6,600 women / 33 gardens (IISD/IFAD), onion price gap (DUBAWA, Jul 2026), Esoko/Ghana +7–10% (Courtois & Subervie 2015), USSD 182-char limit.

---

## 7. Claude Code: fill these from the repo before building Slide 10

Open the project and confirm, then correct the slide if anything differs:
- Framework and styling (expected: Astro + Tailwind)
- Where the rules engine lives (file path) and the exact thresholds (expected: 0.8 / 1.3; 4-week average; ≥ 3 pest reports)
- Browser database used (sql.js or Dexie) and where the seed JSON lives
- How the phone simulator is built (component name)
- How Open-Meteo is called (endpoint, what fields)
- Hosting (GitHub Pages?) and `npm run dev` working offline

Put the real file paths in the Slide 10 speaker notes so any team member can answer "show us where that happens."

---

## 8. Q&A prep (for the team, not slides)

Every team member should be able to answer these in about 20 seconds:

| Likely question | Short answer |
|---|---|
| Why not AI? | Little real data yet; rules are transparent and every colour shows its reason, which builds trust. ML can come later once we have season data. |
| What if a leader enters wrong data? | Only verified leaders log plantings; farmer reports alone can't trigger ACT NOW; outliers are flagged by admin. |
| What if the buyer doesn't pay or cancels? | Buyers are verified, can't cancel after planting, pay at collection or within 48 h; late payers lose their rating. |
| Isn't this just Marché Kibaroo? | We use their prices as an input. They give a price; we give a decision and a buyer. |
| How do farmers without smartphones use it? | USSD and voice call-back on any phone, no data. Only the leader needs a smartphone. |
| Why would Africell/QCell work with you? | USSD sessions and SMS are traffic they earn from; the social-service angle supports a PURA fee exemption. |
| Who pays? | Buyers, a small fee per completed order. Farmers never pay (farmer-paid models failed, e.g. Esoko). |
| Data privacy? | Consent at sign-up (Personal Data Protection and Privacy Act 2025); buyers see the kafo, never individual farmers. |
| What does it cost to run? | Year 1: ~D47,500 PURA fees (or exemption) + ~€240–600 SMS for a 600-farmer pilot + operator share (to negotiate). |
| How does USSD work technically? | Each key press sends the session ID and input to our server; we reply `CON` (more) or `END` (done) within the operator timeout. |

---

## 9. Sources

**Problem & users:** team research report and challenge brief · 6,600 women / 33 gardens: https://sdg.iisd.org/commentary/guest-articles/the-women-transforming-the-rural-gambia-through-horticulture/ · Jahaur quote: https://www.gafspfund.org/news/gambia-turning-post-harvest-losses-value-jahaur-village · school-feeding "the buyer is known": https://allafrica.com/stories/202607020008.html · onion price gap: DUBAWA, Jul 2026 (via team research report)

**Evidence on existing approaches** (via team research report): Courtois & Subervie 2015 · Nyarko et al. · Zant 2024 · Esoko (ICTworks, OD Impact) · MLouma (Orange Developer) · Viamo Mali (ILO 2026) · DigiFarm (Mercy Corps)

**Buyers:** WFP Gambia: https://docs.wfp.org/api/documents/WFP-0000172828/download · Hotel Association matchmaking: https://academicnewsletter.sufe.edu.cn/info/461856 · tourism season +15% forecast: https://allafrica.com/stories/202610120552.html

**Telecom & tech:** PURA fees: https://pura.gm/wp-content/uploads/2026/04/PURA-Unified-Fees-Regulations-2026.pdf · SMS prices: https://budgetsms.net/sms-gateway-pricing/gm/gambia · no two-way SMS/short codes for international providers: https://www.sent.dm/en/resources/sms-compliance/gambia-sms-guide · USSD limits and CON/END flow: https://helloduty.com/blogs/the-comprehensive-guide-to-understanding-and-building-ussd-applications · Africa's Talking countries: https://help.africastalking.com/en/articles/2727792-which-countries-are-africa-s-talking-products-in · 9-digit numbers: https://static0.twilio.com/en-us/guidelines/gm/sms

**Payments:** Wave API: https://providers.apievangelist.com/providers/wave-mobile-money/ · Modem Pay: https://vc4a.com/ventures/modem-pay-limited · Afrimoney APIs: https://www.africell.com/?p=939
