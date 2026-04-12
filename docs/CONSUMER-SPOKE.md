# Consumer Spoke — Design Specification

## Purpose
The consumer-facing pillar of the MGS ecosystem. Manages the GS wallet, impact dashboard, purchase tracking, campaign rewards, social sharing, and all consumer engagement channels — without storing any personally identifiable information.

The consumer spoke is the ONLY system that touches the end consumer. Manufacturer and retailer spokes never interact with consumers directly. The consumer spoke connects to both via the hub.

---

## 1. Architecture — The Three Pillars

```
                        ┌──────────────┐
                        │  MCP HUB     │
                        │  (control    │
                        │   plane)     │
                        └──────┬───────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
  ┌────────▼───────┐  ┌───────▼────────┐  ┌───────▼───────┐
  │ MANUFACTURER   │  │  CONSUMER      │  │  RETAILER     │
  │ SPOKES         │  │  SPOKE         │  │  SPOKES       │
  │                │  │                │  │               │
  │ • products     │  │ • wallet       │  │ • EPOS        │
  │ • campaigns    │  │ • impact map   │  │ • transactions│
  │ • GS values    │  │ • purchases    │  │ • analytics   │
  │ • analytics    │  │ • social share │  │ • campaigns   │
  │                │  │ • redemption   │  │               │
  └───────┬────────┘  └───────┬────────┘  └───────┬───────┘
          │                   │                   │
          │         ┌─────────┴─────────┐         │
          │         │  CONSUMER APPS    │         │
          └────────►│                   │◄────────┘
     gs values,     │ • mobile app     │  transaction
     campaign       │ • browser ext    │  confirmations,
     rewards        │ • web portal     │  gs earned
                    │ • gift cards     │
                    │ • charity        │
                    │ • car journeys   │
                    │ • can/bottle     │
                    │ • airline        │
                    └───────────────────┘
```

### Data flow

**Hub → Consumer spoke:**
- Product catalogue with GS values (which products earn GS)
- Active campaigns (bonus GS, double GS, promotions)
- Project portfolio (Amazon, pampas, African programmes — for impact map)
- GS expiry rules (12-month credential lifecycle)

**Consumer spoke → Hub:**
- GS allocation events (token X earned Y GS via channel Z)
- Redemption events (token X redeemed GS against project)
- Social share events (anonymised: how many shares, which platforms)

**Retailer spoke → Consumer spoke (via hub):**
- Transaction confirmations: "token ABC123 earned 42 GS at Tesco store TSC-0442"
- Active in-store campaigns relevant to this consumer's purchase history

**Manufacturer spoke → Consumer spoke (via hub):**
- Campaign rewards: "bonus 15 GS for buying Heinz this week"
- Product stories: "this product saved X kg CO2 through Y action" (for impact dashboard)

**NEVER stored in consumer spoke:**
- Consumer name, email, phone, address
- Loyalty card numbers
- Retailer or manufacturer commercial terms
- Other consumers' data (each token is isolated)

---

## 2. Pseudonymous Identity System

### Token generation
```
token = crypto.randomBytes(32).toString('hex')
token_hash = sha256(token)
recovery_phrase = bip39.generateMnemonic(128)  // 12 words
```

- The raw token lives ONLY on the consumer's device
- The consumer spoke stores the token_hash — cannot reverse to get the token
- The recovery phrase is shown once on first use, consumer writes it down
- Recovery phrase can regenerate the token on a new device

### Token lifecycle

```
generate → active → [earning / redeeming / sharing] → expired (12 months inactive)
                                                            │
                                                    reactivate (new purchase)
```

- Token never truly deletes — balance persists even if dormant
- 12 months of zero activity → GS balance frozen, visible decline on social map
- Any new activity (purchase, donation, etc.) reactivates immediately

---

## 3. Database

### tokens
The core identity table. Zero PII.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| token_hash | text UNIQUE | sha256 of the consumer's raw token |
| recovery_hash | text | sha256 of the recovery phrase (for verification only) |
| balance_gs | decimal | current GS balance |
| lifetime_gs | decimal | total GS ever earned |
| lifetime_redeemed | decimal | total GS redeemed against projects |
| last_activity_at | timestamp | last earn/redeem/share event |
| first_seen_at | timestamp | when token was first used |
| status | text | "active" / "dormant" / "frozen" |
| optional_email_hash | text | sha256 of recovery email IF consumer opted in. null otherwise. |
| created_at | timestamp | |

