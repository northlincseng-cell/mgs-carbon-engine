# MCP Manufacturer Pages — Build Specification

## Purpose
Add "manufacturers" as a first-class section in the MCP admin panel sidebar, with full drill-down into each manufacturer showing the data that their future spoke would contain. This turns the MCP from a governance-only tool into a demonstrable end-to-end platform.

---

## 1. Sidebar Menu Changes

Add new section "MANUFACTURERS" to the sidebar, positioned after "RETAILERS & PRODUCTS":

```
OVERVIEW
  dashboard

RETAILERS & PRODUCTS
  retailers
  products
  offers

MANUFACTURERS              ← NEW SECTION
  manufacturer list        ← NEW: grid/table of all manufacturers
  onboarding pipeline      ← NEW: staged pipeline (like retailer onboarding)

COMMERCIAL
  countries
  deals
  volume tiers
  gs pricing

ENGINES
  carbon accounting        ← NEW: links to carbon accounting pages
  equivalence
  value protection
  deal scoring

DATA FEEDS
  carbon markets
  c2050 feed
  regulatory updates

SYSTEM
  user management
  system status
  change log
  approvals
```

---

## 2. Database Tables (new)

### manufacturers
Separate from retailers — manufacturers are a distinct entity type.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| name | text NOT NULL | "Heinz", "Unilever", "Nestlé" |
| code | text UNIQUE | "HEINZ", "UNILEVER" — short reference |
| country | text | HQ country |
| flag | text | emoji flag |
| sector | text | "food_beverage" / "personal_care" / "household" / "fashion" / "automotive" / "other" |
| website | text | |
| contact_name | text | primary contact (not consumer PII — B2B contact) |
| contact_email | text | |
| onboarding_stage | text | "prospect" / "due_diligence" / "verification" / "contract" / "integration" / "live" |
| maturity_level | integer | 0-4 per capability maturity model |
| deal_id | integer FK → deals | linked deal in the hub |
| c2050_verified | boolean | has C2050 verification certificate |
| c2050_certificate_id | text | |
| deimos_measured | boolean | has Deimos measurement |
| scope1_tonnes | decimal | annual scope 1 emissions |
| scope2_tonnes | decimal | annual scope 2 emissions |
| scope3_tonnes | decimal | annual scope 3 emissions |
| total_tonnes | decimal | calculated |
| baseline_year | integer | |
| renewable_pct | decimal | % energy from renewables |
| transition_plan | jsonb | structured roadmap (see below) |
| logo_url | text | |
| notes | text | |
| status | text | "active" / "pending" / "suspended" / "dropped" |
| created_at | timestamp | |
| updated_at | timestamp | |

### manufacturer_products
Products belonging to this manufacturer with GS values.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| manufacturer_id | integer FK → manufacturers | |
| hub_product_id | integer FK → products | link to existing hub products table |
| sku | text | manufacturer's own SKU |
| name | text | |
| brand | text | sub-brand (e.g. "Heinz Beanz" under Heinz) |
| category | text | |
| gs_per_unit | decimal | approved GS value |
| gs_status | text | "draft" / "pending_calculation" / "pending_approval" / "active" / "suspended" |
| carbon_per_unit_g | decimal | grams CO2e per unit |
| transition_pct | decimal | % of GS from transition action |
| offset_pct | decimal | % from offset projects |
| dimensional_breakdown | jsonb | scores per dimension |
| offset_project_ids | integer[] | C2050 project references |
| price_local | text | retail price indication |
| image_url | text | |
| verified_at | timestamp | |
| created_at | timestamp | |
| updated_at | timestamp | |

### manufacturer_campaigns
Campaign data — illustrating what the manufacturer spoke would manage.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| manufacturer_id | integer FK → manufacturers | |
| name | text | |
| type | text | "bonus_gs" / "double_gs" / "product_launch" / "ab_test" / "jv_retailer" |
| status | text | "draft" / "submitted" / "approved" / "active" / "completed" / "rejected" |
| target_product_ids | integer[] | manufacturer_products |
| target_retailers | text[] | retailer codes or "all" |
| target_regions | text[] | |
| gs_multiplier | decimal | |
| budget_gs | decimal | total GS budget |
| budget_spent_gs | decimal | |
| start_date | timestamp | |
| end_date | timestamp | |
| ab_variant | text | null / "A" / "B" |
| ab_partner_id | integer | links A ↔ B |
| jv_retailer_code | text | |
| jv_contribution_pct | decimal | |
| results | jsonb | { impressions, gs_earned, units_sold, unique_tokens, conversion_rate } |
| approved_by | text | |
| approved_at | timestamp | |
| notes | text | |
| created_at | timestamp | |
| updated_at | timestamp | |

### manufacturer_sales
Aggregated sales data (simulated for demo, real data from spokes in production).

| column | type | notes |
|---|---|---|
| id | serial PK | |
| manufacturer_id | integer FK | |
| product_id | integer FK → manufacturer_products | |
| retailer_code | text | |
| region | text | |
| period | text | "daily" / "weekly" / "monthly" |
| period_date | date | |
| units_sold | integer | |
| gs_allocated | decimal | |
| revenue_estimated | decimal | estimated from gs_per_unit × units |
| source | text | "epos" / "receipt_scan" / "browser_extension" |
| created_at | timestamp | |

