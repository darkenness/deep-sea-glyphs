import { App, PluginSettingTab, Setting } from "obsidian";
import { t } from "./i18n";
import { MODE_ORDER, ModeKey } from "./modes";
import { cursorSmith, installCursorPresets } from "./cursor-smith";
import type DeepSeaPlugin from "./main";

export type RenderStyle = "ascii" | "braille" | "blocks" | "hanzi";
export type GridResolution = "ultra" | "fine" | "medium";

export interface DeepSeaSettings {
	enabled: boolean;
	paused: boolean;
	autoSwitchDarkTheme: boolean;
	/** Base theme ("moonstone" or "obsidian") that was active before the background turned dark mode on. */
	previousTheme: string;
	mode: ModeKey;
	renderStyle: RenderStyle;
	gridResolution: GridResolution;
	fpsCap: number;
	oceanSpeed: number;
	jellyfishCount: number;
	largeSwimmerCount: number;
	fishCount: number;
	dimming: number;
	sidebarAlpha: number;
	editorCardMode: boolean;
	editorWidthPx: number;
	editorFullWidth: boolean;
	editorCardAlpha: number;
	editorCardBlur: boolean;
	typingRipples: boolean;
	mouseRipples: boolean;
	anchorTarget: boolean;
	pauseOnBlur: boolean;
	linkCursorSmith: boolean;
}

export const DEFAULT_SETTINGS: DeepSeaSettings = {
	enabled: true,
	paused: false,
	autoSwitchDarkTheme: true,
	previousTheme: "",
	mode: "pastel",
	renderStyle: "ascii",
	gridResolution: "fine",
	fpsCap: 45,
	oceanSpeed: 1.15,
	jellyfishCount: 3,
	largeSwimmerCount: 4,
	fishCount: 68,
	dimming: 0.18,
	sidebarAlpha: 0.44,
	editorCardMode: true,
	editorWidthPx: 960,
	editorFullWidth: false,
	editorCardAlpha: 0.73,
	editorCardBlur: false,
	typingRipples: true,
	mouseRipples: true,
	anchorTarget: true,
	pauseOnBlur: true,
	linkCursorSmith: true,
};

