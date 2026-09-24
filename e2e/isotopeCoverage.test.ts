import { expect, test } from '@playwright/test';

/**
 * An unknown material doesn't have to have counts for every analysed
 * isotope — unchecking one in "Measured isotopes" hides its counting fields,
 * the Review table shows "— not measured" for that cell instead of a
 * computed (garbage) result, and the other isotope on the same unknown is
 * unaffected.
 */
test('unknown material can skip an isotope it was not measured for', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (e) => pageErrors.push(e.message));

	await page.goto('/');
	await page.getByRole('button', { name: 'Get Started' }).click();

	// Two plain (non-fission) isotopes so this test is unaffected by the
	// fission-correction panel.
	await page.getByRole('button', { name: 'Add custom isotope' }).click();
	await page.getByLabel('Element Name').nth(0).fill('Cobalt');
	await page.getByLabel('Isotope', { exact: true }).nth(0).fill('Co-60');
	await page.getByLabel('Energy (in KeV)').nth(0).fill('1332');
	await page.getByLabel('Half Life', { exact: true }).nth(0).fill('1925');

	await page.getByRole('button', { name: 'Add custom isotope' }).click();
	await page.getByLabel('Element Name').nth(1).fill('Iron');
	await page.getByLabel('Isotope', { exact: true }).nth(1).fill('Fe-59');
	await page.getByLabel('Energy (in KeV)').nth(1).fill('1099');
	await page.getByLabel('Half Life', { exact: true }).nth(1).fill('44.5');

	await page
		.getByRole('button', { name: /^Next:/ })
		.first()
		.click();

	// Step 2: one reference material with both isotopes measured.
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

	// Step 3: the unknown was only counted for Cobalt. Checking it narrows the
	// "measured isotopes" set to just Cobalt (an empty set means "all"), which
	// hides Iron's counting fields.
	await page.getByRole('button', { name: 'Add unknown material' }).click();
	await page.getByRole('checkbox', { name: 'Cobalt' }).check();
	await expect(page.getByRole('heading', { name: 'Iron Counts' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Cobalt Counts' })).toBeVisible();
	await fillMaterial(page, { netl: 'UNK-1', sample: 'Unknown 1' });
	await setCounts(page, 0, 1250);
	await page
		.getByRole('button', { name: /^Next:/ })
		.first()
		.click();

	// Review: Cobalt has a real result, Iron reports "not measured" instead of
	// a computed value from an empty count.
	await expect(page.getByRole('heading', { name: 'Step 4: Review' })).toBeVisible();
	const row = page.getByRole('row').filter({ hasText: 'UNK-1' }).first();
	await expect(row).toContainText('not measured');

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
