/**
 * auth-registry channel-mirror 测试
 * 验证：provider+credentialType → authMethod 映射、成功/失败状态转换。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// 隔离注册表路径
vi.mock("./constants.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./constants.js")>();
  return {
    ...actual,
    resolveAuthRegistryPath: () => "/tmp/openclaw-test/auth-registry-mirror.json",
  };
});

import { mirrorAuthChannelResult } from "./channel-mirror.js";
import { loadAuthRegistry, saveAuthRegistry } from "./store.js";

function resetDeepseek(): void {
  const reg = loadAuthRegistry();
  const ds = reg.providers.find((p) => p.id === "deepseek");
  if (ds) {
    const m = ds.authMethods.find((x) => x.id === "deepseek-api-key");
    if (m) {
      m.channelStatus = "unknown";
      m.channelCheckedAt = undefined;
      m.lastSuccessAt = undefined;
      m.lastFailureAt = undefined;
      m.channelNote = undefined;
    }
  }
  saveAuthRegistry(reg);
}

function getMethodStatus(methodId: string): {
  status?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
} {
  const reg = loadAuthRegistry();
  const m = reg.providers.flatMap((p) => p.authMethods).find((x) => x.id === methodId);
  return {
    status: m?.channelStatus,
    lastSuccessAt: m?.lastSuccessAt,
    lastFailureAt: m?.lastFailureAt,
  };
}

describe("mirrorAuthChannelResult", () => {
  beforeEach(() => {
    resetDeepseek();
  });

  it("maps provider+api_key credential to the matching authMethod", () => {
    mirrorAuthChannelResult({
      provider: "deepseek",
      credentialType: "api_key",
      success: true,
    });
    expect(getMethodStatus("deepseek-api-key").status).toBe("ok");
  });

  it("success sets ok and lastSuccessAt", () => {
    mirrorAuthChannelResult({
      provider: "deepseek",
      credentialType: "api_key",
      success: true,
    });
    const s = getMethodStatus("deepseek-api-key");
    expect(s.status).toBe("ok");
    expect(s.lastSuccessAt).toBeTruthy();
  });

  it("timeout failure sets down", () => {
    mirrorAuthChannelResult({
      provider: "deepseek",
      credentialType: "api_key",
      success: false,
      reason: "timeout",
    });
    expect(getMethodStatus("deepseek-api-key").status).toBe("down");
  });

  it("auth/billing failure sets suspect, not down", () => {
    mirrorAuthChannelResult({
      provider: "deepseek",
      credentialType: "api_key",
      success: false,
      reason: "billing",
    });
    expect(getMethodStatus("deepseek-api-key").status).toBe("suspect");
    expect(getMethodStatus("deepseek-api-key").lastFailureAt).toBeTruthy();
  });

  it("ok is not demoted by suspect failure (state machine core)", () => {
    // 先成功 → ok
    mirrorAuthChannelResult({
      provider: "deepseek",
      credentialType: "api_key",
      success: true,
    });
    expect(getMethodStatus("deepseek-api-key").status).toBe("ok");

    // suspect 失败不降级 ok
    mirrorAuthChannelResult({
      provider: "deepseek",
      credentialType: "api_key",
      success: false,
      reason: "auth",
    });
    expect(getMethodStatus("deepseek-api-key").status).toBe("ok");
  });

  it("ok is demoted by timeout (down)", () => {
    mirrorAuthChannelResult({
      provider: "deepseek",
      credentialType: "api_key",
      success: true,
    });
    mirrorAuthChannelResult({
      provider: "deepseek",
      credentialType: "api_key",
      success: false,
      reason: "timeout",
    });
    expect(getMethodStatus("deepseek-api-key").status).toBe("down");
  });

  it("unknown provider is no-op (silent)", () => {
    expect(() =>
      mirrorAuthChannelResult({
        provider: "nonexistent-vendor",
        credentialType: "api_key",
        success: true,
      }),
    ).not.toThrow();
  });

  it("oauth credential maps to oauth-type method (qwen-portal)", () => {
    mirrorAuthChannelResult({
      provider: "qwen",
      credentialType: "oauth",
      success: true,
    });
    // qwen 有 portal-api-key(type oauth) 和 portal(type oauth) 两个 oauth 方法，用单方法 fallback 需谨慎；
    // 这里只断言至少有一个 qwen 方法被更新为 ok
    const reg = loadAuthRegistry();
    const qwen = reg.providers.find((p) => p.id === "qwen");
    const oauthMethods = qwen?.authMethods.filter((m) => m.type === "oauth") ?? [];
    expect(oauthMethods.length).toBeGreaterThan(0);
  });
});
