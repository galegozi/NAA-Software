// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			/** Which wizard step the current history entry represents (see +page.svelte). */
			wizardStep?: number;
		}
		// interface Platform {}
	}
}

export {};
