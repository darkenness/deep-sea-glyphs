// Drag the left or right edge of the writing card to resize it; double-click an edge for full width.
import { t } from "../i18n";
import { clamp } from "../ocean/math";
import type DeepSeaPlugin from "../main";

const EDGE_BAND_PX = 10;
const MIN_WIDTH_PX = 560;

interface EdgeHit {
	centerX: number;
	maxWidth: number;
}

export class CardResizer {
	private drag: EdgeHit | null = null;
	private hud: HTMLElement;
	private hudTimer = 0;

	constructor(private plugin: DeepSeaPlugin) {
		this.hud = document.body.createDiv("deep-sea-resize-hud");
		const opts = { capture: true };
		plugin.registerDomEvent(window, "pointermove", (ev) => this.onMove(ev));
		plugin.registerDomEvent(window, "pointerdown", (ev) => this.onDown(ev), opts);
		plugin.registerDomEvent(window, "pointerup", () => this.endDrag());
		plugin.registerDomEvent(window, "blur", () => this.endDrag());
		plugin.registerDomEvent(window, "dblclick", (ev) => this.onDoubleClick(ev), opts);
	}

	/** Is the pointer within EDGE_BAND_PX of the active Markdown card's left or right border? */
	private hitTest(x: number, y: number): EdgeHit | null {
		const s = this.plugin.settings;
		if (!s.enabled || !s.editorCardMode) return null;
		const leaf = document.querySelector(".workspace-split.mod-root .workspace-leaf.mod-active .workspace-leaf-content[data-type='markdown']");
		const sizer = leaf?.querySelector(".markdown-source-view.mod-cm6 .cm-sizer, .markdown-preview-view .markdown-preview-sizer");
		const content = leaf?.querySelector(".view-content");
		if (!sizer || !content) return null;
		const view = content.getBoundingClientRect();
		// Ignore the scrollbar and the area above or below the editor.
		if (y < view.top + 8 || y > view.bottom - 8 || x > view.right - 16) return null;
		const card = sizer.getBoundingClientRect();
		if (Math.abs(x - card.left) > EDGE_BAND_PX && Math.abs(x - card.right) > EDGE_BAND_PX) return null;
		return { centerX: (card.left + card.right) / 2, maxWidth: Math.max(580, view.width - 32) };
	}

	private onMove(ev: PointerEvent): void {
		const s = this.plugin.settings;
		if (!this.drag) {
			document.body.toggleClass("deep-sea-edge-hover", this.hitTest(ev.clientX, ev.clientY) !== null);
			return;
		}
		// The card stays centred, so its width is twice the pointer's distance from the centre.
		s.editorWidthPx = Math.round(clamp(Math.abs(ev.clientX - this.drag.centerX) * 2, MIN_WIDTH_PX, this.drag.maxWidth));
		s.editorFullWidth = false;
		this.plugin.syncCss();
		this.showHud(t.hudWidth(s.editorWidthPx));
	}

	private onDown(ev: PointerEvent): void {
		if (ev.button !== 0) return;
		const hit = this.hitTest(ev.clientX, ev.clientY);
		if (!hit) return;
		ev.preventDefault();
		ev.stopPropagation();
		this.drag = hit;
		document.body.addClass("deep-sea-resizing");
	}

	private endDrag(): void {
		if (!this.drag) return;
		this.drag = null;
		document.body.removeClass("deep-sea-resizing");
		void this.plugin.saveSettings();
	}

	private onDoubleClick(ev: MouseEvent): void {
		if (!this.hitTest(ev.clientX, ev.clientY)) return;
		ev.preventDefault();
		ev.stopPropagation();
		void this.plugin.toggleFullWidth();
	}

	showHud(text: string): void {
		this.hud.setText(text);
		this.hud.addClass("is-visible");
		window.clearTimeout(this.hudTimer);
		this.hudTimer = window.setTimeout(() => {
			if (!this.drag) this.hud.removeClass("is-visible");
		}, 1500);
	}

	destroy(): void {
		window.clearTimeout(this.hudTimer);
		document.body.removeClass("deep-sea-edge-hover", "deep-sea-resizing");
		this.hud.remove();
	}
}
