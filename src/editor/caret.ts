// Watches typing in the CodeMirror 6 editor and reports the caret position on screen.
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

/** Called once per typing burst with the caret's screen position; isEnter when a newline was typed. */
export type CaretListener = (x: number, y: number, isEnter: boolean) => void;

export function caretActivityExtension(isActive: () => boolean, onActivity: CaretListener) {
	return ViewPlugin.fromClass(
		class {
			update(update: ViewUpdate) {
				// Skip IME composition (pinyin before it is committed) and pastes.
				if (!isActive() || !update.docChanged || update.view.composing) return;
				let inserted = false;
				let isEnter = false;
				let deleted = false;
				for (const tr of update.transactions) {
					if (!tr.docChanged || tr.isUserEvent("input.paste")) continue;
					if (tr.isUserEvent("delete")) deleted = true;
					tr.changes.iterChanges((_fromA, _toA, _fromB, _toB, text) => {
						const s = text.toString();
						if (!s) return;
						inserted = true;
						if (s.includes("\n")) isEnter = true;
					});
				}
				if (!inserted && !deleted) return;
				const view: EditorView = update.view;
				const pos = update.state.selection.main.head;
				// Layout is not measured yet inside update(); read coordinates on the next frame.
				window.requestAnimationFrame(() => {
					if (!view.dom.isConnected) return;
					const coords = view.coordsAtPos(pos);
					if (coords) onActivity(coords.left, (coords.top + coords.bottom) / 2, isEnter);
				});
			}
		},
	);
}

/** Small crosshair with coordinates that follows the caret and fades out after a pause. */
export class CaretHud {
	private el: HTMLElement;
	private badge: HTMLElement;
	private hideTimer = 0;

	constructor() {
		this.el = document.body.createDiv("deep-sea-anchor-hud");
		this.el.createDiv("deep-sea-anchor-reticle");
		this.badge = this.el.createDiv("deep-sea-anchor-badge");
	}

	show(x: number, y: number): void {
		const rx = Math.round(x);
		const ry = Math.round(y);
		this.badge.setText(`X:${rx} Y:${ry}`);
		this.el.setCssProps({ "--deep-sea-hud-x": `${rx}px`, "--deep-sea-hud-y": `${ry}px` });
		this.el.addClass("is-visible");
		window.clearTimeout(this.hideTimer);
		this.hideTimer = window.setTimeout(() => this.hide(), 1400);
	}

	hide(): void {
		window.clearTimeout(this.hideTimer);
		this.el.removeClass("is-visible");
	}

	destroy(): void {
		this.hide();
		this.el.remove();
	}
}
