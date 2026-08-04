import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveOpenClawAgentDir } from "./agent-paths.js";
import {
  installModelsConfigTestHooks,
  withModelsTempHome as withTempHome,
} from "./models-config.e2e-harness.js";
import { ensureOpenClawModelsJson } from "./models-config.js";
import {
  applyProviderMetaRemovals,
  loadProviderMeta,
  PROVIDER_META_FILE,
} from "./provider-meta.js";

installModelsConfigTestHooks();

type ProviderWithModels = { models?: Array<{ id: string; name: string }> };

async function writeMeta(agentDir: string, content: unknown) {
  await fs.mkdir(agentDir, { recursive: true });
  await fs.writeFile(path.join(agentDir, PROVIDER_META_FILE), JSON.stringify(content, null, 2));
}

describe("provider-meta removals", () => {
  it("drops removedModels from a provider's model list", async () => {
    await withTempHome(async () => {
      const agentDir = resolveOpenClawAgentDir();
      await writeMeta(agentDir, {
        version: 1,
        providers: {
          deepseek: { removedModels: ["deepseek-chat", "deepseek-reasoner"] },
        },
      });

      const providers: Record<string, ProviderWithModels> = {
        deepseek: {
          models: [
            { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
            { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
            { id: "deepseek-chat", name: "DeepSeek V3.2 (Chat)" },
            { id: "deepseek-reasoner", name: "DeepSeek V3.2 (Reasoner)" },
          ],
        },
      };

      const result = await applyProviderMetaRemovals(providers, agentDir);
      const ids = result.deepseek.models?.map((m) => m.id) ?? [];
      expect(ids).toEqual(["deepseek-v4-pro", "deepseek-v4-flash"]);
    });
  });

  it("leaves providers untouched when no removedModels match", async () => {
    await withTempHome(async () => {
      const agentDir = resolveOpenClawAgentDir();
      await writeMeta(agentDir, {
        version: 1,
        providers: {
          deepseek: { removedModels: ["deepseek-chat"] },
        },
      });

      const providers: Record<string, ProviderWithModels> = {
        qwen: { models: [{ id: "qwen-max", name: "Qwen Max" }] },
      };

      const result = await applyProviderMetaRemovals(providers, agentDir);
      expect(result.qwen.models?.map((m) => m.id)).toEqual(["qwen-max"]);
    });
  });

  it("returns providers unchanged when no meta file exists", async () => {
    await withTempHome(async () => {
      const agentDir = resolveOpenClawAgentDir();
      const providers: Record<string, ProviderWithModels> = {
        deepseek: { models: [{ id: "deepseek-chat", name: "DS" }] },
      };
      const result = await applyProviderMetaRemovals(providers, agentDir);
      expect(result).toBe(providers);
    });
  });

  it("loadProviderMeta returns normalized entries incl. localized fields", async () => {
    await withTempHome(async () => {
      const agentDir = resolveOpenClawAgentDir();
      await writeMeta(agentDir, {
        version: 1,
        providers: {
          deepseek: {
            name: "DeepSeek",
            nameZh: "深度求索",
            website: "https://www.deepseek.com",
            removedModels: ["deepseek-chat"],
          },
        },
      });

      const meta = await loadProviderMeta(agentDir);
      expect(meta?.providers?.deepseek?.name).toBe("DeepSeek");
      expect(meta?.providers?.deepseek?.nameZh).toBe("深度求索");
      expect(meta?.providers?.deepseek?.website).toBe("https://www.deepseek.com");
      expect(meta?.providers?.deepseek?.removedModels).toEqual(["deepseek-chat"]);
    });
  });

  it("provider id matching is case-insensitive", async () => {
    await withTempHome(async () => {
      const agentDir = resolveOpenClawAgentDir();
      await writeMeta(agentDir, {
        version: 1,
        providers: {
          DeepSeek: { removedModels: ["deepseek-chat"] },
        },
      });

      const providers: Record<string, ProviderWithModels> = {
        deepseek: {
          models: [
            { id: "deepseek-v4-pro", name: "P" },
            { id: "deepseek-chat", name: "C" },
          ],
        },
      };

      const result = await applyProviderMetaRemovals(providers, agentDir);
      expect(result.deepseek.models?.map((m) => m.id)).toEqual(["deepseek-v4-pro"]);
    });
  });

  it("end-to-end: ensureOpenClawModelsJson drops removedModels from written models.json", async () => {
    await withTempHome(async () => {
      const agentDir = resolveOpenClawAgentDir();
      await writeMeta(agentDir, {
        version: 1,
        providers: {
          deepseek: { removedModels: ["deepseek-chat", "deepseek-reasoner"] },
        },
      });

      await ensureOpenClawModelsJson(
        {
          models: {
            providers: {
              deepseek: {
                baseUrl: "https://api.deepseek.com",
                models: [
                  {
                    id: "deepseek-v4-pro",
                    name: "DeepSeek V4 Pro",
                    reasoning: false,
                    input: ["text"],
                  },
                  {
                    id: "deepseek-v4-flash",
                    name: "DeepSeek V4 Flash",
                    reasoning: false,
                    input: ["text"],
                  },
                  {
                    id: "deepseek-chat",
                    name: "DeepSeek V3.2 (Chat)",
                    reasoning: false,
                    input: ["text"],
                  },
                  {
                    id: "deepseek-reasoner",
                    name: "DeepSeek V3.2 (Reasoner)",
                    reasoning: true,
                    input: ["text"],
                  },
                ],
              },
            },
          },
        },
        agentDir,
      );

      const raw = await fs.readFile(path.join(agentDir, "models.json"), "utf8");
      const parsed = JSON.parse(raw) as {
        providers: Record<string, { models?: Array<{ id: string }> }>;
      };
      const ids = parsed.providers.deepseek?.models?.map((m) => m.id) ?? [];
      expect(ids).toEqual(["deepseek-v4-pro", "deepseek-v4-flash"]);
    });
  });
});
