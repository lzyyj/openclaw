import path from "node:path";
import { resolveApiKeyForProvider } from "../agents/model-auth.js";
import { loadConfig } from "../config/config.js";
import { writeConfigFile } from "../config/io.js";
import { resolveAgentModelPrimaryValue } from "../config/model-input.js";
import { resolveStateDir } from "../config/paths.js";
import { loadJsonFile, saveJsonFile } from "../infra/json-file.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { updateAuthMethodChannelStatus } from "./auth-registry/index.js";
import { applyDefaultModel } from "./provider-auth-helpers.js";

/**
 * 厂商模型列表验证 + 动态同步（"拿到 key 后立即验证"）
 *
 * 背景：把硬编码模型目录（pi-ai + fork seed）当作出厂默认经验值，融合进本地注册表。
 * 用户 configure 选择 api-key 厂商并输入 key 后，并行发起 GET {baseUrl}/models：
 *   - 200 + 模型列表 → 配置可用（baseUrl 对 + key 有效），动态取真实模型，写回本地 models.json
 *   - 401/403        → key 无效（endpoint 命中鉴权，baseUrl 通常正确）→ 认证问题，不改配置
 *   - 404/超时/网络  → baseUrl 错（endpoint 不存在）→ 标记需核实完整访问参数
 *
 * 目的：
 *   1. 验证：让配置后的 suspect 状态立即升级为 ok（或标记 baseurl 错）
 *   2. 动态取模型：真实支持的模型列表合并进 models.json，脱离硬编码关联
 *   3. 廉价：GET /models 是只读元数据请求，不消耗 token 额度，适合"选到厂商即验证"
 */

export type ProviderVerifyResult =
  | { ok: true; models: string[]; status: number }
  | { ok: false; error: "auth" | "baseurl"; status: number; detail: string };

/** OpenAI 兼容 /models 响应形状（与 huggingface-models.ts 一致） */
type OpenAiListModelsResponse = {
  data?: Array<{ id?: string }>;
};

const MODELS_TIMEOUT_MS = 10_000;

/**
 * 归一化 baseUrl：确保以 / 结尾，便于拼接 /models。
 * - "https://api.deepseek.com"         → "https://api.deepseek.com/"
 * - "https://dashscope.../v1"          → ".../v1/"
 * - "https://api.deepseek.com/v1/"     → 保持
 */
export function normalizeBaseUrlForPath(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "") + "/";
}

/**
 * 发起 GET {baseUrl}/models，返回分类结果。
 *
 * 错误分类规则（利用 HTTP 语义天然区分"key 错"与"baseUrl 错"）：
 * - 200 + data[]           → ok，返回模型 id 列表
 * - 401/403                → auth：请求命中了服务端鉴权，说明 endpoint 存在，是 key 无效
 * - 404/其他/超时/网络错误  → baseurl：endpoint 不存在或不可达，需核实完整访问参数（含 baseUrl）
 */
