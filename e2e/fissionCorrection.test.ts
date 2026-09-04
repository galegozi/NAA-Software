import { expect, test } from '@playwright/test';

/**
 * End-to-end: a full Ce-141 / U analysis with a hand-entered fission factor.
 * Verifies the correction is applied on the Review step and the worked
 * breakdown renders. Timings match between the two materials so every physics
 * ratio is 1; k is then just the net-count ratio:
 *   k(Ce) = 1250/1000 = 1.25,  k(U) = 4800/800 = 6  →  C_U^U = 6·5 = 30 ppm
 *   corrected(Ce) = 1.25·(4 + 0.08·5) − 0.08·30 = 5.5 − 2.4 = 3.1 ppm
 *   uncorrected(Ce) = 1.25·4 = 5.0 ppm
 */
test('fission-interference correction is applied and shown on Review', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (e) => pageErrors.push(e.message));

	await page.goto('/');
	await page.getByRole('button', { name: 'Get Started' }).click();

	// --- Step 1: two isotopes -------------------------------------------------
	await page.getByRole('button', { name: 'Add custom isotope' }).click();
	await page.getByLabel('Element Name').nth(0).fill('Cerium');
	await page.getByLabel('Isotope', { exact: true }).nth(0).fill('Ce-141');
	await page.getByLabel('Energy (in KeV)').nth(0).fill('145');
	await page.getByLabel('Half Life', { exact: true }).nth(0).fill('3000');

	await page.getByRole('button', { name: 'Add custom isotope' }).click();
	await page.getByLabel('Element Name').nth(1).fill('Uranium');
	await page.getByLabel('Isotope', { exact: true }).nth(1).fill('U-239');
	await page.getByLabel('Energy (in KeV)').nth(1).fill('74');
	await page.getByLabel('Half Life', { exact: true }).nth(1).fill('1500');

	// Fission factor on cerium: f = 0.08 ± 0.008, parent U-235. Ce-141 isn't
	// lanthanum, so it's labelled the standard (flat-factor) correction.
	await expect(page.getByText('Possible fission interference').first()).toBeVisible();
	await expect(page.getByText('Standard correction — flat factor').first()).toBeVisible();
	await page.locator('select').filter({ hasText: 'U-235' }).first().selectOption('U-235');
	await page.getByLabel('Correction factor').fill('0.08');
	await page.getByLabel('Uncertainty', { exact: true }).fill('0.008');
	await page.getByRole('button', { name: 'Apply factor' }).click();
	await expect(page.getByText('(custom)').first()).toBeVisible();

	// Reviewed — the warning settles to a compact row (auto-dismissed).
	await expect(page.getByText('Possible fission interference')).toHaveCount(0);

	await page
		.getByRole('button', { name: /^Next:/ })
		.first()
		.click();

	// --- Step 2: one reference material -------------------------------------
	await page.getByRole('button', { name: '+ Add custom reference material' }).click();
	await fillMaterial(page, { netl: 'REF-A', sample: 'Standard A' });
	// Counts: Ce ref net = 1000, U ref net = 800
	await setCounts(page, 0, 1000);
	await setCounts(page, 1, 800);
	// Known concentrations: Ce 4 ppm, U 5 ppm
	await page.getByLabel('Known Concentration').nth(0).fill('4');
	await page.getByLabel('Known Concentration').nth(1).fill('5');
	for (const select of await page.getByLabel('Reference Material Concentration Units').all()) {
		await select.selectOption('ppm');
	}
	await page
		.getByRole('button', { name: /^Next:/ })
		.first()
		.click();

	// --- Step 3: one unknown ---------------------------------------------------
	await page.getByRole('button', { name: 'Add unknown material' }).click();
	await fillMaterial(page, { netl: 'UNK-1', sample: 'Unknown 1' });
	// Ce unknown net = 1250 (k = 1.25); U unknown net = 4800 (k = 6, C_U^U = 6·5 = 30)
	await setCounts(page, 0, 1250);
	await setCounts(page, 1, 4800);
	await page
		.getByRole('button', { name: /^Next:/ })
		.first()
		.click();

	// --- Step 4: Review ------------------------------------------------------
	await expect(page.getByRole('heading', { name: 'Step 4: Review' })).toBeVisible();
	await expect(
		page.getByText('Fission-interference corrections applied to 1 result')
	).toBeVisible();
	await expect(
		page.getByRole('heading', { name: 'Fission interference corrections' })
	).toBeVisible();

	const breakdown = page.locator('table', {
		has: page.getByRole('columnheader', { name: 'Corrected' })
	});
	const breakdownRow = breakdown.getByRole('row').filter({ hasText: 'Cerium' });
	await expect(breakdownRow).toContainText('30'); // C_fissile^U
	await expect(breakdownRow).toContainText('3.1'); // corrected
	await expect(breakdownRow).toContainText('±'); // corrected uncertainty rendered

	// Main table cell shows the corrected value with the † marker and a ± uncertainty.
	await expect(page.getByRole('cell', { name: /^3\.1† ± / })).toBeVisible();

	// Uncorrected value still available in the collapsed table.
	await expect(page.getByText('Uncorrected concentrations')).toBeVisible();

	expect(pageErrors).toEqual([]);
});

