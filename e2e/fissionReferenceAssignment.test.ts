import { expect, test } from '@playwright/test';

/**
 * Two separate reference materials, one meant for La-140 and one for Ce-141,
 * with uranium not analysed. Regression test for the report that only one of
 * the two reference materials showed its "Uranium concentration" box:
 *
 *  - while both reference materials still cover both isotopes, each isotope's
 *    box shows on *both* cards (with a note to narrow the coverage), and
 *  - once each reference material's coverage is set to its one isotope, that
 *    isotope's box shows on exactly that card.
 */
test('every reference material covering a fission isotope shows its uranium box', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (e) => pageErrors.push(e.message));

	await page.goto('/');
	await page.getByRole('button', { name: 'Get Started' }).click();

	// La-140 (idx 0) + Ce-141 (idx 1) — both known fission products, uranium
	// not analysed. Standard (flat-factor) correction for both.
	await page.getByRole('button', { name: 'Add custom isotope' }).click();
	await page.getByLabel('Element Name').nth(0).fill('Lanthanum');
	await page.getByLabel('Isotope', { exact: true }).nth(0).fill('La-140');
	await page.getByLabel('Energy (in KeV)').nth(0).fill('1596');
	await page.getByLabel('Half Life', { exact: true }).nth(0).fill('1.678');
	await page.getByLabel('Half Life Unit').nth(0).selectOption('days');

	await page.getByRole('button', { name: 'Add custom isotope' }).click();
	await page.getByLabel('Element Name').nth(1).fill('Cerium');
	await page.getByLabel('Isotope', { exact: true }).nth(1).fill('Ce-141');
	await page.getByLabel('Energy (in KeV)').nth(1).fill('145');
	await page.getByLabel('Half Life', { exact: true }).nth(1).fill('3000');

	const laPanel = page.locator('#fission-correction-0');
	await laPanel.getByText('Standard — flat factor.').click();
	await laPanel.locator('select').filter({ hasText: 'U-235' }).selectOption('U-235');
	await laPanel.getByLabel('Correction factor').fill('0.00233');
	await laPanel.getByRole('button', { name: 'Apply factor' }).click();

	const cePanel = page.locator('#fission-correction-1');
	await cePanel.locator('select').filter({ hasText: 'U-235' }).selectOption('U-235');
	await cePanel.getByLabel('Correction factor').fill('0.08');
	await cePanel.getByRole('button', { name: 'Apply factor' }).click();

	await page
		.getByRole('button', { name: /^Next:/ })
		.first()
		.click();

	// --- Step 2: two reference materials, coverage not set yet --------------
	// REF-La is counted for lanthanum only, REF-Ce for cerium only (each card
	// filled fully before the next is added so the nth() locators stay simple).
	await page.getByRole('button', { name: '+ Add custom reference material' }).click();
	await fillMaterial(page, { netl: 'REF-La', sample: 'La standard' });
	await setCounts(page, 0, 1000);
	await page.getByLabel('Known Concentration').nth(0).fill('4');
	await page.getByLabel('Reference Material Concentration Units').nth(0).selectOption('ppm');

	await page.getByRole('button', { name: '+ Add custom reference material' }).click();
	await fillMaterial(page, { netl: 'REF-Ce', sample: 'Ce standard' });
	// REF-Ce is the second card: its Cerium counting is the 4th count block.
	await setCounts(page, 3, 1000);
	await page.getByLabel('Known Concentration').nth(3).fill('4');
	await page.getByLabel('Reference Material Concentration Units').nth(3).selectOption('ppm');

	const laBox = page.getByText(
		'Uranium concentration — needed for the Lanthanum fission correction'
	);
	const ceBox = page.getByText('Uranium concentration — needed for the Cerium fission correction');

	// Neither reference material's coverage is set, so both still own both
	// isotopes — each box shows on both cards (not just one) with the "narrow
	// the coverage" note. String matching (not regex) so Playwright normalizes
	// the template's line-wraps.
	await expect(laBox).toHaveCount(2);
	await expect(ceBox).toHaveCount(2);
	await expect(
		page.getByText('More than one reference material covers this isotope').first()
	).toBeVisible();

	// Point each reference material at its one isotope by ticking its coverage.
	await page.getByRole('checkbox', { name: 'Lanthanum' }).first().check();
	await page.getByRole('checkbox', { name: 'Cerium' }).nth(1).check();

	// Now each box shows exactly once, on the right card, and the note is gone.
	await expect(laBox).toHaveCount(1);
	await expect(ceBox).toHaveCount(1);
	await expect(page.getByText('More than one reference material covers this isotope')).toHaveCount(
		0
	);
	await expect(refCard(page, 'REF-La')).toContainText(
		'Uranium concentration — needed for the Lanthanum fission correction'
	);
	await expect(refCard(page, 'REF-Ce')).toContainText(
		'Uranium concentration — needed for the Cerium fission correction'
	);

	expect(pageErrors).toEqual([]);
});

