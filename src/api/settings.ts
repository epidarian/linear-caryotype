import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "../state/types";

export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  );
}

/** Resolved (defaults + config.plist + prefs.plist). */
export function settingsGet(): Promise<Settings> {
  return invoke<Settings>("settings_get");
}

export function settingsReload(): Promise<Settings> {
  return invoke<Settings>("settings_reload");
}

/** Raw prefs partial. */
export function prefsGet(): Promise<Partial<Settings>> {
  return invoke<Partial<Settings>>("prefs_get");
}

/** Deep-merge a patch into prefs.plist and return the new effective settings. */
export function prefsPatch(patch: Partial<Settings>): Promise<Settings> {
  return invoke<Settings>("prefs_patch", { patch });
}

/** Raw config.plist partial. */
export function configGet(): Promise<Partial<Settings>> {
  return invoke<Partial<Settings>>("config_get");
}

export function configReload(): Promise<Partial<Settings>> {
  return invoke<Partial<Settings>>("config_reload");
}

/** Deep-merge a patch into config.plist (declarative / managed). */
export function configPatch(patch: Partial<Settings>): Promise<Settings> {
  return invoke<Settings>("config_patch", { patch });
}
