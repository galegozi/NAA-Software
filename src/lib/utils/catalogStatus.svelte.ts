/**
 * Tracks whether the shared-catalog API is serving built-in **sample data**
 * instead of the real database. The API sets `"mocked": true` on its response
 * when it can't reach Cosmos DB (e.g. a Static Web Apps preview environment with
 * no `COSMOSDB_*` settings). Any catalog fetch reports its payload here; the
 * layout shows a banner so a short sample list is never mistaken for data loss.
 */
class CatalogStatus {
	/** True once any catalog response has come back flagged as sample data. */
	usingSampleData = $state(false);

	/** Call with a parsed catalog API response body. */
	noteResponse(payload: unknown): void {
		if (
			payload &&
			typeof payload === 'object' &&
			(payload as { mocked?: unknown }).mocked === true
		) {
			this.usingSampleData = true;
		}
	}

	reset(): void {
		this.usingSampleData = false;
	}
}

export const catalogStatus = new CatalogStatus();
