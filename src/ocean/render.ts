// Builds on stackedlol/ascii-sharks (MIT, Copyright (c) 2026 drewdi). See THIRD_PARTY_NOTICES.md.
// Two passes per frame: rasterize creatures into per-cell buffers, then paint those cells.
import type { OceanEngine } from "./engine";
import {
	BLOCK_RAMP,
	BRAILLE_SAMPLES,
	brailleBit,
	CELL_EDGE,
	CELL_EYE,
	CELL_FIN,
	CELL_JELLY_CORE,
	CELL_JELLY_DOME,
	CELL_JELLY_FRILL,
	CELL_JELLY_RIM,
	CELL_JELLY_TENTACLE,
	CELL_MARK,
	CELL_RIDGE,
	CELL_TAIL,
	EDGE_HEAVY,
	EDGE_LIGHT,
	FIN_GLYPHS,
	HANZI_RAMP,
	JELLY_RAMP,
	QUAD_SAMPLES,
	RIDGE_GLYPHS,
	SKIN_RAMP,
	SubSample,
} from "./glyphs";
import { clamp, hash3, packRgb, traverseCells, unpackRgb } from "./math";
import { jellyBell, sampleJelly, sampleSwimmer, Swimmer, SwimmerKind } from "./shapes";
import type { JellyPalette } from "../modes";

const SPECIES_TINT: Record<SwimmerKind, [number, number, number]> = {
	hammerhead: [0.82, 0.96, 1.08],
	manta: [0.78, 0.95, 1.06],
	whaleshark: [0.74, 0.94, 1.14],
	classic: [0.84, 0.97, 1.06],
};

/** Eye position per species: [fraction along the body, lateral offset in body lengths]. */
const EYES: Record<SwimmerKind, [number, number]> = {
	hammerhead: [0.036, 0.165],
	whaleshark: [0.042, 0.082],
	manta: [0.062, 0.076],
	classic: [0.058, 0.062],
};

/** Manta tail: from this spine node to the end it is drawn as a one-cell stroke. */
const MANTA_TAIL_START = 10;

/** Line glyph whose slope is closest to the angle. Screen y points down, so +45° reads as "\". */
function strokeGlyph(angle: number): string {
	const slope = Math.abs(Math.tan(angle));
	if (slope < 0.414) return "-"; // tan 22.5°
	if (slope > 2.414) return "|"; // tan 67.5°
	return Math.sin(angle) * Math.cos(angle) > 0 ? "\\" : "/";
}

function ramp(chars: string, t: number, jitter = 0): string {
	return chars[clamp(Math.floor(t * (chars.length - 1)) + jitter, 0, chars.length - 1)];
}

