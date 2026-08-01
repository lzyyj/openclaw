import { afterEach, describe, expect, it, vi } from "vitest";
import type { WizardPrompter } from "../wizard/prompts.js";
import {
  loadModelsVerified,
  MODELS_VERIFIED_FILENAME,
  normalizeBaseUrlForPath,
  verifyProviderInteractive,
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

// 隔离 auth profile 解析：交互验证测试里直接注入 key，避免依赖真实 auth-profiles.json
vi.mock("../agents/model-auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../agents/model-auth.js")>();
  return {
    ...actual,
    resolveApiKeyForProvider: async () => ({ apiKey: "sk-test", source: "test", mode: "api-key" }),
  };
});

// 隔离写回：持久化 baseUrl 到配置不应触碰真实 ~/.openclaw/openclaw.json
vi.mock("../config/io.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/io.js")>();
  return {
    ...actual,
    writeConfigFile: async () => {},
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

describe("verifyProviderInteractive", () => {
  function makePrompter(overrides: Partial<WizardPrompter> = {}): WizardPrompter {
    return {
      intro: vi.fn(async () => {}),
      outro: vi.fn(async () => {}),
      note: vi.fn(async () => {}),
      select: vi.fn(async () => "skip"),
      multiselect: vi.fn(async () => []),
      text: vi.fn(async () => ""),
      confirm: vi.fn(async () => true),
      progress: () => ({ update: vi.fn(), stop: vi.fn() }),
      ...overrides,
    } as WizardPrompter;
  }

  function makeCfg(baseUrl: string, models: Array<{ id: string }> = []): unknown {
    return {
      models: {
        providers: {
          "qwen-portal": { baseUrl, apiKey: "sk-test", api: "openai-completions", models },
        },
      },
      agents: { defaults: { model: { primary: "qwen-portal/coder-model" } } },
    };
  }

  it("prompts to edit baseUrl on severe (5xx) errors and re-verifies with the corrected URL", async () => {
    // GET /models 第一次 504（严重错误，暗示 baseUrl 过时），改 URL 后 200
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 504, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: "qwen3-coder-plus" }, { id: "qwen3.7-max" }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const prompter = makePrompter({
      select: vi.fn(async () => "edit-url"),
      text: vi.fn(async () => "https://dashscope.aliyuncs.com/compatible-mode/v1"),
    });

    const outcome = await verifyProviderInteractive({
      providerId: "qwen-portal",
      methodId: "qwen-portal-api-key",
      prompter,
      cfg: makeCfg("https://portal.qwen.ai/v1") as never,
    });

    expect(outcome.kind).toBe("ok");
    // 第二次请求应打到修正后的 dashscope 地址
    const secondUrl = fetchMock.mock.calls[1][0];
    expect(String(secondUrl)).toContain("dashscope.aliyuncs.com");
  });

  it("marks auth failures (401) as suspect and lets user re-enter key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );
    const prompter = makePrompter({
      select: vi.fn(async () => "keep"),
    });
    const outcome = await verifyProviderInteractive({
      providerId: "qwen-portal",
      methodId: "qwen-portal-api-key",
      prompter,
      cfg: makeCfg("https://portal.qwen.ai/v1") as never,
    });
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.error).toBe("auth");
    }
  });
});
