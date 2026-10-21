# Kafo Signal — Pitch Deck Build Guide (for Claude Code)

> **How to use this file:** Give this whole file to Claude Code and say:
> *"Build the pitch deck described in kafo-signal-deck-guide.md as a .pptx. Take the screenshots listed in Section 4 from my running site first, then build the slides."*
>
> Everything below is already researched and fact-checked (October 2026). Claude Code should **not** invent new numbers. If a fact is not in this file, leave it out.

---

## 1. What we are pitching (context for Claude Code)

**Event:** UTG ITCA Hackathon 2026 · Challenge 02 · Agricultural Information & Market Access (The Gambia)

**Product:** **Kafo Signal** — a traffic-light tool for women's vegetable garden groups (*kafos*). It tells them **what to plant, where to sell and what risk is coming** with one answer: **GOOD / CAREFUL / AVOID**, and links that answer to **buyers who commit to orders before planting**.

**One-sentence pitch:** *The Gambia already has price and advice services — what's missing is the step from information to a decision, and from a decision to a buyer who pays. Kafo Signal gives a clear answer and a real order.*

**Users (4 roles):**
| Role | Device | What they do |
|---|---|---|
| Farmer (kafo member) | Basic phone | Dials `*1234#` text menu or `*4321#` free call-back voice line (Mandinka, Wolof, Fula, Jola, English) |
| Kafo leader | Smartphone app | Records plantings for the group, accepts buyer orders, confirms reports, weighs each farmer's share |
| Buyer (hotel, wholesaler, school-meal supplier) | Website | Posts orders before planting, sees harvest outlook, pays by mobile money |
| Admin (team → later extension officers) | Website | Signs up kafos/buyers, enters prices, weather and pest warnings |

**The three answers:**
| Question | How it's decided |
|---|---|
| What to plant? | Amount already planted vs. what buyers ordered. Lots planted + few orders → AVOID. Little planted + buyer waiting → GOOD. |
| Where to sell? | Market price minus transport, vs. usual price. A confirmed buyer is always GOOD. Old prices are never shown ("no recent price"). |
| Is anything coming? | Farmer reports alone only reach CAREFUL. ACT NOW needs the leader to confirm, or an official warning. |

Rules-based, no AI — transparent, works with little data, every answer shows its reason (e.g. *"Avoid tomato: 14 kafos are already growing it"*).

### ⚠️ Demo vs. real world — keep these separate

| | What it is | Needs partners / fees? |
|---|---|---|
| **The demo (Slides 6–8)** | A working prototype. USSD/SMS run in an on-screen phone simulator, voice is simulated, payments are mocked, prices are demo data. | **No.** Nothing from Africell, QCell, PURA, Wave or any partner is used or needed. |
| **Going live (Slides 9–10)** | What it would take to run Kafo Signal for real farmers **after the hackathon**. Answers the judges' question about "data, trust and who pays". | **Yes, only then.** Operators, PURA codes, payment APIs, data and buyer partners. |

Rules for Claude Code:
- Label demo slides with a small tag: **"Prototype · simulated"**.
- Label Slides 9–10 with a small tag: **"Going live · after the hackathon"**.
- Never say or imply the demo is connected to Africell, QCell, Wave or PURA.

**Demo story ("Fatou's season"):** Hotel posts *150 kg okra in ~10 weeks* → farmer dials `*1234#`, sees *Tomato: DON'T PLANT · Okra: GOOD, buyer waiting* → leader accepts order, logs 40 beds → insect reports turn okra YELLOW → heavy rain warning: SMS + call "ACT NOW, harvest early" → leader weighs each woman's okra → buyer pays each farmer directly by Wave → SMS "PAID 38 kg okra".

---

## 2. Deck rules (design + build)

- **Format:** `.pptx`, 16:9. Build with the pptx skill / `pptxgenjs`. **11 slides** (+ optional appendix). Target 6–7 minute pitch.
- **Short and concise:** max ~30 words of on-slide text per slide (not counting tables). Detail goes in **speaker notes** (provided below for every slide).
- **Palette (traffic-light brand):**
  - Primary dark green `14402F` (title/closing backgrounds, headings)
  - Signal green `2E9E4F` · Signal yellow `F2B705` · Signal red `D93B30`
  - Text `1B1B1B`, muted `5F6B66`, light surface `F1F5F2`, white `FFFFFF`
  - Green dominates; red/yellow only for signals and risks.