/**
 * Uranium is NOT analysed: no fission correction is offered or applied. Step 1
 * shows an informational note (with no factor controls), and the Review step
 * reports the plain comparative-NAA result with no correction.
 *   k(Ce) = 1250/1000 = 1.25,  uncorrected(Ce) = 1.25·4 = 5.0 ppm
 */
test('no fission correction is offered until uranium is analysed', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (e) => pageErrors.push(e.message));

	await page.goto('/');
	await page.getByRole('button', { name: 'Get Started' }).click();

	await page.getByRole('button', { name: 'Add custom isotope' }).click();
	await page.getByLabel('Element Name').fill('Cerium');
	await page.getByLabel('Isotope', { exact: true }).fill('Ce-141');
	await page.getByLabel('Energy (in KeV)').fill('145');
	await page.getByLabel('Half Life', { exact: true }).fill('3000');

	// Informational note only — no factor / parent / "apply" controls.
	await expect(page.getByText('Possible fission interference').first()).toBeVisible();
	await expect(
		page.getByText('only applied when a uranium isotope is part of the analysis').first()
	).toBeVisible();
	await expect(page.getByLabel('Correction factor')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Apply factor' })).toHaveCount(0);

	// Dismissing settles the panel to a compact, non-warning "reviewed" row —
	// the warning auto-dismisses once the isotope has been reviewed.
	await page.getByRole('button', { name: 'No uranium — dismiss' }).first().click();
	await expect(page.getByText('No fission interference (0)').first()).toBeVisible();
	await expect(page.getByText(/Possible fission interference/)).toHaveCount(0);

	// "Change" reopens it for editing.
	await page.getByRole('button', { name: 'Change' }).click();
	await expect(
		page.getByText('only applied when a uranium isotope is part of the analysis').first()
	).toBeVisible();
	await page.getByRole('button', { name: 'No uranium — dismiss' }).first().click();

	await page
		.getByRole('button', { name: /^Next:/ })
		.first()
		.click();

	await page.getByRole('button', { name: '+ Add custom reference material' }).click();
	await fillMaterial(page, { netl: 'REF-A', sample: 'Standard A' });
	await setCounts(page, 0, 1000);
	await page.getByLabel('Known Concentration').fill('4');
	await page.getByLabel('Reference Material Concentration Units').selectOption('ppm');
	await page
		.getByRole('button', { name: /^Next:/ })
		.first()
		.click();

	await page.getByRole('button', { name: 'Add unknown material' }).click();
	await fillMaterial(page, { netl: 'UNK-1', sample: 'Unknown 1' });
	await setCounts(page, 0, 1250);
	await page
		.getByRole('button', { name: /^Next:/ })
		.first()
		.click();

	// Review: no correction, no hand-entry prompt, plain result shown.
	await expect(page.getByRole('heading', { name: 'Step 4: Review' })).toBeVisible();
	await expect(page.getByText(/Fission-interference corrections applied/)).toHaveCount(0);
	await expect(page.getByText(/concentration needed/i)).toHaveCount(0);
	await expect(
		page.getByRole('cell', { name: /^5(\.0+)? ± /, exact: false }).first()
	).toBeVisible();

	expect(pageErrors).toEqual([]);
});

/**
 * La-140 needs the Ba-140 → La-140 in-growth: the Review step blocks the
 * correction (red error) until the Ba-140 half-life is supplied, then applies it.
 */
