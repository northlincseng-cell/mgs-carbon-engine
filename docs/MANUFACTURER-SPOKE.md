# Manufacturer Spoke — Design Specification

## Purpose
A dedicated spoke instance for each contracted manufacturer. Provides the manufacturer with their own portal to manage products, GS values, campaigns, and view sales analytics — while the hub (MCP) retains all pricing authority and commercial governance.

Each manufacturer gets their own database, their own deployment, and their own portal URL. Data isolation is absolute — Heinz cannot see Unilever's data.

---

## 1. Architecture

```
                        ┌──────────────┐
                        │  MCP HUB     │
                        │              │
                        │ • pricing    │
                        │ • rules      │
                        │ • approvals  │
                        └──────┬───────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼───────┐ ┌─────▼──────┐ ┌───────▼────────┐
     │ HEINZ SPOKE    │ │ UNILEVER   │ │ NESTLÉ SPOKE   │
     │                │ │ SPOKE      │ │                │
     │ own database   │ │ own db     │ │ own db         │
     │ own portal     │ │ own portal │ │ own portal     │
     │ own campaigns  │ │            │ │                │
     └────────────────┘ └────────────┘ └────────────────┘
```

### Data flow

**Hub → Spoke (push/webhook):**
- Product catalogue rules (which SKUs qualify for GS)
- GS values per SKU (calculated by carbon accounting engine, approved by hub)
- Pricing rules (what the manufacturer pays per GS — from their deal in the hub)
- Campaign approval/rejection decisions
- Retailer list (which retailers stock their products)

**Spoke → Hub (push/api):**
- Product submissions (new SKUs, updated emissions data)
- Campaign proposals (manufacturer creates, hub approves)
- GS allocation events (when receipt scanning or EPOS confirms a sale)

**Never flows from spoke:**
- Other manufacturers' data (isolated databases)
- Hub-level pricing cascade details
- Other deal terms

---

## 2. Database (per manufacturer)

### products
The manufacturer's product catalogue with GS values.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| hub_product_id | integer | reference to hub products table |
| sku | text | manufacturer's own SKU |
| name | text | |
| brand | text | |
| category | text | |
| gs_per_unit | decimal | current approved GS value (synced from hub) |
| gs_status | text | "active" / "pending_review" / "suspended" |
| emissions_data | jsonb | manufacturer-submitted: carbon, renewable %, supply chain scores |
| image_url | text | product image for campaigns |
| created_at | timestamp | |
| updated_at | timestamp | |

### sales
Aggregated sales data flowing back from receipt scanning and EPOS spokes.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| product_id | integer FK | |
| retailer_code | text | anonymised retailer reference |
| region | text | geographic region |
| units_sold | integer | |
| gs_allocated | decimal | total GS earned by consumers |
| period_start | date | aggregation period |
| period_end | date | |
| source | text | "receipt_scan" / "epos" / "browser_extension" |
| created_at | timestamp | |

### campaigns
Manufacturer-created promotional campaigns.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| name | text | |
| type | text | "bonus_gs" / "double_gs" / "product_launch" / "ab_test" / "jv_retailer" |
| status | text | "draft" / "submitted" / "hub_approved" / "active" / "completed" / "rejected" |
| target_products | integer[] | product IDs included |
| target_retailers | text[] | retailer codes (or "all") |
| target_regions | text[] | geographic targeting |
| gs_multiplier | decimal | e.g. 2.0 for double GS |
| budget_gs | decimal | total GS budget for campaign |
| budget_spent_gs | decimal | GS allocated so far |
| start_date | timestamp | |
| end_date | timestamp | |
| ab_variant | text | null for non-AB, "A" or "B" for AB tests |
| ab_partner_campaign_id | integer | links A to B variant |
| jv_retailer_code | text | for joint venture campaigns |
| jv_retailer_contribution_pct | decimal | retailer's share of GS cost |
| hub_approval_id | integer | reference to hub approval_queue |
| hub_approved_at | timestamp | |
| notes | text | |
| created_at | timestamp | |
| updated_at | timestamp | |

### campaign_results
Performance data per campaign.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| campaign_id | integer FK | |
| date | date | |
| impressions | integer | consumers who saw the campaign |
| gs_earned | decimal | GS allocated via this campaign |
| units_sold | integer | product sales attributed |
| unique_tokens | integer | unique consumer tokens engaged |
| conversion_rate | decimal | % of impressions → purchase |
| region | text | |

### analytics_snapshots
Pre-computed analytics for the manufacturer dashboard.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| period | text | "daily" / "weekly" / "monthly" |
| period_date | date | |
| total_gs_allocated | decimal | |
| total_units_sold | integer | |
| unique_consumers | integer | unique tokens |
| top_product_id | integer | best performer |
| top_retailer_code | text | best retail channel |
| avg_gs_per_transaction | decimal | |
| repeat_purchase_rate | decimal | % consumers buying again within 30 days |

---

## 3. Manufacturer Portal (frontend)

