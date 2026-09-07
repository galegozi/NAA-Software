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
	await page.getByRole('button', { name: '+ Add custom reference material' }).click();
	await fillMaterial(page, { netl: 'REF-La', sample: 'La standard' });
	await setCounts(page, 0, 1000);
	await page.getByLabel('Known Concentration').nth(0).fill('4');
	await page.getByLabel('Reference Material Concentration Units').nth(0).selectOption('ppm');

	await page.getByRole('button', { name: '+ Add custom reference material' }).click();
	await fillMaterial(page, { netl: 'REF-Ce', sample: 'Ce standard' });
	await setCounts(page, 1, 1000);
	await page.getByLabel('Known Concentration').nth(1).fill('4');
	await page.getByLabel('Reference Material Concentration Units').nth(1).selectOption('ppm');

	const laBox = page.getByText(
		'Uranium concentration — needed for the Lanthanum fission correction'
	);
	const ceBox = page.getByText('Uranium concentration — needed for the Cerium fission correction');

	// Both isotopes are still covered by both reference materials, so each box
	// shows on both cards (not just one) and carries the "narrow the coverage"
	// note. String matching (not regex) so Playwright normalizes the template's
	// line-wraps.
	await expect(laBox).toHaveCount(2);
	await expect(ceBox).toHaveCount(2);
	await expect(
		page.getByText('More than one reference material covers this isotope').first()
	).toBeVisible();

	// Set each reference material's coverage to its one isotope.
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
