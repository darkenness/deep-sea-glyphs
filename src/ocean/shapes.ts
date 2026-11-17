// Builds on stackedlol/ascii-sharks (MIT, Copyright (c) 2026 drewdi). See THIRD_PARTY_NOTICES.md.
// Body outlines sampled at sub-cell points. Each creature is a spine of nodes; a point is
// mapped to (s along the body 0..1, v across it in body lengths) and tested against a profile.
import {
	CELL_BODY,
	CELL_FIN,
	CELL_JELLY_CORE,
	CELL_JELLY_DOME,
	CELL_JELLY_FRILL,
	CELL_JELLY_RIM,
	CELL_MARK,
	CELL_RIDGE,
} from "./glyphs";
import { clamp, smoothstep, wrapAngle } from "./math";

export type SwimmerKind = "hammerhead" | "manta" | "whaleshark" | "classic";

export interface SpineNode {
	x: number;
	y: number;
	ang: number;
	ca: number;
	sa: number;
}

export interface Swimmer {
	id: number;
	kind: SwimmerKind;
	len: number;
	segLen: number;
	x: number;
	y: number;
	heading: number;
	targetHeading: number;
	speed: number;
	phase: number;
	depth: number;
	nodes: SpineNode[];
}

export interface Jellyfish {
	id: number;
	x: number;
	y: number;
	heading: number;
	turnVel: number;
	radius: number;
	phase: number;
	pulseFreq: number;
	paletteIdx: number;
	depth: number;
	/** Recent headings, newest first; tentacles and oral arms follow them with a delay. */
	trailAngles: Float32Array;
}

export interface SwimmerHit {
	flag: number;
	shade: number;
	s: number;
	u: number;
}

export interface JellyHit {
	flag: number;
	shade: number;
	su: number;
	sv: number;
}

/** Bell size of a jellyfish this frame; the bell narrows and lengthens as it pulses. */
export function jellyBell(jf: Jellyfish) {
	const pulse = Math.sin(jf.phase);
	return { bellW: jf.radius * (1 - 0.13 * pulse), bellH: jf.radius * (0.72 + 0.15 * pulse) };
}

/** Half-width of a backward-swept pectoral fin rooted between s0 and s1 with its tip at sTip. */
function sweptFinHalf(s: number, av: number, s0: number, s1: number, sTip: number, maxSpan: number): number {
	if (s < s0 || s > sTip) return 0;
	const leadSpan = maxSpan * Math.pow(clamp((s - s0) / (sTip - s0), 0, 1), 0.78);
	if (s <= s1) return leadSpan;
	const innerCut = maxSpan * Math.pow(clamp((s - s1) / (sTip - s1), 0, 1), 1.35);
	return av >= innerCut * 0.78 ? leadSpan : 0;
}

