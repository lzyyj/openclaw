import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadModelsVerified,
  MODELS_VERIFIED_FILENAME,
  normalizeBaseUrlForPath,
  verifyProviderWithModels,
} from "./provider-verify.js";

// 隔离 models-verified.json：mock resolveStateDir 到临时目录，避免污染真实 ~/.openclaw
vi.mock("../config/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/paths.js")>();
  return {
    ...actual,
    resolveStateDir: () => "/tmp/openclaw-test-provider-verify",
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeBaseUrlForPath", () => {
  it("adds trailing slash when missing", () => {
    expect(normalizeBaseUrlForPath("https://api.deepseek.com")).toBe("https://api.deepseek.com/");
  });

  it("keeps existing trailing slash", () => {
    expect(normalizeBaseUrlForPath("https://api.deepseek.com/")).toBe("https://api.deepseek.com/");
  });

  it("handles /v1 paths", () => {
    expect(normalizeBaseUrlForPath("https://dashscope.aliyuncs.com/compatible-mode/v1")).toBe(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/",
    );
  });

  it("collapses multiple trailing slashes", () => {
    expect(normalizeBaseUrlForPath("https://example.com/v1///")).toBe("https://example.com/v1/");
  });
});

describe("verifyProviderWithModels", () => {
  it("returns ok with model ids on 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }, { id: undefined }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyProviderWithModels({
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-test",
    });

    expect(result).toEqual({
      ok: true,
      models: ["deepseek-chat", "deepseek-reasoner"],
      status: 200,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepseek.com/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test",
        }),
      }),
    );
  });

  it("classifies 401 as auth error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );
    const result = await verifyProviderWithModels({
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-bad",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("auth");
    }
  });

  it("classifies 404 as baseurl error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }),
    );
    const result = await verifyProviderWithModels({
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("baseurl");
    }
  });

  it("classifies network failure as baseurl error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await verifyProviderWithModels({
      baseUrl: "https://unreachable.example.com",
      apiKey: "sk-test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("baseurl");
    }
  });

  it("returns auth error for missing key", async () => {
    const result = await verifyProviderWithModels({
      baseUrl: "https://api.deepseek.com",
      apiKey: "  ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("auth");
    }
  });

  it("returns ok with empty models when data missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }),
    );
    const result = await verifyProviderWithModels({
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-test",
    });
    expect(result).toEqual({ ok: true, models: [], status: 200 });
  });
});

describe("loadModelsVerified", () => {
  it("returns empty providers when file missing", () => {
    const file = loadModelsVerified();
    expect(file.version).toBe(1);
    expect(file.providers).toEqual({});
  });

  it("exposes the verified models filename (string-list storage)", () => {
    // 方案①：真实模型 id 以纯字符串列表存独立文件，不与 openclaw.json 的完整对象耦合
    expect(MODELS_VERIFIED_FILENAME).toBe("models-verified.json");
  });
});