### manufacturer_transition_milestones
Tracking progress against transition plan.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| manufacturer_id | integer FK | |
| milestone | text | description of the milestone |
| target_date | date | |
| completed_date | date | null until achieved |
| status | text | "on_track" / "at_risk" / "overdue" / "completed" |
| evidence | text | what proof was provided |
| verified_by | text | "self" / "c2050" / "deimos" |
| impact_on_gs | text | "if missed, gs values recalculated" — the stick |
| notes | text | |
| created_at | timestamp | |

---

## 3. Frontend Pages

### 3.1 Manufacturer List (`/manufacturers`)

**Layout:** Same pattern as retailers page.

**Top section:**
- StatCards: total manufacturers, live, in pipeline, avg maturity level
- Onboarding pipeline bar: prospect → due diligence → verification → contract → integration → live (clickable to filter)

**Main section:**
- Card grid (not table — more visual for manufacturers):
  - Logo placeholder + name + flag
  - Sector badge
  - Maturity level indicator (0-4 dots or progress bar)
  - Onboarding stage badge (colour-coded)
  - Product count + total GS allocated
  - C2050 verified tick / Deimos measured tick
  - Deal status badge (linked to deals page)

**Actions:**
- "add manufacturer" button (opens CrudDialog)
- Filter by: sector, stage, maturity level, status
- Search by name/code

### 3.2 Manufacturer Detail (`/manufacturers/:id`)

The drill-down page. This is the key page — it shows what the manufacturer would see in their spoke portal.

**PageHeader:** manufacturer name, sector badge, stage badge, maturity level

**Tab navigation across the top:**

#### Tab 1: Overview
- **Profile card:** name, code, country, sector, website, contact, deal link
- **Verification status:** C2050 verified (yes/no + cert ID), Deimos measured (yes/no)
- **Emissions summary:** scope 1/2/3 bar chart (recharts), total tonnes, baseline year
- **Renewable energy %:** gauge or progress bar
- **Maturity level:** visual indicator with level description
  - Level 0: Entry — initial engagement
  - Level 1: Basic GS — products listed, no verification
  - Level 2: Voluntary carbon — C2050 verified offset projects
  - Level 3: Verra-standard — tradable credits
  - Level 4: Full ecosystem — Deimos measured, all dimensions verified

#### Tab 2: Products
- **DataTable:** all manufacturer_products
  - Columns: sku, name, brand, category, gs_per_unit, gs_status, carbon_per_unit_g, transition %, offset %
  - Status badges: colour-coded (active=green, pending=amber, draft=grey)
  - Click row → expand to show dimensional breakdown (radar chart)
- **"add product" button** — CrudDialog with all fields
- **"request calculation" button** — submits product to carbon accounting engine
- **Summary row:** total products, active products, avg GS per product, total GS allocated across all products

#### Tab 3: Campaigns
- **Campaign list** as cards:
  - Name, type badge, status badge
  - Target products (count), target retailers
  - GS multiplier, budget (total / spent), date range
  - If A/B test: show both variants side by side
  - If JV: show retailer name and contribution split
