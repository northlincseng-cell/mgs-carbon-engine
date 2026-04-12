# Carbon Accounting Engine — Design Specification

## Purpose
An interim calculation engine inside the MCP hub that translates manufacturer emissions data into GS values per product. Designed as a replaceable module — Deimos slots in when ready with zero disruption to the rest of the system.

The engine answers one question: **"How many green squares does this product earn, and what is the dimensional breakdown?"**

---

## Design Principles

1. **Deimos-replaceable:** The engine exposes a standard interface (input: emissions data → output: GS value + dimensional breakdown). When Deimos is ready, it replaces the calculation logic behind this interface. No other part of the system changes.
2. **Multi-dimensional:** Every calculation produces scores across all dimensions, not just carbon. A product with strong social impact but moderate carbon can still earn GS.
3. **Auditable:** Every calculation is stored with its inputs, method, version, and timestamp. An auditor can reproduce any GS value from the stored inputs.
4. **Manufacturer self-service:** Manufacturers submit their data through the MCP panel or API. The engine calculates. An admin reviews and approves before GS values go live.

---

## Data Model

### manufacturer_profiles
The manufacturer's overall sustainability position.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| manufacturer_id | integer FK → retailers | links to existing retailers table (manufacturers are a retailer type) |
| scope1_tonnes | decimal | direct emissions (fuel, processes) |
| scope2_tonnes | decimal | purchased energy |
| scope3_tonnes | decimal | supply chain, logistics, end-of-life |
| total_tonnes | decimal | calculated: scope 1+2+3 |
| baseline_year | integer | the year these figures represent |
| transition_plan | jsonb | structured roadmap: targets by year, actions planned |
| renewable_pct | decimal | % energy from renewable sources |
| verified_by | text | "self-reported" / "c2050" / "deimos" / third-party name |
| verification_date | timestamp | |
| verification_certificate_id | text | C2050 certificate reference when available |
| maturity_level | integer | 0-4 per Corporate Onboarding Maturity Model |
| created_at | timestamp | |
| updated_at | timestamp | |

### product_emissions
Per-product emissions and sustainability data.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| product_id | integer FK → products | links to existing products table |
| manufacturer_profile_id | integer FK → manufacturer_profiles | |
| carbon_per_unit_g | decimal | grams CO2e per unit (manufacturing + packaging + logistics) |
| renewable_energy_pct | decimal | % renewable in this product's production |
| supply_chain_score | decimal 0-100 | assessed supply chain sustainability |
| packaging_score | decimal 0-100 | recyclability, material, weight |
| logistics_score | decimal 0-100 | distance, mode, efficiency |
| social_impact_score | decimal 0-100 | labour practices, community, fair trade |
| ecosystem_score | decimal 0-100 | biodiversity, water, land use |
| basic_needs_score | decimal 0-100 | contribution to water/energy/food access |
| education_score | decimal 0-100 | women's education, training, skills |
| governance_score | decimal 0-100 | transparency, compliance, reporting |
| data_source | text | "manufacturer-submitted" / "estimated" / "deimos-calculated" |
| data_confidence | text | "high" / "medium" / "low" |
| created_at | timestamp | |
| updated_at | timestamp | |

### gs_calculations
The actual GS value computation — one row per product per calculation run.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| product_id | integer FK → products | |
| product_emission_id | integer FK → product_emissions | the input data used |
| calculation_method | text | "interim-v1" / "deimos-v1" / etc. — tracks which engine version |
| gs_per_unit | decimal | the output: how many GS this product earns per unit sold |
| transition_pct | decimal | what % of the GS value comes from transition action (must be ≥75%) |
| offset_pct | decimal | what % comes from offset projects (must be ≤25%) |
| dimensional_breakdown | jsonb | see Dimensional Breakdown below |
| offset_project_ids | integer[] | which C2050 projects fund the offset component |
| status | text | "draft" / "pending_review" / "approved" / "active" / "superseded" |
| approved_by | text | username of admin who approved |
| approved_at | timestamp | |
| valid_from | timestamp | when this GS value becomes active |
| valid_to | timestamp | null = current; set when superseded |
| notes | text | |
| created_at | timestamp | |

### Dimensional Breakdown (jsonb structure)
```json
{
  "carbon": { "score": 72, "weight": 0.15, "weighted": 10.8 },
  "renewable_energy": { "score": 85, "weight": 0.15, "weighted": 12.75 },
  "social_impact": { "score": 60, "weight": 0.12, "weighted": 7.2 },
  "ecosystem": { "score": 78, "weight": 0.15, "weighted": 11.7 },
  "basic_needs": { "score": 45, "weight": 0.10, "weighted": 4.5 },
  "education": { "score": 55, "weight": 0.10, "weighted": 5.5 },
  "governance": { "score": 90, "weight": 0.13, "weighted": 11.7 },
  "packaging": { "score": 70, "weight": 0.10, "weighted": 7.0 },
  "total_weighted": 71.15,
  "gs_per_unit": 18,
  "method_version": "interim-v1"
}
```
Each dimension must be ≥10% weight. Weights must sum to 1.0. No dimension can be zero — minimum floor enforced by Value Protection Engine.

### offset_allocations
Links GS calculations to C2050 verified offset projects (the ≤25% component).