### transactions
Every GS-earning event.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| token_hash | text FK | |
| source | text | "epos" / "receipt_scan" / "browser_extension" / "gift_card" / "charity" / "car_journey" / "can_bottle" / "airline" |
| retailer_code | text | anonymised retailer reference |
| items | jsonb | array of { sku, name, gs_earned, campaign_bonus } |
| total_gs | decimal | |
| campaign_ids | integer[] | which campaigns contributed bonus GS |
| receipt_image_hash | text | hash of receipt image (for audit, image stored temporarily then deleted) |
| location_region | text | coarse region only (e.g. "north england"), never precise location |
| created_at | timestamp | |

### redemptions
When a consumer directs GS to a project.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| token_hash | text FK | |
| project_id | integer | hub project reference (from C2050 verified projects) |
| project_name | text | |
| gs_redeemed | decimal | |
| dimensions_contributed | jsonb | which dimensions this redemption supports |
| pin_coordinates | jsonb | { lat, lng } for the impact map |
| created_at | timestamp | |

### impact_map_pins
Pins on the consumer's shareable impact map.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| token_hash | text FK | |
| project_id | integer | |
| pin_type | text | "purchase" / "redemption" / "donation" / "gift" |
| coordinates | jsonb | { lat, lng } — project location, not consumer location |
| gs_value | decimal | GS associated with this pin |
| label | text | "heinz baked beans — 15 GS" (product level) or "rocket stoves — 200 GS" (project level) |
| earned_at | timestamp | |
| expires_at | timestamp | 12 months from earned_at |
| visible | boolean | true until expired |

### gift_cards
GS gift card purchases and redemptions.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| gift_code | text UNIQUE | unique redemption code |
| purchaser_token_hash | text | who bought it (null for corporate bulk purchases) |
| recipient_token_hash | text | who redeemed it (null until redeemed) |
| gs_amount | decimal | |
| occasion | text | "mothers_day" / "christmas" / "birthday" / "earth_day" / "corporate" / "general" |
| message | text | personal message (stored ephemerally, deleted after 30 days) |
| purchase_amount_pence | integer | what was paid in real money |
| currency | text | |
| status | text | "active" / "redeemed" / "expired" |
| purchased_at | timestamp | |
| redeemed_at | timestamp | |
| expires_at | timestamp | 12 months from purchase |

### charity_subscriptions
Recurring charity donations earning GS.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| token_hash | text FK | |
| charity_name | text | |
| charity_verified | boolean | C2050 verified charity |
| donation_amount_pence | integer | monthly amount |
| currency | text | |
| gs_per_month | decimal | GS earned per donation cycle |
| bonus_gs_12month | decimal | bonus GS for maintaining 12 consecutive months |
| streak_months | integer | consecutive months donated |
| status | text | "active" / "paused" / "cancelled" |
| started_at | timestamp | |
| last_donation_at | timestamp | |
| next_donation_at | timestamp | |

### social_shares
Anonymised tracking of social sharing for viral loop analytics.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| token_hash | text FK | |
| platform | text | "instagram" / "facebook" / "x" / "linkedin" / "whatsapp" / "other" |
| share_type | text | "impact_map" / "milestone" / "gift_card" / "campaign" |
| shared_at | timestamp | |
| referral_tokens_generated | integer | how many new tokens were created from this share's URL |

### engagement_channels
Tracks which channels each token uses.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| token_hash | text FK | |
| channel | text | "mobile_app" / "browser_extension" / "web_portal" / "receipt_scan" |
| first_used_at | timestamp | |
| last_used_at | timestamp | |
| total_events | integer | |

---

## 4. Consumer-Facing Apps

All apps share the same consumer spoke backend. The token is the identity across all channels.

### 4.1 Mobile App
The primary consumer interface.

