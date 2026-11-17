export function clamp(v: number, lo: number, hi: number): number {
	return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(a: number, b: number, x: number): number {
	const t = clamp((x - a) / (b - a), 0, 1);
	return t * t * (3 - 2 * t);
}

export function wrapAngle(a: number): number {
	while (a > Math.PI) a -= Math.PI * 2;
	while (a < -Math.PI) a += Math.PI * 2;
	return a;
}

/** Deterministic hash of three integers to [0, 1). */
export function hash3(a: number, b: number, c: number): number {
	let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function packRgb(r: number, g: number, b: number): number {
	return ((clamp(r | 0, 0, 255) << 16) | (clamp(g | 0, 0, 255) << 8) | clamp(b | 0, 0, 255)) >>> 0;
}

export function unpackRgb(c: number): string {
	return `${(c >>> 16) & 255},${(c >>> 8) & 255},${c & 255}`;
}

/**
 * Calls visit(col, row) for every grid cell a segment passes through, each once, in order
 * (Amanatides & Woo grid traversal). Thin strokes drawn this way never break between cells.
 */
export function traverseCells(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	cw: number,
	ch: number,
	visit: (col: number, row: number) => void,
): void {
	let col = Math.floor(x0 / cw);
	let row = Math.floor(y0 / ch);
	const endCol = Math.floor(x1 / cw);
	const endRow = Math.floor(y1 / ch);
	const dx = x1 - x0;
	const dy = y1 - y0;
	const stepX = dx > 0 ? 1 : -1;
	const stepY = dy > 0 ? 1 : -1;
	const tDeltaX = dx !== 0 ? Math.abs(cw / dx) : Infinity;
	const tDeltaY = dy !== 0 ? Math.abs(ch / dy) : Infinity;
	let tMaxX = dx !== 0 ? ((stepX > 0 ? (col + 1) * cw : col * cw) - x0) / dx : Infinity;
	let tMaxY = dy !== 0 ? ((stepY > 0 ? (row + 1) * ch : row * ch) - y0) / dy : Infinity;
	visit(col, row);
	while (col !== endCol || row !== endRow) {
		if (tMaxX < tMaxY) {
			if (tMaxX > 1) break;
			col += stepX;
			tMaxX += tDeltaX;
		} else {
			if (tMaxY > 1) break;
			row += stepY;
			tMaxY += tDeltaY;
		}
		visit(col, row);
	}
}