export async function verifyProviderWithModels(params: {
  baseUrl: string;
  apiKey: string;
}): Promise<ProviderVerifyResult> {
  const trimmedKey = params.apiKey?.trim();
  if (!trimmedKey) {
    return { ok: false, error: "auth", status: 0, detail: "missing api key" };
  }

  const url = `${normalizeBaseUrlForPath(params.baseUrl)}models`;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${trimmedKey}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const body = (await response.json().catch(() => null)) as OpenAiListModelsResponse | null;
      const models = Array.isArray(body?.data)
        ? body.data.map((m) => m?.id).filter((id): id is string => Boolean(id))
        : [];
      return { ok: true, models, status: response.status };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        error: "auth",
        status: response.status,
        detail: `GET ${url} -> HTTP ${response.status} (invalid key; endpoint reachable)`,
      };
    }

    return {
      ok: false,
      error: "baseurl",
      status: response.status,
      detail: `GET ${url} -> HTTP ${response.status} (endpoint not found / unreachable; verify baseUrl & access params)`,
    };
  } catch (err) {
    return {
      ok: false,
      error: "baseurl",
      status: 0,
      detail: `GET ${url} failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * 读取验证所需的 baseUrl 与 apiKey。
 * - baseUrl 来自 config 的 models.providers[providerId].baseUrl（applyProviderConfig 已写入）
 * - apiKey 来自 auth profile store（resolveApiKeyForProvider，读取 auth.json 里刚存的 key）
 * 返回 undefined 表示无法取得完整输入（无配置可验证）。
 */
export async function readProviderVerifyInputs(
  providerId: string,
  cfg?: ReturnType<typeof loadConfig>,
): Promise<{ baseUrl: string; apiKey: string } | undefined> {
  const config = cfg ?? loadConfig();
  const provider = config.models?.providers?.[providerId];
  if (!provider || typeof provider !== "object") {
    return undefined;
  }
  const baseUrl = provider.baseUrl as string | undefined;
  if (!baseUrl) {
    return undefined;
  }
  try {
    const resolved = await resolveApiKeyForProvider({ provider: providerId, cfg: config });
    const apiKey = resolved?.apiKey;
    if (!apiKey) {
      return undefined;
    }
    return { baseUrl, apiKey };
  } catch {
    return undefined;
  }
}

/**
 * 验证并更新注册表状态（静默，不抛错）。
 * - ok      → 升为 ok，记录 lastSuccessAt；若拿到真实模型列表，合并回本地 models.json
 * - auth    → 认证问题（key 无效），不改配置，标 suspect + note
 * - baseurl → 配置错误（baseUrl/访问参数），标 suspect + note（提示核实完整访问参数）
 */
export async function verifyProviderAndRecord(params: {
  providerId: string;
  methodId: string;
  nonInteractive?: boolean;
}): Promise<ProviderVerifyResult | undefined> {
  const inputs = await readProviderVerifyInputs(params.providerId);
  if (!inputs) {
    return undefined;
  }

  const result = await verifyProviderWithModels(inputs);

  if (result.ok) {
    updateAuthMethodChannelStatus({
      methodId: params.methodId,
      status: "ok",
      success: true,
      note: `verified via GET /models (${result.models.length} models)`,
    });
    if (result.models.length > 0 && !params.nonInteractive) {
      await mergeVerifiedModelsIntoFile(params.providerId, result.models);
    }
  } else if (result.error === "auth") {
    updateAuthMethodChannelStatus({
      methodId: params.methodId,
      status: "suspect",
      note: `auth failed: invalid api key (${result.detail})`,
    });
  } else {
    updateAuthMethodChannelStatus({
      methodId: params.methodId,
      status: "suspect",
      note: `config error: verify baseUrl & access params (${result.detail})`,
    });
  }

  return result;
}

/**
 * 交互式验证：baseUrl 验证失败时展示当前值，供用户现场修改后重试。
 *
 * 背景：厂商 baseUrl 硬编码在插件里，若厂商迁移/更换网关（如 Qwen sk-ws key 实际指向
 * DashScope 而非 portal.qwen.ai），验证 404/401 会让用户一头雾水。这里把 baseUrl 暴露出来，
 * 让 URL 变更或 key 类型不匹配时能就地维护，而不是写死在代码里。
 *
 * 流程（仅 baseurl 类错误触发改 URL；auth 类错误提示改 key 或保持）：
 *   baseurl 错（404/超时/网络）→ 展示当前 baseUrl，用户可选：改 baseUrl / 保持继续 / 跳过
 *   auth 错（401/403）        → baseUrl 对、key 无效：提示改 key 或保持
 *   ok                        → 标 ok + 合并真实模型
 *
 * 无论结果如何都不抛错（让 configure 向导继续）。
 */
export type InteractiveVerifyOutcome =
  | { kind: "ok"; modelCount: number; modelCorrected: boolean }
  | { kind: "skipped" }
  | { kind: "failed"; error: "auth" | "baseurl"; status: number; detail: string };

export async function verifyProviderInteractive(params: {
  providerId: string;
  methodId: string;
  prompter: WizardPrompter;
  cfg?: ReturnType<typeof loadConfig>;
  /** 是否可让用户修改 baseUrl（默认 true） */
  allowBaseUrlEdit?: boolean;
}): Promise<InteractiveVerifyOutcome> {
  const { providerId, methodId, prompter, cfg } = params;
  const allowBaseUrlEdit = params.allowBaseUrlEdit ?? true;

  const initialInputs = await readProviderVerifyInputs(providerId, cfg);
  if (!initialInputs) {
    await prompter.note(
      `无法验证 ${providerId}：缺少 baseUrl 或 apiKey（未写入配置）。`,
      "Provider verify",
    );
    return { kind: "skipped" };
  }

  let baseUrl = initialInputs.baseUrl;
  let apiKey = initialInputs.apiKey;

  for (let attempt = 0; attempt < 10; attempt++) {
    const spinner = prompter.progress(`Verifying ${providerId}…`);
    const result = await verifyProviderWithModels({ baseUrl, apiKey });
    spinner.stop(
      result.ok ? "Verification OK." : `Verification failed (${result.status ?? result.detail}).`,
    );

    // 成功 → 标 ok + 合并真实模型
    if (result.ok) {
      updateAuthMethodChannelStatus({
        methodId,
        status: "ok",
        success: true,
        note: `verified via GET ${baseUrl}/models (${result.models.length} models)`,
      });
      await mergeVerifiedModelsIntoFile(providerId, result.models);

      // 若配置里当前主模型不在真实模型列表（如插件硬编码模型名已失效 / 厂商换网关），
      // 让用户从真实列表里挑一个纠正，避免运行时拿到不存在的模型 id。
      const fixed = await maybeCorrectDefaultModel({
        providerId,
        baseUrl,
        realModels: result.models,
        prompter,
        cfg,
      });

      return { kind: "ok", modelCount: result.models.length, modelCorrected: fixed };
    }

    // 认证问题（key 无效但 baseUrl 对）→ 提示改 key 或保持
    if (result.error === "auth") {
      updateAuthMethodChannelStatus({
        methodId,
        status: "suspect",
        note: `auth failed: invalid api key (${result.detail})`,
      });
      const choice = await prompter.select<"change-key" | "keep">({
        message: `baseUrl 正确但 apiKey 无效（HTTP ${result.status}）。`,
        options: [
          { value: "change-key", label: "重新输入 API key" },
          { value: "keep", label: "保持现状（标记 suspect）" },
        ],
      });
      if (choice === "change-key") {
        const newKey = await prompter.text({
          message: "Enter API key",
          initialValue: apiKey,
          validate: (v) => (String(v ?? "").trim() ? undefined : "Required"),
        });
        apiKey = String(newKey ?? "").trim();
        continue;
      }
      return { kind: "failed", error: "auth", status: result.status, detail: result.detail };
    }

    // baseUrl 问题（404/5xx/超时/网络）→ 展示当前值让用户改
    updateAuthMethodChannelStatus({
      methodId,
      status: "suspect",
      note: `config error: verify baseUrl & access params (${result.detail})`,
    });

    if (!allowBaseUrlEdit) {
      return { kind: "failed", error: "baseurl", status: result.status, detail: result.detail };
    }

    // 严重错误：5xx/网关超时/网络不可达 → 强烈提示可能是"硬编码 baseUrl 已过时"，
    // 引导用户优先重新核实当前 baseUrl，而不是继续盲目重试。
    const severeStatus = result.status >= 500 || result.status === 0;
    const msg = severeStatus
      ? `baseUrl 出现严重错误（HTTP ${result.status ?? "网络/超时"}）：${result.detail}。` +
        `\n这通常意味着配置的 baseUrl（当前：${baseUrl}）已过时或厂商更换了网关 —— ` +
        `请重新核实当前厂商最新的 API 端点，而不是沿用历史硬编码值。`
      : `baseUrl 验证失败（HTTP ${result.status ?? "?"}）：${result.detail}`;

    const choice = await prompter.select<"edit-url" | "retry" | "skip">({
      message: msg,
      options: [
        { value: "edit-url", label: "重新核实并修改 baseUrl", hint: `当前：${baseUrl}` },
        { value: "retry", label: "重新验证（保持当前 baseUrl）" },
        { value: "skip", label: "跳过（标记 suspect，稍后再调）" },
      ],
      initialValue: severeStatus ? "edit-url" : undefined,
    });

    if (choice === "edit-url") {
      const newUrl = (
        await prompter.text({
          message: "baseUrl（OpenAI 兼容端点，含 /v1；请填核实后的最新地址）",
          initialValue: baseUrl,
          placeholder: "https://api.example.com/v1",
          validate: (v) => (String(v ?? "").trim() ? undefined : "Required"),
        })
      ).trim();
      if (newUrl && newUrl !== baseUrl) {
        baseUrl = newUrl;
        // 同步写回 config，确保后续运行用到新 baseUrl
        await persistProviderBaseUrl(providerId, baseUrl, cfg);
      }
      continue;
    }

    if (choice === "retry") {
      continue;
    }

    return { kind: "failed", error: "baseurl", status: result.status, detail: result.detail };
  }

  return { kind: "skipped" };
}

/**
 * 把修正后的 baseUrl 持久化到 openclaw.json（models.providers[providerId].baseUrl）。
 * 若 provider 尚不存在则跳过（读取源可能来自 models.json 等其它位置）。
 */
async function persistProviderBaseUrl(
  providerId: string,
  baseUrl: string,
  cfg?: ReturnType<typeof loadConfig>,
): Promise<void> {
  const config = cfg ?? loadConfig();
  const providers = config.models?.providers;
  if (!providers || typeof providers !== "object" || !providers[providerId]) {
    return;
  }
  const existing = providers[providerId] as { baseUrl?: unknown };
  if (existing.baseUrl === baseUrl) {
    return;
  }
  try {
    (providers[providerId] as Record<string, unknown>).baseUrl = baseUrl;
    await writeConfigFile(config);
  } catch {
    // 静默：写回失败不阻断交互流程
  }
}
export const MODELS_VERIFIED_FILENAME = "models-verified.json";

type ModelsVerifiedFile = {
  version: number;
  providers: Record<string, string[]>;
};

function resolveModelsVerifiedPath(): string {
  return path.join(resolveStateDir(), MODELS_VERIFIED_FILENAME);
}

/**
 * 读取已验证模型文件（不存在则返回空）。
 */
export function loadModelsVerified(): ModelsVerifiedFile {
  const raw = loadJsonFile(resolveModelsVerifiedPath());
  if (
    raw &&
    typeof raw === "object" &&
    (raw as ModelsVerifiedFile).providers &&
    typeof (raw as ModelsVerifiedFile).providers === "object"
  ) {
    return raw as ModelsVerifiedFile;
  }
  return { version: 1, providers: {} };
}

/**
 * 把 GET /models 拿到的真实模型 id（纯字符串列表）合并进独立文件 models-verified.json。
 * 合并策略：保留已有 id，追加真实新增的（去重），不整体覆盖。
 * 静默执行：失败不中断主流程。
 */
export async function mergeVerifiedModelsIntoFile(
  providerId: string,
  realModelIds: string[],
): Promise<void> {
  try {
    const file = loadModelsVerified();
    const existing = file.providers[providerId] ?? [];
    const seen = new Set(existing);
    const added = realModelIds.filter((id) => !seen.has(id));
    if (added.length === 0) {
      return;
    }
    file.providers[providerId] = [...existing, ...added];
    saveJsonFile(resolveModelsVerifiedPath(), file);
  } catch {
    // 静默：写回失败不应影响验证主流程
  }
}

/**
 * 主模型与真实模型列表不一致时，让用户纠正默认模型。
 * - 读取 agents.defaults.model.primary（如 "qwen-portal/coder-model"）
 * - 若其 model 段不在 realModels 里（硬编码模型名失效 / 厂商换网关），从真实列表挑一个
 * - 返回是否做了纠正
 */
async function maybeCorrectDefaultModel(params: {
  providerId: string;
  baseUrl: string;
  realModels: string[];
  prompter: WizardPrompter;
  cfg?: ReturnType<typeof loadConfig>;
}): Promise<boolean> {
  const { providerId, realModels, prompter, cfg } = params;
  const config = cfg ?? loadConfig();
  const current = resolveAgentModelPrimaryValue(config.agents?.defaults?.model);
  if (!current) {
    return false;
  }
  // primary 形如 "providerId/modelId"，取 model 段比对
  const slashIdx = current.indexOf("/");
  const currentModelId = slashIdx === -1 ? current : current.slice(slashIdx + 1);
  if (realModels.includes(currentModelId)) {
    return false;
  }

  const candidates = realModels
    .filter((id) => id.toLowerCase().includes("coder") || id.toLowerCase().includes("qwen"))
    .slice(0, 40);
  const pool = candidates.length > 0 ? candidates : realModels.slice(0, 40);

  const choice = await prompter.select<"pick" | "keep">({
    message: `当前默认模型 "${current}" 不在 ${providerId} 返回的真实列表里（可能模型名已变更 / 网关切换）。`,
    options: [
      { value: "pick", label: "从真实模型里选一个", hint: `共 ${realModels.length} 个` },
      { value: "keep", label: "保持现状" },
    ],
  });
  if (choice !== "pick") {
    return false;
  }

  const picked = await prompter.select<string>({
    message: "选择默认模型",
    options: pool.map((id) => ({ value: id, label: id })),
  });
  if (!picked) {
    return false;
  }

  const newPrimary = `${providerId}/${picked}`;
  try {
    applyDefaultModel(config, newPrimary);
    await writeConfigFile(config);
    await prompter.note(`默认模型已改为 ${newPrimary}`, "Default model");
    return true;
  } catch {
    return false;
  }
}