**Screens:**
- **home:** GS balance (large), recent activity feed, active campaigns nearby
- **wallet:** QR code display (for EPOS scanning), token management, recovery phrase backup
- **earn:** receipt scanner (camera), nearby participating retailers (map), online shopping link (opens browser extension)
- **impact:** project map with pins, dimensional breakdown ("your 2,847 GS contributed to: 1,903kg CO2 reduced, 10 families electrified, 47 trees protected"), shareable impact card
- **history:** full transaction log, filterable by retailer/product/date/channel
- **redeem:** choose a project to direct GS to, browse C2050 verified projects by dimension/region
- **gift:** buy GS gift cards, enter gift codes, view received gifts
- **donate:** set up charity subscriptions, view streak, browse verified charities
- **share:** generate shareable impact card, share to social platforms, view referral stats
- **settings:** recovery phrase, optional email backup, notification preferences, channel connections

### 4.2 Browser Extension
For online shopping GS earning.

**Features:**
- detects participating manufacturer products on retail websites
- shows GS badge next to qualifying products: "earn 15 GS"
- highlights active campaigns: "double GS on Heinz this week"
- post-purchase: prompts consumer to link the transaction to their token
- works on any retail website selling contracted manufacturer products

### 4.3 Web Portal
Browser-based access to the full wallet and impact dashboard.

**URL:** mygreensquares.com/wallet (requires token — entered or scanned from phone)

### 4.4 Public Share Map
No authentication required. Anyone can view.

**URL:** mygreensquares.com/map/{token_hash_short}

**Shows:**
- impact map with pins (projects funded, products purchased)
- total GS earned
- dimensional impact summary
- "join green squares" call to action
- Open Graph metadata for social preview: image auto-generated showing GS count + impact stats

---

## 5. API Endpoints

### Consumer app → Spoke backend

| endpoint | method | purpose |
|---|---|---|
| /api/wallet/create | POST | generate new token + recovery phrase |
| /api/wallet/recover | POST | recover token from 12-word phrase |
| /api/wallet/balance | GET | current GS balance + lifetime stats |
| /api/wallet/qr | GET | generate QR code data for EPOS scanning |
| /api/transactions | GET | transaction history (filterable) |
| /api/transactions/scan-receipt | POST | submit receipt image for OCR matching |
| /api/earn/nearby | GET | nearby participating retailers (coarse location) |
| /api/earn/products | GET | product catalogue with GS values |
| /api/earn/campaigns | GET | active campaigns relevant to consumer |
| /api/impact/map | GET | pins and impact data for this token |
| /api/impact/summary | GET | dimensional impact breakdown |
| /api/impact/share | POST | generate shareable impact card + OG image |
| /api/redeem/projects | GET | browse C2050 verified projects |
| /api/redeem | POST | direct GS to a project |
| /api/gift/purchase | POST | buy a GS gift card |
| /api/gift/redeem | POST | redeem a gift code |
| /api/gift/history | GET | sent and received gifts |
| /api/charity/subscribe | POST | set up recurring donation |
| /api/charity/cancel | POST | cancel subscription |
| /api/charity/list | GET | browse verified charities |
| /api/charity/streak | GET | current donation streak + bonus info |
| /api/social/share | POST | log a social share event |
| /api/social/referrals | GET | referral stats (how many new tokens from my shares) |

### Public endpoints (no auth)

| endpoint | method | purpose |
|---|---|---|
| /api/public/map/:hash | GET | public impact map data |
| /api/public/og-image/:hash | GET | auto-generated Open Graph image |
| /api/public/stats | GET | global MGS stats (total GS issued, projects funded, consumers) |

### Hub ↔ Consumer spoke sync

| endpoint | direction | purpose |
|---|---|---|
| /api/sync/products | hub → spoke | product catalogue with GS values |
| /api/sync/campaigns | hub → spoke | active campaigns |
| /api/sync/projects | hub → spoke | C2050 verified projects for redemption |
| /api/sync/gs-earned | spoke → hub | GS allocation events (for manufacturer/retailer analytics) |
| /api/sync/redemptions | spoke → hub | redemption events (for project tracking) |
| /api/sync/social-stats | spoke → hub | anonymised sharing stats (for viral loop analytics) |

### Retailer spoke → Consumer spoke (via hub)