- **Fonts:** Cambria (headings), Calibri (body). Titles 36–40pt, body 14–16pt, captions 10–12pt.
- **Motif:** the three-dot traffic light (● ● ●) and pill-shaped signal badges with a shape + word: ✓ GOOD, ! CAREFUL, ✕ AVOID (so it works in black-and-white and for colour-blind viewers).
- **Sandwich:** dark green title + closing slides; white/light content slides.
- **Screenshots:** placed in rounded phone/browser frames with a soft shadow. If a screenshot file is missing, insert a grey placeholder box labelled with the filename — never fake UI.
- Avoid: accent lines under titles, edge stripes, centred body text, text overflow.
- **QA before handing back:** render to images, check every slide for overflow/overlap; run `validate.py`.

---

## 3. Slide-by-slide spec

### Slide 1 — Title (dark green)
- **Title:** Kafo Signal
- **Subtitle:** From farm information to a decision — and a buyer who pays
- **Visual:** large three-dot traffic light; small line: *UTG ITCA Hackathon 2026 · Challenge 02* + team name `[TEAM NAME]`
- **Notes:** "Women's garden groups in The Gambia don't lack information. They lack a clear answer and a buyer. Kafo Signal gives both."

### Slide 2 — The problem
- **Title:** Farmers get numbers, not decisions
- **Visual:** 3 big stat callouts
  - **1 : 3,000** — extension workers to farmers (Dept. of Agriculture, 2025)
  - **22%** — farm households with any market information (Agricultural Census 2011/12)
  - **Up to 50%** — of vegetables lost after harvest, Gambia + Sub-Saharan Africa (AfDB 2026)
- **One line under stats:** Everyone plants tomato at the same time → glut → "giveaway" prices → spoilage.
- **Notes:** Women do most vegetable farming; ~41% of adults can't read; women's literacy 47% vs men 67%; Mandinka is almost absent from speech technology.

### Slide 3 — What already exists (and the gap)
- **Title:** The pipes exist. The last step is missing.
- **Visual:** 3 small cards → arrow → a red "gap" card
  - Marché Kibaroo — voice price service, 29 markets, English + 5 local languages
  - Senenyaa Bantabaa — government e-extension phone line, 4 languages
  - Jokkalante — WhatsApp buyer linkage (needs smartphone + data)
  - **Gap card:** No one turns information into *what to do*, and no one guarantees a buyer *before* planting.
- **Notes:** We plug into these, we don't compete. Marché Kibaroo prices are a data source for us. All are donor-funded; ROOTS ends ~2027 — so a buyer-funded model matters.

### Slide 4 — Our solution: one answer, three ways
- **Title:** One answer everyone understands
- **Visual:** 3 columns GOOD / CAREFUL / AVOID (green/yellow/red pills) × 3 rows: What to plant · Where to sell · Risk alert. Use short cell text:
  - Plant: *Little competition, buyer waiting* / *Many kafos planting* / *Glut coming*
  - Sell: *Good price or confirmed buyer* / *Average — compare or wait* / *Price crash, don't travel*
  - Risk: *All OK* / *Watch out* / *Act now*
- **Bottom strip:** Same answer as **colour tile** (leader app) · **one word** (basic phone) · **spoken sentence** (voice call)

### Slide 5 — How a season works
- **Title:** The buyer's order comes before planting
- **Visual:** horizontal 6-step flow with icons: Buyer posts order → Farmer asks "what to plant?" → Leader accepts & logs planting → Alerts while growing → Weigh & deliver → Each farmer paid by mobile money
- **Notes:** This order is the key design choice: it's what lets us say "okra is GOOD, a buyer is waiting" and stops every kafo planting tomato.

### Slide 6 — Demo: the farmer on a basic phone
- **Tag (Slides 6–8):** Prototype · simulated
- **Title:** Works on any phone, no internet
- **Visual:** two phone frames side by side: `01-ussd-menu.png` and `02-ussd-answer.png`; small third: `03-sms-alert.png`
- **Callouts (3, short):** `*1234#` free text menu · `*4321#` free call-back in her language · Every message starts with its key word (GOOD, ACT NOW, PAID)
- **Notes:** USSD runs on 2G with no data bundle. Voice uses pre-recorded clips because speech tech barely supports Mandinka.

### Slide 7 — Demo: the kafo leader app
- **Title:** One trusted leader decides for 200 women
- **Visual:** phone frame `04-leader-plant-tiles.png` (large) + `05-leader-sell-card.png` (smaller)
- **Callouts:** Colour tiles + crop pictures + ♪ audio · Logs plantings → powers the glut warning · Accept buyer orders in one tap
- **Notes:** Only verified leaders record plantings and accept orders, so one wrong entry can't mislead every kafo.

### Slide 8 — Demo: buyer dashboard + payment
- **Title:** Buyers see the harvest before it exists
- **Visual:** browser frame `06-buyer-dashboard.png` (large) + `07-payment-confirmed.png` (small)
- **Callouts:** Post orders weeks ahead · Harvest outlook by crop · Each farmer paid directly, SMS receipt
- **Notes:** Buyers pay at collection or within 48h; late payers lose their rating. Buyers see the kafo, never individual farmers' names or numbers.

