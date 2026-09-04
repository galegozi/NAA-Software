import { expect, test } from '@playwright/test';

/**
 * Selecting an isotope that is a known fission product raises the
 * "possible fission interference" prompt in Step 1 — offered right away, not
 * gated on uranium being analysed. The per-isotope control records a choice
 * (here: an explicit "no fission interference").
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
	await page.getByLabel('Element Name').nth(0).fill('Lanthanum');
	await page.getByLabel('Isotope', { exact: true }).nth(0).fill('La-140');
	await page.getByLabel('Energy (in KeV)').nth(0).fill('1596');
	await page.getByLabel('Half Life', { exact: true }).nth(0).fill('40.3');

	// The factor picker is offered immediately — no uranium isotope needed —
	// with a note that its concentration isn't one of the analysed isotopes.
	await expect(page.getByText('Possible fission interference').first()).toBeVisible();
	await expect(page.getByText("isn't one of your analysed isotopes").first()).toBeVisible();
	await expect(page.getByText('not reviewed')).toBeVisible();

	// The "add it as a custom isotope" shortcut still pre-fills element / isotope.
	await page.getByRole('button', { name: 'add it as a custom isotope' }).first().click();
	await expect(page.getByLabel('Element Name').nth(1)).toHaveValue('Uranium');
	await expect(page.getByLabel('Isotope', { exact: true }).nth(1)).toHaveValue('U-');
	await page.getByLabel('Isotope', { exact: true }).nth(1).fill('U-239');
	await page.getByLabel('Energy (in KeV)').nth(1).fill('74');
	await page.getByLabel('Half Life', { exact: true }).nth(1).fill('1500');

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
