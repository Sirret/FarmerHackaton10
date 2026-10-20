# Kafo Signal: build spec (locked decisions)

UTG ITCA Hackathon 2026 · Challenge 02 · Agricultural Information & Market Access
Status: farmer + kafo leader sides locked · buyer + admin sides to review

## 1. Concept
A decision tool for women's vegetable garden groups (kafos) in West Coast Region (Brikama area). The engine gives a 3-level signal (green / yellow / red) for **what to plant**, **where to sell** and **what risk is coming**. Buyers post orders **before planting** (forward orders, paid on delivery); farmers can also sell extra produce after harvest (spot offers).
Pilot crops: tomato, onion, pepper, okra.

## 2. Tech stack
- One repo: **Astro + Tailwind**, static output, deploys to **GitHub Pages**; runs locally with `npm run dev`.
- Data: **in-browser DB** (sql.js SQLite or Dexie/IndexedDB), seeded from JSON in `src/data/`. Save locally first, sync to a server later ("better service" phase).
- USSD/SMS and voice calls are **simulated** on the `/farmer` page (phone simulator). Going live needs a server, a PURA short code and an operator agreement.
- All signal logic in `src/lib/rules.js`; `render(signal, channel, language)` turns the signal into a tile colour, USSD word or voice clip.
- Pages: `/farmer` (phone sim) · `/kafo` · `/buyer` · `/admin` · home with role switcher.

## 3. Roles & permissions
| Action | Farmer (phone) | Kafo leader (app) | Buyer | Admin |
|---|---|---|---|---|
| Log / update planting | No ("tell my leader I'm interested") | Yes | No | Correct |
| Accept buyer order (full or partial) | No | Yes | No | No |
| "I have produce" | Request → leader | Confirm / merge → public offer | Sees offers | No |
| Report a problem | Yes (unverified) | Confirm (verified) | No | Official alert |
| Register farmers | No | Yes | No | Yes |
| Register kafos & leaders | No | No | No | Yes (with contract) |
| Prices, weather alerts, verify buyers | No | No | No | Yes |

## 4. Signals per channel
Engine outputs `green | yellow | red`. Rendering:
| Signal | Kafo app / buyer dashboard | Basic-phone text | Voice |
|---|---|---|---|
| Green | Green tile ✓ | GOOD TO PLANT / BEST MARKET / ALL OK | "This is a good choice…" |
| Yellow | Yellow tile ! | CAREFUL / OK MARKET / WATCH OUT | "Be careful…" |
| Red | Red tile ✕ | DON'T PLANT / AVOID / ACT NOW | "It is better not to…" |
Basic phones get **words, not colours** (no colour on screen, symbols may not render). Voice gives a **spoken estimate**: verdict, then reason, then one number.

Rules:
- **Plant:** expected supply ÷ demand: < 0.8 green, 0.8–1.3 yellow, > 1.3 red. Demand = open forward orders + baseline.
- **Sell:** (market price − transport) vs 4-week average; a confirmed order is always green.
- **Risk:** admin alert (from DWR bulletin) or pest reports in the district over the last 7 days. **Unverified farmer reports can only raise a signal to yellow; red needs a leader-verified report or an admin alert.**

## 5. Farmer side (basic phone)
**Registration: by the kafo leader (Option A).** The leader adds name, phone, language, crops and phone status. Location is inherited from the kafo. The farmer gets a welcome SMS + welcome voice call.
**Unregistered number / community not registered:** "Ask your kafo leader to add you." The caller can record their name + village. **The admin gets a lead notification, contacts them and decides next steps.**

**Two channels, same numbering:**
- Text: USSD **`*1234#`** + SMS from short code **`1234`**
- Voice: **`*4321#`**. The farmer dials the code, sees "Kafo Signal will call you now", the session closes (free), and **the system calls back within about 10 seconds** from `4321`, then plays voice notes; the farmer presses keys.
- Languages: **English, Mandinka, Wolof, Fula, Jola**

**Menu:**
```
1 What to plant      → crops with verdict → crop detail → "1 Tell my leader I'm interested"
2 Where to sell      → crop → 2–3 markets with verdict + price (after transport)
3 Alerts             → active alerts · SMS on/off · alerts by voice call
4 I have produce     → crop → amount (bucket / bag / 2–4 bags / 5+) → ready when → sent to LEADER
5 Report a problem   → crop → problem (insects, leaf spots, wilting, animals, flooding, 9 = record voice)
6 Call me            → voice callback
7 My profile         → language · crops · my kafo · my orders/payments
0 Help               → how verdicts work + leader contact
```
Design rules: at most 5–7 options per screen · 3 levels or fewer · 0 Back / 00 Main · SMS ≤160 chars, plain Latin letters (ng/ny instead of ŋ/ñ) · results start with the verdict word · up to 2 profiles per shared phone.