| data | flow |
|---|---|
| EPOS transaction confirmed | retailer spoke → hub → consumer spoke: updates token balance |
| In-store campaign reward | retailer spoke → hub → consumer spoke: bonus GS credited |
| Receipt scan match | consumer spoke → hub → retailer spoke: sale attributed |

### Manufacturer spoke → Consumer spoke (via hub)

| data | flow |
|---|---|
| Campaign reward | manufacturer spoke → hub → consumer spoke: bonus GS for qualifying purchase |
| Product story | manufacturer spoke → hub → consumer spoke: sustainability narrative for impact dashboard |

---

## 6. Receipt Scanning Engine

Built into the consumer spoke as the primary day-one earning mechanism.

### Flow
```
consumer photographs receipt
    → image uploaded (stored temporarily, deleted after processing)
    → OCR extracts text (tesseract / google vision)
    → line items parsed: product names, quantities, prices
    → fuzzy match against hub product catalogue (contracted manufacturers only)
    → matched items → GS allocated per product
    → unmatched items → flagged as "not yet participating"
    → results returned to consumer app
    → receipt image hash stored (audit trail), image deleted
```

### Matching logic
```
for each line_item in receipt:
    1. exact SKU match against products_stocked
    2. if no SKU: fuzzy name match (levenshtein distance < 3)
    3. if no name match: brand keyword match
    4. if matched AND product.gs_status == "active":
        → allocate gs_per_unit × quantity
        → apply any active campaign multiplier
    5. if not matched:
        → show as "not yet participating" in app
        → log as demand signal (anonymised: "product X seen Y times, not contracted")
```

### Demand signals
Unmatched products create anonymised demand data pushed to the hub. The hub uses this in sales conversations: "your product appeared on 50,000 receipts last month but isn't earning GS. Here's what you're missing."

---

## 7. GS Expiry and Social Pressure

### 12-month rolling expiry
- Each GS earned has an `expires_at` = `earned_at + 12 months`
- On expiry: pin fades on impact map, GS deducted from visible balance
- Lifetime total never decreases (only visible/active balance)
- Dormancy: if no activity for 12 months, status → "dormant", all GS frozen

### Social pressure mechanics
- Impact map is public — friends can see your pin count declining
- Monthly digest (if notifications enabled): "you earned 142 GS this month. 38 GS expiring next month."
- Streak bonuses on charity: "12 consecutive months → 50 bonus GS"
- Referral visibility: "you've inspired 7 friends to join green squares"

### Reactivation
- Any earning event reactivates a dormant token
- Previously frozen GS remain expired but new earning resumes
- No penalty for returning — the system rewards activity, not punishes absence

---

## 8. Gift Card System

### Purchase flow
```
consumer opens gift card screen
    → selects occasion (mothers day, christmas, birthday, earth day, corporate, general)
    → selects GS amount (100, 250, 500, 1000, custom)
    → pays via payment provider (stripe / similar)
    → gift code generated
    → optional: add personal message (deleted after 30 days)
    → share gift code via link, QR, or social
```

### Redemption flow
```
recipient opens GS app or web portal
    → enters gift code
    → GS credited to their token
    → pins appear on their impact map (labelled as "gift from a friend")
    → if recipient has no token, one is created automatically
```

### Corporate gifting
- Companies buy GS gift cards in bulk via hub portal
- Each card has unique code
- Distributed to employees, clients, partners
- Company sees aggregate redemption stats (how many redeemed, by region)
- No PII — company doesn't know which employee has which token

---

## 9. Charity Donation Programme

### Setup
```
consumer browses verified charities (C2050 verified or MGS-approved)
    → selects charity and monthly amount
    → payment via direct debit or card
    → GS earned per monthly donation (rate set by hub)
    → streak tracking begins
```

### Streak rewards
| months | bonus |
|---|---|
| 3 consecutive | +10% GS on next donation |
| 6 consecutive | +20% GS |
| 12 consecutive | +50 bonus GS + "sustained giver" badge on impact map |
| 24 consecutive | +100 bonus GS + "champion" badge |

### Expiry protection
Charity GS follow the same 12-month expiry BUT: active subscriptions continuously earn new GS, so the balance naturally sustains. If a consumer cancels, their charity GS begin expiring after 12 months — creating visible decline on their social map.

