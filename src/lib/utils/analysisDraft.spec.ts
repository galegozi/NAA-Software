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
		fissionChoices: [],
		fissionManualFissile: [],
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

	it('round-trips fission-interference choices', () => {
		const draft = makeDraft({
			fissionChoices: [
				{
					isotopeKey: 'la|140|',
					factor: 0.0123,
					uncertainty: 0.0004,
					mode: 'table',
					fissileNuclide: 'U-235',
					gammaEnergyKev: 1596.2,
					irradiationPosition: '',
					irradiationType: 'thermal',
					sourceRowId: 'row-1'
				},
				{ isotopeKey: 'mo|99|', factor: 0, uncertainty: 0, mode: 'none' }
			]
		});
		saveDraft(draft);
		expect(loadDraft()?.fissionChoices).toEqual(draft.fissionChoices);
	});

	it('round-trips hand-entered fissile concentrations', () => {
		const draft = makeDraft({
			fissionManualFissile: [
				{
					isotopeKey: 'ce|141|',
					unit: 'ppm',
					inStandard: 5,
					inUnknown: [
						{ value: 30, uncertainty: 1.5 },
						{ value: null, uncertainty: null }
					]
				}
			]
		});
		saveDraft(draft);
		expect(loadDraft()?.fissionManualFissile).toEqual(draft.fissionManualFissile);
	});

	it('defaults new fission fields to [] for drafts written before they existed', () => {
		const legacy: Record<string, unknown> = { ...makeDraft() };
		delete legacy.fissionChoices;
		delete legacy.fissionManualFissile;
		window.localStorage.setItem(DRAFT_KEY, JSON.stringify(legacy));
		expect(loadDraft()?.fissionChoices).toEqual([]);
		expect(loadDraft()?.fissionManualFissile).toEqual([]);
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