export class DeepSeaSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: DeepSeaPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const p = this.plugin;
		const s = p.settings;
		containerEl.empty();

		const toggle = (text: string[], value: boolean, apply: (v: boolean) => void | Promise<void>) =>
			new Setting(containerEl)
				.setName(text[0])
				.setDesc(text[1])
				.addToggle((tg) =>
					tg.setValue(value).onChange(async (v) => {
						await apply(v);
						await p.saveSettings();
					}),
				);
		const slider = (text: string[], value: number, min: number, max: number, step: number, apply: (v: number) => void) =>
			new Setting(containerEl)
				.setName(text[0])
				.setDesc(text[1])
				.addSlider((sl) =>
					sl
						.setLimits(min, max, step)
						.setValue(value)
						.onChange(async (v) => {
							apply(v);
							await p.saveSettings();
						}),
				);

		new Setting(containerEl).setName(t.headingScene).setHeading();
		toggle(t.enabled, s.enabled, (v) => p.setEnabled(v));
		toggle(t.autoDark, s.autoSwitchDarkTheme, (v) => {
			s.autoSwitchDarkTheme = v;
		});
		new Setting(containerEl)
			.setName(t.mode[0])
			.setDesc(t.mode[1])
			.addDropdown((dd) => {
				for (const key of MODE_ORDER) dd.addOption(key, t.modeNames[key]);
				dd.setValue(s.mode).onChange((v) => p.applyMode(v as ModeKey));
			});
		new Setting(containerEl)
			.setName(t.grid[0])
			.setDesc(t.grid[1])
			.addDropdown((dd) =>
				dd
					.addOptions(t.gridOptions)
					.setValue(s.gridResolution)
					.onChange(async (v) => {
						s.gridResolution = v as GridResolution;
						await p.saveSettings();
						p.engine?.resize(true);
					}),
			);
		new Setting(containerEl)
			.setName(t.style[0])
			.setDesc(t.style[1])
			.addDropdown((dd) =>
				dd
					.addOptions(t.styleOptions)
					.setValue(s.renderStyle)
					.onChange(async (v) => {
						s.renderStyle = v as RenderStyle;
						await p.saveSettings();
					}),
			);
		slider(t.speed, s.oceanSpeed, 0.3, 3, 0.05, (v) => (s.oceanSpeed = v));
		new Setting(containerEl)
			.setName(t.fps[0])
			.setDesc(t.fps[1])
			.addDropdown((dd) => {
				for (const fps of [15, 24, 30, 45, 60]) dd.addOption(String(fps), `${fps} fps`);
				dd.setValue(String(s.fpsCap)).onChange(async (v) => {
					s.fpsCap = Number(v);
					await p.saveSettings();
				});
			});
		slider(t.jellyfish, s.jellyfishCount, 0, 6, 1, (v) => {
			s.jellyfishCount = v;
			p.engine?.rebuildEcosystem();
		});
		slider(t.swimmers, s.largeSwimmerCount, 0, 6, 1, (v) => {
			s.largeSwimmerCount = v;
			p.engine?.rebuildEcosystem();
		});
		slider(t.fish, s.fishCount, 0, 160, 4, (v) => {
			s.fishCount = v;
			p.engine?.rebuildEcosystem();
		});
		toggle(t.pauseOnBlur, s.pauseOnBlur, (v) => {
			s.pauseOnBlur = v;
			p.engine?.syncLoop();
		});

		new Setting(containerEl).setName(t.headingCard).setHeading();
		// Every card setting is a CSS variable or class, so each change ends with syncCss().
		toggle(t.cardMode, s.editorCardMode, (v) => {
			s.editorCardMode = v;
			p.syncCss();
		});
		slider(t.cardWidth, s.editorWidthPx, 580, 1600, 10, (v) => {
			s.editorWidthPx = v;
			s.editorFullWidth = false;
			p.syncCss();
		});
		toggle(t.fullWidth, s.editorFullWidth, (v) => {
			s.editorFullWidth = v;
			p.syncCss();
		});
		slider(t.cardAlpha, s.editorCardAlpha, 0.35, 0.95, 0.02, (v) => {
			s.editorCardAlpha = v;
			p.syncCss();
		});
		toggle(t.cardBlur, s.editorCardBlur, (v) => {
			s.editorCardBlur = v;
			p.syncCss();
		});
		slider(t.dimming, s.dimming, 0, 0.7, 0.02, (v) => {
			s.dimming = v;
			p.syncCss();
		});
		slider(t.sidebarAlpha, s.sidebarAlpha, 0.15, 0.85, 0.02, (v) => {
			s.sidebarAlpha = v;
			p.syncCss();
		});

		new Setting(containerEl).setName(t.headingTyping).setHeading();
		toggle(t.ripples, s.typingRipples, (v) => {
			s.typingRipples = v;
		});
		toggle(t.mouseRipples, s.mouseRipples, (v) => {
			s.mouseRipples = v;
		});
		toggle(t.anchor, s.anchorTarget, (v) => {
			s.anchorTarget = v;
			if (!v) p.caretHud.hide();
		});

		new Setting(containerEl).setName(t.headingCursor).setHeading();
		if (!cursorSmith(this.app)) {
			containerEl.createEl("p", { text: t.csMissing, cls: "setting-item-description" });
			return;
		}
		toggle(t.csLink, s.linkCursorSmith, (v) => {
			s.linkCursorSmith = v;
		});
		new Setting(containerEl)
			.setName(t.csInstall[0])
			.setDesc(t.csInstall[1])
			.addButton((b) => b.setButtonText(t.csInstallButton).onClick(() => installCursorPresets(this.app)));
	}
}
