import { SECRETS, delay } from "./_stubs";

// [stub-data] In-memory secret store. NOT secure. Resets on reload.

export type KeyName = "linear" | "openai" | "anthropic";

export async function setApiKey(name: KeyName, value: string): Promise<void> {
  SECRETS[name] = value;
  return delay(undefined, 0);
}

export async function getApiKey(name: KeyName): Promise<string | null> {
  return delay(SECRETS[name] ?? null, 0);
}

export async function clearApiKey(name: KeyName): Promise<void> {
  SECRETS[name] = null;
  return delay(undefined, 0);
}
