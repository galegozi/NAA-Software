import { expect, test } from '@playwright/test';

/**
 * The wizard keeps `step` in the browser history (shallow routing) so the
 * back/forward buttons walk through visited steps. Regression test for that.
 */
test('browser back/forward navigates the wizard steps', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (e) => pageErrors.push(e.message));

	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('NAA Analysis Software');

	// Welcome -> Step 1
	await page.getByRole('button', { name: 'Get Started' }).click();
	await expect(page.getByRole('heading', { name: 'Step 1: Select Isotopes' })).toBeVisible();

	// A custom isotope so step 1 validation lets us advance.
	await page.getByRole('button', { name: 'Add custom isotope' }).click();
	await page.getByLabel('Element Name').fill('Gold');
	await page.getByLabel('Isotope', { exact: true }).fill('Au-198');
	await page.getByLabel('Energy (in KeV)').fill('411');
	await page.getByLabel('Half Life', { exact: true }).fill('2.7');

	// Step 1 -> Step 2
	await page.getByRole('button', { name: /^Next:/ }).click();
	await expect(page.getByRole('heading', { name: 'Step 2: Build Library' })).toBeVisible();

	// Back button: 2 -> 1 -> Welcome
	await page.goBack();
	await expect(page.getByRole('heading', { name: 'Step 1: Select Isotopes' })).toBeVisible();
	await page.goBack();
	await expect(page.getByRole('button', { name: 'Get Started' })).toBeVisible();

	// Forward button: Welcome -> 1 -> 2
	await page.goForward();
	await expect(page.getByRole('heading', { name: 'Step 1: Select Isotopes' })).toBeVisible();
	await page.goForward();
	await expect(page.getByRole('heading', { name: 'Step 2: Build Library' })).toBeVisible();

	expect(pageErrors).toEqual([]);
});
