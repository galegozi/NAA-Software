# NAA Software

Welcome to the NAA Software!
This software computes the concentrations of radioactive isotopes in unknown materials.

## What is Neutron Activation Analysis?

Neutron Activation Analysis uses a nuclear reactor to determine concentrations of isotopes.
The idea is to irradiate both the known and unknown materials and compare the counts of neutrons measured by the detector.
This software uses properties of the isotopes, materials, and irradiations to compute the unknown concentrations.

# Svelte library

Everything you need to build a Svelte library, powered by [`sv`](https://npmjs.com/package/sv).

Read more about creating a library [in the docs](https://svelte.dev/docs/kit/packaging).

## Developing

Requires **Node 20.19+, 22.13+, or 24+** and **npm 10.9+** (Vite 8 / ESLint 10). A
`.nvmrc` pins Node 22 — run `nvm use` (or `nvm install`) before `npm install`.

Once you've installed dependencies with `npm install`, start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

Everything inside `src/lib` is part of your library, everything inside `src/routes` can be used as a showcase or preview app.

## Building

To build your library:

```sh
npm pack
```

To create a production version of your showcase app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Azure Static Web Apps + Cosmos DB

This project now includes an integrated Azure Functions backend under `api/` for use with Azure Static Web Apps.

### What it exposes

- `GET /api/isotopes`
- `POST /api/isotopes`
- `GET /api/reference-materials`
- `POST /api/reference-materials`
- `GET` / `POST /api/reference-datasheets`
- `GET` / `POST /api/isotope-measurements` — proxy-measurement relationships
  ("isotope A is measured to quantify isotope B"). `POST` body:
  `{ "measuredIsotope": { "isotopeId": "<catalog id>" }, "targetIsotope": { "isotopeId": "<catalog id>" }, "notes": "" }`.
  Upserts by the (measured, target) pair.
- `GET` / `POST /api/fission-corrections` — fission-interference correction
  factors. `POST` body:
  `{ "fissileNuclide": "U-235", "interferingIsotope": "La-140", "gammaEnergyKev": 1596.2, "irradiationPosition": "", "irradiationType": "thermal|epithermal|fast", "correctionFactor": 0.0123, "uncertainty": 0, "notes": "" }`
  (`gammaEnergyKev`, `irradiationPosition`, `uncertainty`, `notes` optional;
  `irradiationType` defaults to `thermal`). Upserts by the
  (fissile, interferent, energy, position, irradiation type) tuple. Populated
  through the temporary, unlinked data-entry screen at
  `/admin/fission-corrections`.

`GET` on all five resources is **public** (shared catalog data). Only the `POST`
endpoints require the `isotope_writer` role — enforced twice for each: a
`staticwebapp.config.json` route rule (`{ "methods": ["POST"], "allowedRoles":
["isotope_writer"] }`) and an in-function `x-ms-client-principal` check on the
`POST` path. `GET` matches no route rule and no handler auth check. Only `GET`
and `POST` are registered; other methods 404.

The frontend isotope viewer calls `/api/isotopes` by default. You can override that by setting `PUBLIC_ISOTOPE_API_URL`.
The reference material viewer calls `/api/reference-materials` by default. You can override that by setting `PUBLIC_REFERENCE_MATERIAL_API_URL`.

Both GET endpoints accept `q` (search) and `limit` (page size) and respond with `{ items, count, search, hasMore, ... }`; the catalog viewers fetch the next page when the user scrolls to the bottom.

- `/api/isotopes` pages with a **Cosmos continuation token**: the response carries `continuation` (an opaque string, `null` on the last page); send it back as `?continuation=…` for the next page. The query is a plain `SELECT * FROM c` — no `ORDER BY`/`OFFSET`, so it needs no index.
- `/api/reference-materials` pages with `?offset=…` (`ORDER BY c._ts DESC OFFSET … LIMIT …`).

When no `COSMOSDB_*` settings are present (or `MOCK_COSMOS=true`), both endpoints serve a small built-in sample catalog with `"mocked": true`, and the app shows a "sample data" banner. A configured database is always used.

### API access control

The integrated Azure Functions endpoint stays at `authLevel: 'anonymous'`, because Azure Static Web Apps is the layer that authenticates and authorizes requests before forwarding them to the function.

Every `POST` (`/api/isotopes`, `/api/reference-materials`, `/api/reference-datasheets`, `/api/isotope-measurements`, `/api/fission-corrections`) is locked down in two places:

- `staticwebapp.config.json` has a `POST`-only route rule allowing only the custom `isotope_writer` role.
- The function independently validates the forwarded `x-ms-client-principal` header on its `POST` path and rejects callers without the role.

That second check matters because it prevents an accidental config regression from silently opening write access.

Every `GET` is intentionally public (shared catalog data) — no route rule, no handler check. If you want reads restricted too, add matching `GET` route rules with the roles you want.

Important limitation: this is still a browser-callable API. Any user who has the `isotope_writer` role can invoke the write endpoint from the browser or other clients while signed in. If writes must only come from trusted backend automation, move the write path behind a separate backend service that is not directly exposed to browser users.

To grant access, assign the `isotope_writer` role in Azure Static Web Apps invitations/role assignments.

### Reference material write payload

`POST /api/reference-materials` expects JSON in this shape:

```json
{
	"referenceKey": "AB0053::SRM1633c",
	"notes": "Optional run notes",
	"isotopes": [
		{
			"isotopeId": "isotope-doc-id-1",
			"energy": 1173.2
		}
	],
	"countings": [
		{
			"countingLabel": "Original ROI",
			"referenceMaterial": {
				"NETL_code": "AB0053",
				"sampleName": "SRM1633c",
				"mass": 0.5,
				"irradiationTime": 3600,
				"irradiationEnd": "2026-01-11T10:00",
				"measurementStartTime": "2026-01-12T12:00",
				"decayTime": 93600,
				"liveTime": 1800,
				"realTime": 1820,
				"fluence": 1.2e13,
				"counts": [
					{
						"grossCounts": 5000,
						"netCounts": 4500,
						"uncertainty": 67,
						"grossCountsPositionalCorrectionFactor": 1,
						"netCountsPositionalCorrectionFactor": 1,
						"uncertaintyPositionalCorrectionFactor": 1
					}
				],
				"dtType": "simple",
				"countingMode": "normal",
				"knownConcentration": [0.1],
				"knownUncertainty": [0.005],
				"concentrationUnits": ["ppm"]
			}
		}
	]
}
```

`countingMode` is `"normal"` (singles, the default when omitted) or `"compton"` (Compton-suppressed). It is part of the reference-material identity fingerprint, so a normal and a Compton-suppressed counting of the same physical sample are stored as separate records rather than merged.

If a document with the same normalized `referenceKey` already exists, the API appends the incoming countings to that existing record.

To update one counting in place instead, send `"mode": "replace-counting"` together with `"targetItemId"` (the document id) and `"targetCountingId"` (the counting to overwrite). The document id and `referenceKey` are preserved; the targeted counting is swapped for the incoming one (keeping its `countingId`), and the isotope set is replaced. If the target counting is gone, the incoming counting is appended.

### Write payload

`POST /api/isotopes` expects JSON in this shape:

```json
{
	"mode": "append",
	"elementName": "Cobalt",
	"shortName": "Co",
	"massNumber": 60,
	"suffix": "m",
	"energies": [1173.2, 1332.5],
	"halfLife": {
		"number": 5.2714,
		"unit": "years"
	}
}
```

The function derives:

- a GUID `id`
- `halfLifeSeconds`
- audit metadata such as `createdAt` and `createdBy`

Isotope identity is `(shortName, massNumber, suffix)`, so `Co-60m` is a distinct record from `Co-60`. If an isotope with that identity already exists:

- `"mode": "append"` (default) keeps every stored field and unions in any new energies.
- `"mode": "replace"` treats the payload as authoritative — `elementName`, `halfLife` and the **entire** `energies` list overwrite what is stored (identity and creation audit fields are kept). The wizard's "Update existing" action uses this after asking the user to confirm the full energy list.

### Backend configuration

Set these application settings in Azure Static Web Apps:

- `COSMOSDB_ENDPOINT`
- `COSMOSDB_KEY`
- `COSMOSDB_DATABASE`
- `COSMOSDB_CONTAINER`
- `COSMOSDB_REFERENCE_CONTAINER` (optional, defaults to `reference-materials`)
- `COSMOSDB_DATASHEET_CONTAINER` (optional, defaults to `reference-datasheets`)
- `COSMOSDB_ISOTOPE_MEASUREMENTS_CONTAINER` (optional, defaults to `isotope-measurements`)
- `COSMOSDB_FISSION_CORRECTIONS_CONTAINER` (optional, defaults to `fission-corrections`)
- `MOCK_COSMOS` (optional, defaults to `false`; when `true`, GET/POST isotope endpoints and POST reference-materials use mock in-memory behavior and log payloads instead of calling Cosmos DB)
- `ISOTOPE_WRITE_ROLE` (optional, defaults to `isotope_writer`)
- `COSMOSDB_QUERY` (optional, defaults to `SELECT * FROM c`)

The included sample file is `api/local.settings.sample.json`.

### Local development

Install the API dependencies:

```sh
cd api
npm install
```

To run the integrated Static Web App locally, use the Azure Static Web Apps CLI or Azure Functions Core Tools with the Svelte app and the `api/` folder together.

### Azure deployment settings

Use these Azure Static Web Apps settings:

- App location: `/`
- API location: `api`
- Output location: `build`
