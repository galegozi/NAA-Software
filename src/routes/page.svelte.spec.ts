import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('/+page.svelte', () => {
	it('should render h1', async () => {
		render(Page);

		const heading = page.getByRole('heading', { level: 1 });
		await expect.element(heading).toBeInTheDocument();
	});

	it('walks into the unified Select Isotopes step and supports custom isotopes', async () => {
		render(Page);

		await page.getByRole('button', { name: 'Get Started' }).click();

		const stepHeading = page.getByRole('heading', { name: 'Step 1: Select Isotopes' });
		await expect.element(stepHeading).toBeInTheDocument();

		// No API in the test environment, so the catalog picker must be hidden entirely.
		await expect
			.element(page.getByRole('searchbox', { name: 'Search isotope catalog' }))
			.not.toBeInTheDocument();

		await page.getByRole('button', { name: 'Add custom isotope' }).click();

		await expect.element(page.getByText('Isotopes to analyze (1)')).toBeInTheDocument();
		await expect.element(page.getByRole('textbox', { name: 'Element Name' })).toBeInTheDocument();

		// Removing it empties the list again.
		await page.getByRole('button', { name: 'Remove' }).click();
		await expect.element(page.getByText('Isotopes to analyze (0)')).toBeInTheDocument();
	});

	it('blocks leaving Select Isotopes with no isotopes', async () => {
		render(Page);

		await page.getByRole('button', { name: 'Get Started' }).click();
		await page.getByRole('button', { name: 'Next: Build Library' }).click();

		// Still on step 1, with a validation message.
		await expect
			.element(page.getByRole('heading', { name: 'Step 1: Select Isotopes' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText('Add at least one isotope to analyze.'))
			.toBeInTheDocument();
	});
});
