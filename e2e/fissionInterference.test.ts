import { expect, test } from '@playwright/test';

/**
 * Selecting an isotope that is a known fission product raises a
 * "possible fission interference" note in Step 1. The factor-picking controls
 * only appear once a uranium isotope is also part of the analysis; before that
 * the note is informational and points the user at adding uranium.
 */
test('fission-interference prompt is gated on uranium being analysed', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (e) => pageErrors.push(e.message));

	await page.goto('/');
	await page.getByRole('button', { name: 'Get Started' }).click();
	await expect(page.getByRole('heading', { name: 'Step 1: Select Isotopes' })).toBeVisible();

	await page.getByRole('button', { name: 'Add custom isotope' }).click();
	await page.getByLabel('Element Name').nth(0).fill('Lanthanum');
	await page.getByLabel('Isotope', { exact: true }).nth(0).fill('La-140');
	await page.getByLabel('Energy (in KeV)').nth(0).fill('1596');
	await page.getByLabel('Half Life', { exact: true }).nth(0).fill('40.3');

	// No uranium yet: informational note only, no factor controls.
	await expect(page.getByText('Possible fission interference').first()).toBeVisible();
	await expect(
		page.getByText('only applied when a uranium isotope is part of the analysis').first()
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'No fission interference (0)' })).toHaveCount(0);
	await expect(page.getByText('not reviewed')).toHaveCount(0);

	// The "add a custom uranium isotope" button pre-fills element / isotope.
	await page.getByRole('button', { name: 'Add a custom uranium isotope' }).first().click();
	await expect(page.getByLabel('Element Name').nth(1)).toHaveValue('Uranium');
	await expect(page.getByLabel('Isotope', { exact: true }).nth(1)).toHaveValue('U-');

	// Finish populating it — the factor-picking control then appears.
	await page.getByLabel('Isotope', { exact: true }).nth(1).fill('U-239');
	await page.getByLabel('Energy (in KeV)').nth(1).fill('74');
	await page.getByLabel('Half Life', { exact: true }).nth(1).fill('1500');

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
