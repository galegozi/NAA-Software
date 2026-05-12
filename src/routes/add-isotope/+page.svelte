<script lang="ts">
	import WriteIsotopeForm from '$lib/components/WriteIsotopeForm.svelte';
	import AuthGate from '$lib/components/AuthGate.svelte';
	import type { IsotopeWriteForm } from '$lib/types.js';
	import { lookupElementName } from '../../lib/utils/elementNames.js';
	import {
		parseIsotopeWriteUpload,
		type ParsedIsotopeUploadItem,
		type ParsedIsotopeUploadResult
	} from '../../lib/utils/isotopeWriteUpload.js';

	type IsotopeWriteRequest = {
		elementName: string;
		shortName: string;
		massNumber: number;
		suffix: string;
		energies: number[];
		halfLife: {
			number: number;
			unit: IsotopeWriteForm['unit'];
		};
	};

	const WRITER_ROLE = 'isotope_writer';

	function createWriteIsotopeForm(): IsotopeWriteForm {
		return {
			elementName: '',
			shortName: '',
			massNumber: 0,
			suffix: '',
			energy: 0,
			halfLife: 0,
			unit: 'seconds'
		};
	}

	let isotopeForm = $state<IsotopeWriteForm>(createWriteIsotopeForm());
	let isotopeFormRef = $state<WriteIsotopeForm | null>(null);
	let isSubmitting = $state(false);
	let submitMessage = $state('');
	let submitError = $state('');
	let uploadFiles = $state<FileList | undefined>(undefined);
	let uploadFileName = $state('');
	let uploadParseError = $state('');
	let uploadResult = $state<ParsedIsotopeUploadResult | null>(null);
	let uploadMessage = $state('');
	let uploadError = $state('');
	let isUploading = $state(false);
	let authGateRef = $state<AuthGate | null>(null);

	function resolveElementName(formData: Pick<IsotopeWriteForm, 'elementName' | 'shortName'>): string {
		return formData.elementName.trim() || lookupElementName(formData.shortName);
	}

	function buildManualPayload(formData: IsotopeWriteForm): IsotopeWriteRequest {
		const elementName = resolveElementName(formData);
		if (!elementName) {
			throw new Error('Element name is required unless the short symbol can be recognized.');
		}

		return {
			elementName,
			shortName: formData.shortName.trim(),
			massNumber: formData.massNumber,
			suffix: formData.suffix.trim(),
			energies: [formData.energy],
			halfLife: {
				number: formData.halfLife,
				unit: formData.unit
			}
		};
	}

	function buildUploadPayload(item: ParsedIsotopeUploadItem): IsotopeWriteRequest {
		return {
			elementName: item.elementName,
			shortName: item.shortName,
			massNumber: item.massNumber,
			suffix: '',
			energies: item.energies,
			halfLife: {
				number: item.halfLife.number,
				unit: item.halfLife.unit
			}
		};
	}

	async function saveIsotope(payload: IsotopeWriteRequest) {
		const response = await fetch('/api/isotopes', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json'
			},
			body: JSON.stringify(payload)
		});

		const body = await response.json().catch(() => null);

		if (!response.ok) {
			if (response.status === 401 || response.status === 403) {
				await authGateRef?.refreshAuthState();
			}

			throw new Error(body?.error || `Request failed with status ${response.status}`);
		}

		return {
			created: Boolean(body?.created)
		};
	}

	async function submitIsotope(writerAccess: boolean) {
		submitMessage = '';
		submitError = '';

		if (!writerAccess) {
			submitError = `Your account is signed in, but it does not have the '${WRITER_ROLE}' role required to save isotope data.`;
			return;
		}

		if (!isotopeFormRef?.validateWriteIsotopeForm()) {
			isotopeFormRef?.showValidationErrors();
			submitError = isotopeFormRef?.getValidationErrors()?.join('. ') || 'Please correct the form.';
			return;
		}

		isSubmitting = true;

		try {
			const payload = await saveIsotope(buildManualPayload(isotopeForm));

			submitMessage = payload.created
				? 'Isotope added successfully.'
				: 'Existing isotope updated successfully. Any new energy was appended.';
			isotopeForm = createWriteIsotopeForm();
			isotopeFormRef?.hideValidationErrors();
		} catch (error) {
			submitError = error instanceof Error ? error.message : 'Unable to save isotope.';
		} finally {
			isSubmitting = false;
		}
	}

	async function handleUploadChange(event: Event) {
		uploadParseError = '';
		uploadError = '';
		uploadMessage = '';
		uploadResult = null;
		uploadFileName = '';

		const input = event.currentTarget;
		if (!(input instanceof HTMLInputElement)) {
			return;
		}

		const file = input.files?.[0];
		if (!file) {
			return;
		}

		uploadFileName = file.name;

		try {
			const content = await file.text();
			uploadResult = parseIsotopeWriteUpload(content);
		} catch (error) {
			uploadParseError = error instanceof Error ? error.message : 'Unable to parse the uploaded file.';
		}
	}

	async function submitUploadedIsotopes(writerAccess: boolean) {
		uploadError = '';
		uploadMessage = '';

		if (!writerAccess) {
			uploadError = `Your account is signed in, but it does not have the '${WRITER_ROLE}' role required to save isotope data.`;
			return;
		}

		if (!uploadResult || uploadResult.items.length === 0) {
			uploadError = 'Upload a file with at least one valid isotope row before saving.';
			return;
		}

		isUploading = true;

		let createdCount = 0;
		let updatedCount = 0;
		const failures: string[] = [];

		try {
			for (const item of uploadResult.items) {
				try {
					const result = await saveIsotope(buildUploadPayload(item));
					if (result.created) {
						createdCount += 1;
					} else {
						updatedCount += 1;
					}
				} catch (error) {
					const label = `${item.shortName}-${item.massNumber}`;
					const message = error instanceof Error ? error.message : 'Unknown error';
					failures.push(`${label}: ${message}`);

					if (message.includes('role required') || message.includes('Not authenticated')) {
						break;
					}
				}
			}

			if (failures.length > 0) {
				uploadError = `Saved ${createdCount + updatedCount} isotope records, but ${failures.length} failed. ${failures.slice(0, 3).join(' | ')}`;
			} else {
				uploadMessage = `Saved ${uploadResult.items.length} isotope records from ${uploadResult.sourceLineCount} rows. ${createdCount} created, ${updatedCount} updated.`;
			}
		} finally {
			isUploading = false;
		}
	}

