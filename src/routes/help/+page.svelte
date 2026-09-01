<script lang="ts">
	import { resolve } from '$app/paths';
	import { APP_VERSION } from '$lib/utils/stepUtils.js';
</script>

<svelte:head>
	<title>Help — NAA Analysis</title>
</svelte:head>

<div class="guide">
	<h1 class="text-3xl font-bold">Using the NAA Analysis tool</h1>
	<p class="mt-2 text-sm">Version {APP_VERSION}</p>

	<p class="mt-4">
		This tool works out how much of each element is in an unknown sample. It compares the gamma-ray
		counts from your sample against a <em>reference material</em> of known composition — both irradiated
		and counted the same way — and does the decay and dead-time corrections for you.
	</p>

	<nav class="mt-4 rounded border border-surface-300-700 p-3 text-sm">
		<strong>On this page</strong>
		<ul class="mt-1 ml-5 list-disc">
			<li><a class="underline" href="#what-is-naa">What is Neutron Activation Analysis?</a></li>
			<li><a class="underline" href="#a-lot-of-steps">"This looks like a lot of steps…"</a></li>
			<li><a class="underline" href="#quick-start">Quick start</a></li>
			<li><a class="underline" href="#the-steps">The steps, one by one</a></li>
			<li><a class="underline" href="#common-tasks">Common tasks</a></li>
			<li><a class="underline" href="#faq">FAQ &amp; troubleshooting</a></li>
		</ul>
	</nav>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="what-is-naa" class="mt-8 text-2xl font-bold">What is Neutron Activation Analysis?</h2>

	<details class="guide__item" open>
		<summary>The short version</summary>
		<div>
			<p>
				You put a sample in a neutron beam (in a research reactor). Some of its nuclei absorb a
				neutron and become radioactive isotopes. As those decay they emit gamma rays at energies
				that are characteristic of each isotope — so the gammas at, say, 411.8&nbsp;keV tell you
				you're looking at Au-198, and how many of them per second tells you how much gold was in the
				sample.
			</p>
			<p>
				To turn a count rate into an actual concentration, you run a <strong
					>reference material</strong
				>
				of certified composition through the same irradiation and counting, and compare. This is the "comparator
				method" of NAA.
			</p>
			<p class="guide__why">
				<strong>What this software does — and doesn't:</strong> it does the bookkeeping — the decay,
				saturation and dead-time corrections, matching your sample's counts to the reference, and
				propagating the uncertainties. It does <strong>not</strong> control or talk to the reactor or
				the detector. You bring the numbers (from your counting software, e.g. a Maestro ROI report);
				it does the maths and gives you concentrations with uncertainties.
			</p>
		</div>
	</details>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="a-lot-of-steps" class="mt-8 text-2xl font-bold">"This looks like a lot of steps…"</h2>

	<details class="guide__item">
		<summary>Is all of this really necessary?</summary>
		<div>
			<p>
				The calculation only needs three things: the nuclear properties of each isotope you're
				measuring, a reference material with <em>known</em> concentrations and its counts, and your unknown
				sample's counts. The steps just collect those three things in order.
			</p>
			<p class="guide__why">
				<strong>Why it feels heavy:</strong> the first analysis is the slowest because you may be entering
				isotopes and a reference material by hand. Once they're in the shared catalog, everyone (including
				future you) picks them from a list in a few clicks. The catalog is the payoff for the setup.
			</p>
			<ul class="ml-5 list-disc">
				<li>You do <strong>not</strong> need an account to run an analysis.</li>
				<li>
					Signing in is only for <strong>contributing</strong> data back to the shared catalog.
				</li>
				<li>Everything you type is saved automatically in your browser as you go.</li>
			</ul>
		</div>
	</details>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="quick-start" class="mt-8 text-2xl font-bold">Quick start</h2>

	<ol class="mt-2 ml-5 list-decimal space-y-1">
		<li><strong>Get Started</strong> on the welcome screen.</li>
		<li>
			<strong>Select isotopes</strong> — add each gamma line you're measuring (e.g. Au-198 at 411.8&nbsp;keV),
			from the catalog or by hand.
		</li>
		<li>
			<strong>Build library</strong> — add a reference material (catalog or your own), fill in its counts
			and certified concentrations, and choose which reference covers each isotope.
		</li>
		<li><strong>Unknown materials</strong> — add your sample(s) and their counts.</li>
		<li>
			<strong>Review</strong> — read the concentration table, download the CSV, and (optionally) contribute
			anything new to the catalog.
		</li>
	</ol>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="the-steps" class="mt-8 text-2xl font-bold">The steps, one by one</h2>

	<details class="guide__item">
		<summary>Before you start — autosave, sign-in, themes</summary>
		<div>
			<ul class="ml-5 list-disc">
				<li>
					<strong>Autosave.</strong> As you work, the whole analysis is saved in <em>this</em>
					browser on <em>this</em> device. Close the tab, refresh, or get sent to a sign-in page — your
					work is still there when you come back.
				</li>
				<li>
					<strong>One draft per browser.</strong> It isn't synced between devices or people. Use
					<em>Start new analysis</em> on the welcome screen to clear it and begin fresh.
				</li>
				<li>
					<strong>Sign in</strong> (top-right — only on the main deployment, the one with the shared catalog)
					is needed to upload to the catalog — nothing else.
				</li>
				<li>
					<strong>Light / Dark</strong> toggle and this <strong>Help</strong> link are top-right.
				</li>
			</ul>
		</div>
	</details>

	<details class="guide__item">
		<summary>Step 1 — Select isotopes</summary>
		<div>
			<p>
				An "isotope" here means one specific gamma line you read off the spectrum — for example
				<strong>Au-198</strong> at <strong>411.8&nbsp;keV</strong>. Add one row per line you're
				using.
			</p>
			<p>Two ways to add:</p>
			<ul class="ml-5 list-disc">
				<li>
					<strong>From the catalog</strong> — search (by element, mass number, or energy) and click to
					add. Only shown when the shared catalog is reachable.
				</li>
				<li><strong>Add custom isotope</strong> — enter it yourself.</li>
			</ul>
			<p>Fields on a custom isotope:</p>
			<ul class="ml-5 list-disc">
				<li>
					<strong>Element name</strong> — e.g. Gold. Left blank, it's inferred from a known symbol.
				</li>
				<li>
					<strong>Isotope name</strong> — e.g. <code>Au-198</code>. For a metastable state write
					<code>Ag-110m</code> (the trailing "m" matters — Ag-110m is a different nuclide from Ag-110).
				</li>
				<li><strong>Energy (keV)</strong> — the gamma line you're integrating.</li>
				<li><strong>Half-life</strong> and its <strong>unit</strong>.</li>
			</ul>
			<p class="guide__why">
				<strong>Why the tool needs this:</strong> the half-life corrects for decay between the end of
				irradiation and your count; the energy is used to line up your ROI with the reference's.
			</p>
		</div>
	</details>

	<details class="guide__item">
		<summary>Step 2 — Build library (reference materials)</summary>
		<div>
			<p>
				A <strong>reference material</strong> is a sample whose element concentrations are certified.
				Irradiated and counted the same way as your unknown, it becomes the "ruler" that turns counts
				into concentrations.
			</p>
			<p>
				Add one from the catalog, or <strong>Add your own reference material</strong>. For a custom
				one you fill in:
			</p>
			<ul class="ml-5 list-disc">
				<li>
					<strong>Identifying name</strong> — a NETL code and/or sample name.
				</li>
				<li>
					<strong>Irradiation &amp; counting</strong> — mass, reactor power, irradiation time, end time,
					measurement start, decay time, live/real time, fluence, irradiation mode, dead-time correction
					type.
				</li>
				<li>
					<strong>Per isotope</strong> — net counts and uncertainty, and the
					<strong>known concentration</strong> + uncertainty + unit (ppm or %).
				</li>
			</ul>
			<p>
				<strong>Coverage.</strong> A reference doesn't have to measure every isotope in your
				analysis. Tick the isotopes it covers (or leave the selection empty to mean "all"). Then,
				under
				<em>Isotope assignment</em>, pick which reference supplies each isotope if more than one
				could.
			</p>
			<p class="guide__why">
				<strong>Why known concentrations:</strong> the reference's certified value plus its counts give
				the counts-per-unit-concentration for that isotope, which is then applied to your unknown's counts.
			</p>
		</div>
	</details>

	<details class="guide__item">
		<summary>Step 3 — Unknown materials</summary>
		<div>
			<p>
				Your actual sample(s). Same irradiation/counting fields and per-isotope counts as a
				reference material — but no known concentration, because that's what you're solving for. Add
				as many unknowns as you measured; they all appear as rows in the results table.
			</p>
		</div>
	</details>

	<details class="guide__item">
		<summary>Step 4 — Review</summary>
		<div>
			<ul class="ml-5 list-disc">
				<li>
					<strong>Predicted Concentrations</strong> table — rows are your unknowns, columns are the elements.
					Each cell is the concentration ± absolute uncertainty; further rows give the concentration detection
					limit.
				</li>
				<li><strong>Download Table as CSV</strong> for your records.</li>
				<li>
					<strong>Contribute to the shared catalog</strong> (signed-in writers) — one button uploads every
					new isotope and reference material at once, in the right order.
				</li>
				<li>
					<strong>Expand for debug information</strong> — the full intermediate values, if you want to
					check the working.
				</li>
			</ul>
		</div>
	</details>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="common-tasks" class="mt-8 text-2xl font-bold">Common tasks</h2>

	<details class="guide__item">
		<summary>Load counts from a Maestro <code>.rpt</code> file</summary>
		<div>
			<p>
				On any reference or unknown material there's a file picker for a Maestro ROI report.
				Selecting one fills the per-isotope net counts, gross counts and uncertainties from the
				matching ROIs, matched to your isotopes by energy. Check the values after import.
			</p>
		</div>
	</details>

	<details class="guide__item">
		<summary>Contribute an isotope to the catalog</summary>
		<div>
			<ol class="ml-5 list-decimal space-y-1">
				<li>Sign in (top-right) with an account that has upload access.</li>
				<li>On a custom isotope's card, open <strong>Share this isotope</strong>.</li>
				<li>Check the energy-line list — it's what gets stored. Add or trim lines here.</li>
				<li>
					<strong>Save to shared catalog.</strong> You'll see a short summary of what will happen; confirm
					it. If an isotope with that exact name already exists you'll be told, so you don't create a
					duplicate.
				</li>
			</ol>
		</div>
	</details>

	<details class="guide__item">
		<summary>Contribute a reference material to the catalog</summary>
		<div>
			<p>
				On a custom reference material's card, open <strong>Publish to shared catalog</strong>. You
				don't have to prepare anything first — when you confirm, the tool will:
			</p>
			<ul class="ml-5 list-disc">
				<li>add any of its isotopes that aren't in the catalog yet;</li>
				<li>
					create its "datasheet" (the certified-concentration table) from the values you entered;
				</li>
				<li>then save the reference material itself.</li>
			</ul>
			<p>The confirmation box lists exactly those steps before anything is uploaded.</p>
		</div>
	</details>

	<details class="guide__item">
		<summary>Record a proxy measurement (e.g. Np-239 to measure uranium)</summary>
		<div>
			<p>
				Sometimes you detect one isotope but you're actually quantifying another — classically,
				Np-239's gamma lines are used to measure uranium. The tool flags this when an isotope's name
				implies a different element than its label ("Np-239" on a "Uranium" entry) and offers a
				<strong>Record how this is measured</strong> button.
			</p>
			<p>
				That opens the <strong>Isotope relationships</strong> panel (also reachable at the bottom of
				Step 1). Choose the <strong>measured</strong> isotope (the one you detect) and the
				<strong>target</strong> isotope (the one you're quantifying) — each from the catalog, from
				your analysis, or as a custom entry — and add it. It's used for matching reference materials
				straight away; <strong>Publish to catalog</strong> shares it (and adds any missing isotopes first).
			</p>
		</div>
	</details>

	<details class="guide__item">
		<summary>Fix or update something that's already in the catalog</summary>
		<div>
			<p>
				Load the isotope or reference material from the catalog, edit it, then open its publish
				panel and choose <strong>Update the existing catalog entry</strong>. For an isotope this
				overwrites its half-life, element name and energy list; for a reference material it replaces
				the exact counting you loaded, in place. Choosing <strong>Save as new</strong> instead (or renaming
				it) creates a separate entry.
			</p>
		</div>
	</details>

	<!-- ------------------------------------------------------------------ -->
	<h2 id="faq" class="mt-8 text-2xl font-bold">FAQ &amp; troubleshooting</h2>

	<details class="guide__item">
		<summary>Will my data be shared automatically?</summary>
		<div>
			<p>
				No. Anything you enter stays in your browser until you explicitly press a publish/upload
				button and confirm the summary. The welcome screen and the confirmation dialogs both spell
				this out.
			</p>
		</div>
	</details>

	<details class="guide__item">
		<summary>I got an error uploading a reference material</summary>
		<div>
			<ul class="ml-5 list-disc">
				<li>
					Make sure the isotopes it <em>covers</em> have their net counts filled in — the upload sends
					counts for exactly those isotopes.
				</li>
				<li>Give it a NETL code or sample name (needed as its identifier).</li>
				<li>
					Either enter the known concentrations (a datasheet is built from them) or pick an existing
					datasheet.
				</li>
			</ul>
		</div>
	</details>

	<details class="guide__item">
		<summary>Why does it ask for a "datasheet"?</summary>
		<div>
			<p>
				The datasheet is just the reference material's certified concentration table, stored as its
				own record so several reference materials can share one. You normally never see it — the
				tool builds it automatically from the concentrations you type on the material. The picker is
				there only if you want to reuse an existing one.
			</p>
		</div>
	</details>

	<details class="guide__item">
		<summary>I'm signed in but the upload buttons are disabled</summary>
		<div>
			<p>
				Your account can sign in but hasn't been given upload access (the <code>isotope_writer</code
				>
				role). The header will say "(no upload access)". Ask an administrator to grant it — see the
				<a class="underline" href={resolve('/help/admin')}>Admin guide</a>.
			</p>
		</div>
	</details>

	<details class="guide__item">
		<summary>My draft disappeared</summary>
		<div>
			<p>
				The draft is per-browser and per-device. It's gone if you opened the tool in a different
				browser or on another machine, cleared your site data / used private browsing, or someone
				pressed <em>Start new analysis</em>.
			</p>
		</div>
	</details>

	<details class="guide__item">
		<summary>The catalog search boxes don't appear</summary>
		<div>
			<p>
				The shared catalog needs a backend and database, which only the main Azure deployment has.
				The GitHub Pages copy is the same software and version, just deployed as static files with
				no backend attached — so on that one (and when running locally) you enter every isotope and
				reference material by hand and run the full analysis that way.
			</p>
		</div>
	</details>

	<details class="guide__item">
		<summary>How do I start over?</summary>
		<div>
			<p>
				<em>Start new analysis</em> on the welcome screen clears the saved draft after a confirmation.
				Clicking the "NAA Analysis" title in the header takes you back to the welcome screen without clearing
				anything.
			</p>
		</div>
	</details>

	<hr class="mt-10 border-surface-300-700" />
	<p class="mt-4 text-sm">
		Running or maintaining the deployment? See the
		<a class="underline" href={resolve('/help/admin')}>Admin guide</a>.
	</p>
	<p class="mt-2 text-sm">
		Source code, issues and releases:
		<a
			class="underline"
			href="https://github.com/galegozi/NAA-Software"
			target="_blank"
			rel="noopener noreferrer">github.com/galegozi/NAA-Software</a
		>.
	</p>
</div>
