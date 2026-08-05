import { describe, it, expect, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { applyDefaultModelChoice } from "./auth-choice.default-model.js";

function makePrompter() {
  return {
    note: vi.fn(async () => {}),
  };
}

describe("applyDefaultModelChoice", () => {
  it("keeps existing default model when setDefaultModel and a primary already exists", async () => {
    const config = {
      agents: {
        defaults: {
          model: { primary: "deepseek/deepseek-v4-pro", fallbacks: [] },
        },
      },
    } as OpenClawConfig;
    // applyDefaultConfig 会覆盖成 chat（模拟 applyDeepseekConfig）
    const applyDefaultConfig = vi.fn((cfg) => ({
      ...cfg,
      agents: {
        ...cfg.agents,
        defaults: {
          ...cfg.agents.defaults,
          model: {
            primary: "deepseek/deepseek-chat",
            fallbacks: cfg.agents.defaults.model.fallbacks,
          },
        },
      },
    }));
    const applyProviderConfig = vi.fn((cfg) => ({ ...cfg }));
    const prompter = makePrompter();

    const result = await applyDefaultModelChoice({
      config,
      setDefaultModel: true,
      defaultModel: "deepseek/deepseek-chat",
      applyDefaultConfig,
      applyProviderConfig,
      noteDefault: "deepseek/deepseek-chat",
      noteAgentModel: vi.fn(),
      prompter,
    });

    // 已有主模型 → 用 applyProviderConfig（保留），不调用 applyDefaultConfig（不覆盖）
    expect(applyDefaultConfig).not.toHaveBeenCalled();
    expect(applyProviderConfig).toHaveBeenCalledTimes(1);
    const primary = result.config.agents.defaults.model.primary;
    expect(primary).toBe("deepseek/deepseek-v4-pro");
    // note 提示"已保留"
    expect(prompter.note).toHaveBeenCalledWith(
      expect.stringContaining("deepseek/deepseek-v4-pro"),
      expect.anything(),
    );
  });

  it("applies default model when setDefaultModel and no primary exists (fresh onboard)", async () => {
    const config = { agents: { defaults: {} } } as OpenClawConfig;
    const applyDefaultConfig = vi.fn((cfg) => ({
      ...cfg,
      agents: { defaults: { model: { primary: "deepseek/deepseek-chat" } } },
    }));
    const applyProviderConfig = vi.fn((cfg) => ({ ...cfg }));
    const prompter = makePrompter();

    const result = await applyDefaultModelChoice({
      config,
      setDefaultModel: true,
      defaultModel: "deepseek/deepseek-chat",
      applyDefaultConfig,
      applyProviderConfig,
      noteDefault: "deepseek/deepseek-chat",
      noteAgentModel: vi.fn(),
      prompter,
    });

    expect(applyDefaultConfig).toHaveBeenCalledTimes(1);
    expect(applyProviderConfig).not.toHaveBeenCalled();
    expect(result.config.agents.defaults.model.primary).toBe("deepseek/deepseek-chat");
  });
});
