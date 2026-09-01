<script lang="ts">
	import { resolve } from '$app/paths';
	import { APP_VERSION } from '$lib/utils/stepUtils.js';
</script>

<svelte:head>
	<title>Admin guide — NAA Analysis</title>
</svelte:head>

<div class="guide">
	<h1 class="text-3xl font-bold">Admin guide</h1>
	<p class="mt-2 text-sm">
		Version {APP_VERSION} · for people who deploy, configure, or maintain this tool. End-user help is
		on the <a class="underline" href={resolve('/help')}>Help page</a>.
	</p>

	<nav class="mt-4 rounded border border-surface-300-700 p-3 text-sm">
		<strong>On this page</strong>
		<ul class="mt-1 ml-5 list-disc">
			<li><a class="underline" href="#architecture">Architecture</a></li>
			<li><a class="underline" href="#local">Local development</a></li>
			<li><a class="underline" href="#data">Data model (Cosmos DB)</a></li>
			<li><a class="underline" href="#api">API endpoints &amp; access control</a></li>
			<li><a class="underline" href="#deploy">Deploying</a></li>
			<li><a class="underline" href="#portal">Azure Portal tasks</a></li>
			<li><a class="underline" href="#access">Managing access to Azure</a></li>
			<li><a class="underline" href="#tasks">Common admin tasks</a></li>
			<li><a class="underline" href="#gotchas">Gotchas</a></li>
		</ul>
	</nav>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="architecture" class="mt-8 text-2xl font-bold">Architecture</h2>

	<details class="guide__item" open>
		<summary>The shape of the thing</summary>
		<div>
			<ul class="ml-5 list-disc">
				<li>
					<strong>Frontend:</strong> SvelteKit (Svelte 5), built as a fully static SPA (<code
						>@sveltejs/adapter-static</code
					>, <code>fallback: 404.html</code>,
					<code>prerender = true</code>, <code>appDir: 'app'</code>). No SvelteKit server code.
				</li>
				<li>
					<strong>Backend:</strong> Azure Functions v4 (plain JS ESM) in <code>api/</code>, backed
					by Azure Cosmos DB.
				</li>
				<li>
					<strong>Two deployment targets:</strong> GitHub Pages (static only, no API) and Azure
					Static Web Apps (static + <code>api/</code>). The wizard probes
					<code>GET /api/isotopes</code>
					at runtime and only shows catalog features when the API answers.
				</li>
				<li>
					<strong>Physics:</strong> <code>src/lib/NAAMath/</code>, layered by what inputs each step
					needs, each module exposing <code>getAll()</code>; <code>everythingMath.ts</code> combines them.
				</li>
				<li>
					<strong>The wizard:</strong> <code>src/routes/+page.svelte</code> is the whole UI. Auth
					state is <code>src/lib/utils/swaAuth.svelte.ts</code>; catalog reads/writes are
					<code>src/lib/utils/catalogWrite.ts</code>; the autosaved draft is
					<code>src/lib/utils/analysisDraft.ts</code>.
				</li>
			</ul>
			<p>
				<code>CLAUDE.md</code> in the repo is the condensed architecture reference and is kept current
				with structural changes.
			</p>
		</div>
	</details>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="local" class="mt-8 text-2xl font-bold">Local development</h2>

	<details class="guide__item">
		<summary>Running it on your machine</summary>
		<div>
			<p>
				<strong>Node 20.19+, 22.13+, or 24+</strong> is required (the build toolchain — Vite 8,
				ESLint 10 — needs it). The repo has a <code>.nvmrc</code> pinned to Node 22, so
				<code>nvm use</code> picks the right version. Older Node fails the build with an
				<code>Unsupported engine</code> / syntax error before it starts.
			</p>
			<p>Frontend (repo root):</p>
			<pre><code
					>npm install
npm run dev          # dev server
npm run build        # production build (output: build/)
npm run check        # svelte-check — this is the gate to keep green
npm run lint         # prettier + eslint (not CI-gated; has pre-existing drift)
npm run test:unit -- --run   # vitest, single pass</code
				></pre>
			<p>API (separate package):</p>
			<pre><code
					>cd api
