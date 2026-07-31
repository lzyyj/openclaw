import path from "node:path";
import { resolveApiKeyForProvider } from "../agents/model-auth.js";
import { loadConfig } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import { loadJsonFile, saveJsonFile } from "../infra/json-file.js";
import { updateAuthMethodChannelStatus } from "./auth-registry/index.js";

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
 * 已验证模型文件（存放于 StateDir，如 ~/.openclaw/models-verified.json）。
 * 结构：{ providers: { [providerId]: string[] } } —— 纯字符串模型 id 列表。
 * 与 openclaw.json / models.json 解耦：不塞完整 ModelDefinitionConfig（避免假 cost 等兜底参数污染配置）。
 * 引擎层 provider models 必须是完整对象，故真实列表单独存，运行时按需补全对象。
 */
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
async function mergeVerifiedModelsIntoFile(
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
