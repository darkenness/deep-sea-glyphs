// Optional link to the Cursor-Smith plugin (github.com/Sadsnake1/cursor-smith, MIT).
// We only call its runtime methods; none of its code is bundled here.
import { App, Notice } from "obsidian";
import { t } from "./i18n";
import type { ModeKey } from "./modes";
import presets from "../presets/cursor-smith.json";

interface CursorSmithPlugin {
	getUserPresets(): Record<string, unknown>;
	loadUserPreset(name: string): Promise<void> | void;
	saveSettings(): Promise<void>;
}

interface PluginRegistry {
	plugins?: { getPlugin(id: string): unknown };
}

export function cursorSmith(app: App): CursorSmithPlugin | null {
	const plugin = (app as unknown as PluginRegistry).plugins?.getPlugin("cursor-smith") as Partial<CursorSmithPlugin> | null;
	if (!plugin || typeof plugin.loadUserPreset !== "function" || typeof plugin.getUserPresets !== "function") return null;
	return plugin as CursorSmithPlugin;
}

/** Loads the caret preset that matches a mood, if Cursor-Smith has it. */
export async function loadCursorPreset(app: App, mode: ModeKey): Promise<void> {
	const cs = cursorSmith(app);
	const name = presets[mode].name;
	if (cs && name in cs.getUserPresets()) await cs.loadUserPreset(name);
}

/** Writes the three deep sea presets into Cursor-Smith's user presets. */
export async function installCursorPresets(app: App): Promise<void> {
	const cs = cursorSmith(app);
	if (!cs) return;
	const userPresets = cs.getUserPresets();
	for (const preset of Object.values(presets)) userPresets[preset.name] = structuredClone(preset.snapshot);
	await cs.saveSettings();
	new Notice(t.csInstalled);
}
