import { invoke } from "@tauri-apps/api/core";

export type KeyName = "linear" | "openai" | "anthropic";

export function setApiKey(name: KeyName, value: string): Promise<void> {
  return invoke("set_api_key", { name, value });
}

export function getApiKey(name: KeyName): Promise<string | null> {
  return invoke<string | null>("get_api_key", { name });
}

export function clearApiKey(name: KeyName): Promise<void> {
  return invoke("clear_api_key", { name });
}
