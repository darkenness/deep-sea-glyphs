// Cell categories written by the rasterizer and read by the painter.
export const CELL_EMPTY = 0;
export const CELL_EDGE = 1;
export const CELL_BODY = 2;
export const CELL_FIN = 3;
export const CELL_RIDGE = 4;
export const CELL_MARK = 5;
export const CELL_EYE = 6;
export const CELL_TAIL = 7;
export const CELL_JELLY_DOME = 8;
export const CELL_JELLY_RIM = 9;
export const CELL_JELLY_CORE = 10;
export const CELL_JELLY_FRILL = 11;
export const CELL_JELLY_TENTACLE = 12;

// Glyph ramps, light to dense. The ramp-per-surface idea follows ascii-sharks (MIT, see THIRD_PARTY_NOTICES.md).
export const SKIN_RAMP = ".:;+t%SX8#@";
export const FIN_GLYPHS = ":;+t%";
export const RIDGE_GLYPHS = "@#8%";
export const EDGE_LIGHT = ".,'`";
export const EDGE_HEAVY = ":;+";
export const JELLY_RAMP = "·.:;+*o%#";
export const BLOCK_RAMP = "░▒▓█";
export const HANZI_RAMP = "一十川水汐泡流浪魚鯊海";

/** One sample point inside a cell, in cell-relative units, plus the braille bit it lights. */
export type SubSample = [x: number, y: number, bit: number];

/** 2×2 supersampling grid used for anti-aliased glyph cells. */
export const QUAD_SAMPLES: SubSample[] = [
	[0.25, 0.25, 0],
	[0.75, 0.25, 0],
	[0.25, 0.75, 0],
	[0.75, 0.75, 0],
];

/**
 * Bit of the Unicode braille cell (U+2800 block) at a 2-column × 4-row position.
 * Rows 0–2 are dots 1–3 / 4–6; row 3 holds dots 7 / 8, added later to the standard.
 */
export function brailleBit(col: number, row: number): number {
	if (row === 3) return col === 0 ? 0x40 : 0x80;
	return 1 << (row + col * 3);
}

/** Centres of the eight braille dot positions, each tagged with its bit. */
export const BRAILLE_SAMPLES: SubSample[] = [];
for (let col = 0; col < 2; col++) {
	for (let row = 0; row < 4; row++) {
		BRAILLE_SAMPLES.push([(col + 0.5) / 2, (row + 0.5) / 4, brailleBit(col, row)]);
	}
}
