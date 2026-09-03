<script lang="ts">
	import { resolve } from '$app/paths';
	import { APP_VERSION } from '$lib/utils/stepUtils.js';

	// Example bodies kept as strings so the JSON braces don't collide with Svelte
	// template syntax.
	const isotopeItem = `{
  "id": "6f1c…",                 // GUID, assigned by the server
  "elementName": "Cobalt",
  "shortName": "Co",
  "massNumber": 60,
  "suffix": "m",                 // "" for the ground state; "m" for a metastable state
  "energies": [1173.2, 1332.5],  // keV
  "halfLife": { "number": 5.2714, "unit": "years" },
  "halfLifeSeconds": 166337280
}`;

	const isotopesGetResponse = `{
  "items": [ /* isotope objects, see below */ ],
  "count": 24,
  "search": "co",
  "continuation": "eyJ0b2tlbiI6…",  // opaque; null on the last page
  "hasMore": true,
  "mocked": true                    // only present when sample data is served
}`;

	const isotopePost = `{
  "mode": "append",              // "append" (default) | "replace"
  "elementName": "Cobalt",       // optional if it can be inferred from shortName
  "shortName": "Co",
  "massNumber": 60,
  "suffix": "m",                 // optional, default ""
  "energies": [1173.2, 1332.5],
  "halfLife": { "number": 5.2714, "unit": "years" }
}`;

	const isotopePostResponse = `{
  "item": { /* the stored isotope */ },
  "created": false,              // true on 201, false on 200 (matched an existing record)
  "appendedEnergy": true,        // append mode unioned in new energies
  "replaced": false              // true when mode was "replace"
}`;

	const referenceMaterialPost = `{
  "notes": "Optional run notes",
  "isotopes": [
    { "isotopeId": "isotope-doc-id-1", "energy": 1173.2 }
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
        "dtType": "simple",
        "countingMode": "normal",           // "normal" (default) | "compton"
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
        "knownConcentration": [0.1],
        "knownUncertainty": [0.005],
        "concentrationUnits": ["ppm"]
      }
    }
  ]
}`;

	const referenceMaterialReplace = `{
  "mode": "replace-counting",
  "targetItemId": "<reference-material document id>",
  "targetCountingId": "<countingId to overwrite>",
  "isotopes": [ /* … */ ],
  "countings": [ { /* exactly one, the replacement */ } ]
}`;

	const datasheetPost = `{
  "sampleName": "SRM1633c",
  "entries": [
    { "label": "Co", "concentration": 46, "uncertainty": 3, "unit": "ppm" },
    { "label": "Fe", "concentration": 7.8, "uncertainty": 0.2, "unit": "percentage" }
  ]
}`;

	const measurementPost = `{
  "measuredIsotope": { "isotopeId": "<catalog id of the isotope you detect>" },
  "targetIsotope":   { "isotopeId": "<catalog id of the isotope you quantify>" },
  "notes": ""
}`;

	const fissionPost = `{
  "fissileNuclide": "U-235",
  "interferingIsotope": "La-140",
  "gammaEnergyKev": 1596.2,       // optional
  "irradiationPosition": "",      // optional
  "irradiationType": "thermal",   // "thermal" (default) | "epithermal" | "fast"
  "correctionFactor": 0.00233,
  "uncertainty": 0.00012,         // optional
  "notes": ""                     // optional
}`;

	const errorShape = `{ "error": "Human-readable message." }`;
</script>

<svelte:head>
	<title>API reference — NAA Analysis</title>
</svelte:head>

