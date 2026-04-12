# C2050 → MGS Integration Specification

## Document Purpose
Technical specification for the one-way data feed from C2050 into the MGS Master Control Panel, plus the minimal contract confirmation endpoint MGS exposes back to C2050. This document is intended for both the MGS and C2050 development teams during joint implementation.

---

## 1. Architecture Overview

```
┌──────────────────┐                    ┌──────────────────┐
│      C2050       │                    │    MGS (MCP)     │
│                  │                    │                  │
│  verified        │ ──── one-way ───► │  c2050_projects  │
│  projects        │      feed         │  c2050_certs     │
│                  │                    │  c2050_streams   │
│  geospatial      │ ──── one-way ───► │  geospatial      │
│  layers (ESRI)   │      feed         │  cache           │
│                  │                    │                  │
│  verification    │ ──── one-way ───► │  gs_calculations │
│  certificates    │      feed         │  (links to cert) │
│                  │                    │                  │
│  carbon pricing  │ ──── one-way ───► │  carbon_markets  │
│  reference data  │      feed         │  (reference)     │
│                  │                    │                  │
│  contract        │ ◄─── minimal ──── │  confirmations   │
│  confirmations   │      response     │  only            │
│                  │                    │                  │
└──────────────────┘                    └──────────────────┘

NEVER flows from MGS to C2050:
✗ commercial pricing
✗ deal terms or volume data
✗ retailer information
✗ consumer data (none exists)
✗ manufacturer commercial agreements
```

---

## 2. Authentication

### C2050 → MGS (inbound feed)
C2050 authenticates to the MGS API using a dedicated API key with the `api_client` role.

```
Authorization: Bearer c2050_<api_key>
```

- API key issued by MGS super_admin via the user management page
- Key has `api_client` role — read/write to C2050-specific endpoints only
- Rate limit: 1000 req/min (elevated from standard 100 for data feed)
- IP allowlisting: C2050 server IPs only (configured in UFW)

### MGS → C2050 (contract confirmations)
MGS authenticates to the C2050 confirmation endpoint using a separate API key issued by C2050.

```
Authorization: Bearer mgs_<api_key>
```

- Minimal scope: can only POST to `/api/v1/confirmations`
- No read access to C2050 data via this key

---

## 3. Inbound Data Feeds (C2050 → MGS)

### 3.1 Verified Projects

C2050 pushes verified project data to MGS. These are the offset projects that manufacturers can select for their ≤25% offset component.

**Endpoint:** `POST /api/c2050/projects`

**Request body:**
```json
{
  "c2050_project_id": "C2050-PRJ-2026-0042",
  "name": "rondônia rocket stove programme",
  "type": "rocket_stoves",
  "country": "BR",
  "region": "rondônia",
  "coordinates": { "lat": -10.94, "lng": -62.07 },
  "dimensions": {
    "carbon": { "score": 75, "tonnes_per_year": 12400 },
    "renewable_energy": { "score": 40, "detail": "replaces wood burning with efficient stoves" },
    "social_impact": { "score": 85, "detail": "health improvements, reduced indoor pollution" },
    "ecosystem": { "score": 70, "detail": "reduced deforestation for firewood" },
    "basic_needs": { "score": 90, "detail": "improved cooking, reduced fuel costs" },
    "education": { "score": 60, "detail": "community training programme included" },
    "governance": { "score": 80, "detail": "local government partnership, transparent reporting" }
  },
  "verification_status": "verified",
  "verification_date": "2026-03-15T00:00:00Z",
  "certificate_id": "C2050-CERT-2026-0042",
  "vintage_year": 2026,
  "total_credits_available": 12400,
  "credits_allocated": 3200,
  "credits_remaining": 9200,
  "geospatial_layer_url": "https://c2050.platform/esri/layers/PRJ-0042",
  "legal": {
    "land_registry_verified": true,
    "mining_rights_clear": true,
    "indigenous_rights_consulted": true
  },
  "updated_at": "2026-03-15T14:30:00Z"
}
```