npm install
npm test             # node --test
npm start            # Azure Functions Core Tools (func start)</code
				></pre>
			<p>
				For the full local combo (SPA + functions + emulated auth) use the
				<strong>Azure Static Web Apps CLI</strong> (<code>swa start</code>) pointing at the built
				app and <code>api/</code>.
			</p>
			<p class="guide__why">
				<strong>No database needed:</strong> set <code>MOCK_COSMOS=true</code> (env var or
				<code>api/local.settings.json</code>, sample in <code>api/local.settings.sample.json</code>)
				and the API serves in-memory mock data and logs writes instead of calling Cosmos.
			</p>
		</div>
	</details>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="data" class="mt-8 text-2xl font-bold">Data model (Cosmos DB)</h2>

	<details class="guide__item">
		<summary>Containers and document shapes</summary>
		<div>
			<p>
				One database (default <code>NAA-db</code>), four containers. Names come from env vars with
				these defaults:
			</p>
			<ul class="ml-5 list-disc">
				<li><code>COSMOSDB_CONTAINER</code> → <code>isotopes</code></li>
				<li><code>COSMOSDB_REFERENCE_CONTAINER</code> → <code>reference-materials</code></li>
				<li><code>COSMOSDB_DATASHEET_CONTAINER</code> → <code>reference-datasheets</code></li>
				<li>
					<code>COSMOSDB_ISOTOPE_MEASUREMENTS_CONTAINER</code> → <code>isotope-measurements</code>
				</li>
			</ul>
			<p>Document identity / shape:</p>
			<ul class="ml-5 list-disc">
				<li>
					<strong>isotope</strong> — identity is <code>(shortName, massNumber, suffix)</code> (so
					<code>Ag-110m</code> is distinct from <code>Ag-110</code>); carries
					<code>energies[]</code>, <code>halfLife</code> / <code>halfLifeUnit</code> /
					<code>halfLifeSeconds</code>.
				</li>
				<li>
					<strong>reference-material</strong> — <code>referenceKey</code> is a SHA-256 fingerprint
					of
					<em>all</em> the counting metadata + isotope set (recomputed server-side; the client's
					<code>referenceKey</code> is ignored). Contains <code>isotopes[]</code> and
					<code>countings[]</code>; each counting has its own <code>countingId</code> and a
					<code>referenceMaterial</code> with <code>counts[]</code>,
					<code>knownConcentration[]</code>, etc.
				</li>
				<li>
					<strong>reference-datasheet</strong> — <code>sampleName</code> and
					<code>entries[]</code> (<code>label</code>, <code>concentration</code>,
					<code>uncertainty</code>, <code>unit</code>). Referenced by
					<code>referenceDatasheetId</code> on each counting.
				</li>
				<li>
					<strong>isotope-measurement-link</strong> — <code>measuredIsotope.isotopeId</code> +
					<code>targetIsotope.isotopeId</code> (catalog ids) + <code>notes</code>. Upserts by the
					pair.
				</li>
			</ul>
			<p>
				Normalization / merge logic lives in <code>api/src/lib/*WritePayload.js</code> (unit-tested, separate
				from the handlers). All Cosmos queries are parameterised — no string interpolation of user input.
			</p>
		</div>
	</details>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="api" class="mt-8 text-2xl font-bold">API endpoints &amp; access control</h2>

	<details class="guide__item">
		<summary>Endpoints</summary>
		<div>
			<ul class="ml-5 list-disc">
				<li><code>GET</code> / <code>POST /api/isotopes</code></li>
				<li><code>GET</code> / <code>POST /api/reference-materials</code></li>
				<li><code>GET</code> / <code>POST /api/reference-datasheets</code></li>
				<li><code>GET</code> / <code>POST /api/isotope-measurements</code></li>
			</ul>
			<p>
				<strong>Every <code>GET</code> is public</strong> — it's all shared catalog data. Only the
				<code>POST</code>s need the writer role: isotopes and reference-materials via a
				<code>staticwebapp.config.json</code> route rule + an in-function check;
				reference-datasheets and isotope-measurements via an in-function check on the
				<code>POST</code> path only (no route rule).
			</p>
			<p>
				<code>POST</code> payload shapes are documented in <code>README.md</code>. Update-in-place
				flags: <code>POST /api/isotopes</code> with <code>"mode":"replace"</code> overwrites
				element/half-life/energy list; <code>POST /api/reference-materials</code> with
				<code>"mode":"replace-counting"</code> + <code>targetItemId</code>/<code
					>targetCountingId</code
				>
				swaps one counting on a document by id.
			</p>
		</div>
	</details>

	<details class="guide__item">
		<summary>The two-layer write guard (keep both in sync)</summary>
		<div>
			<p>
				The functions stay at <code>authLevel: 'anonymous'</code> — Azure SWA is the authenticating layer.
				Writes are protected twice:
			</p>
			<ol class="ml-5 list-decimal space-y-1">
				<li>
					<code>staticwebapp.config.json</code> route rules restrict <code>POST /api/isotopes</code>
					and <code>POST /api/reference-materials</code> to the <code>isotope_writer</code> role (with
					<code>responseOverrides</code> for 401 → login and 403 → SPA).
				</li>
				<li>
					Each handler independently re-validates the SWA-forwarded
					<code>x-ms-client-principal</code> header via
					<code>api/src/lib/staticWebAppsAuth.js</code> (<code>canWriteIsotopes</code>) — on the
					<code>POST</code> path only, so <code>GET</code> stays public.
				</li>
			</ol>
			<p class="guide__why">
				<strong>Why both:</strong> for the two route-ruled endpoints, the in-function check is the backstop
				against a config regression silently opening write access. <code>reference-datasheets</code> and
				<code>isotope-measurements</code> have no route rule, so their in-function <code>POST</code> check
				is the only guard — don't remove it.
			</p>
			<p>
				The role name is <code>isotope_writer</code> unless overridden by
				<code>ISOTOPE_WRITE_ROLE</code>.
			</p>
		</div>
	</details>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="deploy" class="mt-8 text-2xl font-bold">Deploying</h2>

	<details class="guide__item">
		<summary>The two GitHub Actions workflows</summary>
		<div>
			<ul class="ml-5 list-disc">
				<li>
					<strong>GitHub Pages</strong> — <code>.github/workflows/deploy.yml</code>, on push to
					<code>main</code>. Runs <code>npm run build</code>, publishes <code>build/</code>. Static
					only, no API. If hosting under a repo sub-path, set <code>paths.base</code> in
					<code>svelte.config.js</code>.
				</li>
				<li>
					<strong>Azure Static Web Apps</strong> —
					<code>.github/workflows/azure-static-web-apps-*.yml</code>. Uses
					<code>Azure/static-web-apps-deploy@v1</code> with the deployment token in repo secret
					<code>AZURE_STATIC_WEB_APPS_API_TOKEN_*</code>; builds and deploys both the SPA (<code
						>output_location: "build"</code
					>) and <code>api/</code>.
				</li>
			</ul>
			<p>
				Both fire on <code>main</code>. A PR against <code>main</code> gets an SWA preview environment;
				it's torn down when the PR closes.
			</p>
		</div>
	</details>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="portal" class="mt-8 text-2xl font-bold">Azure Portal tasks</h2>

	<details class="guide__item">
		<summary>Where things live</summary>
		<div>
			<ul class="ml-5 list-disc">
				<li>
					<strong>Static Web App</strong> resource — hosts the SPA and the managed Functions. This is
					where you set app settings, manage roles, see the deployment token, and add custom domains.
				</li>
				<li>
					<strong>Cosmos DB account</strong> — a separate resource. Data Explorer here to inspect or fix
					documents.
				</li>
				<li>
					<strong>Application Insights</strong> (if linked) — function logs and failures.
				</li>
			</ul>
		</div>
	</details>

	<details class="guide__item">
		<summary>Set or change environment variables</summary>
		<div>
			<p>
				Static Web App → <strong>Settings → Environment variables</strong> (a.k.a. Configuration →
				Application settings). These are read by the Functions as <code>process.env.*</code>:
			</p>
			<ul class="ml-5 list-disc">
				<li>
					<code>COSMOSDB_ENDPOINT</code>, <code>COSMOSDB_KEY</code>, <code>COSMOSDB_DATABASE</code> —
					required.
				</li>
				<li>
					<code>COSMOSDB_CONTAINER</code> and the <code>*_REFERENCE_CONTAINER</code> /
					<code>*_DATASHEET_CONTAINER</code> / <code>*_ISOTOPE_MEASUREMENTS_CONTAINER</code> — optional,
					defaults above.
				</li>
				<li><code>MOCK_COSMOS</code> — leave unset / <code>false</code> in production.</li>
				<li><code>ISOTOPE_WRITE_ROLE</code> — optional override of <code>isotope_writer</code>.</li>
			</ul>
			<p>
				Saving app settings restarts the Functions. Production and each preview environment have
				their own set.
			</p>
		</div>
	</details>

	<details class="guide__item">
		<summary>Grant someone catalog write access</summary>
		<div>
			<ol class="ml-5 list-decimal space-y-1">
				<li>Static Web App → <strong>Role management</strong> → <strong>Invite</strong>.</li>
				<li>
					Pick the identity provider (Azure AD), enter their email, and add the role <code
						>isotope_writer</code
					>.
				</li>
				<li>
					Send them the generated invitation link (one-time, expires). They open it, sign in, and
					the role is bound to their account.
				</li>
			</ol>
			<p>
				To revoke: Role management → the user → remove. This is <em>separate</em> from Azure RBAC on
				the resource — it only controls what they can do <em>through the app</em>.
			</p>
		</div>
	</details>

	<details class="guide__item">
		<summary>See logs / diagnose a failing function</summary>
		<div>
			<ul class="ml-5 list-disc">
				<li>
					Static Web App → <strong>Functions</strong> → the function → <strong>Invocations</strong>
					/ <strong>Logs</strong>, or the linked Application Insights → <em>Failures</em> /
					<em>Logs (KQL)</em>.
				</li>
				<li>
					Handlers log with <code>context.log</code> / <code>context.error</code>; write failures
					log <code>"Failed to write … to Cosmos DB."</code> with the error.
				</li>
				<li>
					A 500 on a write is almost always Cosmos config (endpoint/key/database/container) or a
					Cosmos-side permission / firewall issue.
				</li>
			</ul>
		</div>
	</details>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="access" class="mt-8 text-2xl font-bold">Managing access to Azure</h2>

	<details class="guide__item" open>
		<summary>Service account vs. individual accounts</summary>
		<div>
			<p>
				<strong>Don't share the service account's username / password.</strong> One shared credential
				means no audit trail (everything looks like "the service account"), you can't revoke one person
				without rotating for everyone, and it fights MFA and most university policies.
			</p>
			<p>
				<strong>Instead, add each admin's own account with a scoped Azure RBAC role</strong>, on the
				specific resources — not the whole subscription:
			</p>
			<ul class="ml-5 list-disc">
				<li>
					Manage the app / Functions / config / deployments → <strong>Contributor</strong> on the Static
					Web App (or the resource group).
				</li>
				<li>Manage the Cosmos account (not read data) → <strong>Cosmos DB Operator</strong>.</li>
				<li>
					Read / write catalog documents directly → <strong
						>Cosmos DB Built-in Data Contributor</strong
					> (a data-plane role).
				</li>
				<li>Look only → <strong>Reader</strong> on the resource group.</li>
			</ul>
			<p>
				Assigning roles needs <strong>Owner</strong> or <strong>User Access Administrator</strong> on
				the resource / resource group. If the service account doesn't have that, UT IT or the subscription
				owner does the assignments.
			</p>
			<p class="guide__why">
				<strong>The app's <code>isotope_writer</code> role is separate</strong> from Azure RBAC.
				Being an Azure admin does <em>not</em> grant it — assign it explicitly in Role management to anyone
				who should also contribute catalog data through the UI.
			</p>
			<p>
				<strong>Keep the service account for automation only</strong>, and tighten it: enable MFA,
				and prefer GitHub Actions OIDC / federated credentials (a service principal with no stored
				password) over an account password for deployments. The SWA deployment token is independent
				of the service account and can be rotated on its own.
			</p>
			<p>
				Two things to check with UT's cloud team: whether the other admins' accounts are in the same
				Entra tenant (direct assignment) or need guest invites, and whether their policy lets you
				self-manage role assignments on the resource group.
			</p>
		</div>
	</details>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="tasks" class="mt-8 text-2xl font-bold">Common admin tasks</h2>

	<details class="guide__item">
		<summary>Rotate the SWA deployment token</summary>
		<div>
			<p>
				Static Web App → <strong>Overview → Manage deployment token</strong> → Reset. Then update
				the repo secret <code>AZURE_STATIC_WEB_APPS_API_TOKEN_*</code> (repo → Settings → Secrets and
				variables → Actions).
			</p>
		</div>
	</details>

	<details class="guide__item">
		<summary>Inspect or fix a bad catalog document</summary>
		<div>
			<ul class="ml-5 list-disc">
				<li>
					Cosmos DB account → <strong>Data Explorer</strong> → the container → query or edit the JSON
					directly.
				</li>
				<li>
					To find a reference material, search its <code
						>countings[].referenceMaterial.NETL_code</code
					>
					or <code>sampleName</code>; the top-level <code>referenceKey</code> is an opaque hash.
				</li>
				<li>
					To find an isotope, match <code>shortName</code> + <code>massNumber</code> +
					<code>suffix</code>.
				</li>
				<li>
					Deleting a datasheet that a counting still references will break loading that reference
					material.
				</li>
			</ul>
		</div>
	</details>

	<details class="guide__item">
		<summary>Roll back a deployment</summary>
		<div>
			<p>
				Revert the offending commit on <code>main</code> and let the workflows redeploy, or (SWA)
				re-run an older successful "Build And Deploy" job from the Actions tab. GitHub Pages
				similarly redeploys from whatever <code>main</code> points at.
			</p>
		</div>
	</details>

	<details class="guide__item">
		<summary>The deployed app shows no catalog search</summary>
		<div>
			<ol class="ml-5 list-decimal space-y-1">
				<li>Confirm you're on the Azure SWA URL, not the GitHub Pages one (Pages has no API).</li>
				<li>Hit <code>/api/isotopes</code> directly — a 200 with JSON means the API is up.</li>
				<li>If it 500s: check <code>COSMOSDB_*</code> app settings and the function logs.</li>
				<li>Check the Cosmos account's networking/firewall allows the SWA.</li>
			</ol>
		</div>
	</details>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="gotchas" class="mt-8 text-2xl font-bold">Gotchas</h2>

	<details class="guide__item">
		<summary>Things that have bitten people</summary>
		<div>
			<ul class="ml-5 list-disc">
				<li>
					<strong>Isotope identity is <code>(shortName, massNumber, suffix)</code>.</strong>
					<code>Ag-110m</code> ≠ <code>Ag-110</code>. The metastable "m" is part of the key.
				</li>
				<li>
					<strong>Reference-material identity is a hash of all metadata.</strong> Editing any field
					makes a <em>new</em> catalog entry unless you use the wizard's "update existing" (which targets
					the document by id).
				</li>
				<li>
					<strong>Isotope append-mode never overwrites half-life or element name</strong> — only
					<code>"mode":"replace"</code> does, and the wizard makes you confirm the full energy list first.
				</li>
				<li>
					<strong>A reference material only carries counts for the isotopes it covers.</strong> The
					wizard slices the per-isotope arrays to the covered set before upload so
					<code>isotopes.length === counts.length</code> for the API.
				</li>
				<li>
					<strong><code>npm run lint</code> is not CI-gated</strong> and has pre-existing prettier
					drift. Gate on <code>npm run check</code>. The client (browser) vitest project is
					currently broken on an env import; the <code>server</code> project is the one that matters.
				</li>
				<li>
					<strong>Update <code>README.md</code></strong> when changing the <code>POST</code> payload
					shapes or Azure settings, and <code>CLAUDE.md</code> for structural changes.
				</li>
			</ul>
		</div>
	</details>

	<hr class="mt-10 border-surface-300-700" />
	<p class="mt-4 text-sm">
		<a class="underline" href={resolve('/help')}>← Back to the user Help page</a>
	</p>
</div>
