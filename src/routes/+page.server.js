export const prerender = false;

import { CosmosClient } from '@azure/cosmos';
import { env } from '$env/dynamic/private';
// import { fail } from '@sveltejs/kit';

let client = new CosmosClient({
    endpoint: 'https://bad-endpoint.documents.azure.com:443/',
    key: 'bad key'
});
if (env.COSMOSDB_ENDPOINT && env.COSMOSDB_KEY) {
    client = new CosmosClient({
        endpoint: env.COSMOSDB_ENDPOINT,
        key: env.COSMOSDB_KEY
    });
}

/** @type {import('./$types.js').PageServerLoad} */
export const load = async () => {
    console.log('SvelteKit load function processed a request.');
    
    const database = client?.database('NAA-db');
    const container = database?.container('isotopes');
    
    const { resources: items } = await container?.items.readAll().fetchAll() ?? { resources: [] };
    return {
        items: items
    };
};

// export const actions = {
//     delete: async ({ cookies, request }) => {
//         console.log('SvelteKit delete action processed a request.');

//         const data = await request.formData();
//         const itemId = data.get('id');
        
//         const database = client?.database('NAA-db');
//         const container = database?.container('isotopes');

//         try{
//             await container?.item(itemId, itemId).delete();
//             return {
//                 success: true
//             };
//         }
//         catch (error){
//             return fail(500, 'Failed to delete item.')
//         }
//     }
// }