export function sampleSwimmer(sw: Swimmer, px: number, py: number, segHint: number): SwimmerHit | null {
	const nodes = sw.nodes;
	let bestD2 = Infinity;
	let bestK = 0;
	let bestAlong = 0;
	let bestLat = 0;
	const kStart = Math.max(0, segHint - 4);
	const kEnd = Math.min(nodes.length - 2, segHint + 4);
	for (let k = kStart; k <= kEnd; k++) {
		const a = nodes[k];
		const dx = px - a.x;
		const dy = py - a.y;
		const along = clamp(dx * a.ca + dy * a.sa, 0, sw.segLen);
		const ex = dx - a.ca * along;
		const ey = dy - a.sa * along;
		const d2 = ex * ex + ey * ey;
		if (d2 < bestD2) {
			bestD2 = d2;
			bestK = k;
			bestAlong = along;
			bestLat = -dx * a.sa + dy * a.ca;
		}
	}

	const s = clamp((bestK * sw.segLen + bestAlong) / sw.len, 0, 1);
	const v = bestLat / sw.len;
	const av = Math.abs(v);
	let bodyHalf = 0;
	let finHalf = 0;

	if (sw.kind === "manta") {
		// Diamond disc with curved wings, two cephalic lobes ahead and a thin tail behind.
		if (s < 0.075) {
			bodyHalf = 0.044 + 0.03 * smoothstep(0, 0.075, s);
			if (av > 0.044 && av < 0.086) finHalf = 0.086 * smoothstep(0, 0.04, s + 0.02);
		} else if (s < 0.58) {
			const t = (s - 0.075) / 0.505;
			bodyHalf = 0.016 + 0.068 * Math.sin(t * Math.PI);
			const flap = 1 + 0.055 * Math.sin(sw.phase - av * 3.4);
			const lead = smoothstep(0, 0.46, t);
			const trail = Math.pow(Math.max(0, 1 - Math.max(0, t - 0.34) / 0.66), 1.35);
			finHalf = 0.54 * lead * trail * flap;
		} else {
			bodyHalf = 0.01 * Math.max(0, 1 - (s - 0.58) / 0.42);
		}
		const maxHalf = Math.max(bodyHalf, finHalf);
		if (av > maxHalf || maxHalf < 0.003) return null;
		let flag = av <= bodyHalf ? CELL_BODY : CELL_FIN;
		const chevron = s > 0.15 && s < 0.29 && av > 0.042 && av < 0.16 && Math.abs(av - (s - 0.09) * 0.65) < 0.028;
		const domeZ = Math.sqrt(Math.max(0.05, 1 - Math.pow(av / Math.max(0.01, maxHalf), 1.65)));
		const shade = clamp(0.36 + domeZ * 0.5 + (bestLat < 0 ? 0.12 : -0.06) + (chevron ? 0.24 : 0), 0.12, 1);
		if (s > 0.12 && s < 0.44 && av < 0.01) flag = CELL_RIDGE;
		return { flag, shade, s, u: v / Math.max(0.01, maxHalf) };
	}

	let tailNotch = 0;
	if (sw.kind === "hammerhead") {
		if (s < 0.065) {
			// Wide T-shaped head (cephalofoil).
			bodyHalf = 0.048 + 0.142 * Math.pow(Math.sin((s / 0.065) * Math.PI), 0.52);
		} else if (s < 0.28) {
			bodyHalf = 0.072 + 0.024 * smoothstep(0.065, 0.25, s);
		} else if (s < 0.82) {
			bodyHalf = 0.016 + 0.08 * Math.pow(1 - (s - 0.28) / 0.54, 1.22);
		} else {
			const kt = (s - 0.82) / 0.18;
			finHalf = 0.016 + 0.115 * Math.pow(kt, 0.82);
			tailNotch = kt > 0.38 ? (kt - 0.38) * 0.14 : 0;
			bodyHalf = 0.015 * (1 - kt);
		}
		finHalf = Math.max(finHalf, sweptFinHalf(s, av, 0.18, 0.32, 0.43, 0.26));
		if (s > 0.54 && s < 0.65) finHalf = Math.max(finHalf, sweptFinHalf(s, av, 0.54, 0.6, 0.65, 0.082));
	} else if (sw.kind === "whaleshark") {
		if (s < 0.09) bodyHalf = 0.098 * Math.pow(Math.sin(((s / 0.09) * Math.PI) / 2), 0.42);
		else if (s < 0.34) bodyHalf = 0.098 + 0.026 * smoothstep(0.09, 0.3, s);
		else if (s < 0.83) bodyHalf = 0.019 + 0.105 * Math.pow(1 - (s - 0.34) / 0.49, 1.12);
		else {
			const kt = (s - 0.83) / 0.17;
			finHalf = 0.019 + 0.112 * Math.pow(kt, 0.85);
			tailNotch = kt > 0.4 ? (kt - 0.4) * 0.13 : 0;
			bodyHalf = 0.017 * (1 - kt);
		}
		finHalf = Math.max(finHalf, sweptFinHalf(s, av, 0.18, 0.36, 0.48, 0.26));
		if (s > 0.58 && s < 0.69) finHalf = Math.max(finHalf, sweptFinHalf(s, av, 0.58, 0.64, 0.69, 0.088));
	} else {
		if (s < 0.13) bodyHalf = 0.084 * Math.pow(Math.sin(((s / 0.13) * Math.PI) / 2), 0.88);
		else if (s < 0.3) bodyHalf = 0.084 + 0.016 * smoothstep(0.13, 0.3, s);
		else if (s < 0.83) bodyHalf = 0.016 + 0.084 * Math.pow(1 - (s - 0.3) / 0.53, 1.24);
		else {
			const kt = (s - 0.83) / 0.17;
			finHalf = 0.016 + 0.105 * Math.pow(kt, 0.84);
			tailNotch = kt > 0.36 ? (kt - 0.36) * 0.13 : 0;
			bodyHalf = 0.015 * (1 - kt);
		}
		finHalf = Math.max(finHalf, sweptFinHalf(s, av, 0.19, 0.33, 0.44, 0.24));
		if (s > 0.55 && s < 0.65) finHalf = Math.max(finHalf, sweptFinHalf(s, av, 0.55, 0.6, 0.65, 0.075));
	}

	if (tailNotch > 0 && av < tailNotch && av > bodyHalf) return null;
	const maxHalf = Math.max(bodyHalf, finHalf);
	if (av > maxHalf || maxHalf < 0.003) return null;

	let flag = av <= bodyHalf ? CELL_BODY : CELL_FIN;
	if (flag === CELL_BODY && s > 0.24 && s < 0.44 && av < 0.011) flag = CELL_RIDGE;
	if (flag === CELL_BODY && sw.kind === "whaleshark" && s > 0.14 && s < 0.76) {
		// Pale spot lattice; gill slits near the head.
		if (Math.sin(s * 88) * Math.cos(v * 95) > 0.58) flag = CELL_RIDGE;
		else if (s < 0.23 && av > bodyHalf * 0.58 && Math.sin(s * 210) > 0.5) flag = CELL_MARK;
	} else if (flag === CELL_BODY && s > 0.13 && s < 0.21 && av > bodyHalf * 0.58 && Math.sin(s * 230) > 0.55) {
		flag = CELL_MARK;
	}

	const cylZ = Math.sqrt(Math.max(0.04, 1 - Math.pow(av / Math.max(0.01, maxHalf), 1.8)));
	const sideLight = bestLat < 0 ? 0.14 : -0.1;
	const shade = clamp((flag === CELL_FIN ? 0.24 + cylZ * 0.45 : 0.34 + cylZ * 0.56) + sideLight, 0.08, 1);
	return { flag, shade, s, u: v / Math.max(0.01, maxHalf) };
}