**Response:** `201 Created`
```json
{
  "mgs_project_id": 42,
  "c2050_project_id": "C2050-PRJ-2026-0042",
  "status": "received",
  "indexed_at": "2026-03-15T14:30:05Z"
}
```

**MGS storage:** New table `c2050_projects` — stores the full project data. Referenced by `offset_allocations` in the carbon accounting engine when manufacturers select offset projects.

### 3.2 Verification Certificates

When C2050 issues or updates a verification certificate for a manufacturer or project.

**Endpoint:** `POST /api/c2050/certificates`

**Request body:**
```json
{
  "certificate_id": "C2050-CERT-2026-0042",
  "c2050_project_id": "C2050-PRJ-2026-0042",
  "manufacturer_name": "heinz",
  "type": "project_verification",
  "status": "active",
  "issued_date": "2026-03-15T00:00:00Z",
  "expiry_date": "2027-03-15T00:00:00Z",
  "dimensions_verified": ["carbon", "social_impact", "basic_needs", "ecosystem"],
  "auditor": "kpmg",
  "audit_reference": "KPMG-AUD-2026-1847",
  "document_url": "https://c2050.platform/certs/CERT-2026-0042.pdf",
  "updated_at": "2026-03-15T14:30:00Z"
}
```

**Response:** `201 Created`
```json
{
  "mgs_certificate_id": 18,
  "certificate_id": "C2050-CERT-2026-0042",
  "status": "received"
}
```

**MGS storage:** New table `c2050_certificates`. Linked to `manufacturer_profiles.verification_certificate_id` and `gs_calculations.offset_project_ids` in the carbon accounting engine. A GS calculation cannot reach "approved" status without a valid certificate.

### 3.3 Carbon Pricing Reference Data

C2050 provides reference carbon pricing for use in the carbon accounting engine's valuation logic.

**Endpoint:** `POST /api/c2050/carbon-pricing`

**Request body:**
```json
{
  "market": "EU ETS",
  "price_per_tonne": 67.46,
  "currency": "EUR",
  "source": "c2050-verified",
  "effective_date": "2026-03-15",
  "updated_at": "2026-03-15T08:00:00Z"
}
```

**Response:** `200 OK`
```json
{
  "market": "EU ETS",
  "status": "updated"
}
```

**MGS storage:** Updates the existing `carbon_markets` table. C2050-sourced prices are flagged as `source: "c2050"` to distinguish from manually entered or refreshed data.

### 3.4 Geospatial Layer Updates

C2050 notifies MGS when ESRI geospatial layers are updated for a project.

**Endpoint:** `POST /api/c2050/geospatial`

**Request body:**
```json
{
  "c2050_project_id": "C2050-PRJ-2026-0042",
  "layer_type": "land_use_change",
  "esri_layer_url": "https://c2050.platform/esri/layers/PRJ-0042/land-use-2026",
  "bbox": { "north": -9.5, "south": -12.0, "east": -60.0, "west": -64.0 },
  "last_imagery_date": "2026-03-10",
  "resolution_m": 10,
  "updated_at": "2026-03-15T10:00:00Z"
}
```

**Response:** `200 OK`

**MGS storage:** Stored in a `c2050_geospatial_layers` table. Used by the consumer share map (limited layers visible to consumers) and the MCP admin panel (full multi-layer access for corporate users).

### 3.5 Stream Status (heartbeat)

C2050 sends periodic status updates for each data stream.

**Endpoint:** `PUT /api/streams/:id`

This already exists in the MCP. C2050 updates the `c2050_streams` table with current status, frequency, and last update timestamp.

---

## 4. Contract Confirmation Endpoint (MGS → C2050)

The ONLY data MGS sends back to C2050. This is triggered when a manufacturer signs a deal in the MCP that involves C2050-verified projects.

