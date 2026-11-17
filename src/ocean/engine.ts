// Builds on stackedlol/ascii-sharks (MIT, Copyright (c) 2026 drewdi). See THIRD_PARTY_NOTICES.md.
// Simulation and frame loop. Drawing lives in render.ts.
import type { DeepSeaSettings } from "../settings";
import { MODES, Mode } from "../modes";
import { clamp, wrapAngle } from "./math";
import { Jellyfish, Swimmer, SwimmerKind } from "./shapes";
import { paintFrame } from "./render";

interface School {
	x: number;
	y: number;
	ang: number;
	speed: number;
	seed: number;
}

interface MicroFish {
	school: number;
	ox: number;
	oy: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
	glint: number;
}

interface Ripple {
	x: number;
	y: number;
	r: number;
	maxR: number;
	alpha: number;
	color: string;
}

interface Plankton {
	x: number;
	y: number;
	vx: number;
	vy: number;
	phase: number;
	size: number;
}

const SPINE_NODES = 18;
const SPECIES_ORDER: SwimmerKind[] = ["hammerhead", "manta", "whaleshark", "classic", "manta", "hammerhead"];
const CELL_SIZES = { ultra: [6, 9], fine: [7, 10], medium: [9, 13] } as const;

export class OceanEngine {
	readonly ctx: CanvasRenderingContext2D;
	readonly backdrop = createEl("canvas");
	width = 0;
	height = 0;
	dpr = 1;
	cellW = 7;
	cellH = 10;
	cols = 0;
	rows = 0;
	simTime = 0;

	// Per-cell buffers, rebuilt on resize. The wake is a diffusing glow field left by movement.
	wake = new Float32Array(0);
	private wakeNext = new Float32Array(0);
	cellFlag = new Uint8Array(0);
	cellShade = new Float32Array(0);
	cellTile = new Uint32Array(0);
	cellGlyph = new Uint32Array(0);
	cellKey = new Uint32Array(0);
	cellDepth = new Float32Array(0);
	cellDots = new Uint8Array(0);
	cellAngle = new Float32Array(0);

	jellyfish: Jellyfish[] = [];
	swimmers: Swimmer[] = [];
	microFish: MicroFish[] = [];
	ripples: Ripple[] = [];
	plankton: Plankton[] = [];
	private schools: School[] = [];

	private pointer = { x: -9999, y: -9999, active: false };
	private raf = 0;
	private lastFrameMs = 0;
	private focused = true;
	private disposed = false;
	private backdropKey = "";
	private resizeObserver: ResizeObserver;

	constructor(
		private canvas: HTMLCanvasElement,
		readonly settings: () => DeepSeaSettings,
	) {
		const ctx = canvas.getContext("2d", { alpha: false });
		if (!ctx) throw new Error("Canvas 2D context unavailable");
		this.ctx = ctx;
		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(canvas);
		this.resize(true);
		this.rebuildEcosystem();
	}

	get mode(): Mode {
		return MODES[this.settings().mode] ?? MODES.pastel;
	}

	resize(force = false): void {
		if (this.disposed) return;
		const rect = this.canvas.getBoundingClientRect();
		const w = Math.max(1, Math.floor(rect.width || window.innerWidth));
		const h = Math.max(1, Math.floor(rect.height || window.innerHeight));
		const dpr = Math.min(window.devicePixelRatio || 1, 2.25);
		const [cw, ch] = CELL_SIZES[this.settings().gridResolution] ?? CELL_SIZES.fine;
		const same = w === this.width && h === this.height && dpr === this.dpr && cw === this.cellW && ch === this.cellH;
		if (same && !force) return;

		this.width = w;
		this.height = h;
		this.dpr = dpr;
		this.cellW = cw;
		this.cellH = ch;
		this.canvas.width = this.backdrop.width = Math.round(w * dpr);
		this.canvas.height = this.backdrop.height = Math.round(h * dpr);
		this.cols = Math.max(32, Math.ceil(w / cw));
		this.rows = Math.max(20, Math.ceil(h / ch));
		const n = this.cols * this.rows;
		this.wake = new Float32Array(n);
		this.wakeNext = new Float32Array(n);
		this.cellFlag = new Uint8Array(n);
		this.cellShade = new Float32Array(n);
		this.cellTile = new Uint32Array(n);
		this.cellGlyph = new Uint32Array(n);
		this.cellKey = new Uint32Array(n);
		this.cellDepth = new Float32Array(n);
		this.cellDots = new Uint8Array(n);
		this.cellAngle = new Float32Array(n);
		this.backdropKey = "";
		if (this.jellyfish.length) this.render();
	}

