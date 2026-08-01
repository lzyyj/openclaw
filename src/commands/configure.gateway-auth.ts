import { ensureAuthProfileStore } from "../agents/auth-profiles.js";
import type { OpenClawConfig, GatewayAuthConfig } from "../config/config.js";
import { resolveAgentModelPrimaryValue } from "../config/model-input.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { PROVIDER_TO_GROUP_ID_REVERSE } from "./auth-choice-options.js";
import { promptAuthChoiceGrouped, resolveInitialGroupFromConfig } from "./auth-choice-prompt.js";
import { applyAuthChoice, resolvePreferredProviderForAuthChoice } from "./auth-choice.js";
import {
  applyModelAllowlist,
  applyModelFallbacks,
  applyModelFallbacksFromSelection,
  applyPrimaryModel,
  promptDefaultModel,
  promptModelAllowlist,
  promptModelFallbacks,
} from "./model-picker.js";
import { promptCustomApiConfig } from "./onboard-custom.js";
import { randomToken } from "./onboard-helpers.js";
import { verifyProviderInteractive } from "./provider-verify.js";

type GatewayAuthChoice = "token" | "password" | "trusted-proxy";

/** Reject undefined, empty, and common JS string-coercion artifacts for token auth. */
function sanitizeTokenValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") {
    return undefined;
  }
  return trimmed;
}

const ANTHROPIC_OAUTH_MODEL_KEYS = [
  "anthropic/claude-sonnet-4-6",
  "anthropic/claude-opus-4-6",
  "anthropic/claude-opus-4-5",
  "anthropic/claude-sonnet-4-5",
  "anthropic/claude-haiku-4-5",
];

/**
 * 从 auth choice（认证方式 id）推导出厂商 provider id，用于定位 config 里的
 * models.providers[providerId]（读取 baseUrl/apiKey 做验证）。
 * - "deepseek-api-key" -> "deepseek"
 * - "moonshot-api-key" -> "moonshot"
 * - "openrouter-api-key" -> "openrouter"
 * - "qwen-portal-api-key" -> "qwen-portal"（strip 后缀即可，已是规范 provider id）
 * - "qwen"（分组 id）       -> "qwen-portal"（经归一化映射）
 * 若无法可靠推导（如 custom-api-key / qwen-portal OAuth），返回 undefined（跳过验证）。
 */
function providerIdFromAuthChoice(authChoice: string): string | undefined {
  if (authChoice.endsWith("-api-key")) {
    return authChoice.slice(0, -"-api-key".length);
  }
  // 特殊映射：部分 authChoice 与 provider id 不完全一致
  const special: Record<string, string> = {
    "ai-gateway-api-key": "vercel-ai-gateway",
    "kimi-code-api-key": "kimi-coding",
  };
  if (special[authChoice]) {
    return special[authChoice];
  }
  // 分组 id → provider id 归一化（group "qwen" -> provider "qwen-portal"）。
  // 与 auth-choice-prompt 的 provider→group 映射保持一致，确保 authChoice 以分组名出现时
  // 也能解析到规范 provider id。
  return PROVIDER_TO_GROUP_ID_REVERSE[authChoice];
}

export function buildGatewayAuthConfig(params: {
  existing?: GatewayAuthConfig;
  mode: GatewayAuthChoice;
  token?: string;
  password?: string;
  trustedProxy?: {
    userHeader: string;
    requiredHeaders?: string[];
    allowUsers?: string[];
  };
}): GatewayAuthConfig | undefined {
  const allowTailscale = params.existing?.allowTailscale;
  const base: GatewayAuthConfig = {};
  if (typeof allowTailscale === "boolean") {
    base.allowTailscale = allowTailscale;
  }

  if (params.mode === "token") {
    // Keep token mode always valid: treat empty/undefined/"undefined"/"null" as missing and generate a token.
    const token = sanitizeTokenValue(params.token) ?? randomToken();
    return { ...base, mode: "token", token };
  }
  if (params.mode === "password") {
    const password = params.password?.trim();
    return { ...base, mode: "password", ...(password && { password }) };
  }
  if (params.mode === "trusted-proxy") {
    if (!params.trustedProxy) {
      throw new Error("trustedProxy config is required when mode is trusted-proxy");
    }
    return { ...base, mode: "trusted-proxy", trustedProxy: params.trustedProxy };
  }
  return base;
}

