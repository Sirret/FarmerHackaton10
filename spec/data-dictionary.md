# Kafo Signal: data dictionary

Stored in the repo as **`spec/data-dictionary.md`**. This is the single source of truth for every table and field in the Dexie (IndexedDB) database. **If code adds or changes a field, update this file in the same commit.**

## Conventions
- **IDs** are readable strings with a prefix: `kafo_brikama`, `farmer_awa`, `order_0001`. Generated IDs: `prefix_` + 6 random chars.
- **Dates** are ISO strings: `2026-12-12` for dates, `2026-12-12T09:00:00Z` for timestamps. "Now" always comes from `clock.now()` (the demo clock), never `new Date()` directly.
- **Money** is a whole number of **dalasi** (`price_per_kg: 45` = D45).
- **Weights** are whole **kg**. Farmer-facing amounts (bucket / bag) are converted using `config.unit_kg`.
- **Signals** are always one of `green | yellow | red` (plus `none` for "no recent price"). Never store colours (hex) in data; colours live only in the theme.
- **Languages:** `en | mnk | wo | ff | dyo`.
- **Crops:** `tomato | onion | pepper | okra` (extendable via `crop_calendar`).
- `[]` means an array field. **Indexed** fields are marked ★ (used in the Dexie schema string).
- **Writer** says which role is allowed to create or update the record.

---

## People & organisations

### `users`
Every person who can act in the system.
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | Unique user ID | `user_fatou` |
| name | string | Display name | `Fatou Sanneh` |
| phone ★ | string | Gambian number, 7 digits | `7012345` |
| role ★ | enum | `farmer \| leader \| buyer \| admin` | `leader` |
| language | enum | Preferred language | `mnk` |
| kafo_id ★ | string? | Kafo for farmers and leaders | `kafo_brikama` |
| buyer_id | string? | Business for buyer users | `buyer_senegambia_hotel` |
| verified | boolean | Leaders/buyers approved by admin | `true` |
| pin | string? | 4-digit PIN (demo: not enforced) | `1234` |
| created_at | timestamp | | |
Writer: admin (leaders, buyers) · leader (farmers)

### `farmers`
Extra details for users with `role = farmer`.
| Field | Type | Description | Example |
|---|---|---|---|
| user_id ★ | string | → `users.id` | `user_awa` |
| kafo_id ★ | string | → `kafos.id` (location is inherited from here) | `kafo_brikama` |
| crops | string[] | Crops she grows | `["okra","pepper"]` |
| has_phone | boolean | false = reached through the leader only | `true` |
| shared_phone_slot | number? | 1 or 2 if two profiles share a phone | `1` |
| name_clip | string? | Path to recorded name audio | `names/farmer_awa.mp3` |
| sms_alerts | boolean | Receives SMS alerts | `true` |
| voice_alerts | boolean | Receives alert calls | `false` |
Writer: leader · admin · farmer (only her own `sms_alerts` / `voice_alerts`, from the USSD Alerts menu)

### `kafos`
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | | `kafo_brikama` |
| code ★ | string | 4-digit kafo code | `0142` |
| name | string | | `Brikama Women's Kafo` |
| village | string | | `Brikama` |
| district ★ | string | Used for signals and alerts | `Kombo Central` |
| market_town_id | string | → `market_towns.id` | `town_brikama` |
| lat, lng | number | GPS of the garden | `13.27, -16.65` |
| total_beds | number | Capacity, used for data checks | `200` |
| leader_id | string | → `users.id` | `user_fatou` |
| deputy_id | string? | → `users.id` | |
| contract_ref | string | Admin contract number | `KS-2026-014` |
| contract_signed_on | date | | `2026-10-01` |
| consent_confirmed | boolean | Members agreed to data use | `true` |
| contract_photo | blob? | Photo of the signed paper | |
| name_clip | string? | | `names/kafo_brikama.mp3` |
Writer: admin

### `buyers`
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | | `buyer_senegambia_hotel` |
| business_name | string | | `Coastal Hotel (demo)` |
| type | enum | `hotel \| wholesaler \| supermarket \| school_supplier \| processor` | `hotel` |
| reg_number | string | Business registration | `BR-55821` |
| contact_name, contact_phone | string | | |
| location | string | | `Kololi` |
| verified ★ | boolean | Admin approved | `true` |
| suspended | boolean | | `false` |
Writer: buyer (create) · admin (verify/suspend)

### `market_towns`
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | | `town_serekunda` |
| name | string | | `Serekunda` |
| region | enum | `WCR \| KMC \| BJL \| LRR \| NBR \| CRR \| URR` | `KMC` |
| is_market | boolean | Has a market with tracked prices | `true` |
| name_clip | string? | Voice clip ID | `market_serekunda` |
Writer: admin (seed)