**Voice clips** (added later): `audio/{lang}/{clip}.mp3`. Sentences are chained from clips: `crop_okra` + `verdict_good_plant` + `why_buyer` + numbers (`num_150`, `kilos`, `dalasi_per_kilo`). Names: `names/kafo_{id}.mp3`, `names/farmer_{id}.mp3`.

## 6. Kafo leader side (locked)
1. **Accounts:** the admin registers the kafo + leader under a contract, then reaches out. Login is phone + 4-digit PIN (role switcher in the prototype). One deputy allowed.
2. **Offline:** save locally first, show "Saved ✓ / Waiting to send", sync when service improves.
3. **Planting log:** kafo-level entry with optional member split: crop, beds, planting date, members (tick names).
4. **Kg & harvest date:** pre-filled from the crop calendar (`days_to_harvest`, `kg_per_bed`); the leader adjusts. **Kg starts as an estimate; scales are provided for deliveries, so actual kg is recorded at delivery** and later improves the estimates.
5. **Stages:** Planted → Growing → Ready → Harvested, plus a "Lost some / all" button with a reason. The leader updates each stage; the engine always uses the latest numbers.
6. **Partial orders:** a kafo can commit part of an order (e.g. 80 of 150 kg); the rest stays open for other kafos.
7. **Aggregation:** the produce-request inbox lets the leader merge members' requests into one kafo offer.
8. **Delivery:** the leader records kg per member, weighed on the scale.
9. **Payment:** each member is paid directly (mock Wave/QMoney) by kg delivered; the leader never holds group money.
10. **Transparency:** each member gets an SMS of their logged contribution + payment; the admin sees an audit log.
11. **Broadcast:** SMS/voice note to all members (optional).

**Screens:** Home (signal tiles + to-do inbox + upcoming harvests) · Plant (log, list, stages) · Sell (orders, offers, deliveries) · Members (add/edit, contributions, broadcast) · Alerts (area alerts, member reports) · Profile (kafo code, village, market town, beds, deputy, PIN).

**24h priority:**
- **Must have:** home tiles + inbox, log planting with auto kg/date, accept order, confirm produce/reports, add member.
- **Should have:** stages + lost, partial orders, merge requests, delivery kg + payout split, member SMS.
- **Cut if late:** PIN login, broadcast, deputy, offline status label, audit view.

## 7. Data model (draft)
- `users`: id, name, phone, role (farmer|leader|buyer|admin), language, verified
- `farmers`: user_id, kafo_id, crops[], has_phone, voice_name_clip
- `kafos`: id, code (4 digits), name, village, district, market_town, lat, lng, leader_id, deputy_id, total_beds, contract_ref
- `market_towns`: id, name, region
- `crop_calendar`: crop, days_to_harvest, kg_per_bed, pest_risk_months[], notes
- `plantings`: id, kafo_id, crop, beds, member_ids[], planted_on, expected_harvest, expected_kg, stage, lost_kg, lost_reason, logged_by (leader), logged_at
- `orders`: id, buyer_id, crop, kg, deliver_by, price_per_kg, type (forward|spot), status
- `order_acceptances`: order_id, kafo_id, kg_committed
- `produce_requests`: id, farmer_id, crop, amount, ready_when, status (pending_leader|merged|rejected)
- `produce_offers`: id, kafo_id, crop, kg, request_ids[], status
- `deliveries`: order_id, member_id, kg_actual, paid_amount, paid_at
- `reports`: id, reporter_id, crop, problem, voice_clip, verified, created_at
- `alerts`: id, district, type, level, message, ends_at, created_by
- `prices`: market_town_id, crop, price_per_kg, date
- `leads`: phone, voice_clip, created_at, status (for unregistered callers)