function rasterizeSwimmer(e: OceanEngine, sw: Swimmer, samples: SubSample[], braille: boolean): void {
	const { cols, rows, cellW: cw, cellH: ch } = e;
	const nodes = sw.nodes;
	const pad = sw.len * (sw.kind === "manta" ? 0.58 : 0.3);
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const n of nodes) {
		minX = Math.min(minX, n.x - pad);
		maxX = Math.max(maxX, n.x + pad);
		minY = Math.min(minY, n.y - pad);
		maxY = Math.max(maxY, n.y + pad);
	}
	const [tr, tg, tb] = SPECIES_TINT[sw.kind];
	const dim = (0.68 + 0.32 * sw.depth) * 0.84;

	for (let r = clamp(Math.floor(minY / ch), 0, rows - 1); r <= clamp(Math.ceil(maxY / ch), 0, rows - 1); r++) {
		for (let c = clamp(Math.floor(minX / cw), 0, cols - 1); c <= clamp(Math.ceil(maxX / cw), 0, cols - 1); c++) {
			const idx = r * cols + c;
			if (e.cellFlag[idx] && e.cellDepth[idx] > sw.depth) continue;

			// Nearest spine node to the cell centre narrows the per-sample search.
			const midX = (c + 0.5) * cw;
			const midY = (r + 0.5) * ch;
			let nearSeg = -1;
			let nearD2 = pad * pad;
			for (let k = 0; k < nodes.length - 1; k++) {
				const d2 = (midX - nodes[k].x) ** 2 + (midY - nodes[k].y) ** 2;
				if (d2 < nearD2) {
					nearD2 = d2;
					nearSeg = k;
				}
			}
			if (nearSeg < 0) continue;

			let hits = 0;
			let shadeSum = 0;
			let topFlag = 0;
			let sRep = 0;
			let uRep = 0;
			let dots = 0;
			for (const [sx, sy, bit] of samples) {
				const hit = sampleSwimmer(sw, (c + sx) * cw, (r + sy) * ch, nearSeg);
				if (!hit) continue;
				hits++;
				shadeSum += hit.shade;
				topFlag = Math.max(topFlag, hit.flag);
				sRep = hit.s;
				uRep = hit.u;
				dots |= bit;
			}
			if (!hits) continue;

			const coverage = hits / samples.length;
			const shade = shadeSum / hits;
			const isEdge = coverage < 0.45 && topFlag !== CELL_EYE && topFlag !== CELL_RIDGE;
			const flag = isEdge ? CELL_EDGE : topFlag;
			let level = 44 + shade * 148;
			if (flag === CELL_RIDGE) level = 212;
			else if (flag === CELL_MARK || flag === CELL_EYE) level = 26;
			else if (flag === CELL_FIN) level = 38 + shade * 116;
			level *= dim;
			const glyph = shade > 0.56 ? 22 : 168 + shade * 55;

			e.cellFlag[idx] = flag;
			e.cellShade[idx] = isEdge ? coverage * 1.8 * shade : shade;
			e.cellTile[idx] = packRgb(level * tr * 0.78, level * tg * 0.98 + 8, level * tb * 1.08 + 16);
			e.cellGlyph[idx] = flag === CELL_RIDGE ? packRgb(224, 246, 255) : packRgb(glyph * tr * 0.9, glyph * tg + 12, glyph * tb + 20);
			// Key is fixed to a spot on the body, so glyph choice and sparkle move with the fish.
			e.cellKey[idx] = ((sw.id * 73856093) ^ (Math.floor(sRep * 64) * 19349663) ^ (Math.floor((uRep + 1) * 32) * 83492791)) >>> 0;
			e.cellDepth[idx] = sw.depth;
			e.cellDots[idx] = braille ? dots : 0;
			e.cellAngle[idx] = nodes[nearSeg].ang;
		}
	}

	// Eyes are stamped into exactly one cell each so they never smear.
	const [eyeS, eyeLat] = EYES[sw.kind];
	const pos = eyeS * (nodes.length - 1);
	const en = nodes[clamp(Math.floor(pos), 0, nodes.length - 2)];
	const along = (pos - Math.floor(pos)) * sw.segLen;
	const lat = eyeLat * sw.len;
	for (const side of [-1, 1]) {
		const c = Math.floor((en.x + en.ca * along - en.sa * lat * side) / cw);
		const r = Math.floor((en.y + en.sa * along + en.ca * lat * side) / ch);
		if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
		const idx = r * cols + c;
		e.cellFlag[idx] = CELL_EYE;
		e.cellTile[idx] = packRgb(16, 32, 46);
		e.cellGlyph[idx] = packRgb(212, 246, 252);
		e.cellDepth[idx] = sw.depth;
		e.cellDots[idx] = braille ? 0x1b : 0;
	}

	// The manta tail is thinner than a cell, so it is traced segment by segment through the grid.
	if (sw.kind !== "manta") return;
	const tailNodes = nodes.length - MANTA_TAIL_START;
	for (let k = MANTA_TAIL_START; k < nodes.length - 1; k++) {
		const a = nodes[k];
		const b = nodes[k + 1];
		const shade = 0.72 * (1 - ((k - MANTA_TAIL_START) / tailNodes) * 0.45);
		// Braille: a two-dot stroke, horizontal or vertical depending on the segment direction.
		const tailDots = Math.abs(Math.cos(b.ang)) > 0.7 ? brailleBit(0, 2) | brailleBit(1, 2) : brailleBit(0, 1) | brailleBit(0, 2);
		traverseCells(a.x, a.y, b.x, b.y, cw, ch, (c, r) => {
			if (c < 0 || c >= cols || r < 0 || r >= rows) return;
			const idx = r * cols + c;
			if (e.cellFlag[idx] && e.cellFlag[idx] !== CELL_EDGE) return;
			e.cellFlag[idx] = CELL_TAIL;
			e.cellShade[idx] = shade;
			e.cellGlyph[idx] = packRgb(132, 186, 206);
			e.cellAngle[idx] = b.ang;
			e.cellDepth[idx] = sw.depth;
			e.cellDots[idx] = braille ? tailDots : 0;
		});
	}
}

