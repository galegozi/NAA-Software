import { expect, test } from '@playwright/test';

/**
 * Selecting an isotope that is a known fission product raises the
 * "possible fission interference" prompt in Step 1, and the per-isotope control
 * records a choice (here: an explicit "no fission interference").
 */
test('fission-interference prompt appears for a fission product and records a choice', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (e) => pageErrors.push(e.message));

	await page.goto('/');
	await page.getByRole('button', { name: 'Get Started' }).click();
	await expect(page.getByRole('heading', { name: 'Step 1: Select Isotopes' })).toBeVisible();

	await page.getByRole('button', { name: 'Add custom isotope' }).click();
	await page.getByLabel('Element Name').fill('Lanthanum');
	await page.getByLabel('Isotope', { exact: true }).fill('La-140');
	await page.getByLabel('Energy (in KeV)').fill('1596');
	await page.getByLabel('Half Life', { exact: true }).fill('40.3');

	// Summary box at the top of Step 1.
	await expect(page.getByText('Possible fission interference').first()).toBeVisible();
	await expect(page.getByText('not reviewed')).toBeVisible();

	// Per-isotope control: dismiss it as "no fission interference".
	await page.getByRole('button', { name: 'No fission interference (0)' }).click();
	await expect(page.getByText('No fission interference (0)').first()).toBeVisible();
	await expect(page.getByText('not reviewed')).toHaveCount(0);

	// The Step 2 notice should be gone once every candidate is reviewed.
	await page
		.getByRole('button', { name: /^Next:/ })
		.first()
		.click();
	await expect(page.getByRole('heading', { name: 'Step 2: Build Library' })).toBeVisible();
	await expect(page.getByText('unreviewed fission-interference potential')).toHaveCount(0);

	expect(pageErrors).toEqual([]);
});
