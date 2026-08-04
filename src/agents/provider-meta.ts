import fs from "node:fs/promises";
import path from "node:path";
import { isRecord } from "../utils.js";

/**
 * Local vendor (provider) metadata registry: `provider-meta.json`.
 *
 * Lives alongside `models.json` in the agent dir (`agents/<id>/agent/`).
 * Purpose: let operators maintain vendor-level display metadata and mark
 * stale models for removal WITHOUT editing model runtime config.
 *
 * Hardcoded providers act as the seed only — this file is the authoritative
 * overlay. It is merged at startup; `removedModels` entries are dropped from
 * the generated `models.json` so neither the runner nor the webUI model
 * catalog will see them again (unlike the old merge logic, which kept re-adding
 * stale implicit models).
 *
 * Example:
 * ```jsonc
 * {
 *   "version": 1,
 *   "providers": {
 *     "deepseek": {
 *       "name": "DeepSeek",            // default display name (en / fallback)
 *       "nameZh": "深度求索",            // localized name, only when available
 *       "website": "https://www.deepseek.com",
 *       "description": "...",
 *       "removedModels": ["deepseek-chat", "deepseek-reasoner"]
 *     }
 *   }
 * }
 * ```
 */

export const PROVIDER_META_FILE = "provider-meta.json";

export type ProviderMetaEntry = {
  /** Default display name (en / fallback). Falls back to hardcoded name. */
  name?: string;
  /** Localized display name (e.g. Chinese), only present when available. */
  nameZh?: string;
  /** Vendor homepage URL; may be used to fetch/link a description. */
  website?: string;
  /** Default (en) description. Falls back to hardcoded hint. */
  description?: string;
  /** Localized description, only present when available. */
  descriptionZh?: string;
  /**
   * Model ids to drop from the generated models.json for this provider.
   * Explicit config in openclaw.json still wins — removal only applies to
   * entries that would otherwise be merged in from the hardcoded seed.
   */
  removedModels?: string[];
};

export type ProviderMetaFile = {
  version?: number;
  providers?: Record<string, ProviderMetaEntry>;
};

const DEFAULT_VERSION = 1;

function normalizeRemovedModels(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed) {
        out.push(trimmed);
      }
    }
  }
  return out.length > 0 ? out : undefined;
}

function normalizeEntry(value: unknown): ProviderMetaEntry | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const name = typeof value.name === "string" ? value.name.trim() : undefined;
  const nameZh = typeof value.nameZh === "string" ? value.nameZh.trim() : undefined;
  const website = typeof value.website === "string" ? value.website.trim() : undefined;
  const description = typeof value.description === "string" ? value.description.trim() : undefined;
  const descriptionZh =
    typeof value.descriptionZh === "string" ? value.descriptionZh.trim() : undefined;
  const removedModels = normalizeRemovedModels(value.removedModels);
  if (!name && !nameZh && !website && !description && !removedModels) {
    return undefined;
  }
  const entry: ProviderMetaEntry = { name, nameZh, website, description, descriptionZh };
  if (removedModels) {
    entry.removedModels = removedModels;
  }
  // Drop undefined fields so the object stays compact/serializable.
  for (const key of Object.keys(entry) as Array<keyof ProviderMetaEntry>) {
    if (entry[key] === undefined) {
      delete entry[key];
    }
  }
  return entry;
}

function normalizeFile(value: unknown): ProviderMetaFile | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const version = typeof value.version === "number" ? value.version : DEFAULT_VERSION;
  const providers: Record<string, ProviderMetaEntry> = {};
  const rawProviders = value.providers;
  if (isRecord(rawProviders)) {
    for (const [providerKey, entryValue] of Object.entries(rawProviders)) {
      const provider = providerKey.trim().toLowerCase();
      if (!provider) {
        continue;
      }
      const entry = normalizeEntry(entryValue);
      if (entry) {
        providers[provider] = entry;
      }
    }
  }
  if (Object.keys(providers).length === 0) {
    return undefined;
  }
  return { version, providers };
}

async function readProviderMeta(agentDir: string): Promise<ProviderMetaFile | undefined> {
  const targetPath = path.join(agentDir, PROVIDER_META_FILE);
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return normalizeFile(parsed);
  } catch {
    return undefined;
  }
}

/**
 * Drop `removedModels` entries from a provider's model list.
 * Returns the (possibly new) providers map. Non-mutating.
 */
export async function applyProviderMetaRemovals<T extends { models?: Array<{ id?: unknown }> }>(
  providers: Record<string, T> | undefined,
  agentDir: string,
): Promise<Record<string, T>> {
  if (!providers) {
    return {};
  }
  const meta = await readProviderMeta(agentDir);
  if (!meta?.providers) {
    return providers;
  }
  let mutated = false;
  const next: Record<string, T> = {};
  for (const [providerKey, provider] of Object.entries(providers)) {
    const providerId = providerKey.trim().toLowerCase();
    const removed = meta.providers[providerId]?.removedModels;
    if (!removed || removed.length === 0 || !Array.isArray(provider?.models)) {
      next[providerKey] = provider;
      continue;
    }
    const removedSet = new Set(removed);
    const keptModels = (provider.models as Array<{ id?: unknown }>).filter((model) => {
      const id = typeof model?.id === "string" ? model.id.trim() : "";
      return !removedSet.has(id);
    });
    if (keptModels.length === (provider.models as unknown[]).length) {
      next[providerKey] = provider;
      continue;
    }
    mutated = true;
    next[providerKey] = { ...provider, models: keptModels };
  }
  return mutated ? next : providers;
}

export { normalizeFile as normalizeProviderMetaFile };

/**
 * Load the full provider-meta file for display/query purposes.
 * Returns undefined when the file is absent or unparseable.
 */
export async function loadProviderMeta(agentDir: string): Promise<ProviderMetaFile | undefined> {
  return readProviderMeta(agentDir);
}
