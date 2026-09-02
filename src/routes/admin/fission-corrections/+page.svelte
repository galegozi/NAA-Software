<script lang="ts">
	import { onMount } from 'svelte';
	import { swaAuth, redirectToSignIn } from '$lib/utils/swaAuth.svelte.js';
	import { WRITER_ROLE } from '$lib/utils/catalogWrite.js';
	import {
		IRRADIATION_TYPES,
		listFissionCorrections,
		saveFissionCorrection,
		FissionCorrectionError,
		type FissionCorrectionRecord,
		type IrradiationType
	} from '$lib/utils/fissionCorrections.js';

	// --- form state -------------------------------------------------------
	let fissileNuclide = $state('');
	let interferingIsotope = $state('');
	let gammaEnergyKev = $state('');
	let irradiationPosition = $state('');
	let irradiationType = $state<IrradiationType>('thermal');
	let correctionFactor = $state('');
	let uncertainty = $state('');
	let notes = $state('');

	let saving = $state(false);
	let formError = $state('');
	let formNotice = $state('');

	// --- existing records ------------------------------------------------
	let records = $state<FissionCorrectionRecord[]>([]);
	let listError = $state('');
	let loading = $state(true);

	async function refresh() {
		loading = true;
		listError = '';
		try {
			records = await listFissionCorrections();
		} catch (error) {
			listError =
				error instanceof FissionCorrectionError
					? error.message
					: 'Could not load the existing records.';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void swaAuth.refresh();
		void refresh();
	});

	function clientBlockers(): string[] {
		const problems: string[] = [];
		if (!fissileNuclide.trim()) problems.push('Fissile nuclide is required.');
		if (!interferingIsotope.trim()) problems.push('Interfering isotope is required.');
		if (!Number.isFinite(Number(correctionFactor)) || correctionFactor.trim() === '')
			problems.push('Correction factor must be a number.');
		if (gammaEnergyKev.trim() !== '' && !Number.isFinite(Number(gammaEnergyKev)))
			problems.push('Gamma energy must be a number (or blank).');
		if (uncertainty.trim() !== '' && !(Number(uncertainty) >= 0))
			problems.push('Uncertainty must be zero or greater (or blank).');
		return problems;
	}

	function resetForm() {
		fissileNuclide = '';
		interferingIsotope = '';
		gammaEnergyKev = '';
		irradiationPosition = '';
		irradiationType = 'thermal';
		correctionFactor = '';
		uncertainty = '';
		notes = '';
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		formError = '';
		formNotice = '';

		const problems = clientBlockers();
		if (problems.length > 0) {
			formError = problems.join(' ');
			return;
		}

		saving = true;
		try {
			const result = await saveFissionCorrection({
				fissileNuclide: fissileNuclide.trim(),
				interferingIsotope: interferingIsotope.trim(),
				gammaEnergyKev: gammaEnergyKev.trim() === '' ? null : Number(gammaEnergyKev),
				irradiationPosition: irradiationPosition.trim(),
				irradiationType,
				correctionFactor: Number(correctionFactor),
				uncertainty: uncertainty.trim() === '' ? 0 : Number(uncertainty),
				notes: notes.trim()
			});
			formNotice = result.created
				? `Added ${result.item.fissileNuclide} → ${result.item.interferingIsotope}.`
				: `Updated the existing ${result.item.fissileNuclide} → ${result.item.interferingIsotope} record.`;
			resetForm();
			await refresh();
		} catch (error) {
			formError =
				error instanceof FissionCorrectionError ? error.message : 'Could not save the record.';
		} finally {
			saving = false;
		}
	}

	const canWrite = $derived(swaAuth.signedIn && swaAuth.hasRole(WRITER_ROLE));
</script>

<svelte:head>
	<title>Fission corrections — data entry</title>
</svelte:head>