/**
 * La-140 on the special correction with NOTHING typed in its panel: the special
 * correction is itself the factor (constant 0.00233), so lanthanum is a fission
 * target straight away — its uranium box appears on the La reference and the
 * unknown, and the correction applies on Review alongside cerium's.
 */
test('special La-140 needs no factor and still gets its uranium fields', async ({ page }) => {
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
	await page.getByLabel('Element Name').nth(1).fill('Cerium');
	await page.getByLabel('Isotope', { exact: true }).nth(1).fill('Ce-141');
	await page.getByLabel('Energy (in KeV)').nth(1).fill('145');
	await page.getByLabel('Half Life', { exact: true }).nth(1).fill('3000');

	// La: only the Ba-140 half-life — no factor field exists in special mode.
	const laPanel = page.locator('#fission-correction-0');
	await expect(laPanel.getByLabel('Correction factor')).toHaveCount(0);
	await laPanel.getByLabel('Half-life', { exact: true }).fill('12.75');
	await expect(laPanel.getByRole('button', { name: 'Change' })).toBeVisible();

	const cePanel = page.locator('#fission-correction-1');
	await cePanel.locator('select').filter({ hasText: 'U-235' }).selectOption('U-235');
	await cePanel.getByLabel('Correction factor').fill('0.08');
	await cePanel.getByRole('button', { name: 'Apply factor' }).click();

	await page
		.getByRole('button', { name: /^Next:/ })
		.first()
		.click();

	await page.getByRole('button', { name: '+ Add custom reference material' }).click();
	await fillMaterial(page, { netl: 'REF-La', sample: 'La standard' });
	await setCounts(page, 0, 1000);
	await page.getByLabel('Known Concentration').nth(0).fill('4');
	await page.getByLabel('Reference Material Concentration Units').nth(0).selectOption('ppm');

	await page.getByRole('button', { name: '+ Add custom reference material' }).click();
	await fillMaterial(page, { netl: 'REF-Ce', sample: 'Ce standard' });
	await setCounts(page, 3, 1000);
	await page.getByLabel('Known Concentration').nth(3).fill('4');
	await page.getByLabel('Reference Material Concentration Units').nth(3).selectOption('ppm');

	await page.getByRole('checkbox', { name: 'Lanthanum' }).first().check();
	await page.getByRole('checkbox', { name: 'Cerium' }).nth(1).check();

	await expect(refCard(page, 'REF-La')).toContainText(
		'Uranium concentration — needed for the Lanthanum fission correction'
	);
	await expect(refCard(page, 'REF-Ce')).toContainText(
		'Uranium concentration — needed for the Cerium fission correction'
	);
	// Type uranium once (for La) — Ce's field is pre-filled with it.
	await refCard(page, 'REF-La')
		.getByLabel(/Uranium in this reference material/)
		.fill('5');
	await expect(
		refCard(page, 'REF-Ce').getByLabel(/Uranium in this reference material/)
	).toHaveValue('5');
	await page
		.getByRole('button', { name: /^Next:/ })
		.first()
		.click();

	await page.getByRole('button', { name: 'Add unknown material' }).click();
	await fillMaterial(page, { netl: 'UNK-1', sample: 'Unknown 1' });
	await setCounts(page, 0, 1250);
	await setCounts(page, 1, 1250);
	await expect(
		page.getByText('Uranium concentration — needed for the Lanthanum fission correction')
	).toBeVisible();
	// Both La and Ce ask for the unknown's uranium; typing one pre-fills the other.
	const unknownUranium = page.getByLabel(/Uranium in this unknown/);
	await expect(unknownUranium).toHaveCount(2);
	await unknownUranium.first().fill('30');
	await expect(unknownUranium.nth(1)).toHaveValue('30');
	await page
		.getByRole('button', { name: /^Next:/ })
		.first()
		.click();

	await expect(page.getByRole('heading', { name: 'Step 4: Review' })).toBeVisible();
	await expect(
		page.getByText('Fission-interference corrections applied to 2 results')
	).toBeVisible();
	const breakdown = page.locator('table', {
		has: page.getByRole('columnheader', { name: 'Corrected' })
	});
	const laRow = breakdown.getByRole('row').filter({ hasText: 'Lanthanum' });
	await expect(laRow).toContainText('Special correction — Ba-140 in-growth');
	await expect(laRow).toContainText('30'); // C_U^U reached the La correction
	const ceRow = breakdown.getByRole('row').filter({ hasText: 'Cerium' });
	await expect(ceRow).toContainText('30'); // …and the pre-filled Ce one

	expect(pageErrors).toEqual([]);
});

function refCard(page: import('@playwright/test').Page, netl: string) {
	return page
		.locator('div.scroll-mt-24')
		.filter({ has: page.locator('strong').filter({ hasText: new RegExp(`^${netl}$`) }) })
		.last();
}

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
