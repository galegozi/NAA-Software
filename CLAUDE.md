# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Neutron Activation Analysis (NAA) software: computes concentrations of radioactive isotopes in unknown materials by comparing detector counts against reference materials irradiated in a nuclear reactor. SvelteKit (Svelte 5) frontend + Azure Functions backend backed by Cosmos DB.

## Commands

Frontend (repo root):

```sh
npm run dev          # dev server
npm run build        # production build (output: build/)
npm run check        # svelte-check type checking
npm run lint         # prettier --check + eslint
npm run format       # prettier --write
npm run test:unit    # vitest (watch mode; add -- --run for single pass)
npm run test:e2e     # playwright tests in e2e/
npm test             # unit (single run) + e2e
```

Run a single unit test file: `npx vitest run src/lib/NAAMath/everythingMath.spec.ts`

API (separate package, install deps with `cd api && npm install`):

```sh
cd api && npm test   # node --test, runs api/src/lib/*.test.js
cd api && npm start  # Azure Functions Core Tools (func start)
```

Vitest is split into two projects (vite.config.ts): `client` runs `src/**/*.svelte.{test,spec}.ts` in headless Chromium via Playwright; `server` runs the remaining `src/**/*.{test,spec}.ts` in Node. `expect.requireAssertions` is enabled — a test with no assertion fails.

## Architecture

### Two deployment targets, dual auth mode

The app deploys both to GitHub Pages (static only, `.github/workflows/deploy.yml`) and Azure Static Web Apps (static + `api/` functions). This is why the UI has two modes:

- **Unauthed / static mode** (localhost, `*.github.io`): manual data-entry wizard, no API. Detected by hostname in `src/lib/utils/authEnvironment.ts`.
- **Authed mode** (Azure SWA): the same wizard, plus "Save to shared catalog" / "Publish to shared catalog" panels on custom isotope and reference-material cards. Auth state comes from `/.auth/me` via `src/lib/utils/swaAuth.svelte.ts` (the `swaAuth` singleton + `redirectToSignIn`); reads/writes go through `/api/*` and `src/lib/utils/catalogWrite.ts`. (The shared store is called the "catalog" in the UI — never "database".)

There is a single page (`/`). The wizard autosaves its full state to `localStorage` continuously (`src/lib/utils/analysisDraft.ts`) so a sign-in redirect / refresh / tab close never loses data; "Start new analysis" on the welcome screen clears it.

Publishing anything to the catalog is a two-step confirm: the panel first shows a numbered list of exactly what will happen (including dependencies it resolves for you — publishing a reference material auto-adds any un-catalogued covered isotope and auto-creates its datasheet from the entered concentrations; recording a proxy relationship auto-adds either isotope), then a "Confirm & upload" button runs it. Proxy-measurement relationships ("isotope A measures B", `POST /api/isotope-measurements`) are recorded from Step 1's "Isotope relationships" panel, held with the draft, and feed catalog-matching immediately (`allMeasurementLinks` = API links + local ones).

The build is a fully static SPA: `adapter-static` with `404.html` fallback, `prerender = true`, `appDir: 'app'` (svelte.config.js). There is no SvelteKit server code.

### Frontend

- `src/routes/+page.svelte` (~1700 lines) is the entire wizard UI: step through isotopes → reference materials → unknown materials → computed results. Step numbering/navigation logic lives in `src/lib/utils/stepUtils.ts` (`STEP_CONSTANTS` has separate `UNAUTHED`/`AUTHED` flows; `APP_VERSION` is also defined here).
- `src/lib/NAAMath/` holds the physics, layered by what inputs each computation needs, each module exposing `getAll()`:
  - `isotopeMath.ts` — pure isotope attributes (decay constant, half-life conversion)
  - `MaterialMath.ts` — per-material (dead time, detection limits)
  - `MaterialIsotopeMath.ts` — material × isotope (saturation/decay/dead-time corrections)
  - `MultiMaterialMath.ts` — cross-material (mass/fluence corrections)
  - `everythingMath.ts` — combines all of the above to produce unknown concentration + uncertainty (`EverythingComputed`)
- Domain types in `src/lib/types.ts`; computation result types in `src/lib/NAAMath/types.ts`.
- Styling: Tailwind CSS 4 + Skeleton UI.
- Although package.json is set up as a Svelte library (`svelte-package`/publint via `prepack`), the project is effectively an app; `src/lib/index.ts` is the nominal library entry.

### Backend (`api/`)

Azure Functions v4, plain JS ESM. Handlers in `api/src/functions/` (isotopes, reference-materials, reference-datasheets, isotope-measurements); shared logic in `api/src/lib/`. Payload normalization/merge logic (`isotopeWritePayload.js`, `referenceMaterialWritePayload.js`) is separated from handlers and unit-tested. Writes are upserts by default: existing isotopes get new energies appended; existing reference materials get countings appended. Both `POST` endpoints also take an update-in-place path — `POST /api/isotopes` with `"mode":"replace"` overwrites element/half-life/energies on the matched record; `POST /api/reference-materials` with `"mode":"replace-counting"` + `targetItemId`/`targetCountingId` swaps one counting on a document by id (see README). Each reference-material counting carries a `countingMode` (`normal` | `compton`, Compton-suppressed) that is part of the identity fingerprint — a normal and a compton counting of the same sample are distinct catalog records.

Cosmos DB access goes through `api/src/lib/cosmosClient.js` (env-driven; see README for the full `COSMOSDB_*` settings). Set `MOCK_COSMOS=true` for in-memory mock behavior with no database.

### Access control (security-relevant)

Write endpoints are protected in **two independent layers**, and both must be kept in sync:

1. `staticwebapp.config.json` route rules restrict POSTs to the `isotope_writer` role.
2. Each function re-validates the SWA-forwarded `x-ms-client-principal` header via `api/src/lib/staticWebAppsAuth.js`.

Functions stay at `authLevel: 'anonymous'` on purpose — Azure SWA is the authenticating layer. Don't remove the in-function role check; it guards against config regressions.

## Conventions

- Tabs for indentation, single quotes, 100-char width (`.prettierrc`); prettier runs with svelte + tailwind plugins.
- README.md documents the exact JSON payload shapes for `POST /api/isotopes` and `POST /api/reference-materials` and the Azure app settings — update it when changing those contracts.