function rasterizeJellyfish(e: OceanEngine, samples: SubSample[], braille: boolean): void {
	const { cols, rows, cellW: cw, cellH: ch } = e;
	const palettes = e.mode.jellyPalettes;
	for (const jf of e.jellyfish) {
		const pal: JellyPalette = palettes[jf.paletteIdx % palettes.length];
		const { bellW, bellH } = jellyBell(jf);
		const fx = Math.cos(jf.heading);
		const fy = Math.sin(jf.heading);
		const rx = -fy;
		const ry = fx;
		const armReach = jf.radius * 1.85;
		const midX0 = jf.x - fx * armReach * 0.38;
		const midY0 = jf.y - fy * armReach * 0.38;
		const bound = Math.max(bellW * 1.15, armReach * 0.78) + 14;
		const maxLatSq = bellW * bellW * 1.12;

		for (let r = clamp(Math.floor((midY0 - bound) / ch), 0, rows - 1); r <= clamp(Math.ceil((midY0 + bound) / ch), 0, rows - 1); r++) {
			const my = (r + 0.5) * ch - jf.y;
			for (let c = clamp(Math.floor((midX0 - bound) / cw), 0, cols - 1); c <= clamp(Math.ceil((midX0 + bound) / cw), 0, cols - 1); c++) {
				const mx = (c + 0.5) * cw - jf.x;
				const midLat = mx * rx + my * ry;
				const midFwd = mx * fx + my * fy;
				if (midLat * midLat > maxLatSq || midFwd > bellH * 1.12 || midFwd < -armReach * 1.05) continue;

				let hits = 0;
				let shadeSum = 0;
				let top = 0;
				let su = 0;
				let sv = 0;
				let dots = 0;
				for (const [sx, sy, bit] of samples) {
					const hit = sampleJelly(jf, (c + sx) * cw, (r + sy) * ch, fx, fy, rx, ry, bellW, bellH);
					if (!hit) continue;
					hits++;
					shadeSum += hit.shade;
					// Rim wins over core, core over dome and arms.
					if (hit.flag === CELL_JELLY_RIM || top === 0 || (hit.flag === CELL_JELLY_CORE && top !== CELL_JELLY_RIM)) top = hit.flag;
					su = hit.su;
					sv = hit.sv;
					dots |= bit;
				}
				if (!hits) continue;

				const idx = r * cols + c;
				const coverage = hits / samples.length;
				const shade = shadeSum / hits;
				const isEdge = coverage < 0.48 && top !== CELL_JELLY_RIM;
				const rgb = top === CELL_JELLY_RIM ? pal.rim : top === CELL_JELLY_CORE ? pal.core : top === CELL_JELLY_FRILL ? pal.frill : pal.dome;
				const tile = (0.28 + shade * 0.62) * jf.depth;
				const glyph = 0.65 + shade * 0.48;
				e.cellFlag[idx] = isEdge ? CELL_EDGE : top;
				e.cellShade[idx] = isEdge ? coverage * 1.75 * shade : shade;
				e.cellTile[idx] = packRgb(rgb[0] * tile * 0.68, rgb[1] * tile * 0.74, rgb[2] * tile * 0.82 + 12);
				e.cellGlyph[idx] = packRgb(rgb[0] * glyph, rgb[1] * glyph, rgb[2] * glyph);
				e.cellKey[idx] = ((jf.id * 92837111) ^ (Math.floor((su + 2) * 28) * 39916801) ^ (Math.floor((sv + 2) * 28) * 47900159)) >>> 0;
				e.cellDepth[idx] = jf.depth;
				e.cellDots[idx] |= braille ? dots : 0;
			}
		}

		// Sixteen marginal tentacles, each walked in small steps that bend with the heading history.
		const count = 16;
		const stepPx = cw * 0.42;
		const steps = Math.max(22, Math.floor((jf.radius * 3.05) / stepPx));
		for (let tIdx = 0; tIdx < count; tIdx++) {
			const uNorm = (tIdx / (count - 1)) * 2 - 1;
			const arch = -0.18 + 0.05 * Math.cos(uNorm * Math.PI * 5);
			let x = jf.x + rx * bellW * uNorm * 0.92 + fx * bellH * arch;
			let y = jf.y + ry * bellW * uNorm * 0.92 + fy * bellH * arch;
			const tint = tIdx % 3 === 0 ? pal.core : pal.rim;
			for (let st = 1; st <= steps; st++) {
				const frac = st / steps;
				const trail = jf.trailAngles[Math.min(17, Math.floor(frac * 17))];
				const bx = -Math.cos(trail);
				const by = -Math.sin(trail);
				const wave = Math.sin(jf.phase * 1.25 - frac * 6.4 + tIdx * 0.85) * (0.45 + frac * 1.45) + uNorm * 0.28 * (1 - frac * 0.5);
				x += bx * stepPx - by * wave * 0.36;
				y += by * stepPx + bx * wave * 0.36;

				const c = Math.floor(x / cw);
				const r = Math.floor(y / ch);
				if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
				const idx = r * cols + c;
				const f = e.cellFlag[idx];
				if (f && f !== CELL_EDGE && f !== CELL_JELLY_TENTACLE) continue;
				const val = clamp(Math.pow(1 - frac, 0.85) * 0.82 + ((st + tIdx * 3) % 7 === 0 ? 0.22 : 0), 0.1, 0.92);
				if (f === CELL_JELLY_TENTACLE && e.cellShade[idx] >= val) continue;
				e.cellFlag[idx] = CELL_JELLY_TENTACLE;
				e.cellShade[idx] = val;
				e.cellGlyph[idx] = packRgb(tint[0] * (0.55 + val * 0.5), tint[1] * (0.55 + val * 0.5), tint[2] * (0.58 + val * 0.5));
				e.cellKey[idx] = ((jf.id * 104729) ^ (tIdx * 7919) ^ st) >>> 0;
				if (braille) e.cellDots[idx] |= brailleBit(x - c * cw < cw / 2 ? 0 : 1, clamp(Math.floor(((y - r * ch) / ch) * 4), 0, 3));
			}
		}
	}
}

