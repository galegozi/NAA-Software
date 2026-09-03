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

	// Fission factor on cerium: f = 0.08 ± 0.008, parent U-235.
	await expect(page.getByText('Possible fission interference').first()).toBeVisible();
	await page.locator('select').filter({ hasText: 'U-235' }).first().selectOption('U-235');
	await page.getByLabel('Correction factor').fill('0.08');
	await page.getByLabel('Uncertainty', { exact: true }).fill('0.008');
	await page.getByRole('button', { name: 'Apply factor' }).click();
	await expect(page.getByText('(custom)').first()).toBeVisible();

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
		page.getByText(/only applied when a uranium isotope is part of the analysis/).first()
	).toBeVisible();
	await expect(page.getByLabel('Correction factor')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Apply factor' })).toHaveCount(0);

	// The note can be dismissed ("no uranium in the sample") and undone.
	await page.getByRole('button', { name: 'No uranium — dismiss' }).first().click();
	await expect(page.getByText(/Dismissed — no uranium in the sample/)).toBeVisible();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(
		page.getByText(/only applied when a uranium isotope is part of the analysis/).first()
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