	/** Water gradient and hairline cell grid, cached until size or mood changes. */
	paintBackdrop(): void {
		const key = `${this.width}x${this.height}@${this.dpr}:${this.cellW}x${this.cellH}:${this.settings().mode}`;
		if (key === this.backdropKey) return;
		this.backdropKey = key;
		const g = this.backdrop.getContext("2d");
		if (!g) return;
		const { width: W, height: H, dpr, cellW: cw, cellH: ch, mode } = this;

		// Daylight enters from above: brightest at the surface, fading to the dark floor.
		g.setTransform(dpr, 0, 0, dpr, 0, 0);
		const light = g.createRadialGradient(W * 0.5, -H * 0.35, H * 0.2, W * 0.5, -H * 0.35, H * 1.45 + W * 0.25);
		light.addColorStop(0, mode.waterSurface);
		light.addColorStop(0.42, mode.waterMid);
		light.addColorStop(1, mode.waterFloor);
		g.fillStyle = light;
		g.fillRect(0, 0, W, H);

		// One device pixel wide, snapped to pixel centres so lines stay crisp.
		g.setTransform(1, 0, 0, 1, 0, 0);
		g.strokeStyle = mode.gridStroke;
		g.lineWidth = 1;
		g.beginPath();
		for (let c = 0; c <= this.cols; c++) {
			const x = Math.round(c * cw * dpr) + 0.5;
			g.moveTo(x, 0);
			g.lineTo(x, H * dpr);
		}
		for (let r = 0; r <= this.rows; r++) {
			const y = Math.round(r * ch * dpr) + 0.5;
			g.moveTo(0, y);
			g.lineTo(W * dpr, y);
		}
		g.stroke();
	}