### Slide 9 — Partners we need to go live *(real world only, not used in the demo)*
- **Tag:** Going live · after the hackathon
- **Title:** Who we work with to go live
- **Visual:** a 2×2 grid of partner groups (logos not required — use labelled cards; **do not draw company logos**)

| Need | Partner | What we get | Cost / terms (verified) |
|---|---|---|---|
| USSD + SMS on all networks | **Africell** (largest network) and **QCell** (#2) | Host `*1234#`, two-way SMS, call-back voice line | Operator revenue-share terms are not public → to negotiate |
| Licence for the codes | **PURA** (regulator) | Short code / USSD code | D10,000 application + **D25,000/yr** per code; toll-free number D5,000 + D7,500/yr; **social-service numbers can be exempt from annual fees** |
| Mobile-money payouts | **Wave** (Payout API) or **Modem Pay** (one API for Wave, QMoney, Afrimoney) | Pay each farmer directly by phone number, batch payouts | Wave enables payouts per business after a compliance check |
| Prices & weather | **Marché Kibaroo / MoALFS Planning**, **DWR** bulletins, **Open-Meteo** (free API) | Market prices, dekadal agromet bulletins, 7-day forecast | Partnership; Open-Meteo free |
| Buyers | **Gambia Hotel Association**, **WFP Home-Grown School Feeding**, ITC | Committed pre-harvest orders | Fee per completed order |
| Reach & trust | Dept. of Agriculture extension, kafo federations / NACOFAG, ROOTS | Sign-up of kafos, leader training | Partnership |

- **On-slide:** keep only Partner + one-line "what we get". Put costs on slide 10.
- **Notes:** International SMS providers (BudgetSMS, SMS.to, Infobip) can send one-way alerts to Gambia today for roughly €0.03–0.10 per SMS, but they do **not** support two-way SMS or short codes in Gambia — so the USSD menu must go through Africell/QCell (or a licensed local value-added-service partner). Africa's Talking is not live in Gambia — we use its **simulator only for the demo**.

### Slide 10 — Path to launch + cost *(real world only, not used in the demo)*
- **Tag:** Going live · after the hackathon
- **Title:** From demo to pilot in 3 steps
- **Visual:** 3-phase timeline
  1. **Now — Demo:** on-screen USSD/SMS simulator, mock payments. Cost: D0
  2. **Pilot — 3 kafos in Brikama:** outbound SMS via gateway, call-back voice via operator partner, real payouts via Modem Pay/Wave sandbox → live
  3. **Launch:** own USSD code on Africell + QCell, Marché Kibaroo price feed, buyers onboarded
- **Small cost box (year 1, PURA fees only):**
  - 1 USSD code: D10,000 + D25,000 = **D35,000**
  - 1 toll-free voice number: D5,000 + D7,500 = **D12,500**
  - **Total ≈ D47,500** before operator revenue share — or **apply for the social-service fee exemption**
- **Notes:** Cost-saving option: use ONE code (`*1234#`, with "6 = Call me") instead of two, which halves code fees. Two alternatives to a full PURA licence: (a) run under an operator's existing code as a partner service, (b) partner with a licensed value-added-service provider (a VAS licence itself is D75,000 + US$10,000 for 5 years — too big for us now).

### Slide 11 — Why it lasts + the ask (dark green)
- **Title:** Free for farmers. Paid by sales.
- **Left:** Business model — buyers pay ~2–3% on each completed order. Farmer-paid models failed elsewhere (Esoko); business- and sale-funded ones survived.
- **Right:** Trust built in — verified leaders & buyers · every answer shows its reason · each farmer paid directly with SMS receipt · buyers can't cancel after planting.
- **Ask strip at bottom:** *Pilot with 3 kafos in Brikama · Intro to Africell & QCell · PURA social-service exemption · Marché Kibaroo price feed*
- **Notes:** Close on Fatou: "She didn't get more data. She got an answer, a buyer, and her money on her phone."

### Appendix (optional, after slide 11) — Facts we checked
One table slide with the key numbers and sources from Section 6, for judges' questions.

---

## 4. Screenshots Claude Code must capture from the site

Save to `./screenshots/` at 2× resolution. Mobile views at 390×844; desktop at 1440×900.

| File | Page / state to capture |
|---|---|
| `01-ussd-menu.png` | Phone simulator: main `*1234#` menu (1 What to plant … 7 My profile) |
| `02-ussd-answer.png` | Simulator reply: "Tomato: DON'T PLANT · Okra: GOOD, buyer waiting" |
| `03-sms-alert.png` | Simulated SMS inbox with an "ACT NOW" heavy-rain alert |
| `04-leader-plant-tiles.png` | Leader app, Plant tab: red tomato / yellow onion / green okra & pepper tiles |
| `05-leader-sell-card.png` | Leader app, Sell card: "Hotel needs 150 kg okra" with Accept |
| `06-buyer-dashboard.png` | Buyer dashboard: harvest outlook bars + Post order form |
| `07-payment-confirmed.png` | Order status "Paid ✓" / farmer SMS "PAID 38 kg okra" |

If the site doesn't have one of these states yet, capture the nearest screen and note it in the speaker notes.

---

## 5. Things to double-check before presenting

- **Phone numbers changed:** since 4 Sep 2026 Africell (87), QCell (83) and Comium (86) numbers are 9 digits; Gamcel stays 7 digits for now. Old and new formats run together until 30 Nov 2026. Our demo data and farmer database should store 9-digit numbers.
- **PURA 2026 fee regulations** come into force on a date the Minister gazettes — confirm with PURA that they apply now.
- **Code numbers:** the concept sheet used `*384*12#`, the user guide uses `*1234#` / `*4321#`. Use `*1234#` / `*4321#` consistently and say they are placeholders until PURA assigns real ones.
- **Data protection:** the Personal Data Protection and Privacy Act 2025 requires consent for storing farmer phone and location data — mention consent at sign-up if asked.
- **Price data in the demo** must be labelled "demo data" unless taken from Marché Kibaroo.

---

## 6. Research notes & sources (for answering judges)

**Telecom & licensing**
- PURA Unified Fees Regulations 2026: short code / USSD application D10,000; annual D25,000; premium/VAS codes D50,000/yr; toll-free D5,000 + D7,500/yr per number; social-service and government essential numbers exempt from annual fees; PURA may waive fees for public interest, innovation or small community operators; VAS provider licence D75,000 application + US$10,000 (5 years). — https://pura.gm/wp-content/uploads/2026/04/PURA-Unified-Fees-Regulations-2026.pdf
- International SMS providers: no two-way SMS and no short codes in Gambia; Africell has the largest share. — https://www.sent.dm/en/resources/sms-compliance/gambia-sms-guide
- SMS gateway price example (€0.032–€0.10 per SMS by network). — https://budgetsms.net/sms-gateway-pricing/gm/gambia
- Gamcel requires sender IDs registered in advance. — https://d7networks.com/sms/gambia/
- 9-digit numbering, prefixes 83/86/87 from 4 Sep 2026; Comium rejects international numeric sender IDs. — https://static0.twilio.com/en-us/guidelines/gm/sms · https://osiris.sn/telephonie-la-gambie-annonce-le-passage-aux-numeros-a-neuf-chiffres-pour.html
- Africa's Talking live countries (Gambia not listed → simulator only). — https://help.africastalking.com/en/articles/2727792-which-countries-are-africa-s-talking-products-in
- Viamo 3-2-1 (operator-integrated IVR model, possible future partner; needs operator negotiations). — https://hifa.org/node/96850142

**Payments**
- Wave Business API: Checkout, Payout (single & batch to wallets by phone), webhooks. — https://providers.apievangelist.com/providers/wave-mobile-money/
- Wave payout endpoint enabled per business against a compliance justification. — https://packagist.org/packages/thales/wave
- Wave has 1,900+ agents in Gambia. — https://help.taptapsend.com/en/receiving-countries/how-can-i-send-money-to-the-gambia
- Modem Pay: one API for QMoney, Afrimoney, Wave; bulk payouts. — https://vc4a.com/ventures/modem-pay-limited · https://linkedin.com/company/modempay
- Afrimoney (Africell) merchant APIs follow the GSMA Mobile Money API spec. — https://www.africell.com/?p=939

**Data & buyers**
- Marché Kibaroo MIS: voice-based, 29 markets, English + Wolof, Mandinka, Fula, Jola, Serahule. — https://marchekibaroo.org/post/twenty-one-markets-of-the-mis
- Gambia Hotel Association B2B matchmaking with farmers (ITC, FAO, ROOTS), Feb 2026. — https://academicnewsletter.sufe.edu.cn/info/461856
- WFP school feeding: 167,105 children in 422 schools (2025). — https://docs.wfp.org/api/documents/WFP-0000172828/download
- WFP + ITC initiative for women farmers to supply schools (Sep 2026). — https://news.fundsforngos.org/2026/09/18/gambia-women-farmers-local-food-schools/

**Problem stats** (from the team's research report and challenge brief): 1:3,000 extension ratio (DG of Agriculture, May 2025); 22.1% market-information access (Agricultural Census 2011/12); "up to half" of vegetables lost (AfDB via AllAfrica, Jun 2026); literacy 58.7% adults, women 47% vs men 67%; existing services have no published usage data.