## 8. Admin side (locked)
1. **Who:** our team is the platform operator. Later, regional extension officers become a second admin level per district. Prototype: one admin role.
2. **Kafo contract:** kafo name, village, market town, GPS pin, total beds, leader + deputy phone, contract ref + date signed, member consent checkbox, optional photo of the signed paper.
3. **Leads inbox:** phone, voice clip, date, market town if given. Status New → Contacted → Registered / Not suitable, plus notes. One tap starts kafo registration with the phone pre-filled.
4. **Buyer verification:** business name, type (hotel / wholesaler / supermarket / school supplier / processor), registration number, contact, location. Admin calls to confirm, then toggles Verified; can suspend.
5. **Prices:** entered weekly per market × crop. **If a price is older than 14 days, show "no recent price"** instead of a verdict. Market agents later.
6. **Alerts are template-based:** type (heavy rain, dry spell, pest outbreak, disease), crops, districts, level, end date. Each type maps to pre-recorded clips + translated SMS. A free-text note appears only in the kafo app.
7. **Transport costs:** table of cost per bag, market town → market; seeded JSON, admin-editable.
8. **Engine settings:** config file (thresholds 0.8 / 1.3, baseline demand per crop, report count 3, window 7 days). Optional settings screen.
9. **Crop calendar:** seed JSON, admin-editable; later auto-updates from weighed kg at delivery.
10. **Report queue:** unverified reports older than 48 h → Verify / Dismiss / Escalate to plant protection officer.
11. **Data-quality flags:** auto-flag kg far above bed capacity, bursts of stage updates, large gaps between estimated and actual kg. Admin approves or corrects.
12. **Disputes:** "Report issue" button on any order (buyer or leader) creates a ticket. Payment is held until the admin resolves it, with a note.
13. **Fees view:** completed orders, order value, platform fee owed by buyer (e.g. 2–3%), mock only.
14. **Demo scenario panel:** add 3 pest reports · trigger heavy rain in Brikama · post a buyer order · jump time +8 weeks · reset demo data.

**Screens:** Overview (counts, kafos with alerts) · Register (kafos & leaders, buyers) · Leads · Data (prices, transport, crop calendar) · Alerts (templates, active, report queue) · Quality (flags, disputes) · Money (fees) · Settings (thresholds, audio clip checklist) · Demo.

**24h priority:**
- **Must have:** register kafo + leader, verify buyer, price entry, alert from template, demo panel + reset.
- **Should have:** leads inbox, report queue, data flags, transport editing, overview counts.
- **Cut if late:** disputes, fees view, settings screen (keep the config file), audit log, clip checklist.

**Data model additions:**
- `kafos`: + contract_signed_on, consent_confirmed, contract_photo
- `buyers`: id, business_name, type, reg_number, contact, location, verified, suspended
- `leads`: + status, notes, market_town_id
- `alerts`: + template_type, crops[], districts[], note
- `transport_costs`: from_town_id, to_market_id, cost_per_bag
- `config`: thresholds, baseline_demand, report_count, report_window_days
- `flags`: id, entity, entity_id, reason, status
- `disputes`: id, order_id, raised_by, issue, status, resolution_note

## 9. Phone simulator (`/farmer`), screens, call flow & voice notes

### 9.0 How each role is presented
| Role | Page | Frame |
|---|---|---|
| Farmer | `/farmer` | **Basic phone** (keypad, small monochrome screen) with 2 apps: **Phone** and **Messages** |
| Kafo leader | `/kafo` | **Smartphone frame** centred on the page; only the leader app screens inside it, nothing else |
| Buyer | `/buyer` | **Normal website** (full-width desktop dashboard, responsive) |
| Admin | `/admin` | Normal website |