</script>

<svelte:head>
	<title>Write Isotope</title>
</svelte:head>

<section class="writer-page">
	<div class="writer-page__hero">
		<p class="writer-page__eyebrow">Isotope Catalog</p>
		<h1 class="writer-page__title">
			<span class="writer-page__title-icon" aria-hidden="true">
				<svg viewBox="0 0 24 24" focusable="false">
					<path
						d="M17 9h-1V7a4 4 0 10-8 0v2H7a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2v-8a2 2 0 00-2-2zm-6 6.73V17a1 1 0 002 0v-1.27a2 2 0 10-2 0zM10 9V7a2 2 0 114 0v2h-4z"
					></path>
				</svg>
			</span>
			<span>Write isotope data</span>
		</h1>
		<p class="writer-page__summary">
			Use this page to add a new isotope or append a new energy to an existing isotope record.
			The write endpoint stays locked to Azure-authenticated users with the writer role.
		</p>
	</div>

	<AuthGate bind:this={authGateRef} requiredRole={WRITER_ROLE}>
		{#snippet children({ principal, writerAccess })}
			<div class="writer-card">
				<div class="writer-card__header">
					<div>
						<h2>Add or update an isotope</h2>
						<p>
							If the isotope already exists, the API will keep the existing record and append any
							new energy value.
						</p>
					</div>
					<div class="writer-card__identity">
						<span>Signed in as</span>
						<strong>{principal?.userDetails || principal?.userId || 'Unknown user'}</strong>
					</div>
				</div>

				{#if !writerAccess}
					<div class="writer-page__feedback writer-page__feedback--warning" role="status">
						This account is signed in, but it does not have the <code>{WRITER_ROLE}</code> role.
						You can view and fill out the form, but saving is disabled until that role is assigned.
					</div>
				{/if}

				<form
					class="writer-form"
					onsubmit={(event) => {
						event.preventDefault();
						void submitIsotope(writerAccess);
					}}
				>
					<WriteIsotopeForm bind:this={isotopeFormRef} bind:formData={isotopeForm} />

					<div class="writer-page__helper">
						<p>Provide the element short name, integer mass number, and optional suffix separately.</p>
						<p>If the full element name is left blank, the app will infer it from a recognized symbol.</p>
						<p>All numeric fields accept decimals except for mass number, which stays an integer.</p>
						<p>Submitting the same isotope with a new energy will append that energy to the stored list.</p>
					</div>

					{#if submitError}
						<p class="writer-page__feedback writer-page__feedback--error">{submitError}</p>
					{/if}

					{#if submitMessage}
						<p class="writer-page__feedback writer-page__feedback--success">{submitMessage}</p>
					{/if}

					<div class="writer-form__actions">
						<button
							type="submit"
							class="btn variant-filled-primary"
							disabled={isSubmitting || !writerAccess}
						>
							{isSubmitting ? 'Saving...' : 'Save Isotope'}
						</button>
					</div>
				</form>

				<div class="writer-upload">
					<div class="writer-upload__header">
						<div>
							<h3>Upload isotope rows</h3>
							<p>
								Accepted format: <code>Cd-115B D 2.2280 527.9</code>. The trailing letter is
								treated as a variant marker and only contributes another energy for the same isotope.
							</p>
						</div>
					</div>

					<label class="writer-upload__picker">
						<span>Select a text file</span>
						<input type="file" accept=".txt,.dat,.csv" bind:files={uploadFiles} onchange={handleUploadChange} />
					</label>

					<div class="writer-page__helper">
						<p>The full element name is inferred from the symbol in each row.</p>
						<p>Variant letters like <code>A</code> or <code>B</code> are ignored for isotope identity and grouped into one record.</p>
						<p>Rows for the same isotope must agree on half-life value and unit.</p>
					</div>

					{#if uploadParseError}
						<p class="writer-page__feedback writer-page__feedback--error">{uploadParseError}</p>
					{/if}

					{#if uploadResult}
						<div class="writer-upload__summary">
							<p><strong>File:</strong> {uploadFileName}</p>
							<p><strong>Parsed rows:</strong> {uploadResult.sourceLineCount}</p>
							<p><strong>Grouped isotopes:</strong> {uploadResult.items.length}</p>
							{#if uploadResult.ignoredVariantCount > 0}
								<p>
									<strong>Ignored variant letters:</strong> {uploadResult.ignoredVariantCount}
								</p>
							{/if}
						</div>

						<div class="writer-upload__table-wrap">
							<table class="writer-upload__table">
								<thead>
									<tr>
										<th>Isotope</th>
										<th>Element</th>
										<th>Half-life</th>
										<th>Energies</th>
										<th>Lines</th>
									</tr>
								</thead>
								<tbody>
									{#each uploadResult.items as item (`${item.shortName}-${item.massNumber}-${item.suffix}`)}
										<tr>
											<td>{item.shortName}-{item.massNumber}{item.suffix}</td>
											<td>{item.elementName}</td>
											<td>{item.halfLife.number} {item.halfLife.unit}</td>
											<td>{item.energies.join(', ')}</td>
											<td>{item.lineNumbers.join(', ')}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>

						{#if uploadError}
							<p class="writer-page__feedback writer-page__feedback--error">{uploadError}</p>
						{/if}

						{#if uploadMessage}
							<p class="writer-page__feedback writer-page__feedback--success">{uploadMessage}</p>
						{/if}

						<div class="writer-form__actions">
							<button
								type="button"
								class="btn variant-filled-primary"
								disabled={isUploading || isSubmitting || !writerAccess}
								onclick={() => {
									void submitUploadedIsotopes(writerAccess);
								}}
							>
								{isUploading ? 'Saving Upload...' : 'Save Uploaded Isotopes'}
							</button>
						</div>
					{/if}
				</div>
			</div>
		{/snippet}
	</AuthGate>
</section>

<style>
	.writer-page {
		--writer-text: rgb(15 23 42);
		--writer-muted: rgb(51 65 85);
		--writer-accent: rgb(71 85 105);
		--writer-card-bg: rgb(255 252 245 / 0.96);
		--writer-card-border: rgb(15 23 42 / 0.08);
		--writer-card-shadow: 0 28px 60px rgb(15 23 42 / 0.12);
		--writer-warning-border: rgb(245 158 11 / 0.28);
		--writer-identity-bg: rgb(15 23 42 / 0.05);
		--writer-helper-bg: #fff7e7;
		--writer-helper-border: rgb(245 158 11 / 0.18);
		--writer-error-bg: rgb(254 242 242);
		--writer-error-text: rgb(153 27 27);
		--writer-error-border: rgb(248 113 113 / 0.28);
		--writer-success-bg: rgb(240 253 244);
		--writer-success-text: rgb(22 101 52);
		--writer-success-border: rgb(74 222 128 / 0.25);
		--writer-notice-text: rgb(180 83 9);
		--writer-code-bg: rgb(15 23 42 / 0.08);
		--writer-code-text: inherit;
		padding: 3rem 5% 0;
		display: grid;
		gap: 1.5rem;
		overflow-x: auto;
	}

	.writer-page__hero {
		color: var(--writer-text);
		max-width: 42rem;
	}

	.writer-page__eyebrow {
		margin: 0 0 0.5rem;
		font-size: 0.95rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--writer-accent);
	}

	.writer-page__title {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: clamp(2.2rem, 5vw, 3.75rem);
		line-height: 0.95;
	}

	.writer-page__title-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.1em;
		height: 1.1em;
		color: var(--writer-accent);
	}

	.writer-page__title-icon svg {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}

	.writer-page__summary {
		margin: 1rem 0 0;
		font-size: 1rem;
		color: var(--writer-muted);
	}

	.writer-card {
		background: var(--writer-card-bg);
		border: 1px solid var(--writer-card-border);
		border-radius: 1.5rem;
		padding: 1.5rem;
		box-shadow: var(--writer-card-shadow);
		inline-size: max-content;
		min-inline-size: min(100%, 52rem);
		color: var(--writer-text);
	}

	.writer-card__header {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: start;
		margin-bottom: 1.25rem;
	}

	.writer-card__header > :first-child {
		flex: 1 1 auto;
	}

	.writer-card__header h2 {
		margin: 0;
	}

	.writer-card__header p {
		margin: 0.5rem 0 0;
	}

	.writer-card__identity {
		display: grid;
		gap: 0.25rem;
		padding: 0.9rem 1rem;
		border-radius: 1rem;
		background: var(--writer-identity-bg);
		font-size: 0.9rem;
	}

	.writer-form {
		display: grid;
		gap: 1rem;
	}

	.writer-page__helper {
		padding: 1rem 1.1rem;
		border-radius: 1rem;
		background: var(--writer-helper-bg);
		border: 1px solid var(--writer-helper-border);
		font-size: 0.95rem;
	}

	.writer-page__helper p {
		margin: 0;
	}

	.writer-page__helper p + p {
		margin-top: 0.4rem;
	}

	.writer-page__feedback {
		margin: 0;
		padding: 0.9rem 1rem;
		border-radius: 1rem;
		font-size: 0.95rem;
	}

	.writer-page__feedback--error {
		background: var(--writer-error-bg);
		color: var(--writer-error-text);
		border: 1px solid var(--writer-error-border);
	}

	.writer-page__feedback--success {
		background: var(--writer-success-bg);
		color: var(--writer-success-text);
		border: 1px solid var(--writer-success-border);
	}

	.writer-page__feedback--warning {
		background: var(--writer-helper-bg);
		color: var(--writer-text);
		border: 1px solid var(--writer-helper-border);
	}

	.writer-form__actions {
		display: flex;
		justify-content: flex-start;
	}

	.writer-upload {
		margin-top: 2rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--writer-card-border);
		display: grid;
		gap: 1rem;
	}

	.writer-upload__header h3,
	.writer-upload__header p,
	.writer-upload__summary p {
		margin: 0;
	}

	.writer-upload__header p,
	.writer-upload__summary {
		margin-top: 0.4rem;
	}

	.writer-upload__picker {
		display: grid;
		gap: 0.5rem;
		font-weight: 600;
	}

	.writer-upload__picker input {
		font-weight: 400;
	}

	.writer-upload__summary {
		display: grid;
		gap: 0.35rem;
		padding: 1rem 1.1rem;
		border-radius: 1rem;
		background: rgb(15 23 42 / 0.04);
	}

	.writer-upload__table-wrap {
		overflow-x: auto;
	}

	.writer-upload__table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.95rem;
	}

	.writer-upload__table th,
	.writer-upload__table td {
		padding: 0.75rem;
		border-bottom: 1px solid var(--writer-card-border);
		text-align: left;
		vertical-align: top;
	}

	.writer-upload__table th {
		font-size: 0.82rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--writer-accent);
	}

	code {
		padding: 0.1rem 0.35rem;
		border-radius: 0.4rem;
		background: var(--writer-code-bg);
		color: var(--writer-code-text);
		font-size: 0.92em;
	}

	@media (prefers-color-scheme: dark) {
		.writer-page {
			--writer-text: rgb(226 232 240);
			--writer-muted: rgb(203 213 225);
			--writer-accent: rgb(148 163 184);
			--writer-card-bg: rgb(15 23 42 / 0.82);
			--writer-card-border: rgb(148 163 184 / 0.18);
			--writer-card-shadow: 0 20px 48px rgb(0 0 0 / 0.28);
			--writer-warning-border: rgb(245 158 11 / 0.34);
			--writer-identity-bg: rgb(255 255 255 / 0.06);
			--writer-helper-bg: rgb(120 53 15 / 0.22);
			--writer-helper-border: rgb(245 158 11 / 0.3);
			--writer-error-bg: rgb(69 10 10 / 0.45);
			--writer-error-text: rgb(254 202 202);
			--writer-error-border: rgb(248 113 113 / 0.3);
			--writer-success-bg: rgb(20 83 45 / 0.4);
			--writer-success-text: rgb(187 247 208);
			--writer-success-border: rgb(74 222 128 / 0.28);
			--writer-notice-text: rgb(253 230 138);
			--writer-code-bg: rgb(255 255 255 / 0.08);
			--writer-code-text: rgb(241 245 249);
		}

		.writer-upload__summary {
			background: rgb(255 255 255 / 0.05);
		}
	}

	@media (max-width: 640px) {
		.writer-page {
			padding: 2rem 1rem 0;
		}

		.writer-card {
			padding: 1.1rem;
			min-inline-size: 0;
		}

		.writer-card__header {
			flex-direction: column;
		}
	}
</style>