export function paintFrame(e: OceanEngine): void {
	const { ctx, cols, rows, cellW: cw, cellH: ch, mode } = e;
	const style = e.settings().renderStyle;
	const braille = style === "braille";
	const samples = braille ? BRAILLE_SAMPLES : QUAD_SAMPLES;

	e.cellFlag.fill(0);
	e.cellDots.fill(0);
	for (const sw of e.swimmers) rasterizeSwimmer(e, sw, samples, braille);
	rasterizeJellyfish(e, samples, braille);

	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.drawImage(e.backdrop, 0, 0);
	ctx.setTransform(e.dpr, 0, 0, e.dpr, 0, 0);
	const hanzi = style === "hanzi";
	const fontPx = Math.max(8, Math.round(hanzi ? cw * 0.96 : ch * 0.76));
	ctx.font = hanzi ? `500 ${fontPx}px "Microsoft YaHei", "PingFang SC", sans-serif` : `600 ${fontPx}px "Cascadia Mono", Consolas, ui-monospace, monospace`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	// Wake glow in empty cells.
	const wakeRgb = mode.wakeRgb.join(",");
	for (let i = 0; i < e.wake.length; i++) {
		const wv = e.wake[i];
		if (wv <= 0.05 || e.cellFlag[i]) continue;
		const cx = ((i % cols) + 0.5) * cw;
		const cy = (((i / cols) | 0) + 0.5) * ch;
		ctx.fillStyle = `rgba(${wakeRgb},${clamp(wv * 0.55, 0.05, 0.52).toFixed(3)})`;
		if (braille) {
			ctx.beginPath();
			ctx.arc(cx, cy, Math.max(0.75, cw * 0.12), 0, Math.PI * 2);
			ctx.fill();
		} else {
			ctx.fillRect(cx - 0.9, cy - 0.9, 1.8, 1.8);
		}
	}

	// Soft glow under each jellyfish.
	for (const jf of e.jellyfish) {
		const pal = mode.jellyPalettes[jf.paletteIdx % mode.jellyPalettes.length];
		const auraR = jf.radius * 1.95;
		const aura = ctx.createRadialGradient(jf.x, jf.y, jf.radius * 0.12, jf.x, jf.y, auraR);
		aura.addColorStop(0, `rgba(${pal.core.join(",")},0.13)`);
		aura.addColorStop(0.45, `rgba(${pal.dome.join(",")},0.055)`);
		aura.addColorStop(1, "rgba(0,0,0,0)");
		ctx.fillStyle = aura;
		ctx.fillRect(jf.x - auraR, jf.y - auraR, auraR * 2, auraR * 2);
	}

	for (const p of e.plankton) {
		const twinkle = 0.14 + 0.22 * Math.sin(e.simTime * 1.8 + p.phase);
		if (twinkle <= 0.04) continue;
		ctx.fillStyle = `rgba(${wakeRgb},${twinkle.toFixed(3)})`;
		ctx.fillRect(p.x, p.y, p.size, p.size);
	}

	// Ripples are drawn as dots snapped to the glyph grid.
	for (const rp of e.ripples) {
		const steps = Math.max(24, Math.floor((rp.r * 2 * Math.PI) / (cw * 1.15)));
		ctx.fillStyle = rp.color;
		ctx.globalAlpha = rp.alpha;
		for (let k = 0; k < steps; k++) {
			const a = (k / steps) * Math.PI * 2;
			const c = Math.floor((rp.x + Math.cos(a) * rp.r) / cw);
			const r = Math.floor((rp.y + Math.sin(a) * rp.r * 0.84) / ch);
			if (c >= 0 && c < cols && r >= 0 && r < rows) ctx.fillText("·", (c + 0.5) * cw, (r + 0.5) * ch);
		}
		ctx.globalAlpha = 1;
	}

	e.microFish.forEach((f, i) => {
		const c = Math.floor(f.x / cw);
		const r = Math.floor(f.y / ch);
		if (c < 0 || c >= cols || r < 0 || r >= rows || e.cellFlag[r * cols + c]) return;
		const alpha = clamp(0.28 + (i % 4) * 0.1 + f.glint * 0.52, 0.24, 0.92);
		ctx.fillStyle = f.glint > 0.25 ? mode.accents[0] : `rgba(176, 216, 232, ${alpha.toFixed(2)})`;
		ctx.fillText(f.glint > 0.4 ? "=" : i % 3 === 0 ? "·" : i & 1 ? "-" : "~", (c + 0.5) * cw, (r + 0.5) * ch);
	});

	paintCreatureCells(e, style);
}