test('La-140 correction is blocked until the Ba-140 half-life is given', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (e) => pageErrors.push(e.message));

	await page.goto('/');
	await page.getByRole('button', { name: 'Get Started' }).click();

	// La-140 (idx 0) + Uranium (idx 1).
	await page.getByRole('button', { name: 'Add custom isotope' }).click();
	await page.getByLabel('Element Name').nth(0).fill('Lanthanum');
	await page.getByLabel('Isotope', { exact: true }).nth(0).fill('La-140');
	await page.getByLabel('Energy (in KeV)').nth(0).fill('1596');
	await page.getByLabel('Half Life', { exact: true }).nth(0).fill('1.678');
	await page.getByLabel('Half Life Unit').nth(0).selectOption('days');

	await page.getByRole('button', { name: 'Add custom isotope' }).click();
	await page.getByLabel('Element Name').nth(1).fill('Uranium');
	await page.getByLabel('Isotope', { exact: true }).nth(1).fill('U-239');
	await page.getByLabel('Energy (in KeV)').nth(1).fill('74');
	await page.getByLabel('Half Life', { exact: true }).nth(1).fill('1500');

	// La-140 is the "special" correction — labelled as such, distinct from a
	// flat factor, and (with no Ba-140 isotope or catalog entry) not yet resolved.
	await expect(page.getByText('Special correction — Ba-140 in-growth').first()).toBeVisible();
	await expect(page.getByText(/Not found in your isotopes or the catalog/).first()).toBeVisible();

	// La-140 fission factor: the flat constant A = 0.00233.
	await page.locator('select').filter({ hasText: 'U-235' }).first().selectOption('U-235');
	await page.getByLabel('Correction factor').fill('0.00233');
	await page.getByRole('button', { name: 'Apply factor' }).click();

	await page
		.getByRole('button', { name: /^Next:/ })
		.first()
		.click();

	// Standard.
	await page.getByRole('button', { name: '+ Add custom reference material' }).click();
	await fillMaterial(page, { netl: 'REF-A', sample: 'Standard A' });
	await setCounts(page, 0, 1000);
	await setCounts(page, 1, 800);
	await page.getByLabel('Known Concentration').nth(0).fill('4');
	await page.getByLabel('Known Concentration').nth(1).fill('5');
	for (const select of await page.getByLabel('Reference Material Concentration Units').all()) {
		await select.selectOption('ppm');
	}
	await page
		.getByRole('button', { name: /^Next:/ })
		.first()
		.click();

	// Unknown.
	await page.getByRole('button', { name: 'Add unknown material' }).click();
	await fillMaterial(page, { netl: 'UNK-1', sample: 'Unknown 1' });
	await setCounts(page, 0, 1250);
	await setCounts(page, 1, 4800);
	await page
		.getByRole('button', { name: /^Next:/ })
		.first()
		.click();

	// Review: blocked on the Ba-140 half-life.
	await expect(page.getByRole('heading', { name: 'Step 4: Review' })).toBeVisible();
	await expect(page.getByText(/Ba-140 half-life required/i)).toBeVisible();
	await expect(page.getByText(/Fission-interference corrections applied/)).toHaveCount(0);

	// Supply it — the correction is then applied.
	await page.getByLabel('Ba-140 half-life').fill('12.75');
	await expect(page.getByText(/Ba-140 half-life required/i)).toHaveCount(0);
	await expect(
		page.getByText('Fission-interference corrections applied to 1 result')
	).toBeVisible();

	expect(pageErrors).toEqual([]);
});

/**
 * The Ba-140 half-life pre-fills automatically once Ba-140 is one of the
 * analysed isotopes — no manual entry needed, and no Review-step block.
 */
