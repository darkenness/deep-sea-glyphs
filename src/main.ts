import { App, Notice, Plugin } from "obsidian";
import { t } from "./i18n";
import { MODE_ORDER, ModeKey } from "./modes";
import { DEFAULT_SETTINGS, DeepSeaSettings, DeepSeaSettingTab } from "./settings";
import { OceanEngine } from "./ocean/engine";
import { caretActivityExtension, CaretHud } from "./editor/caret";
import { CardResizer } from "./editor/card-resize";
import { loadCursorPreset } from "./cursor-smith";

const BODY_CLASSES = ["deep-sea-active", "deep-sea-card-mode", "deep-sea-card-blur", "deep-sea-full-width"];
const DARK_THEME = "obsidian";
const LIGHT_THEME = "moonstone";

/** Base-theme switching is not in the public API; these are the app methods Obsidian uses itself. */
interface ThemeApp {
	changeTheme?(theme: string): void;
	vault: { getConfig?(key: string): unknown };
}

export default class DeepSeaPlugin extends Plugin {
	settings: DeepSeaSettings = { ...DEFAULT_SETTINGS };
	engine: OceanEngine | null = null;
	caretHud!: CaretHud;
	private cardResizer!: CardResizer;
	private root!: HTMLElement;
	private statusBar!: HTMLElement;
	private lastRippleMs = 0;

