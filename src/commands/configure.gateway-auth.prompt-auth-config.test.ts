import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";

const mocks = vi.hoisted(() => ({
  promptAuthChoiceGrouped: vi.fn(),
  applyAuthChoice: vi.fn(),
  promptModelAllowlist: vi.fn(),
  promptDefaultModel: vi.fn(),
  promptCustomApiConfig: vi.fn(),
  promptModelFallbacks: vi.fn(),
  verifyProviderInteractive: vi.fn(),
}));

vi.mock("../agents/auth-profiles.js", () => ({
  ensureAuthProfileStore: vi.fn(() => ({
    version: 1,
    profiles: {},
  })),
}));

vi.mock("./auth-choice-prompt.js", () => ({
  promptAuthChoiceGrouped: mocks.promptAuthChoiceGrouped,
  resolveInitialGroupFromConfig: vi.fn(() => undefined),
}));

vi.mock("./auth-choice.js", () => ({
  applyAuthChoice: mocks.applyAuthChoice,
  resolvePreferredProviderForAuthChoice: vi.fn(() => undefined),
}));

vi.mock("./model-picker.js", async (importActual) => {
  const actual = await importActual<typeof import("./model-picker.js")>();
  return {
    ...actual,
    promptModelAllowlist: mocks.promptModelAllowlist,
    promptDefaultModel: mocks.promptDefaultModel,
    promptModelFallbacks: mocks.promptModelFallbacks,
  };
});

vi.mock("./onboard-custom.js", () => ({
  promptCustomApiConfig: mocks.promptCustomApiConfig,
}));

vi.mock("./provider-verify.js", () => ({
  verifyProviderInteractive: mocks.verifyProviderInteractive,
}));

import { promptAuthConfig } from "./configure.gateway-auth.js";

function makeRuntime(): RuntimeEnv {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  };
}

const noopPrompter = { note: vi.fn() } as unknown as WizardPrompter;

describe("promptAuthConfig", () => {
  beforeEach(() => {
    // Default: keep existing fallbacks so tests don't need to set this up.
    mocks.promptModelFallbacks.mockResolvedValue({ mode: "keep" });
    // Default: model picker returns nothing (keeps current selection), so tests
    // that don't exercise model-switching aren't affected by the added picker step.
    mocks.promptDefaultModel.mockResolvedValue({});
  });

  it("keeps Kilo provider models while applying allowlist defaults", async () => {
    mocks.promptAuthChoiceGrouped.mockResolvedValue("kilocode-api-key");
    mocks.applyAuthChoice.mockResolvedValue({
      config: {
        agents: {
          defaults: {
            model: { primary: "kilocode/anthropic/claude-opus-4.6" },
          },
        },
        models: {
          providers: {
            kilocode: {
              baseUrl: "https://api.kilo.ai/api/gateway/",
              api: "openai-completions",
              models: [
                { id: "anthropic/claude-opus-4.6", name: "Claude Opus 4.6" },
                { id: "minimax/minimax-m2.5:free", name: "MiniMax M2.5 (Free)" },
              ],
            },
          },
        },
      },
    });
    mocks.promptModelAllowlist.mockResolvedValue({
      models: ["kilocode/anthropic/claude-opus-4.6"],
    });

    const result = await promptAuthConfig({}, makeRuntime(), noopPrompter);
    expect(result.models?.providers?.kilocode?.models?.map((model) => model.id)).toEqual([
      "anthropic/claude-opus-4.6",
      "minimax/minimax-m2.5:free",
    ]);
    expect(Object.keys(result.agents?.defaults?.models ?? {})).toEqual([
      "kilocode/anthropic/claude-opus-4.6",
    ]);
  });

  it("does not mutate provider model catalogs when allowlist is set", async () => {
    mocks.promptAuthChoiceGrouped.mockResolvedValue("kilocode-api-key");
    mocks.applyAuthChoice.mockResolvedValue({
      config: {
        agents: {
          defaults: {
            model: { primary: "kilocode/anthropic/claude-opus-4.6" },
          },
        },
        models: {
          providers: {
            kilocode: {
              baseUrl: "https://api.kilo.ai/api/gateway/",
              api: "openai-completions",
              models: [
                { id: "anthropic/claude-opus-4.6", name: "Claude Opus 4.6" },
                { id: "minimax/minimax-m2.5:free", name: "MiniMax M2.5 (Free)" },
              ],
            },
            minimax: {
              baseUrl: "https://api.minimax.io/anthropic",
              api: "anthropic-messages",
              models: [{ id: "MiniMax-M2.1", name: "MiniMax M2.1" }],
            },
          },
        },
      },
    });
    mocks.promptModelAllowlist.mockResolvedValue({
      models: ["kilocode/anthropic/claude-opus-4.6"],
    });

    const result = await promptAuthConfig({}, makeRuntime(), noopPrompter);
    expect(result.models?.providers?.kilocode?.models?.map((model) => model.id)).toEqual([
      "anthropic/claude-opus-4.6",
      "minimax/minimax-m2.5:free",
    ]);
    expect(result.models?.providers?.minimax?.models?.map((model) => model.id)).toEqual([
      "MiniMax-M2.1",
    ]);
  });

  it("allows switching the default model when reconfiguring a provider (non-skip)", async () => {
    mocks.promptAuthChoiceGrouped.mockResolvedValue("deepseek-api-key");
    mocks.applyAuthChoice.mockResolvedValue({
      config: {
        agents: { defaults: { model: { primary: "deepseek/deepseek-v4-pro", fallbacks: [] } } },
        models: { providers: {} },
      },
    });
    // 用户在选择具体模型名称时改选 v4-flash
    mocks.promptDefaultModel.mockResolvedValue({
      model: "deepseek/deepseek-v4-flash",
      config: undefined,
    });

    const result = await promptAuthConfig({}, makeRuntime(), noopPrompter);

    // 必须在 applyAuthChoice 之后调用了模型选择（能换具体模型）
    expect(mocks.promptDefaultModel).toHaveBeenCalled();
    // 新选的模型被 applyPrimaryModel 应用为主模型
    expect(result.agents?.defaults?.model?.primary).toBe("deepseek/deepseek-v4-flash");
    // 旧默认 v4-pro 自动降级为备用
    expect(result.agents?.defaults?.model?.fallbacks).toContain("deepseek/deepseek-v4-pro");
  });
});