### 9.1 What the farmer phone looks like
A drawn basic phone in the middle of the page: a small monochrome screen (green-grey, monospace, about 20 chars × 8 lines), a **12-key keypad** (1–9, *, 0, #) plus **green Call** and **red End** keys, and **up/down/OK** navigation keys.

**Home screen** (top bar: network bars, time, battery):
```
 ▂▄▆  Africell     14:05  ▮▮▮
 ──────────────────────────
   [ 1 Phone ]  [ 2 Messages (2) ]
```
Pressing 1 or 2 (or arrows + OK) opens an app; the **red End key always returns Home**.

**App 1 · Phone**
- A dial pad screen: the farmer types digits/symbols and presses green **Call**.
- `*1234#` → opens the **USSD session** (text menu, section 9.2) as an overlay box with a reply field; End closes it.
- `*4321#` → USSD pop-up "Kafo Signal will call you now. Please keep your phone on." → closes → **incoming call** (section 9.4).
- Shows **call history**: recent `4321` calls, incoming/outgoing icons.
- Any other number → "Number not reachable" (demo).

**App 2 · Messages**
- **Inbox** list of threads, unread count badge on the Home icon; new SMS shows a pop-up banner "1 new message · 1234" on whatever screen is open.
- Thread view: messages from `1234` in time order (welcome, alerts, orders, payments), as in section 9.3.
- Read-only for the demo (farmers don't need to send SMS, as all actions go through `*1234#` or `*4321#`).

**Side panel controls (outside the phone, for the demo):**
- **Who is using the phone:** dropdown of seeded farmers (e.g. Awa, Mandinka · Binta, Wolof · unregistered number).
- **Quick-dial shortcuts:** `*1234#` and `*4321#` buttons that type the code for you.
- **Subtitles toggle:** shows the text of each voice note under the phone, so judges who don't speak Wolof can follow.
- **Language override** (demo only): switch the farmer's language instantly to show Wolof vs Mandinka.

Everything is **driven by JSON**: the screens and call menu are data, not hard-coded pages. Changing a menu means editing a file.

### 9.2 Text line (USSD) screen states
Keys typed on the keypad are the reply. `0` = Back, `00` = Main menu. A session ends after **120 s idle** ("Session ended. Dial again."). Text is in the farmer's language; English shown here.

```
[MAIN]                     [PLANT]                      [PLANT_DETAIL okra]
Hi Awa (Brikama Kafo)      PLANT NOW - Brikama          OKRA: GOOD TO PLANT
1 What to plant            1 Tomato: DON'T PLANT        Hotel needs 150kg
2 Where to sell            2 Onion: CAREFUL             in 10 wks. Few kafos
3 Alerts                   3 Pepper: GOOD TO PLANT      growing it.
4 I have produce           4 Okra: GOOD-buyer waiting   Plant this week.
5 Report a problem         0 Back                       1 Tell my leader
6 Call me                                               0 Back
7 My profile
0 Help

[SELL crop]                [SELL_RESULT pepper]         [PRODUCE 1/3]
Which crop?                PEPPER today                 Which crop?
1 Tomato 2 Onion           1 Serekunda: BEST D__/kg     1 Tomato 2 Onion
3 Pepper 4 Okra            2 Brikama: OK D__/kg         3 Pepper 4 Okra
0 Back                     3 Sukuta: AVOID D__/kg
                           (transport counted)

[PRODUCE 2/3]              [PRODUCE 3/3]                [PRODUCE_DONE]
How much?                  Ready when?                  Sent to your leader
1 1 bucket                 1 Today                      Fatou. You'll get an
2 1 bag                    2 This week                  SMS when buyers can
3 2-4 bags                                              see it.
4 5+ bags

[REPORT crop → problem]    [REPORT_DONE]                [ALERTS]
What is the problem?       Thank you Awa.               1 OKRA: WATCH OUT
1 Insects                  2 others near you            Insects nearby
2 Leaf spots               reported this. Your          2 ALL: ACT NOW
3 Wilting                  leader is told.              Heavy rain in 2 days
4 Animals                  Check under leaves.          3 SMS alerts: ON
5 Flooding                                              4 Alerts by call: OFF
9 Other (record voice)

[UNREGISTERED]
Kafo Signal: this number
is not registered. Ask
your kafo leader to add
you. 1 Leave your name
& village (voice)
```

### 9.3 SMS templates (from 1234, ≤160 chars, plain Latin letters)
| Trigger | Template (English) |
|---|---|
| Registered by leader | `Kafo Signal: {name}, you are in {kafo}. Dial *1234# for menu. Dial *4321# to hear it.` |
| Leader confirmed produce | `GOOD: Your {amount} {crop} is now offered to buyers. We will SMS you when one buys. -Kafo Signal` |
| Buyer took the offer/order | `GOOD: Buyer confirmed {crop} for your kafo. Bring to {kafo}, {day} {time}. -Kafo Signal` |
| Pest (unverified) | `{CROP}: WATCH OUT. Insects reported near {town}. Check under leaves. Dial *4321# to hear. -Kafo Signal` |
| Admin alert | `ACT NOW: Heavy rain in {n} days. Harvest ripe {crop} early. Dial *4321# to hear. -Kafo Signal` |
| Paid | `PAID: {kg}kg {crop} delivered. D{amount} sent to your {wallet}. -Kafo Signal` |

### 9.4 Voice line: call states
```
IDLE ─[Phone app: dial *4321# + Call]→ USSD pop-up "Kafo Signal will call you now" (2 s, free)
     → session closes → back to Home
     → WAITING (about 3 s; in the pitch say about 10 s)
     → INCOMING full screen "4321 · Kafo Signal calling…" [green Answer] [red Decline]
     → IN_CALL timer 00:00 → plays IVR node clips; keypad = DTMF keys
     → END (red key, or after the goodbye clip)
```
- While a clip plays, pressing a key **interrupts it** and jumps ahead (real IVR behaviour).
- No key within **8 s** of the end of a menu → replay the menu once → then the goodbye clip and hang up.
- `9` = repeat this menu · `0` = back · `*` = main menu.
- **Outbound alert call:** the admin demo button "Call farmers with alert" makes INCOMING appear without the farmer dialling.

### 9.5 IVR menu nodes (same numbers as the USSD menu)
| Node | Clips played (in order) | Keys |
|---|---|---|
| `greet` | `greet_hello` + `names/farmer_{id}` + `greet_from_kafo` + `names/kafo_{id}` | auto → `main` |
| `main` | `menu_main` ("plant press 1, sell 2, alerts 3, produce 4, problem 5, repeat 9") | 1 plant · 2 sell · 3 alerts · 4 produce · 5 report · 9 repeat |
| `plant` | for each crop: `crop_{x}` + `verdict_{good_plant/careful/dont_plant}` (+ `why_buyer`) · then `menu_crop_detail` | 1–4 detail · 0 back |
| `plant_detail` | `crop_{x}` + verdict + reason clip + numbers (`num_150` `kilos` `in` `num_10` `weeks`) + `advice_plant_this_week` + `menu_tell_leader` | 1 tell leader · 0 back |
| `sell` | `ask_crop` | 1–4 → `sell_result` |
| `sell_result` | `crop_{x}` + `best_market_is` + `market_{town}` + `about` + number + `dalasi_per_kilo` + `after_transport` | 9 repeat · 0 back |
| `alerts` | each active alert: `alert_{type}` + `crop_{x}` + verdict + advice clip | 9 repeat · 0 back |
| `produce` | `ask_crop` → `ask_amount` → `ask_ready` → `produce_sent_to_leader` | per step |
| `report` | `ask_crop` → `ask_problem` → `report_thanks` (9 = `record_after_beep`) | per step |
| `unregistered` | `not_registered` + `ask_leader` + `press1_record_name_village` | 1 record → `thanks_admin_will_call` |
| `goodbye` | `goodbye` | hang up |

The flow lives in **`src/data/ivr/flow.json`**, with each node holding `clips[]`, `subtitle{en,wo,mnk,ff,dyo}` and `keys{}`. Dynamic parts (crop, verdict, numbers, market) are filled in by the engine at runtime.

### 9.6 How your voice notes plug in
- Folder: **`public/audio/{lang}/{clip_id}.mp3`**, where lang = `en` · `mnk` (Mandinka) · `wo` (Wolof) · `ff` (Fula) · `dyo` (Jola).
- **Manifest:** `src/data/ivr/clips.json` lists every clip ID with its English script, so the person recording knows exactly what to say.
- **Fallback if a clip is missing:** show the subtitle text + play the English clip (or browser text-to-speech for English), and log "missing: wo/crop_okra" to the admin clip checklist.
- **Recording tips:** one clip per short phrase, about 1–3 s, no music, consistent voice per language, trim silence. Record numbers once (`num_1`…`num_20`, `num_50`, `num_100`, `num_150`…) and chain them.

**Starter clip list (record these first for the Wolof demo path):**
`greet_hello`, `greet_from_kafo`, `menu_main`, `crop_tomato`, `crop_onion`, `crop_pepper`, `crop_okra`, `verdict_good_plant`, `verdict_careful`, `verdict_dont_plant`, `why_buyer`, `why_many_planting`, `num_150`, `num_10`, `kilos`, `weeks`, `in`, `advice_plant_this_week`, `menu_tell_leader`, `best_market_is`, `market_serekunda`, `about`, `dalasi_per_kilo`, `after_transport`, `alert_heavy_rain`, `verdict_act_now`, `advice_harvest_early`, `goodbye`. Plus names: `names/kafo_{id}`, `names/farmer_{id}`.

### 9.7 Demo script for the Wolof path (about 60 s)
1. Select **Binta (Wolof)** → open **Phone** app → dial `*4321#` → "We will call you now" → callback → Answer.
2. Hears the greeting + main menu in Wolof (subtitles on) → presses **1**.
3. Hears "Tomato… better not to plant. Okra… good choice, a buyer is waiting" → presses **4** → okra detail → presses **1** (tell leader).
4. Switch to `/kafo` tab → leader sees "Binta is interested in okra".
5. Admin demo panel: **trigger heavy rain** → Binta's phone rings (outbound alert) → hears "Act now: heavy rain…" in Wolof; the SMS inbox also shows the text version.

## 10. Still to review
- Buyer side: onboarding, order form, harvest outlook, delivery + payment confirmation, fees.