---

## Farming

### `crop_calendar`
| Field | Type | Description | Example |
|---|---|---|---|
| crop ★ | enum | | `okra` |
| sort_order | number | Fixed position in every menu (1 Tomato, 2 Onion, 3 Pepper, 4 Okra); USSD keys depend on it | `4` |
| days_to_harvest | number | Planting → first harvest | `58` |
| harvest_days | number | How long harvest lasts | `30` |
| kg_per_bed | number | Default yield estimate (updated from actual kg) | `4` |
| pest_risk_months | number[] | Months with high pest risk | `[3,4,5]` |
| pest_note_key | string | i18n key for advice | `pest.okra.leaves` |
| baseline_demand_kg | number | Weekly demand per district when there are no orders | `25` |
Writer: admin (seed, edit)

### `plantings`
One planting batch logged by a kafo leader.
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | | `plant_7f3a2c` |
| kafo_id ★ | string | | `kafo_brikama` |
| crop ★ | enum | | `okra` |
| beds | number | | `40` |
| member_ids | string[] | Farmers growing this batch | `["user_awa","user_binta"]` |
| planted_on | date | | `2026-10-20` |
| expected_harvest ★ | date | Pre-filled from crop calendar, editable | `2026-12-17` |
| expected_kg | number | Pre-filled beds × kg_per_bed, editable | `160` |
| stage ★ | enum | `planted \| growing \| ready \| harvested` | `growing` |
| lost_kg | number | Reported losses | `0` |
| lost_reason | enum? | `pests \| disease \| flood \| drought \| animals \| other` | |
| order_id | string? | Forward order this batch serves | `order_0001` |
| logged_by | string | Leader user ID (required) | `user_fatou` |
| logged_at, updated_at | timestamp | | |
Writer: **leader only** (admin may correct)

### `reports`
Problem reports (pests, disease, etc.).
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | | `rep_a91b0e` |
| reporter_id | string | Farmer or leader | `user_awa` |
| kafo_id ★ | string | | `kafo_brikama` |
| district ★ | string | Copied from kafo | `Kombo Central` |
| crop | enum | | `okra` |
| problem | enum | `insects \| leaf_spots \| wilting \| animals \| flooding \| other` | `insects` |
| voice_note | blob? | Recorded description | |
| verified ★ | boolean | Confirmed by leader or admin | `false` |
| status | enum | `open \| dismissed \| escalated` | `open` |
| created_at ★ | timestamp | | |
Writer: farmer (create, unverified) · leader/admin (verify, dismiss, escalate)

### `alerts`
Admin warnings created from templates.
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | | `alert_0003` |
| template_type | enum | `heavy_rain \| dry_spell \| pest_outbreak \| disease` | `heavy_rain` |
| level | enum | `yellow \| red` | `red` |
| crops | string[] | Empty = all crops | `["okra"]` |
| districts | string[] | | `["Kombo Central"]` |
| starts_on, ends_on ★ | date | | |
| note | string? | Free text, shown in kafo app only | `From DWR bulletin 12` |
| created_by | string | Admin user ID | |
Writer: admin

---

## Market & orders

### `prices`
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | | `price_8812` |
| market_town_id ★ | string | | `town_serekunda` |
| crop ★ | enum | | `pepper` |
| price_per_kg | number | Dalasi | `60` |
| date ★ | date | Week of the price | `2026-10-19` |
| entered_by | string | | `user_admin` |
Writer: admin · Stale if older than `config.price_stale_days`.

### `transport_costs`
| Field | Type | Description | Example |
|---|---|---|---|
| from_town_id ★ | string | Kafo's market town | `town_brikama` |
| to_market_id ★ | string | | `town_serekunda` |
| cost_per_bag | number | Dalasi per bag | `50` |
Writer: admin

### `orders`
Buyer demand. Forward = before planting; spot = buying a confirmed offer.
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | | `order_0001` |
| buyer_id ★ | string | | `buyer_senegambia_hotel` |
| type ★ | enum | `forward \| spot` | `forward` |
| crop ★ | enum | | `okra` |
| kg | number | Total wanted | `150` |
| window_start, window_end | date | Delivery window | `2026-12-15` / `2026-12-21` |
| price_per_kg | number | Fixed offer | `55` |
| grade | enum | `A \| B` | `A` |
| fulfilment | enum | `pickup \| delivery` | `pickup` |
| delivery_fee | number | | `0` |
| repeat_weekly | boolean | | `false` |
| offer_id | string? | For spot orders | |
| status ★ | enum | `open \| partly_filled \| filled \| growing \| ready \| collected \| paid \| cancelled \| disputed` | `open` |
| cancelled_reason | string? | | |
| created_at | timestamp | | |
Writer: buyer (create, cancel while open) · system (status) · admin (dispute)