The manufacturer logs into their own portal (e.g. heinz.mgs-portal.com or bmcewan.co.uk/portal/heinz).

### Pages

**dashboard**
- total GS allocated this month/quarter/year
- units sold with GS attribution
- top 5 products by GS engagement
- top 5 retailers by volume
- campaign performance summary
- consumer engagement trend (line chart)

**products**
- full product catalogue with GS values per SKU
- submit new product (goes to hub for GS calculation and approval)
- update emissions data (triggers recalculation)
- product status: active, pending review, suspended

**campaigns**
- create new campaign:
  - bonus GS (multiplier on selected products)
  - double GS (2x for a period)
  - product launch (new SKU promotion)
  - A/B test (two variants, different GS levels or regions, hub measures performance)
  - JV with retailer (co-funded bonus GS at specific retailer)
- campaign calendar view
- submit for hub approval
- track active campaigns in real time

**analytics**
- sales by retailer (anonymised if needed — "retailer A", "retailer B")
- sales by region
- sales by product
- GS engagement rate (what % of sales earned GS)
- campaign ROI (GS spent vs incremental sales)
- A/B test results (variant A vs B performance comparison)
- consumer behaviour: repeat purchase rate, basket composition, time between purchases
- competitive benchmarking (anonymised): "your GS engagement vs category average"

**settings**
- team members (manufacturer can add their own users)
- notification preferences
- API keys for their own integrations
- branding (logo, colours for their portal)

---

## 4. API Endpoints (spoke)

### Spoke internal API (manufacturer portal → spoke backend)

| endpoint | method | purpose |
|---|---|---|
| /api/products | GET/POST/PUT | manage product catalogue |
| /api/products/:id/emissions | POST | submit emissions data for recalculation |
| /api/sales | GET | sales data (filterable by product, retailer, region, period) |
| /api/campaigns | GET/POST/PUT | manage campaigns |
| /api/campaigns/:id/submit | POST | submit campaign to hub for approval |
| /api/campaigns/:id/results | GET | campaign performance data |
| /api/analytics/dashboard | GET | pre-computed dashboard stats |
| /api/analytics/products | GET | product-level analytics |
| /api/analytics/retailers | GET | retailer-level analytics |
| /api/analytics/ab-test/:id | GET | A/B test comparison results |
| /api/settings/users | GET/POST/PUT/DELETE | manufacturer team management |

### Hub ↔ Spoke sync API

| endpoint | direction | purpose |
|---|---|---|
| /api/sync/products | hub → spoke | push approved GS values, status updates |
| /api/sync/campaigns | hub → spoke | push approval/rejection decisions |
| /api/sync/pricing | hub → spoke | push pricing rule updates |
| /api/sync/retailers | hub → spoke | push retailer list updates |
| /api/sync/sales | spoke → hub | push aggregated sales data |
| /api/sync/campaign-proposals | spoke → hub | push campaign proposals for approval |
| /api/sync/product-submissions | spoke → hub | push new/updated product emissions |

---

## 5. A/B Test Campaign Flow

1. Manufacturer creates campaign with type "ab_test"
2. Defines variant A (e.g. 2x GS on product X in region North) and variant B (e.g. 3x GS in region South)
3. Submits both variants to hub for approval
4. Hub reviews: does this undermine GS value? Is budget within deal terms?
5. If approved, campaigns go active simultaneously
6. Receipt scanning / EPOS spokes apply the correct variant based on region
7. Results flow back to manufacturer spoke: sales, GS allocated, conversion rates per variant
8. Manufacturer views comparison dashboard: "variant A converted at 4.2%, variant B at 6.1%"
9. Campaign ends, manufacturer decides which approach to scale

---

## 6. JV (Joint Venture) Retailer Campaign Flow

1. Manufacturer proposes a JV: "double GS on Heinz beans at Tesco for 2 weeks"
2. Cost split defined: manufacturer pays 60% of GS cost, Tesco pays 40%
3. Submitted to hub — hub validates both the manufacturer deal and the retailer deal
4. If both parties approved, campaign activates at Tesco's spoke only
5. EPOS at Tesco applies the double GS
6. Results visible to both: manufacturer sees sales uplift, Tesco sees engagement
7. Each party billed their share via the hub's pricing cascade

---

## 7. Deployment

Each manufacturer spoke is a deployable template:
- Docker container or standalone Node.js app
- Own PostgreSQL database
- Connected to hub via authenticated API
- Can be hosted on same VPS (small manufacturers) or separate infrastructure (enterprise)
- Hub manages the spoke registry: which manufacturers, which URLs, which API keys

### Spoke template contents
```
manufacturer-spoke/
  server/          — express api, sync engine, analytics computation
  client/          — react portal (dashboard, products, campaigns, analytics)
  shared/          — types, sync protocol definitions
  migrations/      — database schema
  config/          — manufacturer-specific settings (loaded from hub)
```

**Build estimate:** ~100-120k tokens for the template. Each subsequent manufacturer is config + deploy only.
