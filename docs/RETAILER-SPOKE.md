# Retailer Spoke — Design Specification

## Purpose
A dedicated spoke instance for each contracted retailer. Provides the retailer with their own portal for analytics, campaign participation, EPOS integration management, and consumer engagement insights — while the hub (MCP) retains all commercial governance and GS pricing authority.

Each retailer gets their own database, deployment, and portal. Tesco cannot see Sainsbury's data.

---

## 1. Architecture

```
                        ┌──────────────┐
                        │  MCP HUB     │
                        │              │
                        │ • pricing    │
                        │ • gs values  │
                        │ • rules      │
                        └──────┬───────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼───────┐ ┌─────▼──────┐ ┌───────▼────────┐
     │ TESCO SPOKE    │ │ SAINSBURY'S │ │ CARREFOUR      │
     │                │ │ SPOKE      │ │ SPOKE          │
     │ own database   │ │ own db     │ │ own db         │
     │ EPOS link      │ │ EPOS link  │ │ EPOS link      │
     │ analytics      │ │ analytics  │ │ analytics      │
     └────────────────┘ └────────────┘ └────────────────┘
```

### Data flow

**Hub → Spoke (push/webhook):**
- Product catalogue with GS values per SKU (which products in their stores earn GS)
- Active campaigns affecting this retailer (manufacturer campaigns, JV campaigns)
- Pricing rules (retailer's deal terms — their volume tier, any co-funding arrangements)
- Consumer engagement benchmarks (anonymised category averages)

**Spoke → Hub (push/api):**
- Transaction data: { token, product_skus, gs_earned, timestamp } — no PII
- Campaign participation results
- EPOS integration status and health

**Never flows from spoke:**
- Consumer PII (retailer holds this in their own systems, never transmitted)
- Other retailers' data
- Manufacturer deal terms

---

## 2. Database (per retailer)

### transactions
Individual GS-earning transactions at this retailer.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| token_hash | text | anonymised consumer token (hashed) |
| transaction_ref | text | retailer's own transaction reference |
| items | jsonb | array of { sku, name, quantity, gs_earned } |
| total_gs | decimal | total GS for this transaction |
| total_items | integer | |
| total_value_local | decimal | basket value in local currency (no breakdown) |
| currency | text | |
| store_code | text | which store location |
| region | text | |
| source | text | "epos" / "receipt_scan" |
| campaign_ids | integer[] | campaigns active at time of transaction |
| created_at | timestamp | |

### stores
Retailer's store locations (for regional analytics and campaign targeting).

| column | type | notes |
|---|---|---|
| id | serial PK | |
| store_code | text | retailer's own code |
| name | text | |
| region | text | |
| country | text | |
| postcode | text | |
| status | text | "active" / "inactive" |
| epos_integrated | boolean | is this store's EPOS sending data? |
| epos_last_seen | timestamp | last transaction from this store |

### products_stocked
Which GS-earning products this retailer stocks.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| hub_product_id | integer | reference to hub products table |
| sku | text | retailer's own SKU (may differ from manufacturer's) |
| manufacturer_sku | text | manufacturer's SKU for matching |
| name | text | |
| brand | text | |
| gs_per_unit | decimal | synced from hub |
| category | text | |
| in_stock | boolean | |
| last_sold_at | timestamp | |
| updated_at | timestamp | |

### campaigns_active
Campaigns currently running at this retailer.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| hub_campaign_id | integer | reference to hub/manufacturer campaign |
| name | text | |
| type | text | "manufacturer_bonus" / "jv_cofunded" / "retailer_own" |
| gs_multiplier | decimal | |
| target_products | integer[] | product IDs |
| target_stores | text[] | store codes (or "all") |
| start_date | timestamp | |
| end_date | timestamp | |
| budget_gs | decimal | retailer's GS budget (if co-funding) |
| budget_spent_gs | decimal | |
| status | text | "active" / "scheduled" / "completed" |

### campaign_results
Performance per campaign at this retailer.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| campaign_id | integer FK | |
| date | date | |
| transactions | integer | number of qualifying transactions |
| gs_earned | decimal | |
| units_sold | integer | |
| unique_tokens | integer | |
| avg_basket_value | decimal | |
| store_code | text | per-store breakdown |

### analytics_daily
Pre-computed daily analytics.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| date | date | |
| total_transactions | integer | |
| total_gs | decimal | |
| total_units | integer | |
| unique_tokens | integer | |
| avg_gs_per_transaction | decimal | |
| top_product_id | integer | |
| top_store_code | text | |
| gs_participation_rate | decimal | % of total transactions that earned GS |