### `order_acceptances`
Kafos committing to (part of) an order.
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | | `acc_31c9` |
| order_id ★ | string | | `order_0001` |
| kafo_id ★ | string | | `kafo_brikama` |
| kg_committed | number | | `150` |
| accepted_by | string | Leader | `user_fatou` |
| accepted_at | timestamp | | |
Writer: **leader only**

### `produce_requests`
A farmer saying "I have produce" (needs leader confirmation).
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | | `req_5e1a` |
| farmer_id ★ | string | | `user_awa` |
| kafo_id ★ | string | | `kafo_brikama` |
| crop | enum | | `pepper` |
| amount_unit | enum | `bucket \| bag \| bags_2_4 \| bags_5_plus` | `bag` |
| est_kg | number | Converted with `config.unit_kg` | `25` |
| ready_when | enum | `today \| this_week` | `today` |
| status ★ | enum | `pending_leader \| merged \| rejected` | `pending_leader` |
| offer_id | string? | Set when merged | |
| created_at | timestamp | | |
Writer: farmer (create) · leader (merge/reject)

### `interests`
A farmer telling her leader she wants to plant a crop (USSD / voice "1 Tell my leader I'm interested"). Added in schema v2.
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | | `int_3b8e1c` |
| farmer_id ★ | string | | `user_binta` |
| kafo_id ★ | string | | `kafo_brikama` |
| crop | enum | | `okra` |
| status ★ | enum | `new \| seen` | `new` |
| created_at | timestamp | | |
Writer: farmer (create) · leader (mark seen)

### `produce_offers`
Kafo offers visible to buyers (spot market).
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | | `offer_0007` |
| kafo_id ★ | string | | `kafo_brikama` |
| crop | enum | | `pepper` |
| kg | number | Leader-confirmed | `75` |
| request_ids | string[] | Merged requests | |
| ready_when | enum | `today \| this_week` | |
| status ★ | enum | `available \| sold \| withdrawn` | `available` |
| confirmed_by | string | Leader | |
Writer: **leader only**

### `collections`
Buyer collecting from one kafo for one order.
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | | `col_11ab` |
| order_id ★ | string | | `order_0001` |
| kafo_id ★ | string | | `kafo_brikama` |
| kg_weighed | number | Total on the scale | `152` |
| kg_accepted | number | Buyer accepted | `150` |
| kg_rejected | number | | `2` |
| reject_reason | enum? | `size \| ripeness \| damage \| other` | `damage` |
| collected_at | timestamp | | |
Writer: leader (weighed) · buyer (accepted/rejected). `kg_accepted` / `kg_rejected` stay `null` until the buyer confirms.

### `deliveries`
Per-member share of a collection (basis for payment).
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | | `del_9a2f` |
| collection_id ★ | string | | `col_11ab` |
| order_id ★ | string | | `order_0001` |
| member_id ★ | string | Farmer | `user_awa` |
| kg | number | Weighed for this member | `38` |
Writer: **leader only**

### `payments`
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | | `pay_77de` |
| order_id ★ | string | | `order_0001` |
| collection_id | string | → `collections.id` this payment settles (one collection is paid once) | `col_11ab` |
| member_id ★ | string | | `user_awa` |
| amount | number | Dalasi = member kg × price, scaled by accepted/weighed | `2090` |
| method | enum | `wave \| qmoney \| afrimoney` (mock) | `wave` |
| status ★ | enum | `pending \| paid \| on_hold` | `paid` |
| due_by | timestamp | Collection + 48 h | |
| paid_at | timestamp? | | |
| platform_fee | number | Charged to buyer, not member | `52` |
Writer: system (on buyer Pay) · admin (hold/release)

---

## Communication

