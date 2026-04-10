# NAA Software
Welcome to the NAA Software!
This software computes the concentrations of radioactive isotopes in unknown materials.

## What is Neutron Activation Analysis?
Neutron Activation Analysis uses a nuclear reactor to determine concentrations of isotopes.
The idea is to irradiate both the known and unknown materials and compare the counts of neutrons measured by the detector.
This software uses properties of the isotopes, materials, and irradiations to compute the unknown concentrations.

# Svelte library

Everything you need to build a Svelte library, powered by [`sv`](https://npmjs.com/package/sv).

Read more about creating a library [in the docs](https://svelte.dev/docs/kit/packaging).

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

Everything inside `src/lib` is part of your library, everything inside `src/routes` can be used as a showcase or preview app.

## Building

To build your library:

```sh
npm pack
```

To create a production version of your showcase app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Azure Static Web Apps + Cosmos DB

This project now includes an integrated Azure Functions backend under `api/` for use with Azure Static Web Apps.

### What it exposes

- `GET /api/isotopes`

The frontend isotope viewer calls `/api/isotopes` by default. You can override that by setting `PUBLIC_ISOTOPE_API_URL`.

### API access control

The integrated Azure Functions endpoint is protected at the Static Web Apps layer in `staticwebapp.config.json` and is limited to the custom `isotope-reader` role.

This is narrower than the built-in `authenticated` role. Only users explicitly assigned to `isotope-reader` can load the app or call `/api/isotopes`.

To grant access, assign users invitations/roles in Azure Static Web Apps so their identity includes `isotope-reader` after sign-in.

The current config also protects the app routes with the same role and redirects unauthenticated users to Azure AD sign-in.

For integrated Static Web Apps APIs, the function itself should remain `authLevel: 'anonymous'` because Static Web Apps performs the authorization before forwarding the request. Setting the function to `function` or `admin` is not the right model for SWA-integrated APIs.

Important limitation: because this app is a static frontend, any browser user who is allowed to use the app can also call the same `/api/...` endpoint from the browser. If you need the Cosmos query to be inaccessible to end users entirely, that work must move to a server-rendered/backend-controlled path instead of a client-side fetch.

### Backend configuration

Set these application settings in Azure Static Web Apps:

- `COSMOSDB_ENDPOINT`
- `COSMOSDB_KEY`
- `COSMOSDB_DATABASE`
- `COSMOSDB_CONTAINER`
- `COSMOSDB_QUERY` (optional, defaults to `SELECT * FROM c`)

The included sample file is `api/local.settings.sample.json`.

### Local development

Install the API dependencies:

```sh
cd api
npm install
```

To run the integrated Static Web App locally, use the Azure Static Web Apps CLI or Azure Functions Core Tools with the Svelte app and the `api/` folder together.

### Azure deployment settings

Use these Azure Static Web Apps settings:

- App location: `/`
- API location: `api`
- Output location: `build`