test('Ba-140 half-life pre-fills from an analysed Ba-140 isotope', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (e) => pageErrors.push(e.message));

	await page.goto('/');
	await page.getByRole('button', { name: 'Get Started' }).click();

	await page.getByRole('button', { name: 'Add custom isotope' }).click();
	await page.getByLabel('Element Name').nth(0).fill('Lanthanum');
	await page.getByLabel('Isotope', { exact: true }).nth(0).fill('La-140');
	await page.getByLabel('Energy (in KeV)').nth(0).fill('1596');
	await page.getByLabel('Half Life', { exact: true }).nth(0).fill('1.678');
	await page.getByLabel('Half Life Unit').nth(0).selectOption('days');

	await page.getByRole('button', { name: 'Add custom isotope' }).click();
	await page.getByLabel('Element Name').nth(1).fill('Uranium');
	await page.getByLabel('Isotope', { exact: true }).nth(1).fill('U-239');
	await page.getByLabel('Energy (in KeV)').nth(1).fill('74');
	await page.getByLabel('Half Life', { exact: true }).nth(1).fill('1500');

	await page.locator('select').filter({ hasText: 'U-235' }).first().selectOption('U-235');
	await page.getByLabel('Correction factor').fill('0.00233');
	await page.getByRole('button', { name: 'Apply factor' }).click();

	// Reviewed — reopen it to see the Ba-140 half-life field.
	await page.getByRole('button', { name: 'Change' }).click();

	// Not yet resolved — no Ba-140 isotope or catalog entry.
	await expect(page.getByText(/Not found in your isotopes or the catalog/).first()).toBeVisible();
	await expect(page.getByLabel('Half-life')).toHaveValue('');

	// Add Ba-140 with its real half-life — the field pre-fills automatically.
	await page.getByRole('button', { name: 'Add custom isotope' }).click();
	await page.getByLabel('Element Name').nth(2).fill('Barium');
	await page.getByLabel('Isotope', { exact: true }).nth(2).fill('Ba-140');
	await page.getByLabel('Energy (in KeV)').nth(2).fill('537');
	await page.getByLabel('Half Life', { exact: true }).nth(2).fill('12.75');
	await page.getByLabel('Half Life Unit').nth(2).selectOption('days');

	await expect(page.getByLabel('Half-life')).toHaveValue('12.75');
	// String matching (not regex) — Playwright normalizes whitespace across the
	// line-wraps in the source template; a regex would not.
	await expect(page.getByText('Pre-filled below with 12.75 days').first()).toBeVisible();
	await expect(page.getByText('from your Ba-140 isotope').first()).toBeVisible();
	await expect(page.getByText(/Not found in your isotopes or the catalog/)).toHaveCount(0);

	// No manual entry needed downstream: the Review step never blocks.
	await page
		.getByRole('button', { name: /^Next:/ })
		.first()
		.click();
	await page.getByRole('button', { name: '+ Add custom reference material' }).click();
	await fillMaterial(page, { netl: 'REF-A', sample: 'Standard A' });
	await setCounts(page, 0, 1000);
	await setCounts(page, 1, 800);
	await setCounts(page, 2, 500);
	await page.getByLabel('Known Concentration').nth(0).fill('4');
	await page.getByLabel('Known Concentration').nth(1).fill('5');
	await page.getByLabel('Known Concentration').nth(2).fill('1');
	for (const select of await page.getByLabel('Reference Material Concentration Units').all()) {
		await select.selectOption('ppm');
	}
	await page
		.getByRole('button', { name: /^Next:/ })
		.first()
		.click();

	await page.getByRole('button', { name: 'Add unknown material' }).click();
	await fillMaterial(page, { netl: 'UNK-1', sample: 'Unknown 1' });
	await setCounts(page, 0, 1250);
	await setCounts(page, 1, 4800);
	await setCounts(page, 2, 600);
	await page
		.getByRole('button', { name: /^Next:/ })
		.first()
		.click();

	await expect(page.getByRole('heading', { name: 'Step 4: Review' })).toBeVisible();
	await expect(page.getByText(/Ba-140 half-life required/i)).toHaveCount(0);
	await expect(
		page.getByText('Fission-interference corrections applied to 1 result')
	).toBeVisible();

	expect(pageErrors).toEqual([]);
});

async function fillMaterial(
	page: import('@playwright/test').Page,
	{ netl, sample }: { netl: string; sample: string }
) {
	await page.getByLabel('NETL Code').last().fill(netl);
	await page.getByLabel('Sample Name').last().fill(sample);
	await page.getByLabel('Mass (in grams, g)').last().fill('1');
	await page.getByLabel('Reactor Power (kW)').last().fill('1');
	await page.getByLabel('Irradiation time (in seconds, s)').last().fill('3600');
	await page.getByLabel('Decay Time (in seconds, s)').last().fill('600');
	await page.getByLabel('Live Time (in seconds, s)').last().fill('300');
	await page.getByLabel('Real Time (in seconds, s)').last().fill('300');
	await page.getByLabel('Fluence (in neutrons/cm²)').last().fill('1e13');
}

async function setCounts(page: import('@playwright/test').Page, isotopeIdx: number, net: number) {
	await page
		.getByLabel('Gross Counts', { exact: true })
		.nth(isotopeIdx)
		.fill(String(net + 100));
	await page.getByLabel('Net Counts', { exact: true }).nth(isotopeIdx).fill(String(net));
	await page.getByLabel('Uncertainty (in counts)', { exact: true }).nth(isotopeIdx).fill('10');
}
