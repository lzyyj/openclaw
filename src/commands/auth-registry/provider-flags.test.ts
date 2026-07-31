import { rmSync } from "node:fs";
/**
 * buildProviderAuthFlagsFromRegistry 测试（阶段三：非交互 CLI 动态化）
 * 验证：注册表 → CLI flag 列表，过滤 disabled / 非 api-key / 缺字段条目。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// 隔离注册表路径，避免污染真实 ~/.openclaw/auth-registry.json
vi.mock("./constants.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./constants.js")>();
  return {
    ...actual,
    resolveAuthRegistryPath: () => "/tmp/openclaw-test-flags/auth-registry.json",
  };
});

const TEST_REGISTRY_PATH = "/tmp/openclaw-test-flags/auth-registry.json";

import { buildProviderAuthFlagsFromRegistry } from "./index.js";
import { loadAuthRegistry } from "./store.js";

beforeEach(() => {
  try {
    rmSync(TEST_REGISTRY_PATH, { force: true });
  } catch {
    // 文件不存在也正常
  }
});

describe("buildProviderAuthFlagsFromRegistry", () => {
  it("only includes enabled api-key methods with cliFlag/cliOption/optionKey", () => {
    const flags = buildProviderAuthFlagsFromRegistry();
    // 旧 ONBOARD_PROVIDER_AUTH_FLAGS 有 24 项；注册表 seed 的 api-key+非 disabled+有 cliFlag 条目应与其对齐
    expect(flags.length).toBeGreaterThanOrEqual(20);
    for (const f of flags) {
      expect(f.cliFlag.startsWith("--")).toBe(true);
      expect(f.cliOption).toContain("<key>");
      expect(f.optionKey).toBeTruthy();
      expect(f.authChoice).toBeTruthy();
    }
  });

  it("contains key providers (openai/anthropic/deepseek/qwen/minimax)", () => {
    const flags = buildProviderAuthFlagsFromRegistry();
    const choices = flags.map((f) => f.authChoice);
    for (const expected of [
      "openai-api-key",
      "apiKey", // anthropic 旧 AuthChoice 值
      "deepseek-api-key",
      "minimax-api", // minimax 旧 AuthChoice 值
    ]) {
      expect(choices).toContain(expected);
    }
  });

  it("excludes disabled legacy methods (minimax, minimax-cloud)", () => {
    const flags = buildProviderAuthFlagsFromRegistry();
    const choices = flags.map((f) => f.authChoice);
    expect(choices).not.toContain("minimax");
    expect(choices).not.toContain("minimax-cloud");
  });

  it("excludes methods missing cliFlag/optionKey (vllm, zai-cn, custom-api-key)", () => {
    const flags = buildProviderAuthFlagsFromRegistry();
    const choices = flags.map((f) => f.authChoice);
    // vllm/zai-cn/custom-api-key 在 seed 中无 cliFlag/optionKey，不应出现在 flag 列表
    expect(choices).not.toContain("vllm");
    expect(choices).not.toContain("zai-cn");
    expect(choices).not.toContain("custom-api-key");
  });

  it("round-trips: loadAuthRegistry + build returns registrable flags", () => {
    // 先确保注册表可加载（seed 或本地）
    const reg = loadAuthRegistry();
    expect(reg.providers.length).toBeGreaterThan(20);

    const flags = buildProviderAuthFlagsFromRegistry();
    // 每个 flag 都能在注册表里找到对应 method
    for (const f of flags) {
      const found = reg.providers.flatMap((p) => p.authMethods).find((m) => m.id === f.authChoice);
      expect(found).toBeDefined();
      expect(found?.disabled).not.toBe(true);
      expect(found?.type).toBe("api-key");
    }
  });
});
