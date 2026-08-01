import { describe, expect, it } from "vitest";
import type { AuthProfileStore } from "../agents/auth-profiles.js";
import {
  buildAuthChoiceGroups,
  buildAuthChoiceOptions,
  formatAuthChoiceChoicesForCli,
  PROVIDER_TO_GROUP_ID,
  PROVIDER_TO_GROUP_ID_REVERSE,
} from "./auth-choice-options.js";
import { resolveInitialGroupFromConfig } from "./auth-choice-prompt.js";

const EMPTY_STORE: AuthProfileStore = { version: 1, profiles: {} };

function getOptions(includeSkip = false) {
  return buildAuthChoiceOptions({
    store: EMPTY_STORE,
    includeSkip,
  });
}

describe("buildAuthChoiceOptions", () => {
  it("includes core and provider-specific auth choices", () => {
    const options = getOptions();

    for (const value of [
      "github-copilot",
      "token",
      "zai-api-key",
      "xiaomi-api-key",
      "minimax-api",
      "minimax-api-key-cn",
      "minimax-api-lightning",
      "moonshot-api-key",
      "moonshot-api-key-cn",
      "kimi-code-api-key",
      "together-api-key",
      "ai-gateway-api-key",
      "cloudflare-ai-gateway-api-key",
      "synthetic-api-key",
      "chutes",
      "qwen-portal",
      "xai-api-key",
      "mistral-api-key",
      "volcengine-api-key",
      "byteplus-api-key",
      "vllm",
    ]) {
      expect(options.some((opt) => opt.value === value)).toBe(true);
    }
  });

  it("builds cli help choices from the same catalog", () => {
    const options = getOptions(true);
    const cliChoices = formatAuthChoiceChoicesForCli({
      includeLegacyAliases: false,
      includeSkip: true,
    }).split("|");

    for (const option of options) {
      expect(cliChoices).toContain(option.value);
    }
  });

  it("can include legacy aliases in cli help choices", () => {
    const cliChoices = formatAuthChoiceChoicesForCli({
      includeLegacyAliases: true,
      includeSkip: true,
    }).split("|");

    expect(cliChoices).toContain("setup-token");
    expect(cliChoices).toContain("oauth");
    expect(cliChoices).toContain("claude-cli");
    expect(cliChoices).toContain("codex-cli");
  });

  it("shows Chutes in grouped provider selection", () => {
    const { groups } = buildAuthChoiceGroups({
      store: EMPTY_STORE,
      includeSkip: false,
    });
    const chutesGroup = groups.find((group) => group.value === "chutes");

    expect(chutesGroup).toBeDefined();
    expect(chutesGroup?.options.some((opt) => opt.value === "chutes")).toBe(true);
  });
});

describe("PROVIDER_TO_GROUP_ID / group default normalization", () => {
  it("maps canonical qwen-portal provider to the qwen group", () => {
    expect(PROVIDER_TO_GROUP_ID["qwen-portal"]).toBe("qwen");
    expect(PROVIDER_TO_GROUP_ID_REVERSE["qwen"]).toBe("qwen-portal");
  });

  it("resolveInitialGroupFromConfig maps qwen-portal model key to the qwen group", () => {
    // 主模型 qwen-portal/coder-model → 分组 qwen（UI 里 Qwen 分组 id）
    expect(resolveInitialGroupFromConfig("qwen-portal/coder-model")).toBe("qwen");
  });

  it("resolveInitialGroupFromConfig keeps plain provider groups unchanged", () => {
    expect(resolveInitialGroupFromConfig("deepseek/deepseek-chat")).toBe("deepseek");
    expect(resolveInitialGroupFromConfig("moonshot/kimi-k2.5")).toBe("moonshot");
  });

  it("resolveInitialGroupFromConfig handles malformed model keys", () => {
    expect(resolveInitialGroupFromConfig("no-slash-model")).toBeUndefined();
    expect(resolveInitialGroupFromConfig(undefined)).toBeUndefined();
  });
});
