export type ModeKey = "pastel" | "distortion" | "abyss";
export type Rgb = [number, number, number];

export interface JellyPalette {
	dome: Rgb;
	rim: Rgb;
	core: Rgb;
	frill: Rgb;
}

export interface Mode {
	/** Water colour at the lit surface, the mid column and the dark floor. */
	waterSurface: string;
	waterMid: string;
	waterFloor: string;
	gridStroke: string;
	wakeRgb: Rgb;
	accents: string[];
	jellyPalettes: JellyPalette[];
	rippleColors: string[];
}

export const MODE_ORDER: ModeKey[] = ["pastel", "distortion", "abyss"];

export const MODES: Record<ModeKey, Mode> = {
	pastel: {
		waterSurface: "#123142",
		waterMid: "#0a1b29",
		waterFloor: "#03080f",
		gridStroke: "rgba(130, 188, 212, 0.042)",
		wakeRgb: [123, 227, 245],
		accents: ["#b7afe8", "#7be3f5", "#94e0cf", "#f2a7d0", "#a6d8f5"],
		jellyPalettes: [
			{ dome: [142, 198, 226], rim: [190, 238, 252], core: [198, 184, 246], frill: [214, 236, 250] },
			{ dome: [168, 158, 228], rim: [216, 204, 255], core: [138, 230, 242], frill: [232, 212, 252] },
			{ dome: [122, 208, 196], rim: [176, 246, 232], core: [188, 180, 242], frill: [204, 246, 238] },
			{ dome: [208, 154, 196], rim: [246, 196, 228], core: [148, 224, 245], frill: [246, 218, 238] },
		],
		rippleColors: ["#7be3f5", "#b7afe8", "#f2a7d0"],
	},
	distortion: {
		waterSurface: "#0d3036",
		waterMid: "#071a21",
		waterFloor: "#02080c",
		gridStroke: "rgba(72, 218, 194, 0.046)",
		wakeRgb: [0, 245, 212],
		accents: ["#00f5d4", "#38ef7d", "#64dfdf", "#80ffdb", "#b8f2e6"],
		jellyPalettes: [
			{ dome: [56, 212, 196], rim: [136, 255, 236], core: [82, 242, 156], frill: [186, 255, 242] },
			{ dome: [72, 196, 224], rim: [148, 244, 255], core: [0, 245, 212], frill: [196, 250, 255] },
			{ dome: [64, 218, 154], rim: [152, 255, 204], core: [112, 238, 248], frill: [204, 255, 228] },
		],
		rippleColors: ["#00f5d4", "#38ef7d", "#80ffdb"],
	},
	abyss: {
		waterSurface: "#0f2533",
		waterMid: "#08141e",
		waterFloor: "#02060b",
		gridStroke: "rgba(110, 158, 184, 0.032)",
		wakeRgb: [102, 182, 210],
		accents: ["#79b8d1", "#8ba2c9", "#7abfb8"],
		jellyPalettes: [
			{ dome: [106, 162, 190], rim: [154, 208, 230], core: [136, 166, 212], frill: [176, 214, 232] },
			{ dome: [114, 146, 192], rim: [164, 194, 232], core: [118, 186, 204], frill: [182, 206, 234] },
		],
		rippleColors: ["#79b8d1", "#8ba2c9"],
	},
};