This directly solves the charity sector's donor retention problem.

---

## 10. Channel Integration Points

### Car journeys (chauffeur, rental, fleet, Institute of Motoring)
- Consumer's token linked to a car journey provider
- GS earned based on: vehicle efficiency, route optimisation, EV usage
- Transaction posted to consumer spoke via hub: { source: "car_journey", details }

### Can and bottle redemption
- Consumer scans token QR at redemption machine
- Machine posts to consumer spoke via hub: { source: "can_bottle", items_recycled, gs_earned }
- Multi-dimensional: waste + ecosystem + social

### Airline industry
- Consumer links token to airline loyalty programme (via Ludovino's airline org integration)
- GS earned per flight based on: airline's transition score, SAF usage, fleet efficiency
- Posted to consumer spoke via hub: { source: "airline", flight_ref, gs_earned }

### Browser extension
- Consumer installs extension, links to their token
- Extension detects qualifying products on retail websites
- Post-purchase: consumer confirms, GS allocated via hub
- Transaction posted: { source: "browser_extension", retailer_url, items, gs_earned }

All channels use the same token and the same transaction format. The consumer sees a unified balance regardless of how they earned.

---

## 11. Open Graph Image Generator

For social sharing. Auto-generates a branded image for each token's impact.

### Image spec
- 1200 × 630px (standard OG image)
- MGS green background (#6ab023 gradient)
- Consumer's GS count (large, white)
- Impact summary: "protecting X m² of rainforest"
- Pin count on mini-map
- "join green squares" call to action
- No consumer name or PII (unless consumer adds a display name locally)

### Served at
```
GET /api/public/og-image/:token_hash_short
→ returns PNG image
→ cached for 24 hours
→ regenerated when balance changes significantly (>10%)
```

### Social platform meta tags
```html
<meta property="og:title" content="I've earned 2,847 green squares" />
<meta property="og:description" content="protecting 566m² of rainforest and supporting 10 communities" />
<meta property="og:image" content="https://mygreensquares.com/api/public/og-image/abc123" />
<meta property="og:url" content="https://mygreensquares.com/map/abc123" />
```

---

## 12. Deployment

### Single instance (MVP)
- Same VPS as hub for initial launch
- Own PostgreSQL database (separate from hub)
- Express API + React app served by nginx on a subdomain (e.g. app.mygreensquares.com)

### Scaled deployment
- Separate infrastructure from hub
- Read replicas for transaction-heavy queries
- CDN for OG images and static assets
- Rate limiting per token (prevent abuse)
- Receipt image processing offloaded to worker queue

### Template contents
```
consumer-spoke/
  server/
    routes/         — wallet, transactions, earn, impact, redeem, gift, charity, social
    services/       — receipt OCR, GS calculation, expiry engine, OG image generator
    workers/        — receipt processing queue, expiry cron, analytics rollup
    sync/           — hub sync engine
    tests/          — API tests
    migrations/     — database schema
  client/src/
    pages/          — home, wallet, earn, impact, history, redeem, gift, donate, share, settings
    components/     — map, qr-code, impact-card, product-badge, campaign-banner
  shared/           — types, token utils, sync protocol
  public/           — OG image templates, icons, manifest
```

**Build estimate:** ~120-150k tokens. The largest spoke due to receipt scanning engine, OG image generation, gift card system, charity subscriptions, and multiple earning channels.

---

## 13. Privacy Summary

| data | stored? | retention | notes |
|---|---|---|---|
| consumer name | ✗ never | — | |
| consumer email | only if opted in, as sha256 hash | indefinite | for recovery only |
| consumer phone | ✗ never | — | |
| consumer address | ✗ never | — | |
| consumer location | coarse region only | per transaction | "north england", never GPS |
| token (raw) | ✗ never on server | — | device only |
| token hash | ✓ | indefinite | cannot reverse to raw token |
| receipt images | temporary | deleted after OCR processing | hash retained for audit |
| gift messages | ✓ | 30 days | auto-deleted |
| transaction data | ✓ | indefinite | no PII — token hash + products + GS |
| social shares | ✓ anonymised | indefinite | platform + type + timestamp only |

The consumer spoke database could be published in its entirety and no individual could be identified.
