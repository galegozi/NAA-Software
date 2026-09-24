/**
 * Display order for the Review step's "Predicted Concentrations" table (and its
 * CSV): isotope columns grouped by element, and both axes sorted so the
 * measured cells run down a top-left → bottom-right diagonal — the unknown
 * measured for the first element(s) comes first, then the next, and so on.
 *
 * Columns: element groups ordered by the first unknown (in entry order) that
 * measured any isotope of that element, ties broken by where the element first
 * appears among the isotopes; isotopes of one element stay side by side.
 * Rows: unknowns ordered by their first, then last, measured column in that
 * column order. Unmeasured isotopes / unknowns go last; entry order breaks
 * every remaining tie, so an all-measured table keeps its rows as entered.
 */
export function diagonalResultOrder(
	/** `measured[unknownIndex][isotopeIndex]` */
	measured: boolean[][],
	/** Element key per isotope (isotopes sharing a key are grouped). */
	elementKeys: string[]
): { columns: number[]; rows: number[] } {
	const isotopeCount = elementKeys.length;
	const unknownCount = measured.length;

	const firstRowOf = (isotopeIndex: number) => {
		for (let u = 0; u < unknownCount; u++) {
			if (measured[u]?.[isotopeIndex]) return u;
		}
		return Infinity;
	};
	const isotopeFirstRow = Array.from({ length: isotopeCount }, (_, i) => firstRowOf(i));

	const groupFirstRow = new Map<string, number>();
	const groupAppearance = new Map<string, number>();
	elementKeys.forEach((key, i) => {
		groupFirstRow.set(key, Math.min(groupFirstRow.get(key) ?? Infinity, isotopeFirstRow[i]));
		if (!groupAppearance.has(key)) groupAppearance.set(key, i);
	});

	const columns = Array.from({ length: isotopeCount }, (_, i) => i).sort((a, b) => {
		const ka = elementKeys[a];
		const kb = elementKeys[b];
		return (
			compare(groupFirstRow.get(ka)!, groupFirstRow.get(kb)!) ||
			groupAppearance.get(ka)! - groupAppearance.get(kb)! ||
			compare(isotopeFirstRow[a], isotopeFirstRow[b]) ||
			a - b
		);
	});

	const span = (u: number): [number, number] => {
		let first = Infinity;
		let last = Infinity;
		columns.forEach((isotopeIndex, position) => {
			if (!measured[u]?.[isotopeIndex]) return;
			if (first === Infinity) first = position;
			last = position;
		});
		return [first, last];
	};
	const spans = Array.from({ length: unknownCount }, (_, u) => span(u));
	const rows = Array.from({ length: unknownCount }, (_, u) => u).sort(
		(a, b) => compare(spans[a][0], spans[b][0]) || compare(spans[a][1], spans[b][1]) || a - b
	);

	return { columns, rows };
}

function compare(a: number, b: number): number {
	return a === b ? 0 : a < b ? -1 : 1;
}
