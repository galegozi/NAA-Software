import { CosmosClient } from '@azure/cosmos';

let cachedClient;

function getRequiredSetting(name) {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

export function getCosmosContainer() {
	if (!cachedClient) {
		cachedClient = new CosmosClient({
			endpoint: getRequiredSetting('COSMOSDB_ENDPOINT'),
			key: getRequiredSetting('COSMOSDB_KEY')
		});
	}

	const databaseName = process.env.COSMOSDB_DATABASE?.trim() || 'NAA-db';
	const containerName = process.env.COSMOSDB_CONTAINER?.trim() || 'isotopes';

	return cachedClient.database(databaseName).container(containerName);
}

export function getReferenceMaterialsContainer() {
	if (!cachedClient) {
		cachedClient = new CosmosClient({
			endpoint: getRequiredSetting('COSMOSDB_ENDPOINT'),
			key: getRequiredSetting('COSMOSDB_KEY')
		});
	}

	const databaseName = process.env.COSMOSDB_DATABASE?.trim() || 'NAA-db';
	const containerName = process.env.COSMOSDB_REFERENCE_CONTAINER?.trim() || 'reference-materials';

	return cachedClient.database(databaseName).container(containerName);
}

export function getReferenceDatasheetContainer() {
	if (!cachedClient) {
		cachedClient = new CosmosClient({
			endpoint: getRequiredSetting('COSMOSDB_ENDPOINT'),
			key: getRequiredSetting('COSMOSDB_KEY')
		});
	}

	const databaseName = process.env.COSMOSDB_DATABASE?.trim() || 'NAA-db';
	const containerName = process.env.COSMOSDB_DATASHEET_CONTAINER?.trim() || 'reference-datasheets';

	return cachedClient.database(databaseName).container(containerName);
}

export function getIsotopeMeasurementLinksContainer() {
	if (!cachedClient) {
		cachedClient = new CosmosClient({
			endpoint: getRequiredSetting('COSMOSDB_ENDPOINT'),
			key: getRequiredSetting('COSMOSDB_KEY')
		});
	}

	const databaseName = process.env.COSMOSDB_DATABASE?.trim() || 'NAA-db';
	const containerName =
		process.env.COSMOSDB_ISOTOPE_MEASUREMENTS_CONTAINER?.trim() || 'isotope-measurements';

	return cachedClient.database(databaseName).container(containerName);
}

export function getFissionCorrectionsContainer() {
	if (!cachedClient) {
		cachedClient = new CosmosClient({
			endpoint: getRequiredSetting('COSMOSDB_ENDPOINT'),
			key: getRequiredSetting('COSMOSDB_KEY')
		});
	}

	const databaseName = process.env.COSMOSDB_DATABASE?.trim() || 'NAA-db';
	const containerName =
		process.env.COSMOSDB_FISSION_CORRECTIONS_CONTAINER?.trim() || 'fission-corrections';

	return cachedClient.database(databaseName).container(containerName);
}