<div class="guide">
	<h1 class="text-3xl font-bold">Shared-catalog API reference</h1>
	<p class="mt-2 text-sm">
		Version {APP_VERSION} · the HTTP API behind the shared catalog. For the wizard itself see the
		<a class="underline" href={resolve('/help')}>Help page</a>; for running the deployment see the
		<a class="underline" href={resolve('/help/admin')}>Admin guide</a>.
	</p>

	<p class="mt-4">
		The catalog data you browse in the wizard — isotopes, reference materials, datasheets, proxy
		relationships — lives behind a small REST-ish API served by Azure Functions. Every read is
		public; only writes need a signed-in account with the writer role. You can call it directly for
		scripting, bulk loading, or building your own tools against the catalog.
	</p>

	<nav class="mt-4 rounded border border-surface-300-700 p-3 text-sm">
		<strong>On this page</strong>
		<ul class="mt-1 ml-5 list-disc">
			<li><a class="underline" href="#basics">Basics</a></li>
			<li><a class="underline" href="#conventions">Shared conventions</a></li>
			<li><a class="underline" href="#isotopes">Isotopes</a></li>
			<li><a class="underline" href="#reference-materials">Reference materials</a></li>
			<li><a class="underline" href="#datasheets">Reference datasheets</a></li>
			<li><a class="underline" href="#measurements">Proxy-measurement relationships</a></li>
			<li><a class="underline" href="#fission">Fission-interference corrections</a></li>
			<li><a class="underline" href="#auth">Authentication &amp; calling writes</a></li>
			<li><a class="underline" href="#status">Status codes</a></li>
		</ul>
	</nav>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="basics" class="mt-8 text-2xl font-bold">Basics</h2>

	<details class="guide__item" open>
		<summary>Where it is and when it exists</summary>
		<div>
			<ul class="ml-5 list-disc">
				<li>
					<strong>Base path:</strong> <code>/api</code> on the same origin as the app (the Azure Static
					Web Apps deployment). There is no separate API host.
				</li>
				<li>
					<strong>Only on the Azure deployment.</strong> The GitHub Pages copy and a local
					<code>npm run dev</code> are static-only — there is no <code>/api</code> there, and the
					wizard hides catalog features. The app detects this by probing
					<code>GET /api/isotopes</code> at startup.
				</li>
				<li>
					<strong>Five resources:</strong> <code>isotopes</code>, <code>reference-materials</code>,
					<code>reference-datasheets</code>, <code>isotope-measurements</code>,
					<code>fission-corrections</code>. Each registers <code>GET</code> and <code>POST</code>
					only — any other method returns <code>405</code>.
				</li>
				<li>
					<strong>Requests and responses are JSON.</strong> Send
					<code>Content-Type: application/json</code>
					on a <code>POST</code>; send <code>Accept: application/json</code> on a <code>GET</code>.
				</li>
			</ul>
			<p class="guide__why">
				<strong>The frontend paths can be overridden.</strong> The isotope browser calls
				<code>PUBLIC_ISOTOPE_API_URL</code> (default <code>/api/isotopes</code>) and the reference
				browser <code>PUBLIC_REFERENCE_MATERIAL_API_URL</code> (default
				<code>/api/reference-materials</code>) — build-time env vars, useful if you host the API
				elsewhere.
			</p>
		</div>
	</details>

	<details class="guide__item">
		<summary>Reads are public, writes are not</summary>
		<div>
			<p>
				Every <code>GET</code> is anonymous — it is all shared reference data. Every
				<code>POST</code> requires a signed-in identity carrying the
				<code>isotope_writer</code> role (configurable via <code>ISOTOPE_WRITE_ROLE</code>). See
				<a class="underline" href="#auth">Authentication</a> below.
			</p>
		</div>
	</details>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="conventions" class="mt-8 text-2xl font-bold">Shared conventions</h2>

	<details class="guide__item">
		<summary>Errors</summary>
		<div>
			<p>Any non-2xx response has this body:</p>
			<pre><code>{errorShape}</code></pre>
			<p>
				<code>400</code> — malformed JSON or a payload that fails validation (the message names the
				offending field). <code>401</code> / <code>403</code> — not signed in / missing the writer
				role. <code>405</code> — a method other than <code>GET</code>/<code>POST</code>.
				<code>500</code> — the database is configured but the query or write failed (the API never falls
				back to sample data when a real database is present).
			</p>
		</div>
	</details>

	<details class="guide__item">
		<summary>Pagination</summary>
		<div>
			<ul class="ml-5 list-disc">
				<li>
					Both list endpoints take <code>q</code> (free-text search) and <code>limit</code> (page size,
					clamped server-side).
				</li>
				<li>
					<code>/api/isotopes</code> pages with an opaque <strong>continuation token</strong>: the
					response carries <code>continuation</code> (a string, or <code>null</code> on the last
					page); pass it back as <code>?continuation=…</code>.
				</li>
				<li>
					<code>/api/reference-materials</code> pages with a numeric
					<strong><code>offset</code></strong> (<code>?offset=…</code>, newest first).
				</li>
				<li>
					<code>reference-datasheets</code>, <code>isotope-measurements</code> and
					<code>fission-corrections</code> return the <strong>whole list</strong> in one call — no paging.
				</li>
			</ul>
		</div>
	</details>

	<details class="guide__item">
		<summary>Sample-data mode</summary>
		<div>
			<p>
				When no <code>COSMOSDB_*</code> settings are present (or <code>MOCK_COSMOS=true</code>), the
				API serves a small built-in catalog and every response carries <code>"mocked": true</code>.
				The wizard shows an amber "sample data" banner in that state. A configured database is
				always used and never mixed with sample data.
			</p>
		</div>
	</details>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="isotopes" class="mt-8 text-2xl font-bold">Isotopes</h2>

	<details class="guide__item">
		<summary><code>GET /api/isotopes</code></summary>
		<div>
			<p>
				Query params: <code>q</code>, <code>limit</code>, <code>continuation</code>.
				<code>q</code> matches element name, symbol, mass number, or a gamma energy.
			</p>
			<p>Response:</p>
			<pre><code>{isotopesGetResponse}</code></pre>
			<p>Each item:</p>
			<pre><code>{isotopeItem}</code></pre>
			<p class="guide__why">
				<strong>Identity is <code>(shortName, massNumber, suffix)</code>.</strong>
				<code>Ag-110m</code> and <code>Ag-110</code> are different records — the trailing "m" is part
				of the key.
			</p>
		</div>
	</details>

	<details class="guide__item">
		<summary><code>POST /api/isotopes</code> — writer role</summary>
		<div>
			<p>Body:</p>
			<pre><code>{isotopePost}</code></pre>
			<p>
				Required: <code>shortName</code>, <code>massNumber</code> (1–999), <code>energies</code>
				(array of non-negative numbers), <code>halfLife.number</code> and <code>halfLife.unit</code>
				(one of
				<code>seconds, minutes, hours, days, weeks, years</code>). <code>elementName</code> may be
				omitted if it can be inferred from <code>shortName</code>. The server assigns the
				<code>id</code> and computes <code>halfLifeSeconds</code>.
			</p>
			<p>Behaviour when an isotope with the same identity already exists:</p>
			<ul class="ml-5 list-disc">
				<li>
					<code>"mode": "append"</code> (default) — keeps every stored field and unions in any new
					<code>energies</code>. Safe for "found another line" writes.
				</li>
				<li>
					<code>"mode": "replace"</code> — <code>elementName</code>, <code>halfLife</code> and the
					<em>entire</em> <code>energies</code> list overwrite what is stored (identity and creation audit
					fields are kept). The wizard's "Update existing" uses this.
				</li>
			</ul>
			<p>
				Response — <code>201</code> for a new record, <code>200</code> when it matched an existing one:
			</p>
			<pre><code>{isotopePostResponse}</code></pre>
		</div>
	</details>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="reference-materials" class="mt-8 text-2xl font-bold">Reference materials</h2>

	<details class="guide__item">
		<summary><code>GET /api/reference-materials</code></summary>
		<div>
			<p>Query params: <code>q</code>, <code>limit</code>, <code>offset</code>.</p>
			<pre><code
					>{`{
  "items": [ /* reference-material documents, datasheet merged in */ ],
  "count": 12,
  "search": "",
  "hasMore": true
}`}</code
				></pre>
			<p>
				Each item is a reference-material document: a <code>referenceKey</code> fingerprint,
				<code>isotopes[]</code>, and <code>countings[]</code> (each with its own
				<code>countingId</code> and a <code>referenceMaterial</code> holding <code>counts[]</code>,
				<code>knownConcentration[]</code>, etc.). The full shape is in the
				<a class="underline" href={resolve('/help/admin')}>Admin guide</a> data model.
			</p>
		</div>
	</details>

	<details class="guide__item">
		<summary><code>POST /api/reference-materials</code> — writer role</summary>
		<div>
			<p>Body (append — the default):</p>
			<pre><code>{referenceMaterialPost}</code></pre>
			<ul class="ml-5 list-disc">
				<li>
					<code>isotopes.length</code> must equal each counting's <code>counts.length</code> /
					<code>knownConcentration.length</code>.
				</li>
				<li>
					<code>countingMode</code> is <code>"normal"</code> (default) or <code>"compton"</code>. It
					is part of the identity fingerprint, so a normal and a Compton-suppressed counting of the
					same sample are stored separately.
				</li>
				<li>
					The client-supplied <code>referenceKey</code> is ignored — the server recomputes a SHA-256 fingerprint
					from all the counting metadata + isotope set.
				</li>
				<li>
					If a document with the same normalized fingerprint exists, the incoming
					<code>countings</code> are <strong>appended</strong> to it.
				</li>
			</ul>
			<p>To overwrite one counting in place instead:</p>
			<pre><code>{referenceMaterialReplace}</code></pre>
			<p>
				The document <code>id</code> and <code>referenceKey</code> are preserved; the targeted
				counting is swapped (keeping its <code>countingId</code>) and its isotope set replaced. If
				the target counting is gone the incoming one is appended. A missing
				<code>targetItemId</code> document returns <code>404</code>.
			</p>
			<p>
				Response: <code>201</code> (new) or <code>200</code> (appended / replaced), body
				<code>{`{ "item": …, "created": bool }`}</code>.
			</p>
		</div>
	</details>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="datasheets" class="mt-8 text-2xl font-bold">Reference datasheets</h2>

	<details class="guide__item">
		<summary><code>GET</code> / <code>POST /api/reference-datasheets</code></summary>
		<div>
			<p>
				A datasheet is a certified-concentration table, stored separately so several reference
				materials can share one. <code>GET</code> returns <code>{`{ "items": [ … ] }`}</code> (whole list,
				newest first). The wizard normally builds datasheets for you from the concentrations you type;
				you rarely call this directly.
			</p>
			<p><code>POST</code> body (writer role):</p>
			<pre><code>{datasheetPost}</code></pre>
			<p>
				<code>entries[].unit</code> is <code>"ppm"</code> or <code>"percentage"</code>;
				<code>concentration</code> and <code>uncertainty</code> are non-negative numbers. Always
				creates a new record (<code>201</code>, body
				<code>{`{ "item": …, "created": true }`}</code>).
			</p>
		</div>
	</details>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="measurements" class="mt-8 text-2xl font-bold">Proxy-measurement relationships</h2>

	<details class="guide__item">
		<summary><code>GET</code> / <code>POST /api/isotope-measurements</code></summary>
		<div>
			<p>
				Records "isotope A is measured to quantify isotope B" — classically Np-239's lines used to
				measure uranium. <code>GET</code> returns <code>{`{ "items": [ … ] }`}</code> (whole list).
			</p>
			<p><code>POST</code> body (writer role):</p>
			<pre><code>{measurementPost}</code></pre>
			<p>
				Both ids are catalog isotope <code>id</code>s and must differ. Upserts by the
				<code>(measured, target)</code> pair — <code>200</code> when it updates an existing link,
				<code>201</code> when new.
			</p>
		</div>
	</details>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="fission" class="mt-8 text-2xl font-bold">Fission-interference corrections</h2>

	<details class="guide__item">
		<summary><code>GET</code> / <code>POST /api/fission-corrections</code></summary>
		<div>
			<p class="guide__why">
				<strong>7.2 work in progress.</strong> This table is populated through the temporary,
				unlinked screen at <code>/admin/fission-corrections</code>. The route and possibly this
				endpoint are expected to be removed once the table is filled.
			</p>
			<p>
				One record captures a fissile nuclide whose in-pile fission produces a nuclide that is also
				an activation product of another element, plus the empirical factor used to subtract that
				contribution. <code>GET</code> returns <code>{`{ "items": [ … ] }`}</code> (whole list).
			</p>
			<p><code>POST</code> body (writer role):</p>
			<pre><code>{fissionPost}</code></pre>
			<p>
				Required: <code>fissileNuclide</code>, <code>interferingIsotope</code>,
				<code>correctionFactor</code>. Upserts by the
				<code>(fissile, interferent, gamma energy, position, irradiation type)</code> tuple —
				<code>200</code> on update, <code>201</code> on insert.
			</p>
		</div>
	</details>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="auth" class="mt-8 text-2xl font-bold">Authentication &amp; calling writes</h2>

	<details class="guide__item" open>
		<summary>How writes are gated</summary>
		<div>
			<p>
				The Functions themselves are <code>authLevel: 'anonymous'</code> — Azure Static Web Apps is
				the authenticating layer. Each <code>POST</code> is checked <strong>twice</strong>:
			</p>
			<ol class="ml-5 list-decimal space-y-1">
				<li>
					A <code>POST</code>-only route rule in <code>staticwebapp.config.json</code> restricting
					all five endpoints to the <code>isotope_writer</code> role. Unauthenticated callers get a
					<code>302</code> to <code>/.auth/login/aad</code>; authenticated callers without the role
					get <code>403</code>.
				</li>
				<li>
					The handler independently re-validates the SWA-forwarded
					<code>x-ms-client-principal</code> header on the <code>POST</code> path — the backstop
					against a config regression. <code>GET</code> is never gated.
				</li>
			</ol>
		</div>
	</details>

	<details class="guide__item">
		<summary>Calling it from a script</summary>
		<div>
			<ul class="ml-5 list-disc">
				<li>
					<strong>Reads:</strong> just request the URL — no auth, no headers beyond
					<code>Accept</code>.
				</li>
				<li>
					<strong>Writes</strong> need a Static Web Apps authenticated session. In a browser that is
					the cookie set after <code>/.auth/login/aad</code>; from a script you must carry that
					session cookie (or run in a context that has one). There is no API key or bearer-token
					path.
				</li>
				<li>
					Your signed-in account also needs the <code>isotope_writer</code> role — granted in the
					Azure portal under <em>Role management</em> (see the
					<a class="underline" href={resolve('/help/admin')}>Admin guide</a>).
				</li>
			</ul>
			<p class="guide__why">
				<strong>This is a browser-callable API.</strong> Anyone with the writer role can write from a
				browser or a script while signed in. If writes must come only from trusted automation, put that
				path behind a separate backend that is not exposed to app users.
			</p>
		</div>
	</details>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="status" class="mt-8 text-2xl font-bold">Status codes</h2>

	<details class="guide__item">
		<summary>What each endpoint returns</summary>
		<div>
			<ul class="ml-5 list-disc">
				<li>
					<code>200</code> — a successful <code>GET</code>, or a <code>POST</code> that updated / appended
					to an existing record.
				</li>
				<li><code>201</code> — a <code>POST</code> that created a new record.</li>
				<li>
					<code>302</code> — an unauthenticated <code>POST</code> (redirect to login, from the SWA layer).
				</li>
				<li><code>400</code> — invalid JSON or a payload that failed validation.</li>
				<li><code>401</code> — no authenticated identity reached the handler.</li>
				<li><code>403</code> — authenticated but missing the writer role.</li>
				<li>
					<code>404</code> — <code>replace-counting</code> against a reference-material id that no longer
					exists.
				</li>
				<li><code>405</code> — a method other than <code>GET</code> or <code>POST</code>.</li>
				<li><code>500</code> — a configured database that failed the query or write.</li>
			</ul>
		</div>
	</details>

	<hr class="mt-10 border-surface-300-700" />
	<p class="mt-4 text-sm">
		<a class="underline" href={resolve('/help')}>← Back to the Help page</a>
		·
		<a class="underline" href={resolve('/help/admin')}>Admin guide</a>
	</p>
	<p class="mt-2 text-sm">
		Payload shapes are also in <code>README.md</code> in the
		<a
			class="underline"
			href="https://github.com/galegozi/NAA-Software"
			target="_blank"
			rel="noopener noreferrer">source repository</a
		>.
	</p>
</div>