### 4.1 Confirmation Push

When an MGS deal is approved and involves offset allocations against C2050 projects:

**MGS calls:** `POST https://api.c2050.platform/api/v1/confirmations`

**Request body:**
```json
{
  "mgs_deal_id": 15,
  "c2050_project_ids": ["C2050-PRJ-2026-0042", "C2050-PRJ-2026-0055"],
  "credits_reserved": 5000,
  "confirmation_type": "deal_approved",
  "effective_date": "2026-04-01",
  "confirmed_at": "2026-03-20T09:00:00Z"
}
```

**What is NOT included:**
- ✗ deal financial terms (price per GS, total value)
- ✗ manufacturer identity beyond what C2050 already knows from their own verification
- ✗ retailer information
- ✗ volume tier or discount details
- ✗ any consumer data

**What IS included:**
- ✓ which C2050 projects are now committed
- ✓ how many credits are reserved against those projects
- ✓ confirmation type (deal_approved, deal_cancelled, credits_adjusted)
- ✓ effective date

This allows C2050 to update their `credits_allocated` / `credits_remaining` counts without knowing anything about MGS commercial terms.

### 4.2 Confirmation Types

| type | trigger | purpose |
|---|---|---|
| `deal_approved` | MGS deal reaches "active" status with offset allocations | reserve credits on C2050 projects |
| `deal_cancelled` | MGS deal is cancelled or dropped | release reserved credits |
| `credits_adjusted` | MGS recalculates GS values (e.g. after cascade) | adjust reserved credit quantities |
| `deal_completed` | MGS deal reaches "complete" status | finalise credit retirement |

### 4.3 Implementation in MGS

The confirmation is triggered automatically in the existing deal approval workflow:

```typescript
// in server/routes.ts — POST /api/deals/:id/approve
// after deal status set to "active":

if (deal.offsetAllocations?.length) {
  await sendC2050Confirmation({
    mgs_deal_id: deal.id,
    c2050_project_ids: deal.offsetAllocations.map(a => a.c2050ProjectId),
    credits_reserved: deal.offsetAllocations.reduce((sum, a) => sum + a.tonnesAllocated, 0),
    confirmation_type: "deal_approved",
    effective_date: deal.validFrom,
    confirmed_at: new Date().toISOString(),
  });
}
```

The `sendC2050Confirmation` function:
- Calls the C2050 endpoint with the MGS API key
- Logs the confirmation in `change_log` for audit
- Retries on failure (3 attempts with exponential backoff)
- If C2050 is unreachable, queues the confirmation for retry (stored in a `c2050_confirmation_queue` table)
- Never blocks the deal approval — confirmation is async

---

## 5. New Database Tables (MGS side)