export async function promptAuthConfig(
  cfg: OpenClawConfig,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<OpenClawConfig> {
  const existingModel = cfg.agents?.defaults?.model
    ? resolveAgentModelPrimaryValue(cfg.agents.defaults.model)
    : undefined;
  const authChoice = await promptAuthChoiceGrouped({
    prompter,
    store: ensureAuthProfileStore(undefined, {
      allowKeychainPrompt: false,
    }),
    includeSkip: true,
    initialGroupValue: resolveInitialGroupFromConfig(existingModel),
  });

  let next = cfg;
  if (authChoice === "custom-api-key") {
    const customResult = await promptCustomApiConfig({ prompter, runtime, config: next });
    next = customResult.config;
  } else if (authChoice !== "skip") {
    const applied = await applyAuthChoice({
      authChoice,
      config: next,
      prompter,
      runtime,
      setDefaultModel: true,
    });
    next = applied.config;
  } else {
    const modelSelection = await promptDefaultModel({
      config: next,
      prompter,
      allowKeep: true,
      ignoreAllowlist: true,
      preferredProvider: resolvePreferredProviderForAuthChoice(authChoice),
    });
    if (modelSelection.config) {
      next = modelSelection.config;
    }
    if (modelSelection.model) {
      next = applyPrimaryModel(next, modelSelection.model);
    }
  }

  const anthropicOAuth =
    authChoice === "setup-token" || authChoice === "token" || authChoice === "oauth";

  if (authChoice !== "custom-api-key" && authChoice !== "skip") {
    if (anthropicOAuth) {
      // For Anthropic OAuth, show the model allowlist with limited set
      const allowlistSelection = await promptModelAllowlist({
        config: next,
        prompter,
        allowedKeys: ANTHROPIC_OAUTH_MODEL_KEYS,
        initialSelections: ["anthropic/claude-sonnet-4-6"],
        message: "Anthropic OAuth models",
      });
      if (allowlistSelection.models) {
        next = applyModelAllowlist(next, allowlistSelection.models);
        next = applyModelFallbacksFromSelection(next, allowlistSelection.models);
      }
    } else {
      // API-key providers: auto-populate allowlist with the chosen default model,
      // no interactive multi-select needed (too many models for most providers).
      // Primary model lives under agents.defaults.model (not models.primary).
      const chosenDefaultModel = resolveAgentModelPrimaryValue(next.agents?.defaults?.model);
      if (chosenDefaultModel) {
        next = applyModelAllowlist(next, [chosenDefaultModel]);
      }
      // Fallback (backup) models share the same model pool as the primary — only
      // priority differs. Let the user manage them here so stale/hand-edited
      // fallbacks (e.g. providers without a configured key) get cleaned up.
      const fallbackSelection = await promptModelFallbacks({
        config: next,
        prompter,
      });
      if (fallbackSelection.mode === "set") {
        next = applyModelFallbacks(next, fallbackSelection.fallbacks);
      } else if (fallbackSelection.mode === "clear") {
        next = applyModelFallbacks(next, []);
      }

      // 拿到 key 后，交互式验证厂商配置（GET /models）：成功升 ok、动态取模型写回；
      // baseUrl 错（404/超时）会展示当前 baseUrl 供用户现场修改后重试；认证错提示改 key。
      // 相比静默后台验证，让 baseUrl 变更/厂商换网关时能就地维护，不硬编码。
      // 传入 next（向导正在构建的 config 快照），验证内对 baseUrl/默认模型的修正
      // 直接作用于此快照，由外层向导统一保存 —— 避免内层另存被外层旧快照覆盖，
      // 导致"保存的模型与启动读取不一致"。
      const providerId = providerIdFromAuthChoice(authChoice);
      if (providerId) {
        await verifyProviderInteractive({
          providerId,
          methodId: authChoice,
          prompter,
          cfg: next,
        });
      }
    }
  }

  return next;
}
