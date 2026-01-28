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