	rebuildEcosystem(): void {
		const s = this.settings();
		const w = Math.max(960, this.width);
		const h = Math.max(640, this.height);

		const flankSlots = [0.16, 0.84, 0.5, 0.24, 0.76, 0.38, 0.64, 0.12];
		this.jellyfish = [];
		for (let i = 0; i < clamp(s.jellyfishCount, 0, 8); i++) {
			const heading = -Math.PI * 0.5 + (Math.random() - 0.5) * 0.52;
			this.jellyfish.push({
				id: i + 1,
				x: flankSlots[i % flankSlots.length] * w + (Math.random() - 0.5) * 90,
				y: ((i * 0.37 + 0.22) % 0.88) * h,
				heading,
				turnVel: 0,
				radius: 58 + (i % 3) * 14 + Math.random() * 10,
				phase: i * 1.9 + Math.random() * 1.5,
				pulseFreq: 0.68 + Math.random() * 0.24,
				paletteIdx: i,
				depth: 0.78 + (i % 3) * 0.1,
				trailAngles: new Float32Array(18).fill(heading),
			});
		}

		this.swimmers = [];
		const count = clamp(s.largeSwimmerCount, 0, 6);
		for (let i = 0; i < count; i++) {
			const kind = SPECIES_ORDER[i % SPECIES_ORDER.length];
			const len = (kind === "manta" ? 210 : kind === "whaleshark" ? 255 : 225) + Math.random() * 38;
			const x = ((i + 0.4) / Math.max(1, count)) * w;
			const y = ((i * 0.41 + 0.18) % 0.84) * h;
			const heading = (i % 2 === 0 ? 0.12 : Math.PI - 0.15) + (Math.random() - 0.5) * 0.4;
			const segLen = len / (SPINE_NODES - 1);
			const ca = Math.cos(heading);
			const sa = Math.sin(heading);
			const nodes = Array.from({ length: SPINE_NODES }, (_, k) => ({ x: x - ca * k * segLen, y: y - sa * k * segLen, ang: heading, ca, sa }));
			const speed = kind === "manta" ? 58 + Math.random() * 14 : kind === "whaleshark" ? 64 + Math.random() * 14 : 82 + Math.random() * 18;
			this.swimmers.push({ id: i + 1, kind, len, segLen, x, y, heading, targetHeading: heading, speed, phase: Math.random() * Math.PI * 2, depth: 0.72 + (i % 3) * 0.12, nodes });
		}

		this.schools = [0, 1, 2].map((i) => ({
			x: Math.random() * w,
			y: (0.18 + 0.3 * i) * h,
			ang: (i % 2 === 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.5,
			speed: 68 + i * 10,
			seed: i * 11.7,
		}));
		this.microFish = [];
		for (let i = 0; i < clamp(s.fishCount, 0, 160); i++) {
			const school = i % this.schools.length;
			const sc = this.schools[school];
			const ox = (Math.random() - 0.5) * 150;
			const oy = (Math.random() - 0.5) * 85;
			this.microFish.push({ school, ox, oy, x: sc.x + ox, y: sc.y + oy, vx: Math.cos(sc.ang) * sc.speed, vy: Math.sin(sc.ang) * sc.speed, glint: 0 });
		}

		this.plankton = Array.from({ length: 42 }, () => ({
			x: Math.random() * w,
			y: Math.random() * h,
			vy: -9 - Math.random() * 14,
			vx: (Math.random() - 0.5) * 8,
			phase: Math.random() * Math.PI * 2,
			size: Math.random() < 0.3 ? 1.6 : 1.1,
		}));
	}

	onPointerMove(x: number, y: number): void {
		const dx = x - this.pointer.x;
		const dy = y - this.pointer.y;
		this.pointer = { x, y, active: true };
		if (this.settings().mouseRipples && dx * dx + dy * dy > 42) this.depositWake(x, y, 20, 0.24);
	}

	onPointerLeave(): void {
		this.pointer.active = false;
	}

	/** A ring of light at (x, y) that also pushes nearby fish away. */
	spawnRipple(x: number, y: number, strength: number): void {
		if (this.disposed) return;
		const colors = this.mode.rippleColors;
		this.ripples.push({ x, y, r: 8, maxR: 64 + strength * 76, alpha: clamp(0.46 * strength, 0.18, 0.72), color: colors[Math.floor(Math.random() * colors.length)] });
		if (this.ripples.length > 18) this.ripples.shift();
		this.depositWake(x, y, 34 * strength, 0.78 * strength);
		for (const f of this.microFish) {
			const dx = f.x - x;
			const dy = f.y - y;
			const d2 = dx * dx + dy * dy;
			if (d2 > 4 && d2 < 145 * 145) {
				const d = Math.sqrt(d2);
				const push = (1 - d / 145) * 48 * strength;
				f.vx += (dx / d) * push;
				f.vy += (dy / d) * push;
				f.glint = 1;
			}
		}
	}

	private depositWake(px: number, py: number, radiusPx: number, amount: number): void {
		if (!this.cols) return;
		const cx = Math.floor(px / this.cellW);
		const cy = Math.floor(py / this.cellH);
		const rx = Math.max(1, Math.ceil(radiusPx / this.cellW));
		const ry = Math.max(1, Math.ceil(radiusPx / this.cellH));
		for (let y = clamp(cy - ry, 0, this.rows - 1); y <= clamp(cy + ry, 0, this.rows - 1); y++) {
			const ny = (y - cy) / ry;
			for (let x = clamp(cx - rx, 0, this.cols - 1); x <= clamp(cx + rx, 0, this.cols - 1); x++) {
				const nx = (x - cx) / rx;
				const d2 = nx * nx + ny * ny;
				if (d2 < 1) {
					const i = y * this.cols + x;
					this.wake[i] = Math.min(1.35, this.wake[i] + (1 - d2) * amount);
				}
			}
		}
	}

	setWindowFocused(focused: boolean): void {
		this.focused = focused;
		this.syncLoop();
	}

	private shouldRun(): boolean {
		const s = this.settings();
		return !this.disposed && s.enabled && !s.paused && !document.hidden && (this.focused || !s.pauseOnBlur);
	}

	/** Starts or stops the frame loop to match settings, focus and page visibility. */
	syncLoop(): void {
		if (this.raf) window.cancelAnimationFrame(this.raf);
		this.raf = 0;
		if (!this.shouldRun()) return;
		this.lastFrameMs = performance.now();
		this.raf = window.requestAnimationFrame(this.tick);
	}

	private tick = (now: number): void => {
		this.raf = 0;
		if (!this.shouldRun()) return;
		const s = this.settings();
		const elapsed = now - this.lastFrameMs;
		if (elapsed >= (1000 / clamp(s.fpsCap, 12, 60)) * 0.92) {
			this.lastFrameMs = now;
			this.step(Math.min(0.075, elapsed / 1000) * clamp(s.oceanSpeed, 0.25, 3.5));
			this.render();
		}
		this.raf = window.requestAnimationFrame(this.tick);
	};

	render(): void {
		if (!this.cols) return;
		this.paintBackdrop();
		paintFrame(this);
	}

	private step(dt: number): void {
		this.simTime += dt;
		this.stepWake(dt);
		for (let i = this.ripples.length - 1; i >= 0; i--) {
			const rp = this.ripples[i];
			rp.r += dt * 155;
			rp.alpha *= Math.pow(0.1, dt);
			if (rp.r >= rp.maxR || rp.alpha < 0.02) this.ripples.splice(i, 1);
		}
		for (const jf of this.jellyfish) this.stepJelly(jf, dt);
		for (const sw of this.swimmers) this.stepSwimmer(sw, dt);
		this.stepFish(dt);
		const { width: w, height: h } = this;
		for (const p of this.plankton) {
			p.x += (p.vx + Math.sin(this.simTime * 0.65 + p.phase) * 3.5) * dt;
			p.y += p.vy * dt;
			if (p.y < -8) {
				p.y = h + 8;
				p.x = Math.random() * w;
			}
			if (p.x < 0) p.x = w;
			else if (p.x > w) p.x = 0;
		}
	}

	/** Diffuse the wake to its four neighbours and let it decay. */
	private stepWake(dt: number): void {
		const { wake, wakeNext: next, cols, rows } = this;
		const decay = Math.pow(0.32, dt);
		for (let y = 0; y < rows; y++) {
			const row = y * cols;
			const up = Math.max(0, y - 1) * cols;
			const down = Math.min(rows - 1, y + 1) * cols;
			for (let x = 0; x < cols; x++) {
				const left = x > 0 ? x - 1 : x;
				const right = x < cols - 1 ? x + 1 : x;
				next[row + x] = (wake[row + x] * 0.56 + (wake[row + left] + wake[row + right] + wake[up + x] + wake[down + x]) * 0.11) * decay;
			}
		}
		this.wake = next;
		this.wakeNext = wake;
	}

	/** Pulsed jet swimming: speed peaks on each bell contraction, heading drifts upward. */
	private stepJelly(jf: Jellyfish, dt: number): void {
		const { width: w, height: h, simTime } = this;
		jf.phase += dt * jf.pulseFreq * Math.PI * 2;
		const jet = Math.pow(Math.max(0, Math.sin(jf.phase)), 1.45);
		const speed = 16 + jet * 48;
		jf.turnVel += (Math.sin(simTime * 0.35 + jf.id * 2.3) * 0.22 - jf.turnVel) * dt * 1.4;
		jf.heading += jf.turnVel * dt;
		jf.heading += wrapAngle(-Math.PI * 0.5 + Math.sin(simTime * 0.16 + jf.id * 1.7) * 0.52 - jf.heading) * dt * 0.32;
		jf.x += Math.cos(jf.heading) * speed * dt;
		jf.y += Math.sin(jf.heading) * speed * dt;

		const ta = jf.trailAngles;
		ta[0] = jf.heading;
		for (let k = 1; k < ta.length; k++) ta[k] += wrapAngle(ta[k - 1] - ta[k]) * Math.min(1, dt * 5.2);

		if (jet > 0.55) {
			const back = jf.radius * 0.45;
			this.depositWake(jf.x - Math.cos(jf.heading) * back, jf.y - Math.sin(jf.heading) * back, jf.radius * 0.48, 0.07 * dt * 28);
		}

		const margin = jf.radius * 3.1;
		if (jf.y < -margin) {
			jf.y = h + margin * 0.72;
			jf.x = (0.1 + 0.8 * Math.random()) * w;
			ta.fill(jf.heading);
		} else if (jf.y > h + margin * 1.2) {
			jf.y = -margin * 0.65;
		}
		if (jf.x < -margin) jf.x = w + margin * 0.7;
		else if (jf.x > w + margin) jf.x = -margin * 0.7;
	}

	/** Head steers (wander, walls, pointer); the spine follows like a chain with a travelling wave. */
	private stepSwimmer(sw: Swimmer, dt: number): void {
		const { width: w, height: h } = this;
		sw.phase += dt * (sw.kind === "manta" ? 2.55 : 4.15);
		if (Math.random() < dt * 0.48) sw.targetHeading = sw.heading + (Math.random() - 0.5) * 0.85;
		const pad = 135;
		const jitter = () => (Math.random() - 0.5) * 0.55;
		if (sw.x < pad) sw.targetHeading = jitter();
		else if (sw.x > w - pad) sw.targetHeading = Math.PI + jitter();
		if (sw.y < pad) sw.targetHeading = Math.PI * 0.5 + jitter();
		else if (sw.y > h - pad) sw.targetHeading = -Math.PI * 0.5 + jitter();
		if (this.pointer.active) {
			const dx = sw.x - this.pointer.x;
			const dy = sw.y - this.pointer.y;
			const d2 = dx * dx + dy * dy;
			if (d2 < 165 * 165 && d2 > 4) sw.targetHeading = Math.atan2(dy, dx);
		}

		sw.heading += clamp(wrapAngle(sw.targetHeading - sw.heading), -1.45 * dt, 1.45 * dt);
		const moveAng = sw.heading + Math.sin(sw.phase) * (sw.kind === "manta" ? 0.03 : 0.085);
		sw.x += Math.cos(moveAng) * sw.speed * dt;
		sw.y += Math.sin(moveAng) * sw.speed * dt;

		const nodes = sw.nodes;
		Object.assign(nodes[0], { x: sw.x, y: sw.y, ang: moveAng, ca: Math.cos(moveAng), sa: Math.sin(moveAng) });
		for (let k = 1; k < nodes.length; k++) {
			const prev = nodes[k - 1];
			const cur = nodes[k];
			const amp = sw.kind === "manta" ? 0.012 : 0.038 * (k / nodes.length);
			const ang = Math.atan2(prev.y - cur.y, prev.x - cur.x) + Math.sin(sw.phase - k * 0.36) * amp;
			cur.ang = ang;
			cur.ca = Math.cos(ang);
			cur.sa = Math.sin(ang);
			cur.x = prev.x - cur.ca * sw.segLen;
			cur.y = prev.y - cur.sa * sw.segLen;
		}
		for (let k = nodes.length - 4; k < nodes.length; k++) this.depositWake(nodes[k].x, nodes[k].y, 12, 0.038 * dt * 28);
	}

	/** Each fish springs toward its slot around a wandering school leader and flees swimmers and the pointer. */
	private stepFish(dt: number): void {
		const { width: w, height: h } = this;
		for (const sc of this.schools) {
			sc.ang += Math.sin(this.simTime * 0.42 + sc.seed) * 0.38 * dt;
			if (sc.x < 90) sc.ang += wrapAngle(0 - sc.ang) * dt * 1.6;
			else if (sc.x > w - 90) sc.ang += wrapAngle(Math.PI - sc.ang) * dt * 1.6;
			if (sc.y < 80) sc.ang += wrapAngle(Math.PI * 0.5 - sc.ang) * dt * 1.6;
			else if (sc.y > h - 80) sc.ang += wrapAngle(-Math.PI * 0.5 - sc.ang) * dt * 1.6;
			sc.x += Math.cos(sc.ang) * sc.speed * dt;
			sc.y += Math.sin(sc.ang) * sc.speed * dt;
		}

		const flee = (f: MicroFish, ox: number, oy: number, radius: number, force: number): boolean => {
			const dx = f.x - ox;
			const dy = f.y - oy;
			const d2 = dx * dx + dy * dy;
			if (d2 >= radius * radius || d2 <= 4) return false;
			const d = Math.sqrt(d2);
			f.vx += (dx / d) * force * dt;
			f.vy += (dy / d) * force * dt;
			return true;
		};

		this.microFish.forEach((f, i) => {
			const sc = this.schools[f.school];
			const turn = sc.ang * 0.25;
			const tx = sc.x + f.ox * Math.cos(turn) - f.oy * Math.sin(turn);
			const ty = sc.y + f.ox * Math.sin(turn) + f.oy * Math.cos(turn);
			f.vx += (tx - f.x) * 1.15 * dt + Math.cos(sc.ang) * 46 * dt;
			f.vy += (ty - f.y) * 1.15 * dt + Math.sin(sc.ang) * 46 * dt;
			for (const sw of this.swimmers) if (flee(f, sw.x, sw.y, 120, 115)) f.glint = Math.min(1, f.glint + dt * 3.5);
			if (this.pointer.active && flee(f, this.pointer.x, this.pointer.y, 105, 130)) f.glint = 1;

			const spd = Math.hypot(f.vx, f.vy) || 1;
			const maxSpd = 74 + (i % 5) * 7 + f.glint * 45;
			const target = Math.max(42, spd + (Math.min(spd, maxSpd) - spd) * Math.min(1, dt * 4.5));
			f.vx = (f.vx / spd) * target;
			f.vy = (f.vy / spd) * target;
			f.x += f.vx * dt;
			f.y += f.vy * dt;
			f.glint = Math.max(0, f.glint - dt * 1.6);

			const cell = Math.floor(f.y / this.cellH) * this.cols + Math.floor(f.x / this.cellW);
			if (cell >= 0 && cell < this.wake.length) this.wake[cell] = Math.min(1.2, this.wake[cell] + 0.014);
		});
	}

	destroy(): void {
		this.disposed = true;
		if (this.raf) window.cancelAnimationFrame(this.raf);
		this.raf = 0;
		this.resizeObserver.disconnect();
	}
}
