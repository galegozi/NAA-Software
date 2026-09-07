import { expect, test } from '@playwright/test';

/**
 * Two separate reference materials, each covering a different fission
 * candidate isotope (La-140 and Ce-141), with neither uranium analysed. Both
 * reference materials get their own "Uranium concentration" box — this
 * regression-tests the earlier bug where only one of them showed it — and
 * while the isotope→reference assignment is still ambiguous (more than one
 * reference covers a given isotope) each box carries a note pointing at the
 * "Isotope assignment" panel. Resolving the assignment there clears the note.
 */
test('each reference material gets its own uranium box, with an ambiguity note until assigned', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (e) => pageErrors.push(e.message));

	await page.goto('/');
	await page.getByRole('button', { name: 'Get Started' }).click();

	// La-140 (idx 0) + Ce-141 (idx 1) — both known fission products, uranium
	// not analysed. Use the standard (flat-factor) correction for both so
	// neither needs a Ba-140 half-life.
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

	const lanthanumPanel = page.locator('#fission-correction-0');
	await lanthanumPanel.getByText('Standard — flat factor.').click();
	await lanthanumPanel.locator('select').filter({ hasText: 'U-235' }).selectOption('U-235');
	await lanthanumPanel.getByLabel('Correction factor').fill('0.00233');
	await lanthanumPanel.getByRole('button', { name: 'Apply factor' }).click();

	const ceriumPanel = page.locator('#fission-correction-1');
	await ceriumPanel.locator('select').filter({ hasText: 'U-235' }).selectOption('U-235');
	await ceriumPanel.getByLabel('Correction factor').fill('0.08');
	await ceriumPanel.getByRole('button', { name: 'Apply factor' }).click();

	await page
		.getByRole('button', { name: /^Next:/ })
		.first()
		.click();

	// --- Step 2: two reference materials, neither isotope assigned yet -------
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

	// Both reference materials show their own uranium box — the original bug
	// report was that only one of the two did. String matching (not regex) —
	// Playwright normalizes whitespace across the template's line-wraps; a
	// regex would not.
	await expect(
		page.getByText('Uranium concentration — needed for the Lanthanum fission correction')
	).toBeVisible();
	await expect(
		page.getByText('Uranium concentration — needed for the Cerium fission correction')
	).toBeVisible();

	// Neither reference material's isotope coverage is explicit yet, so each
	// isotope is still covered by both — the ambiguity note points at the
	// "Isotope assignment" panel to resolve it.
	await expect(page.getByText("this isotope isn't uniquely assigned").first()).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Isotope assignment' })).toBeVisible();

	// Checking the isotope each material actually covers resolves the
	// assignment — the other checkbox becomes disabled (already claimed
	// elsewhere), and the ambiguity note goes away.
	await page.getByRole('checkbox', { name: 'Lanthanum' }).first().check();
	await page.getByRole('checkbox', { name: 'Cerium' }).nth(1).check();
	await expect(page.getByText("this isotope isn't uniquely assigned")).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Isotope assignment' })).toHaveCount(0);

	// Both boxes are still there, still independently addressable.
	await expect(
		page.getByText('Uranium concentration — needed for the Lanthanum fission correction')
	).toBeVisible();
	await expect(
		page.getByText('Uranium concentration — needed for the Cerium fission correction')
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