- **"create campaign" button** — dialog with:
  - Name, type selector (bonus_gs, double_gs, product_launch, ab_test, jv_retailer)
  - Product multi-select (from this manufacturer's products)
  - Retailer multi-select or "all retailers"
  - Region multi-select
  - GS multiplier, budget, date range
  - If A/B: variant selector, link to partner campaign
  - If JV: retailer code, contribution %
- **Campaign calendar:** monthly view showing active/scheduled campaigns
- **Submit for approval:** sends to hub approval queue

#### Tab 4: Sales Analytics
- **Summary cards:** total units sold, total GS allocated, estimated revenue, unique consumers (tokens)
- **Charts (recharts):**
  - Sales by product (bar chart — top 10 products by GS)
  - Sales by retailer (horizontal bar — which retailers sell the most)
  - Sales by region (horizontal bar or map if available)
  - GS allocation trend (line chart — monthly over 12 months)
  - GS participation rate trend (line chart — % of sales earning GS)
- **Campaign ROI table:**
  - Campaign name, GS spent, incremental units, cost per additional unit, conversion rate
  - If A/B: side-by-side comparison
- **Filterable:** by product, retailer, region, date range, campaign

#### Tab 5: Transition Plan
- **Timeline view:** milestones plotted on a horizontal timeline
  - Each milestone: description, target date, status badge (on_track/at_risk/overdue/completed)
  - Completed milestones in green, at_risk in amber, overdue in red
- **"add milestone" button**
- **GS impact warning:** for overdue milestones: "if not completed by [date], gs values for [N] products will be recalculated" — the stick
- **Verification evidence:** for each completed milestone, show who verified (self/c2050/deimos) and what evidence was provided
- **Overall progress:** % of milestones completed, % on track

#### Tab 6: Settings
- **Edit manufacturer profile** — all fields from the manufacturers table
- **Link to deal** — connect to existing deal in deals page
- **Link to C2050 certificate**
- **Danger zone:** suspend manufacturer (all products go inactive), drop manufacturer

---

## 4. API Endpoints (new routes in routes.ts)

### Manufacturers CRUD
```
GET    /api/manufacturers              — list all (with product count, gs total)
GET    /api/manufacturers/:id          — full detail with products, campaigns, sales
POST   /api/manufacturers              — create
PUT    /api/manufacturers/:id          — update
DELETE /api/manufacturers/:id          — soft delete (status → "dropped")
```

### Manufacturer Products
```
GET    /api/manufacturers/:id/products         — list products for manufacturer
POST   /api/manufacturers/:id/products         — add product
PUT    /api/manufacturers/:id/products/:pid    — update product
DELETE /api/manufacturers/:id/products/:pid    — remove product
POST   /api/manufacturers/:id/products/:pid/calculate — request GS calculation
```

### Manufacturer Campaigns
```
GET    /api/manufacturers/:id/campaigns        — list campaigns
POST   /api/manufacturers/:id/campaigns        — create campaign
PUT    /api/manufacturers/:id/campaigns/:cid   — update campaign
POST   /api/manufacturers/:id/campaigns/:cid/submit — submit for hub approval
```

### Manufacturer Sales (read-only in hub — populated by spoke sync or seed data)
```
GET    /api/manufacturers/:id/sales            — aggregated sales data
GET    /api/manufacturers/:id/sales/by-product — grouped by product
GET    /api/manufacturers/:id/sales/by-retailer — grouped by retailer
GET    /api/manufacturers/:id/sales/by-region  — grouped by region
GET    /api/manufacturers/:id/sales/trend      — monthly trend
```

### Manufacturer Transition
```
GET    /api/manufacturers/:id/milestones       — list milestones
POST   /api/manufacturers/:id/milestones       — add milestone
PUT    /api/manufacturers/:id/milestones/:mid  — update milestone
```

---

## 5. Seed Data

Pre-populate with realistic manufacturer data for demonstration:

### Manufacturers (5)
1. **Heinz** — food_beverage, UK/US, maturity 3, live, C2050 verified, 15 products
2. **Unilever** — personal_care/food, UK/NL, maturity 4, live, Deimos measured, 25 products
3. **Innocent Drinks** — food_beverage, UK, maturity 2, integration stage, 8 products
4. **Quorn** — food_beverage, UK, maturity 3, live, C2050 verified, 12 products
5. **Who Gives A Crap** — household, AU, maturity 1, verification stage, 6 products

### Products per manufacturer
- Heinz: baked beans, tomato soup, ketchup, mayo, salad cream, spaghetti hoops, etc.
- Unilever: dove soap, persil, ben & jerry's, hellmann's, etc.
- Innocent: smoothies (3 flavours), juices (3), coconut water
- Quorn: mince, pieces, sausages, burgers, fillets, nuggets, etc.
- WGAC: toilet paper (3 types), tissues, paper towels

Each product with realistic GS values (10-30 per unit), dimensional breakdown, and transition/offset split.

### Campaigns (8-10)
- Heinz: "double gs on beans — april" (active, bonus_gs)
- Heinz: "ketchup vs mayo a/b test" (active, ab_test — variant A: 2x on ketchup, variant B: 2x on mayo)
- Unilever: "spring clean double gs" (completed, targeting persil/dove)
- Unilever × Tesco: "JV easter promotion" (active, jv_retailer, 60/40 split)
- Innocent: "smoothie summer launch" (scheduled, product_launch)
- Quorn: "veganuary triple gs" (completed, bonus_gs, 3x multiplier)

### Sales data
12 months of weekly aggregated sales per manufacturer, spread across retailers and regions. Enough to make the charts look real.

### Transition milestones
- Heinz: 8 milestones (5 completed, 2 on track, 1 at risk)
- Unilever: 12 milestones (10 completed, 2 on track) — highest maturity
- Innocent: 5 milestones (3 completed, 1 on track, 1 overdue — trigger GS warning)
- Quorn: 6 milestones (4 completed, 2 on track)
- WGAC: 3 milestones (1 completed, 2 on track)

---

## 6. Build Order

1. Database tables + migrations (5 tables)
2. API endpoints (manufacturers CRUD, products, campaigns, sales, milestones)
3. Seed data script
4. Sidebar menu update (add MANUFACTURERS section + ENGINES section)
5. Manufacturer list page (with pipeline bar and card grid)
6. Manufacturer detail page (6 tabs)
   - Overview tab (profile, emissions chart, maturity)
   - Products tab (DataTable with radar chart expand, add/edit/calculate)
   - Campaigns tab (cards, create dialog, calendar, A/B and JV flows)
   - Sales analytics tab (5 charts, campaign ROI table, filters)
   - Transition tab (timeline, milestones, GS impact warnings)
   - Settings tab (edit, link deal, danger zone)
7. Carbon accounting link (menu item, placeholder or wire to engine when built)
8. Build + deploy + test

**Build estimate:** 80-100k tokens total. The detail page with 6 tabs is the largest component.