| column | type | notes |
|---|---|---|
| id | serial PK | |
| gs_calculation_id | integer FK → gs_calculations | |
| project_id | integer | C2050 project reference |
| project_name | text | human-readable |
| project_type | text | "rocket_stoves" / "reforestation" / "water_aid" / "education" / "micro_loans" / "electrification" / "biodiversity" / etc. |
| project_dimensions | jsonb | which GS dimensions this project contributes to |
| tonnes_allocated | decimal | how many tonnes CO2e offset allocated |
| gs_funded | decimal | how many GS this offset funds |
| verified | boolean | C2050 certificate exists |
| certificate_id | text | |

---

## Calculation Logic (Interim Engine v1)

### Step 1: Carbon base
```
carbon_gs_raw = carbon_per_unit_g / 100
```
(100g CO2e = 1 GS baseline)

### Step 2: Transition vs offset split
```
transition_pct = manufacturer's verified transition action percentage
offset_pct = 100 - transition_pct
IF transition_pct < 75: FLAG for review — manufacturer must increase action or increase investment
IF offset_pct > 25: REJECT — exceeds maximum offset allowance
```

### Step 3: Dimensional scoring
Each dimension scored 0-100 from product_emissions data. Apply weights from the equivalence engine configuration (already in MCP). Calculate total weighted score.

```
total_weighted = sum(dimension.score × dimension.weight) for all dimensions
```

### Step 4: GS multiplier
The dimensional score modifies the base GS value. A product with perfect scores across all dimensions earns more GS than one with bare minimums.

```
multiplier = total_weighted / 50  (normalised so average = 1.0)
gs_per_unit = carbon_gs_raw × multiplier
```

Floors: minimum 1 GS per qualifying product. Maximum capped by carbon content (can't earn 100 GS on a product that only displaces 5g CO2e).

### Step 5: Value Protection check
Run the calculation through the Value Protection Engine:
- No dimension below minimum floor
- Cardinal rule check: does this allocation undermine GS value?
- If any check fails → status = "pending_review"

### Step 6: Status workflow
```
draft → pending_review → approved → active
                                   → superseded (when recalculated)
```
Only "active" calculations result in GS being allocated at point of sale.

---

## API Endpoints

### Manufacturer profiles
```
GET    /api/carbon/manufacturers          — list all profiles
GET    /api/carbon/manufacturers/:id      — get profile with products
POST   /api/carbon/manufacturers          — create profile (admin+)
PUT    /api/carbon/manufacturers/:id      — update profile
```

### Product emissions
```
GET    /api/carbon/products/:id/emissions — get emissions data for product
POST   /api/carbon/products/:id/emissions — submit emissions data
PUT    /api/carbon/emissions/:id          — update emissions data
```

### Calculations
```
POST   /api/carbon/calculate/:productId  — run calculation for a product
GET    /api/carbon/calculations           — list all calculations (filterable by status)
GET    /api/carbon/calculations/:id       — get calculation detail with dimensional breakdown
POST   /api/carbon/calculations/:id/approve — approve a calculation (admin+)
POST   /api/carbon/calculations/:id/reject  — reject with notes
GET    /api/carbon/calculations/active    — all currently active GS values
```

### Offset allocations
```
GET    /api/carbon/offsets                — list offset allocations
POST   /api/carbon/offsets               — allocate offset project to calculation
```

### Deimos handover endpoint
```
POST   /api/carbon/deimos/calculate      — future: receives calculation from Deimos
```
Same input/output contract as the interim engine. When Deimos is ready, it calls this endpoint and the result replaces the interim calculation. The gs_calculations table stores `calculation_method: "deimos-v1"` instead of `"interim-v1"`.

---

## MCP Frontend Pages

### Carbon Accounting Dashboard (new page)
- Summary cards: products calculated, pending review, active, avg GS per product
- Manufacturer profiles list with maturity level badges
- Quick actions: run calculation, review pending

### Manufacturer Profile Page (new page)
- Scope 1/2/3 emissions display
- Transition plan timeline
- Maturity level indicator
- Products list with GS values
- Verification status

### Product Calculation Detail (new page or dialog)
- Dimensional breakdown radar chart (6+ dimensions)
- Transition vs offset split bar
- Calculation history (previous values, what changed)
- Offset projects linked
- Approval workflow buttons

### Pending Review Queue (new page or tab)
- All calculations in "pending_review" status
- Flagged issues (transition % too low, dimensional floor breach)
- Approve / reject with notes

---

## Deimos Replacement Plan

The interface contract is:

**Input:**
```json
{
  "product_id": 123,
  "manufacturer_profile": { ... },
  "product_emissions": { ... },
  "offset_projects": [ ... ]
}
```

**Output:**
```json
{
  "gs_per_unit": 18,
  "transition_pct": 82,
  "offset_pct": 18,
  "dimensional_breakdown": { ... },
  "calculation_method": "deimos-v1",
  "confidence": "high"
}
```

When Deimos is ready:
1. Deploy Deimos as a spoke with its own endpoint
2. Update MCP hub to call Deimos endpoint instead of running interim logic
3. Deimos returns the same output format
4. gs_calculations table stores results identically, just with different calculation_method
5. Interim engine remains available as fallback
6. Zero changes needed in frontend, pricing cascade, or consumer-facing systems

---

## Build Estimate

| component | effort |
|---|---|
| Database tables + migrations | 30 min |
| API endpoints (8 routes) | 45 min |
| Calculation engine (interim v1) | 45 min |
| Frontend: carbon dashboard page | 30 min |
| Frontend: manufacturer profile page | 30 min |
| Frontend: calculation detail + radar chart | 30 min |
| Frontend: pending review queue | 20 min |
| Sidebar navigation updates | 5 min |
| Build + deploy + test | 15 min |
| **Total** | **~4 hours** |

Token estimate: 80-100k tokens across subagents for the full build.