/**
 * Jellyfish bell (scalloped dome with rim and inner core) and the ruffled oral arms below it.
 * (fx, fy) is the heading, (rx, ry) the lateral axis.
 */
export function sampleJelly(
	jf: Jellyfish,
	px: number,
	py: number,
	fx: number,
	fy: number,
	rx: number,
	ry: number,
	bellW: number,
	bellH: number,
): JellyHit | null {
	const dx = px - jf.x;
	const dy = py - jf.y;
	const fwd = dx * fx + dy * fy;
	const lat = dx * rx + dy * ry;
	const u = lat / bellW;
	const v = fwd / bellH;

	const scallop = -0.2 + 0.055 * Math.cos(u * Math.PI * 5);
	if (v >= scallop && v <= 1.04 && Math.abs(u) <= 1.05) {
		const nv = Math.max(0, (v - scallop) / (1 - scallop));
		const profile = Math.sqrt(Math.max(0, 1 - Math.pow(nv, 1.85)));
		const radial = Math.abs(u) / Math.max(0.04, profile);
		if (radial <= 1) {
			const z = Math.sqrt(Math.max(0.02, 1 - radial * radial));
			const rib = 0.5 + 0.5 * Math.cos(u * Math.PI * 7);
			if (radial > 0.8 || v < scallop + 0.11 || nv > 0.9) {
				return { flag: CELL_JELLY_RIM, shade: clamp(0.78 + (1 - z) * 0.22, 0.18, 1), su: u, sv: v };
			}
			if (radial < 0.46 && nv > 0.16 && nv < 0.62) {
				return { flag: CELL_JELLY_CORE, shade: clamp(0.68 + 0.22 * Math.sin(u * Math.PI * 4), 0.18, 1), su: u, sv: v };
			}
			const shade = 0.34 + z * 0.42 + (rib > 0.78 ? 0.16 : 0) + (u < 0 ? 0.08 : -0.04);
			return { flag: CELL_JELLY_DOME, shade: clamp(shade, 0.18, 1), su: u, sv: v };
		}
	}

	const armLen = jf.radius * 1.72;
	const behind = -fwd - bellH * 0.1;
	if (behind < 0 || behind > armLen) return null;
	const frac = behind / armLen;
	const lag = wrapAngle(jf.trailAngles[Math.min(17, Math.floor(frac * 12))] - jf.heading);
	const sway = Math.sin(lag) * behind * 0.55 + Math.sin(jf.phase * 1.1 - frac * 4.8) * (4 + frac * 11);
	const relLat = lat - sway;
	const ruffle = 1 + 0.26 * Math.sin(frac * 19 - jf.phase * 1.4) + 0.18 * Math.cos(relLat * 0.22 + frac * 11);
	const halfW = bellW * 0.54 * Math.pow(1 - frac * 0.76, 0.72) * ruffle;
	if (Math.abs(relLat) > halfW || halfW <= 1.5) return null;
	const edge = 1 - Math.abs(relLat) / halfW;
	const fold = 0.5 + 0.5 * Math.cos((relLat / Math.max(4, halfW)) * Math.PI * 3.5 + frac * 8 - jf.phase);
	const shade = clamp((0.35 + edge * 0.42 + fold * 0.28) * (1 - frac * 0.38), 0.16, 0.98);
	return { flag: CELL_JELLY_FRILL, shade, su: relLat / Math.max(4, bellW), sv: -frac };
}