function paintCreatureCells(e: OceanEngine, style: string): void {
	const { ctx, cols, cellW: cw, cellH: ch } = e;
	const accents = e.mode.accents;
	const tick = Math.floor(e.simTime * 2.1);
	const braille = style === "braille";
	const dotR = Math.max(0.75, cw * 0.115);

	for (let i = 0; i < e.cellFlag.length; i++) {
		const flag = e.cellFlag[i];
		if (!flag) continue;
		const x = (i % cols) * cw;
		const y = ((i / cols) | 0) * ch;
		const cx = x + cw * 0.5;
		const cy = y + ch * 0.5 + 0.5;
		const shade = e.cellShade[i];
		const key = e.cellKey[i];
		const glyphRgb = unpackRgb(e.cellGlyph[i]);
		const isJelly = flag >= CELL_JELLY_DOME;

		if (braille) {
			const mask = e.cellDots[i];
			if (!mask) continue;
			if (flag !== CELL_EDGE && flag !== CELL_JELLY_TENTACLE && flag !== CELL_TAIL) {
				ctx.fillStyle = `rgba(${unpackRgb(e.cellTile[i])},${isJelly ? 0.38 : 0.52})`;
				ctx.fillRect(x + 0.75, y + 0.75, cw - 1.5, ch - 1.5);
			}
			ctx.fillStyle =
				hash3(key, tick + (key % 13), 11) < 0.055 ? accents[key % accents.length] : `rgba(${glyphRgb},${clamp(0.45 + shade * 0.55, 0.32, 0.98).toFixed(2)})`;
			ctx.beginPath();
			for (const [sx, sy, bit] of BRAILLE_SAMPLES) {
				if (!(mask & bit)) continue;
				ctx.moveTo(x + sx * cw + dotR, y + sy * ch);
				ctx.arc(x + sx * cw, y + sy * ch, dotR, 0, Math.PI * 2);
			}
			ctx.fill();
			continue;
		}

		if (flag === CELL_TAIL) {
			ctx.fillStyle = `rgba(${glyphRgb},${clamp(shade, 0.25, 0.85).toFixed(2)})`;
			ctx.fillText(strokeGlyph(e.cellAngle[i]), cx, cy);
			continue;
		}

		if (flag === CELL_JELLY_TENTACLE) {
			const chars = style === "blocks" ? "·∙▪░" : style === "hanzi" ? "·一十丝" : ".,':;+*";
			ctx.fillStyle = `rgba(${glyphRgb},${clamp(shade * 0.95, 0.16, 0.9).toFixed(2)})`;
			ctx.fillText(ramp(chars, shade), cx, cy);
			continue;
		}

		if (flag === CELL_EDGE) {
			// Partly covered cells get a thin glyph and no tile, which anti-aliases the outline.
			const set = shade >= 0.42 ? EDGE_HEAVY : EDGE_LIGHT;
			ctx.fillStyle = `rgba(${glyphRgb},${clamp(0.32 + shade * 0.58, 0.24, 0.82).toFixed(2)})`;
			ctx.fillText(style === "blocks" ? "░" : style === "hanzi" ? "·" : set[(key >>> 6) % set.length], cx, cy);
			continue;
		}

		// Interior cell: shaded tile with a 1px dark seam, then a texture glyph on top.
		const tileAlpha = !isJelly
			? 0.88
			: clamp(
					flag === CELL_JELLY_RIM ? 0.72 : flag === CELL_JELLY_CORE ? 0.56 + shade * 0.28 : flag === CELL_JELLY_FRILL ? 0.36 + shade * 0.42 : 0.28 + shade * 0.44,
					0.22,
					0.84,
				);
		ctx.fillStyle = `rgba(${unpackRgb(e.cellTile[i])},${tileAlpha.toFixed(2)})`;
		ctx.fillRect(x + 0.65, y + 0.65, cw - 1.3, ch - 1.3);

		const jitter = ((key >>> 4) % 3) - 1;
		let glyph: string;
		if (flag === CELL_EYE) glyph = "o";
		else if (style === "blocks") glyph = ramp(BLOCK_RAMP, shade);
		else if (style === "hanzi") glyph = ramp(HANZI_RAMP, shade, jitter);
		else if (isJelly) glyph = ramp(JELLY_RAMP, shade, jitter);
		else if (flag === CELL_RIDGE) glyph = RIDGE_GLYPHS[(key >>> 7) % RIDGE_GLYPHS.length];
		else if (flag === CELL_FIN) glyph = FIN_GLYPHS[(key >>> 7) % FIN_GLYPHS.length];
		else glyph = ramp(SKIN_RAMP, 1 - shade, jitter);

		if (flag === CELL_EYE) ctx.fillStyle = "#d2f4fa";
		else if (hash3(key, tick + (key % 31), 7) < 0.055) ctx.fillStyle = accents[key % accents.length];
		else ctx.fillStyle = isJelly ? `rgba(${glyphRgb},${clamp(0.32 + shade * 0.46, 0.28, 0.82).toFixed(2)})` : `rgb(${glyphRgb})`;
		ctx.fillText(glyph, cx, cy);
	}
}