### `sms`
Simulated text messages (shown in the farmer phone's Messages app).
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | | `sms_4c2d` |
| to_user_id ★ | string | | `user_binta` |
| from | string | Always `1234` | `1234` |
| template_key | string | i18n key | `sms.alert.heavy_rain` |
| body | string | Rendered text, ≤160 chars, plain Latin | |
| lang | enum | | `wo` |
| read ★ | boolean | | `false` |
| sent_at ★ | timestamp | | |
Writer: system (`notify.js`)

### `calls`
Simulated voice calls (history + outbound alert calls).
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | | `call_0a19` |
| user_id ★ | string | | `user_binta` |
| direction | enum | `callback \| outbound_alert \| welcome` | `callback` |
| status | enum | `ringing \| answered \| missed \| ended` | `ended` |
| alert_id | string? | For alert calls | |
| started_at, ended_at | timestamp | | |
Writer: system

### `leads`
Unregistered callers who left their details.
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | | `lead_0002` |
| phone | string | | `7654321` |
| voice_note | blob? | Name + village recording | |
| market_town_id | string? | If given | |
| status ★ | enum | `new \| contacted \| registered \| not_suitable` | `new` |
| notes | string | Admin notes | |
| created_at | timestamp | | |
Writer: system (create) · admin (update)

---

## Admin & system

### `flags`
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | | `flag_01` |
| entity | enum | `planting \| collection \| order \| report` | `planting` |
| entity_id | string | | `plant_7f3a2c` |
| reason | enum | `kg_over_capacity \| update_burst \| estimate_gap` | |
| status ★ | enum | `open \| approved \| corrected` | `open` |
Writer: system (create) · admin (resolve)

### `disputes`
| Field | Type | Description | Example |
|---|---|---|---|
| id ★ | string | | `disp_01` |
| order_id ★ | string | | |
| raised_by | string | User ID | |
| issue | enum | `short_delivery \| quality \| late_payment \| other` | |
| description | string | | |
| status ★ | enum | `open \| resolved` | |
| resolution_note | string? | | |
Writer: buyer/leader (create) · admin (resolve)

### `audit`
| Field | Type | Description |
|---|---|---|
| id ★ | string | |
| user_id ★ | string | Who did it |
| action | string | e.g. `planting.create`, `order.accept`, `payment.pay` |
| entity_id | string | |
| at ★ | timestamp | |
Writer: system (every write by leader/buyer/admin)

### `config` (single row, id = `main`)
| Field | Type | Description | Default |
|---|---|---|---|
| seed_version | number | Bump when seed files change; browsers with an older copy reseed | `4` |
| demo_date | date | Current demo "today" | `2026-10-20` |
| plant_green_below | number | Supply ÷ demand | `0.8` |
| plant_red_above | number | | `1.3` |
| sell_green_above | number | Net price ÷ 4-week average at or above this → best market | `1.05` |
| sell_red_below | number | Net price ÷ 4-week average below this → avoid | `0.9` |
| report_count | number | Reports to trigger yellow | `3` |
| report_window_days | number | | `7` |
| alert_lead_days | number | Alerts count from this many days before they start (warnings) | `7` |
| price_stale_days | number | | `14` |
| price_avg_weeks | number | Sell comparison window | `4` |
| payment_due_hours | number | | `48` |
| fee_percent | number | Platform fee on buyer | `2.5` |
| unit_kg | object | `bucket: 10, bag: 25, bags_2_4: 75, bags_5_plus: 125` | |
| theme | string | Active colour theme name | `default` |

---

## Non-database data files (JSON in `src/data/`)
| File | Purpose | Shape |
|---|---|---|
| `i18n.json` | All UI, USSD and SMS text | `{ "key": { "en": "...", "mnk": "...", "wo": "...", "ff": "...", "dyo": "..." } }` |
| `ussd/menu.json` | USSD screens and key routing | `{ "MAIN": { "lines": ["key", ...], "keys": { "1": "PLANT" } } }` |
| `ivr/flow.json` | Voice menu nodes | `{ "main": { "clips": [...], "keys": { "1": "plant" }, "subtitle_key": "..." } }` |
| `ivr/clips.json` | Recording guide | `[{ "id": "crop_okra", "en_script": "okra", "langs_done": ["en"] }]` |
| `seed/*.json` | Demo data, one file per table (`users.json` holds admin, leaders, farmers and buyer contacts; `config.json` is the single config row) | arrays of rows matching this dictionary |

## Dexie schema string (keep in sync with ★ fields)
```js
db.version(1).stores({
  users: 'id, phone, role, kafo_id',
  farmers: 'user_id, kafo_id',
  kafos: 'id, code, district',
  buyers: 'id, verified',
  market_towns: 'id',
  crop_calendar: 'crop',
  plantings: 'id, kafo_id, crop, stage, expected_harvest',
  reports: 'id, kafo_id, district, verified, created_at',
  alerts: 'id, ends_on',
  prices: 'id, market_town_id, crop, date, [market_town_id+crop]',
  transport_costs: '[from_town_id+to_market_id], from_town_id, to_market_id',
  orders: 'id, buyer_id, type, crop, status',
  order_acceptances: 'id, order_id, kafo_id',
  produce_requests: 'id, farmer_id, kafo_id, status',
  produce_offers: 'id, kafo_id, status',
  collections: 'id, order_id, kafo_id',
  deliveries: 'id, collection_id, order_id, member_id',
  payments: 'id, order_id, member_id, status',
  sms: 'id, to_user_id, read, sent_at',
  calls: 'id, user_id',
  leads: 'id, status',
  flags: 'id, status',
  disputes: 'id, order_id, status',
  audit: 'id, user_id, at',
  config: 'id'
});
// v2
db.version(2).stores({
  interests: 'id, farmer_id, kafo_id, status'
});
```
