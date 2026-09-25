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
		localIsotopeLinks: [],
		interferenceSettings: [],
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

	it('round-trips recorded isotope relationships', () => {
		const measured = {
			elementName: 'Neptunium',
			isotopeName: 'Np-239',
			energy: 277.6,
			halfLife: 2.36,
			linkedReference: 0,
			unit: 'days'
		};
		const target = { ...measured, elementName: 'Uranium', isotopeName: 'U-238', id: 'u238' };
		const draft = makeDraft({
			localIsotopeLinks: [{ id: 'r1', notes: 'via n,gamma', published: false, measured, target }]
		});
		saveDraft(draft);
		expect(loadDraft()?.localIsotopeLinks).toEqual(draft.localIsotopeLinks);
	});

	it('round-trips interference settings', () => {
		const draft = makeDraft({
			interferenceSettings: [
				{
					isotopeKey: 'mg|27|',
					interferents: [
						{
							element: 'Al',
							reaction: 'Al-27(n,p)Mg-27',
							enabled: true,
							factor: 0.01,
							uncertainty: 0.0005,
							unit: 'percentage',
							manualInStandard: 2.5,
							manualInUnknown: [8, null]
						}
					]
				}
			]
		});
		saveDraft(draft);
		expect(loadDraft()?.interferenceSettings).toEqual(draft.interferenceSettings);
	});

	it('loads a pre-8.0 draft with no interference settings', () => {
		const { interferenceSettings: _omit, ...legacy } = makeDraft();
		window.localStorage.setItem(DRAFT_KEY, JSON.stringify(legacy));
		expect(loadDraft()?.interferenceSettings).toEqual([]);
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
