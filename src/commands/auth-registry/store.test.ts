import { rmSync } from "node:fs";
/**
 * AuthRegistry 数据层 smoke test
 * 验证 seed 加载、本地合并、软删除、通道状态更新。
 */
import { describe, expect, it, vi } from "vitest";
import {
  addAuthMethod,
  disableAuthMethod,
  findAuthMethod,
  listEnabledProviders,
  updateAuthMethodChannelStatus,
} from "./index.js";
import { AUTH_REGISTRY_SEED, AUTH_REGISTRY_VERSION } from "./seed.js";
import { loadAuthRegistry, saveAuthRegistry } from "./store.js";

// 隔离：用临时注册表路径避免污染真实 ~/.openclaw/auth-registry.json
// 注意：用独立子目录，避免与其他 auth-registry 测试文件共享临时文件导致状态竞争
vi.mock("./constants.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./constants.js")>();
  return {
    ...actual,
    resolveAuthRegistryPath: () => "/tmp/openclaw-test-store/auth-registry.json",
  };
});

// 每个用例前重置临时注册表文件，避免跨用例状态累积（addAuthMethod 幂等性依赖干净 seed）
import { beforeEach } from "vitest";
const TEST_REGISTRY_PATH = "/tmp/openclaw-test-store/auth-registry.json";
beforeEach(() => {
  try {
    rmSync(TEST_REGISTRY_PATH, { force: true });
  } catch {
    // 文件不存在也正常
  }
});

describe("auth-registry seed", () => {
  it("seed has version and providers", () => {
    expect(AUTH_REGISTRY_VERSION).toBe(1);
    expect(AUTH_REGISTRY_SEED.providers.length).toBeGreaterThan(20);
  });

  it("every auth method has vendor matching its provider, or explicit vendor", () => {
    for (const p of AUTH_REGISTRY_SEED.providers) {
      for (const m of p.authMethods) {
        expect(m.id).toBeTruthy();
        expect(m.type).toBeTruthy();
      }
    }
  });

  it("contains key providers", () => {
    const ids = AUTH_REGISTRY_SEED.providers.map((p) => p.id);
    for (const expected of ["openai", "anthropic", "deepseek", "qwen", "minimax", "custom"]) {
      expect(ids).toContain(expected);
    }
  });
});

describe("auth-registry store", () => {
  it("loads merged registry with providers", () => {
    const reg = loadAuthRegistry();
    expect(reg.version).toBe(1);
    expect(reg.providers.length).toBeGreaterThan(0);
  });

  it("findAuthMethod locates a method across providers", () => {
    const reg = loadAuthRegistry();
    const found = findAuthMethod(reg, "deepseek-api-key");
    expect(found).toBeDefined();
    expect(found?.provider.id).toBe("deepseek");
  });

  it("listEnabledProviders excludes soft-disabled", () => {
    const reg = loadAuthRegistry();
    const enabled = listEnabledProviders(reg);
    expect(enabled.every((p) => !p.disabled)).toBe(true);
  });
});

describe("auth-registry mutations", () => {
  it("addAuthMethod creates provider if missing", () => {
    const ok = addAuthMethod({
      providerId: "test-vendor",
      providerName: "Test Vendor",
      method: { id: "test-vendor-api-key", name: "Test API Key", type: "api-key" },
    });
    expect(ok).toBe(true);

    const reg = loadAuthRegistry();
    const found = findAuthMethod(reg, "test-vendor-api-key");
    expect(found?.provider.id).toBe("test-vendor");
    expect(found?.method.vendor).toBe("test-vendor");
  });

  it("addAuthMethod rejects duplicate method id", () => {
    // 已存在 deepseek-api-key
    const ok = addAuthMethod({
      providerId: "deepseek",
      method: { id: "deepseek-api-key", name: "dup", type: "api-key" },
    });
    expect(ok).toBe(false);
  });

  it("disableAuthMethod soft-deletes", () => {
    // 自包含：本用例独立创建待删条目，不依赖其他用例的执行顺序
    addAuthMethod({
      providerId: "test-vendor",
      providerName: "Test Vendor",
      method: { id: "test-vendor-api-key", name: "Test API Key", type: "api-key" },
    });
    const ok = disableAuthMethod("test-vendor-api-key");
    expect(ok).toBe(true);
    const reg = loadAuthRegistry();
    const found = findAuthMethod(reg, "test-vendor-api-key");
    expect(found?.method.disabled).toBe(true);
  });

  it("updateAuthMethodChannelStatus: ok only demoted by down, not suspect", () => {
    // 清理测试条目的状态
    const reg0 = loadAuthRegistry();
    const method0 = findAuthMethod(reg0, "deepseek-api-key")!.method;
    method0.channelStatus = "ok";
    method0.channelCheckedAt = new Date().toISOString();
    saveAuthRegistry(reg0);

    // suspect 不应降级 ok
    updateAuthMethodChannelStatus({ methodId: "deepseek-api-key", status: "suspect" });
    const afterSuspect = findAuthMethod(loadAuthRegistry(), "deepseek-api-key")!.method;
    expect(afterSuspect.channelStatus).toBe("ok");

    // down 应该降级 ok
    updateAuthMethodChannelStatus({ methodId: "deepseek-api-key", status: "down", note: "超时" });
    const afterDown = findAuthMethod(loadAuthRegistry(), "deepseek-api-key")!.method;
    expect(afterDown.channelStatus).toBe("down");
    expect(afterDown.channelNote).toBe("超时");
    expect(afterDown.lastFailureAt).toBeTruthy();

    // 一次成功升回 ok
    updateAuthMethodChannelStatus({ methodId: "deepseek-api-key", status: "down", success: true });
    const afterSuccess = findAuthMethod(loadAuthRegistry(), "deepseek-api-key")!.method;
    expect(afterSuccess.channelStatus).toBe("ok");
    expect(afterSuccess.lastSuccessAt).toBeTruthy();
  });
});