### c2050_projects
```sql
CREATE TABLE c2050_projects (
  id SERIAL PRIMARY KEY,
  c2050_project_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  country TEXT,
  region TEXT,
  coordinates JSONB,
  dimensions JSONB NOT NULL,
  verification_status TEXT DEFAULT 'pending',
  verification_date TIMESTAMP,
  certificate_id TEXT,
  vintage_year INTEGER,
  total_credits DECIMAL,
  credits_allocated DECIMAL DEFAULT 0,
  credits_remaining DECIMAL,
  geospatial_layer_url TEXT,
  legal JSONB,
  raw_payload JSONB,
  received_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### c2050_certificates
```sql
CREATE TABLE c2050_certificates (
  id SERIAL PRIMARY KEY,
  certificate_id TEXT UNIQUE NOT NULL,
  c2050_project_id TEXT,
  manufacturer_name TEXT,
  type TEXT,
  status TEXT DEFAULT 'active',
  issued_date TIMESTAMP,
  expiry_date TIMESTAMP,
  dimensions_verified JSONB,
  auditor TEXT,
  audit_reference TEXT,
  document_url TEXT,
  received_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### c2050_geospatial_layers
```sql
CREATE TABLE c2050_geospatial_layers (
  id SERIAL PRIMARY KEY,
  c2050_project_id TEXT NOT NULL,
  layer_type TEXT NOT NULL,
  esri_layer_url TEXT NOT NULL,
  bbox JSONB,
  last_imagery_date DATE,
  resolution_m INTEGER,
  received_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### c2050_confirmation_queue
```sql
CREATE TABLE c2050_confirmation_queue (
  id SERIAL PRIMARY KEY,
  mgs_deal_id INTEGER NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP,
  confirmed_at TIMESTAMP,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 6. Existing Tables Modified

### c2050_streams (already exists)
No schema changes. C2050 uses the existing `PUT /api/streams/:id` endpoint for heartbeat updates.

### carbon_markets (already exists)
Add column: `source TEXT DEFAULT 'manual'` — values: "manual", "c2050", "api_refresh". C2050-sourced prices are distinguished from manually entered data.

### gs_calculations (from carbon accounting engine)
Already has `offset_project_ids` field. These will reference `c2050_projects.c2050_project_id` values once the integration is live.

### manufacturer_profiles (from carbon accounting engine)
Already has `verification_certificate_id` field. Links to `c2050_certificates.certificate_id`.

---

## 7. API Endpoint Summary

### Inbound (C2050 → MGS) — requires `api_client` role with C2050 key

| method | endpoint | purpose |
|---|---|---|
| POST | `/api/c2050/projects` | receive verified project data |
| POST | `/api/c2050/certificates` | receive verification certificates |
| POST | `/api/c2050/carbon-pricing` | receive carbon price reference data |
| POST | `/api/c2050/geospatial` | receive geospatial layer updates |
| PUT | `/api/streams/:id` | update stream status (existing) |

### Outbound (MGS → C2050) — async, non-blocking

| method | endpoint (on C2050) | purpose |
|---|---|---|
| POST | `/api/v1/confirmations` | send deal/credit confirmations |

### Internal (MGS admin)

| method | endpoint | purpose |
|---|---|---|
| GET | `/api/c2050/projects` | list all received projects |
| GET | `/api/c2050/projects/:id` | get project detail |
| GET | `/api/c2050/certificates` | list all certificates |
| GET | `/api/c2050/confirmations` | list confirmation queue status |

---

## 8. Error Handling

### Inbound feed errors
- Invalid payload → `400 Bad Request` with validation errors
- Duplicate project/certificate → `409 Conflict` (update existing instead)
- Auth failure → `401 Unauthorized`
- Rate limit → `429 Too Many Requests`
- All errors logged in `change_log` with `action: "c2050-feed-error"`

### Outbound confirmation errors
- C2050 unreachable → queue in `c2050_confirmation_queue`, retry 3 times with exponential backoff (1min, 5min, 30min)
- After 3 failures → status = "failed", alert sent via email notification framework
- Never blocks the MGS deal workflow — confirmations are fire-and-forget with retry

---

## 9. Security

- All C2050 endpoints behind `requireRole("api_client")` middleware
- C2050 API key has no access to commercial endpoints (pricing, deals, volume tiers)
- IP allowlisting in UFW for C2050 server IPs
- All inbound payloads stored in `raw_payload` JSONB for audit trail
- TLS 1.2+ enforced on both sides
- No PII in any data flow — C2050 projects contain geographic and environmental data only

---

## 10. Implementation Order

1. Create database tables (c2050_projects, c2050_certificates, c2050_geospatial_layers, c2050_confirmation_queue)
2. Add inbound API endpoints with validation
3. Add C2050 project/certificate list pages to MCP frontend
4. Wire confirmation push into deal approval workflow
5. Add retry queue processor (runs every 5 minutes via pm2 cron or setInterval)
6. Test with mock C2050 data
7. Joint testing with C2050 team

**Build estimate:** ~60-80k tokens when ready to implement.