---

## 3. Retailer Portal (frontend)

The retailer logs into their portal (e.g. tesco.mgs-portal.com or bmcewan.co.uk/portal/tesco).

### Pages

**dashboard**
- total GS allocated today / this week / this month
- GS participation rate (% of transactions earning GS)
- top 10 GS products in their stores
- store-by-store GS performance map
- active campaigns and their performance
- trend charts: GS volume, participation rate, unique consumers over time

**transactions**
- searchable/filterable transaction log
- filter by: date range, store, product, campaign
- no consumer PII shown — only token hashes and transaction data
- export to CSV

**products**
- GS-earning products stocked in their stores
- GS value per product (synced from hub — read-only)
- stock status, last sold date
- product performance ranking

**campaigns**
- view active manufacturer campaigns affecting their stores
- view and manage JV co-funded campaigns
- create retailer-own campaigns (e.g. "earn bonus GS on all organic products this week")
  - submitted to hub for approval
- campaign performance: impressions, conversions, GS earned, incremental sales
- A/B test results (if participating in a manufacturer's A/B test)

**analytics**
- **consumer engagement:**
  - unique GS-earning consumers per period
  - repeat consumer rate (same token returning within 30 days)
  - avg GS per consumer per visit
  - consumer frequency distribution
- **product performance:**
  - GS products vs non-GS products: basket value comparison
  - category breakdown: which categories drive most GS engagement
  - product affinity: which GS products are bought together
- **store performance:**
  - GS participation rate by store
  - regional heatmap
  - store ranking by GS volume
- **competitive benchmarking (anonymised):**
  - "your GS participation rate vs category average"
  - "your avg GS per transaction vs market median"
  - "your repeat consumer rate vs similar retailers"
  - no competitor names — only anonymised percentiles
- **campaign ROI:**
  - incremental sales attributed to GS campaigns
  - cost per additional unit sold (for co-funded campaigns)
  - GS budget efficiency

**epos integration**
- integration status per store (connected / disconnected / error)
- last transaction timestamp per store
- API health dashboard
- test transaction tool (sandbox mode)
- integration guide / documentation link

**settings**
- team members (retailer can add their own portal users)
- notification preferences (daily digest, campaign alerts, integration errors)
- store management (add/update stores)
- API keys for EPOS integration
- branding (logo for their portal)

---

## 4. API Endpoints (spoke)

### Spoke internal API (retailer portal → spoke backend)

| endpoint | method | purpose |
|---|---|---|
| /api/dashboard | GET | pre-computed dashboard stats |
| /api/transactions | GET | transaction log (filterable) |
| /api/transactions/export | GET | CSV export |
| /api/products | GET | GS products in this retailer's stores |
| /api/stores | GET/POST/PUT | manage store locations |
| /api/stores/:code/status | GET | EPOS integration health per store |
| /api/campaigns | GET/POST | view and create campaigns |
| /api/campaigns/:id/results | GET | campaign performance |
| /api/analytics/consumers | GET | consumer engagement metrics |
| /api/analytics/products | GET | product performance |
| /api/analytics/stores | GET | store performance |
| /api/analytics/benchmark | GET | anonymised competitive benchmarking |
| /api/analytics/campaigns | GET | campaign ROI |
| /api/settings/users | GET/POST/PUT/DELETE | retailer team management |

### EPOS Inbound API (retailer's EPOS → spoke)

This is what the retailer's till systems call after each qualifying transaction.

| endpoint | method | purpose |
|---|---|---|
| /api/v1/transaction | POST | submit a transaction |

**Request:**
```json
{
  "api_key": "tesco_epos_<key>",
  "token": "ABC123",
  "store_code": "TSC-0442",
  "transaction_ref": "TSC-0442-20260415-1847",
  "items": [
    { "sku": "5000157024671", "name": "heinz baked beans 415g", "quantity": 2, "price": 1.80 },
    { "sku": "5010029217261", "name": "birds eye garden peas 800g", "quantity": 1, "price": 2.00 }
  ],
  "total_value": 5.60,
  "currency": "GBP",
  "timestamp": "2026-04-15T14:47:22Z"
}
```

**Response:**
```json
{
  "transaction_id": "MGS-TXN-2026-0000847",
  "gs_earned": [
    { "sku": "5000157024671", "gs": 15, "campaign_bonus": 15, "total": 30 },
    { "sku": "5010029217261", "gs": 12, "campaign_bonus": 0, "total": 12 }
  ],
  "total_gs": 42,
  "token_balance": 2889,
  "active_campaigns": [
    { "name": "double gs on heinz — april", "products_affected": 1 }
  ]
}
```

The EPOS can optionally display the GS earned on the receipt.

### Hub ↔ Spoke sync API

| endpoint | direction | purpose |
|---|---|---|
| /api/sync/products | hub → spoke | push GS product catalogue updates |
| /api/sync/campaigns | hub → spoke | push campaign activations/deactivations |
| /api/sync/pricing | hub → spoke | push retailer deal term updates |
| /api/sync/benchmarks | hub → spoke | push anonymised competitive benchmarks |
| /api/sync/transactions | spoke → hub | push aggregated transaction data (daily rollup) |
| /api/sync/campaign-results | spoke → hub | push campaign performance for manufacturer visibility |
| /api/sync/store-status | spoke → hub | push EPOS integration health |

---

## 5. EPOS Integration Tiers

Not every store will have full EPOS integration on day one. The spoke handles mixed tiers.

| tier | how it works | data quality |
|---|---|---|
| **tier 1: receipt scanning** | consumer scans receipt in GS app. spoke's OCR matches products. | ~80% accuracy, delayed (consumer must scan) |
| **tier 2: api integration** | retailer's EPOS calls POST /api/v1/transaction in real time. | 100% accuracy, real time |
| **tier 3: full integration** | EPOS + loyalty card linking + campaign display on receipt. | 100% accuracy, real time, consumer sees GS on receipt |

A retailer may have tier 2 in urban stores and tier 1 in smaller branches. The spoke handles both simultaneously.

---

## 6. Anonymised Competitive Benchmarking

The hub computes benchmarks across all retailer spokes. No retailer names or raw data cross boundaries.

**What the hub computes:**
- Median GS participation rate across all retailers
- Percentile bands: top 10%, top 25%, median, bottom 25%
- Category-level averages (grocery, pharmacy, fashion, etc.)

**What the retailer sees:**
- "your GS participation rate: 4.2% (72nd percentile)"
- "category average: 3.8%"
- "your repeat consumer rate: 23% (above median)"

**What the retailer never sees:**
- Which retailers are in which percentile
- Raw numbers from any other retailer
- Identity of any other retailer

---

## 7. Deployment

Each retailer spoke is a deployable template (same codebase as manufacturer spoke pattern):
- Docker container or standalone Node.js app
- Own PostgreSQL database
- Connected to hub via authenticated API
- Separate hosting for enterprise retailers (Tesco-scale) or shared for smaller retailers

### Spoke template contents
```
retailer-spoke/
  server/          — express api, EPOS inbound, sync engine, analytics
  client/          — react portal (dashboard, transactions, products, campaigns, analytics)
  shared/          — types, sync protocol, EPOS api contract
  migrations/      — database schema
  config/          — retailer-specific settings (loaded from hub)
  docs/            — EPOS integration guide for retailer's IT team
```

### Scaling considerations

| retailer size | hosting | database |
|---|---|---|
| pilot / small | shared VPS with other small retailers | shared PostgreSQL, separate schemas |
| mid-tier | dedicated container on VPS | dedicated PostgreSQL database |
| enterprise (Tesco-scale) | dedicated VPS or cloud instance | dedicated PostgreSQL with read replicas |

The hub's spoke registry tracks: which retailers, which URLs, which API keys, which hosting tier.

**Build estimate:** ~100-120k tokens for the template. Each subsequent retailer is config + deploy only. Significant overlap with manufacturer spoke — shared sync engine, auth, analytics framework.

---

## 8. Relationship to Manufacturer Spoke

| data | manufacturer sees | retailer sees |
|---|---|---|
| sales of their products at this retailer | ✓ yes (aggregated) | ✓ yes (detailed, their stores) |
| campaign performance | ✓ yes (cross-retailer) | ✓ yes (their stores only) |
| other manufacturers' data | ✗ no | ✓ yes (all GS products they stock) |
| other retailers' data | ✓ yes (anonymised benchmarks) | ✗ no |
| consumer PII | ✗ never | ✗ never (held in retailer's own systems) |
| GS pricing / deal terms | their own deal only | their own deal only |

The manufacturer spoke and retailer spoke see the same transactions from different angles. The hub ensures each party only sees what they're entitled to.