<div class="admin">
	<h1 class="text-3xl font-bold">Fission correction factors</h1>
	<p class="mt-2 text-sm">
		Internal data-entry screen for the fission-correction table. One row per interference
		relationship: a fissile nuclide whose in-pile fission produces a nuclide that is also an
		activation product of another element, plus the empirical factor used to subtract that
		contribution. This screen is temporary and unlinked — it will be removed once the table is
		populated.
	</p>

	{#if swaAuth.checking}
		<div class="admin__notice">Checking sign-in…</div>
	{:else if !swaAuth.signInAvailable}
		<div class="admin__notice">
			This deployment has no sign-in, so the table can't be written here. Use the Azure deployment.
		</div>
	{:else if !swaAuth.signedIn}
		<div class="admin__notice">
			<button
				type="button"
				class="btn preset-filled-primary-500"
				onclick={() => redirectToSignIn()}
			>
				Sign in
			</button>
			<span>— you need the <code>{WRITER_ROLE}</code> role to add rows.</span>
		</div>
	{:else if !swaAuth.hasRole(WRITER_ROLE)}
		<div class="admin__notice">
			Signed in, but your account is missing the <code>{WRITER_ROLE}</code> role, so writes will be rejected.
		</div>
	{/if}

	<form class="admin__form" onsubmit={submit}>
		<div class="admin__grid">
			<label class="label">
				<span>Fissile nuclide *</span>
				<input class="input" type="text" placeholder="e.g. U-235" bind:value={fissileNuclide} />
			</label>
			<label class="label">
				<span>Interfering isotope *</span>
				<input
					class="input"
					type="text"
					placeholder="e.g. La-140"
					bind:value={interferingIsotope}
				/>
			</label>
			<label class="label">
				<span>Gamma energy (keV)</span>
				<input
					class="input"
					type="number"
					step="any"
					placeholder="optional"
					bind:value={gammaEnergyKev}
				/>
			</label>
			<label class="label">
				<span>Irradiation position</span>
				<input
					class="input"
					type="text"
					placeholder="reactor / rabbit / position"
					bind:value={irradiationPosition}
				/>
			</label>
			<label class="label">
				<span>Irradiation type</span>
				<select class="select input" bind:value={irradiationType}>
					{#each IRRADIATION_TYPES as type (type)}
						<option value={type}>{type}</option>
					{/each}
				</select>
			</label>
			<label class="label">
				<span>Correction factor *</span>
				<input
					class="input"
					type="number"
					step="any"
					placeholder="e.g. 0.0123"
					bind:value={correctionFactor}
				/>
			</label>
			<label class="label">
				<span>Uncertainty</span>
				<input
					class="input"
					type="number"
					step="any"
					min="0"
					placeholder="absolute, optional"
					bind:value={uncertainty}
				/>
			</label>
			<label class="admin__wide label">
				<span>Notes</span>
				<textarea class="textarea" rows="2" placeholder="optional" bind:value={notes}></textarea>
			</label>
		</div>

		{#if formError}
			<p class="admin__error">{formError}</p>
		{/if}
		{#if formNotice}
			<p class="admin__ok">{formNotice}</p>
		{/if}

		<button type="submit" class="mt-4 btn preset-filled-primary-500" disabled={saving || !canWrite}>
			{saving ? 'Saving…' : 'Add row'}
		</button>
	</form>

	<h2 class="mt-8 text-xl font-bold">
		Existing rows {#if !loading}({records.length}){/if}
	</h2>

	{#if loading}
		<p class="mt-2 text-sm">Loading…</p>
	{:else if listError}
		<p class="admin__error">{listError}</p>
	{:else if records.length === 0}
		<p class="mt-2 text-sm">No rows yet.</p>
	{:else}
		<div class="admin__table-wrap">
			<table class="admin__table">
				<thead>
					<tr>
						<th>Fissile</th>
						<th>Interferent</th>
						<th>Energy (keV)</th>
						<th>Position</th>
						<th>Irr. type</th>
						<th>Factor</th>
						<th>Uncert.</th>
						<th>Notes</th>
						<th>Added</th>
					</tr>
				</thead>
				<tbody>
					{#each records as row (row.id)}
						<tr>
							<td>{row.fissileNuclide}</td>
							<td>{row.interferingIsotope}</td>
							<td>{row.gammaEnergyKev ?? '—'}</td>
							<td>{row.irradiationPosition || '—'}</td>
							<td>{row.irradiationType}</td>
							<td>{row.correctionFactor}</td>
							<td>{row.uncertainty}</td>
							<td>{row.notes || '—'}</td>
							<td>{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.admin {
		max-width: 60rem;
		margin: 0 auto;
		padding: 2rem 1.5rem 4rem;
		line-height: 1.6;
	}

	.admin__notice {
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--color-warning-500);
		border-radius: 0.5rem;
		background-color: var(--color-warning-50-950);
		font-size: 0.95rem;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}

	.admin__form {
		margin-top: 1.5rem;
		padding: 1rem;
		border: 1px solid var(--color-surface-300-700);
		border-radius: 0.6rem;
	}

	.admin__grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 1rem;
	}

	.admin__wide {
		grid-column: 1 / -1;
	}

	.admin__form :global(.label span) {
		display: block;
		font-weight: 700;
		font-size: 0.9rem;
		margin-bottom: 0.25rem;
	}

	.admin__form :global(.input),
	.admin__form :global(.select),
	.admin__form :global(.textarea) {
		width: 100%;
	}

	.admin__error {
		margin-top: 0.75rem;
		color: #ef4444;
		font-size: 0.9rem;
	}

	.admin__ok {
		margin-top: 0.75rem;
		color: var(--color-success-700, #15803d);
		font-size: 0.9rem;
	}

	.admin__table-wrap {
		margin-top: 0.75rem;
		overflow-x: auto;
	}

	.admin__table {
		border-collapse: collapse;
		font-size: 0.85rem;
		min-width: 100%;
	}

	.admin__table th,
	.admin__table td {
		border: 1px solid var(--color-surface-300-700);
		padding: 0.4rem 0.6rem;
		text-align: left;
		white-space: nowrap;
	}

	.admin__table td:nth-child(8) {
		white-space: normal;
		min-width: 12rem;
	}
</style>
