/**
 * promptAuthChoiceGrouped 注册表驱动行为测试
 * 验证：分组构建、新增厂商入口、down 置灰、单认证方式自动跳过。
 */
import { describe, expect, it, vi } from "vitest";
import type { WizardPrompter } from "../wizard/prompts.js";

// 隔离注册表路径
vi.mock("./auth-registry/constants.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./auth-registry/constants.js")>();
  return {
    ...actual,
    resolveAuthRegistryPath: () => "/tmp/openclaw-test/auth-registry-prompt.json",
  };
});

import { buildAuthChoiceGroupsFromRegistry } from "./auth-choice-options.js";
import { promptAuthChoiceGrouped } from "./auth-choice-prompt.js";
import { loadAuthRegistry, saveAuthRegistry } from "./auth-registry/store.js";

function makePrompter(selectionQueue: unknown[]): WizardPrompter {
  let idx = 0;
  return {
    intro: vi.fn(async () => {}),
    outro: vi.fn(async () => {}),
    note: vi.fn(async () => {}),
    select: vi.fn(async () => selectionQueue[idx++]),
    multiselect: vi.fn(async () => []),
    text: vi.fn(async () => "MyTestAI"),
    confirm: vi.fn(async () => true),
    progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
  } as unknown as WizardPrompter;
}

describe("buildAuthChoiceGroupsFromRegistry", () => {
  it("builds groups from registry seed", () => {
    const { groups } = buildAuthChoiceGroupsFromRegistry({ includeSkip: false });
    const ids = groups.map((g) => g.value);
    expect(ids).toContain("deepseek");
    expect(ids).toContain("qwen");
    // soft-disabled legacy 项不展示
    const anthropic = groups.find((g) => g.value === "anthropic");
    const anthropicOpts = anthropic?.options.map((o) => o.value);
    expect(anthropicOpts).not.toContain("setup-token"); // legacy alias 已 disabled
  });

  it("marks down channel methods as disabled", () => {
    // 把一个认证方式标记为 down
    const reg = loadAuthRegistry();
    const ds = reg.providers.find((p) => p.id === "deepseek");
    if (ds) {
      const m = ds.authMethods.find((x) => x.id === "deepseek-api-key");
      if (m) {
        m.channelStatus = "down";
      }
    }
    saveAuthRegistry(reg);

    const { groups } = buildAuthChoiceGroupsFromRegistry({ includeSkip: false });
    const deepseek = groups.find((g) => g.value === "deepseek");
    const dsOption = deepseek?.options.find((o) => o.value === "deepseek-api-key");
    expect(dsOption?.disabled).toBe(true);
  });
});

describe("promptAuthChoiceGrouped (registry-driven)", () => {
  it("single-method provider returns directly", async () => {
    const prompter = makePrompter(["deepseek"]);
    const result = await promptAuthChoiceGrouped({
      prompter,
      store: {} as never,
      includeSkip: false,
    });
    expect(result).toBe("deepseek-api-key");
  });

  it("multi-method provider asks for method, supports Back", async () => {
    // 选择 qwen(多方式) -> 返回上一级(back) -> 重新选 qwen -> 选 qwen-portal
    const prompter = makePrompter(["qwen", "__back", "qwen", "qwen-portal"]);
    const result = await promptAuthChoiceGrouped({
      prompter,
      store: {} as never,
      includeSkip: false,
    });
    expect(result).toBe("qwen-portal");
  });

  it("add provider flow writes to registry and returns new method", async () => {
    // 队列: 选"新增厂商" -> 选认证类型 "api-key"
    const prompter = makePrompter(["__add_provider", "api-key"]);
    const result = await promptAuthChoiceGrouped({
      prompter,
      store: {} as never,
      includeSkip: false,
    });
    // MyTestAI -> mytestai-api-key
    expect(result).toBe("mytestai-api-key");
    const reg = loadAuthRegistry();
    const found = reg.providers.find((p) => p.id === "mytestai");
    expect(found).toBeDefined();
    expect(found?.name).toBe("MyTestAI");
  });

  it("skip returns skip", async () => {
    const prompter = makePrompter(["skip"]);
    const result = await promptAuthChoiceGrouped({
      prompter,
      store: {} as never,
      includeSkip: true,
    });
    expect(result).toBe("skip");
  });
});
