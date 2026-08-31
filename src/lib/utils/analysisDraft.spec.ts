import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DRAFT_KEY,
	clearDraft,
	loadDraft,
	saveDraft,
	type AnalysisDraft
} from './analysisDraft.js';

class MemStorage {
	#map = new Map<string, string>();
	getItem(key: string): string | null {
		return this.#map.has(key) ? (this.#map.get(key) as string) : null;
	}
	setItem(key: string, value: string): void {
		this.#map.set(key, String(value));
	}
	removeItem(key: string): void {
		this.#map.delete(key);
	}
}

function makeDraft(overrides: Partial<AnalysisDraft> = {}): AnalysisDraft {
	return {
		version: 3,
		step: 2,
		title: 'Test run',
		isotopeInfo: [
			{
				elementName: 'Gold',
				isotopeName: 'Au-198',
				energy: 411.8,
				halfLife: 2.7,
				linkedReference: 0,
				unit: 'days'
			}
		],
		materials: { reference: [], unknown: [] },
		referenceIsotopeSelections: [['isotope:0']],
		isotopeReferenceMap: [0],
		referenceCatalogItemIds: [null],
		expandedIsotopes: [0],
		expandedReferences: [],
		expandedUnknowns: [],
		...overrides
	};
}

describe('analysisDraft', () => {
	beforeEach(() => {
		vi.stubGlobal('window', {
			localStorage: new MemStorage(),
			sessionStorage: new MemStorage()
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('round-trips a draft through save and load', () => {
		const draft = makeDraft();
		saveDraft(draft);
		expect(loadDraft()).toEqual(draft);
	});

	it('clearDraft removes the stored draft', () => {
		saveDraft(makeDraft());
		clearDraft();
		expect(loadDraft()).toBeNull();
	});

	it('ignores a draft written by an older version', () => {
		window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...makeDraft(), version: 1 }));
		expect(loadDraft()).toBeNull();
	});

	it('returns null when nothing is stored', () => {
		expect(loadDraft()).toBeNull();
	});
});