	async onload(): Promise<void> {
		this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<DeepSeaSettings>) };

		this.root = createDiv("deep-sea-bg-root");
		const canvas = this.root.createEl("canvas", { cls: "deep-sea-bg-canvas" });
		this.root.createDiv("deep-sea-bg-dim");
		// Behind everything, before the title bar, so window dragging keeps working.
		document.body.prepend(this.root);
		this.engine = new OceanEngine(canvas, () => this.settings);
		this.caretHud = new CaretHud();
		this.cardResizer = new CardResizer(this);

		this.addRibbonIcon("waves", t.ribbon, () => this.setEnabled(!this.settings.enabled, true));
		this.statusBar = this.addStatusBarItem();
		this.statusBar.addClass("deep-sea-status");
		this.statusBar.setAttr("aria-label", t.statusTitle);
		this.registerDomEvent(this.statusBar, "click", () => (this.settings.enabled ? this.cycleMode() : this.setEnabled(true, true)));
		this.registerDomEvent(this.statusBar, "contextmenu", (ev) => {
			ev.preventDefault();
			void this.setEnabled(!this.settings.enabled, true);
		});

		this.addCommand({ id: "toggle-background", name: t.cmdToggle, callback: () => this.setEnabled(!this.settings.enabled, true) });
		this.addCommand({ id: "cycle-mood", name: t.cmdCycle, callback: () => this.cycleMode() });
		this.addCommand({ id: "toggle-full-width", name: t.cmdFullWidth, callback: () => this.toggleFullWidth() });
		this.addCommand({ id: "toggle-pause", name: t.cmdPause, callback: () => this.togglePause() });

		this.registerDomEvent(window, "pointermove", (ev) => {
			if (this.settings.enabled) this.engine?.onPointerMove(ev.clientX, ev.clientY);
		});
		this.registerDomEvent(window, "blur", () => {
			this.caretHud.hide();
			this.engine?.onPointerLeave();
			this.engine?.setWindowFocused(false);
		});
		this.registerDomEvent(window, "focus", () => this.engine?.setWindowFocused(true));
		this.registerDomEvent(document, "visibilitychange", () => this.engine?.syncLoop());

		this.registerEditorExtension(
			caretActivityExtension(
				() => this.settings.enabled,
				(x, y, isEnter) => this.onCaretActivity(x, y, isEnter),
			),
		);
		this.addSettingTab(new DeepSeaSettingTab(this.app, this));

		this.applyVisibility();
		this.syncCss();
		this.updateStatusBar();
		this.app.workspace.onLayoutReady(() => {
			if (this.settings.enabled && this.settings.autoSwitchDarkTheme) this.useDarkTheme(true);
			this.engine?.syncLoop();
		});
	}

	onunload(): void {
		document.body.removeClass(...BODY_CLASSES);
		for (const name of ["--deep-sea-dim", "--deep-sea-sidebar-alpha", "--deep-sea-card-alpha", "--deep-sea-editor-width"]) {
			document.body.style.removeProperty(name);
		}
		this.engine?.destroy();
		this.engine = null;
		this.caretHud.destroy();
		this.cardResizer.destroy();
		this.root.remove();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Pushes card and dimming settings to CSS variables and body classes. */
	syncCss(): void {
		const s = this.settings;
		document.body.setCssProps({
			"--deep-sea-dim": String(s.dimming),
			"--deep-sea-sidebar-alpha": String(s.sidebarAlpha),
			"--deep-sea-card-alpha": String(s.editorCardAlpha),
			"--deep-sea-editor-width": `${s.editorWidthPx}px`,
		});
		document.body.toggleClass("deep-sea-card-mode", s.enabled && s.editorCardMode);
		document.body.toggleClass("deep-sea-card-blur", s.enabled && s.editorCardBlur);
		document.body.toggleClass("deep-sea-full-width", s.enabled && s.editorFullWidth);
	}

	private applyVisibility(): void {
		document.body.toggleClass("deep-sea-active", this.settings.enabled);
		this.root.toggleClass("is-hidden", !this.settings.enabled);
		if (!this.settings.enabled) this.caretHud.hide();
	}

	async setEnabled(enabled: boolean, notify = false): Promise<void> {
		this.settings.enabled = enabled;
		if (this.settings.autoSwitchDarkTheme) this.useDarkTheme(enabled);
		this.applyVisibility();
		this.syncCss();
		this.engine?.syncLoop();
		this.updateStatusBar();
		await this.saveSettings();
		if (notify) new Notice(enabled ? t.noticeOn : t.noticeOff);
	}

	async applyMode(mode: ModeKey, notify = false): Promise<void> {
		this.settings.mode = mode;
		await this.saveSettings();
		this.engine?.paintBackdrop();
		this.updateStatusBar();
		if (this.settings.linkCursorSmith) await loadCursorPreset(this.app, mode);
		if (notify) new Notice(t.noticeMode(t.modeNames[mode]));
	}

	private cycleMode(): Promise<void> {
		const next = MODE_ORDER[(MODE_ORDER.indexOf(this.settings.mode) + 1) % MODE_ORDER.length];
		return this.applyMode(next, true);
	}

	async toggleFullWidth(): Promise<void> {
		const s = this.settings;
		s.editorFullWidth = !s.editorFullWidth;
		this.syncCss();
		await this.saveSettings();
		this.cardResizer.showHud(s.editorFullWidth ? t.hudFull : t.hudRestored(s.editorWidthPx));
	}

	private async togglePause(): Promise<void> {
		this.settings.paused = !this.settings.paused;
		await this.saveSettings();
		this.engine?.syncLoop();
		this.updateStatusBar();
		new Notice(this.settings.paused ? t.noticePaused : t.noticeResumed);
	}

	private onCaretActivity(x: number, y: number, isEnter: boolean): void {
		const now = performance.now();
		// Newlines always ripple; plain keystrokes at most every 75 ms.
		if (this.settings.typingRipples && (isEnter || now - this.lastRippleMs > 75)) {
			this.lastRippleMs = now;
			this.engine?.spawnRipple(x, y, isEnter ? 1.45 : 0.62);
		}
		if (this.settings.anchorTarget) this.caretHud.show(x, y);
	}

	/** Switches the base theme to dark, or back to the one that was active before. */
	private useDarkTheme(dark: boolean): void {
		const app = this.app as App & ThemeApp;
		if (typeof app.changeTheme !== "function") return;
		const current = app.vault.getConfig?.("theme");
		if (dark) {
			// Remember the starting theme only on a real switch, so a restart in dark mode keeps it.
			if (current === DARK_THEME) return;
			this.settings.previousTheme = typeof current === "string" && current ? current : LIGHT_THEME;
			app.changeTheme(DARK_THEME);
		} else {
			if (this.settings.previousTheme && current === DARK_THEME) app.changeTheme(this.settings.previousTheme);
			this.settings.previousTheme = "";
		}
	}

	private updateStatusBar(): void {
		const s = this.settings;
		if (!s.enabled) {
			this.statusBar.setText(`🪼 ${t.statusOff}`);
			return;
		}
		this.statusBar.setText(`🪼 ${t.modeNames[s.mode]}${s.paused ? ` · ${t.paused}` : ""}`);
	}
}
