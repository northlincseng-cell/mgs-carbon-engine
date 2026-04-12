# mgs carbon accounting engine

interim calculation engine for my green squares. translates manufacturer emissions data into gs values per product across multiple dimensions.

designed as a replaceable module — deimos slots in when ready with zero disruption.

## status

🟡 **pre-development** — specification complete, awaiting build.

## documentation

- [full specification](docs/SPEC.md) — data model, api endpoints, calculation logic, deimos handover plan

## architecture

```
hub (mcp) ← carbon accounting engine (this repo)
                ↑
          deimos (future replacement)
```

the engine exposes a standard interface:
- **input:** manufacturer emissions data, product sustainability scores
- **output:** gs value per product + dimensional breakdown

when deimos is ready, it replaces the calculation logic behind this interface. no other part of the system changes.

## folder structure

```
docs/               — specification and design documents
server/
  routes/           — api endpoint handlers
  services/         — calculation engine, validation, approval workflow
  migrations/       — database schema migrations
  tests/            — api and calculation tests
client/src/
  pages/            — mcp frontend pages (carbon dashboard, profiles, review queue)
  components/       — shared ui components (radar chart, dimensional breakdown)
shared/             — schema types, constants, interfaces shared between server and client
```

## key design principles

1. **deimos-replaceable** — standard input/output contract
2. **multi-dimensional** — every calculation scores across all gs dimensions
3. **auditable** — every calculation stored with inputs, method version, timestamp
4. **75/25 enforced** — transition ≥75%, offset ≤25%, no exceptions
5. **cardinal rule** — no calculation can undermine the value of a green square

## related repos

- [mcp-admin-panel](https://github.com/northlincseng-cell/mcp-admin-panel) — the hub
- [greensquares](https://github.com/northlincseng-cell/greensquares) — demo pages
