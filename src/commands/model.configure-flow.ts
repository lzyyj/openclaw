import { ensureAuthProfileStore } from "../agents/auth-profiles.js";
import { getText } from "../cli/i18n.js";
/**
 * 模型配置统一流程（configure / onboard / config 共用）。
 *
 * 历史背景：configure.gateway-auth.ts 的 `promptAuthConfig` 和 wizard/onboarding.ts
 * 的模型配置段原本是两份近似的重复代码，行为漂移导致 onboard 落后于 configure 的修复
 * （如 deferModelConfiguredNote、备用模型选择、verify 先于选模型等）。本文件把
 * "厂商认证 + 验证拉真实模型 + 选主模型 + 选备用/allowlist + 完成 note" 抽成一份，
 * 三处入口统一调用，避免再次分叉。
 *
 * 行为开关（对齐两处原始差异）：
 * - authChoice 预设（非交互/quickstart 脚本）时不弹模型选择（保留 onboard 语义）。
 * - includeFallbacks 控制是否选备用模型（默认 true，onboard 统一打开）。
 * - warnIfOff 控制模型配置后是否做 warnIfModelConfigLooksOff 检查（onboard 用）。
 */
import type { OpenClawConfig } from "../config/config.js";
import { resolveAgentModelPrimaryValue } from "../config/model-input.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { PROVIDER_TO_GROUP_ID_REVERSE } from "./auth-choice-options.js";
import { promptAuthChoiceGrouped } from "./auth-choice-prompt.js";
import {
  applyAuthChoice,
  resolvePreferredProviderForAuthChoice,
  warnIfModelConfigLooksOff,
} from "./auth-choice.js";
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
import type { AuthChoice, OnboardOptions } from "./onboard-types.js";
import { verifyProviderInteractive } from "./provider-verify.js";

/** 从 authChoice 解析 providerId（-api-key 后缀 + 特殊映射 + 分组反向映射）。 */
export function resolveAuthChoiceProviderId(authChoice: string): string | undefined {
  if (!authChoice || authChoice === "custom-api-key") {
    return undefined;
  }
  if (authChoice === "skip") {
    return undefined;
  }
  if (authChoice.endsWith("-api-key")) {
    return authChoice.slice(0, -"-api-key".length);
  }
  const special: Record<string, string> = {
    "ai-gateway-api-key": "vercel-ai-gateway",
    "kimi-code-api-key": "kimi-coding",
  };
  if (special[authChoice]) {
    return special[authChoice];
  }
  // 分组 id → provider id 反向映射（与 auth-choice-options.ts 保持一致）。
  return PROVIDER_TO_GROUP_ID_REVERSE[authChoice];
}

/** Anthropic OAuth 相关 authChoice 判定（含 oauth/setup-token）。 */
function isAnthropicOAuth(authChoice: string): boolean {
  return authChoice === "setup-token" || authChoice === "token" || authChoice === "oauth";
}

export type ConfigureModelFlowParams = {
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  /** 传入的 config 快照，由外层向导统一保存。 */
  cfg: OpenClawConfig;
  /** 预设 authChoice（非交互/quickstart 传参）。undefined = 弹厂商选择提示。 */
  authChoice?: AuthChoice;
  opts?: Partial<OnboardOptions>;
  /** 厂商选择列表是否含 skip 项。 */
  includeSkip?: boolean;
  /** 选完主模型后是否选备用模型（默认 true，与 configure 一致）。 */
  includeFallbacks?: boolean;
  /** 模型配置后是否调 warnIfModelConfigLooksOff（onboarding 用）。 */
  warnIfOff?: boolean;
};

export type ConfigureModelFlowResult = {
  config: OpenClawConfig;
};

/**
 * 统一模型配置流程：
 *   厂商认证(defer note) → 验证拉真实模型(try/catch) → 选主模型 → 选备用/allowlist → 完成 note。
 */
export async function configureModelFlow(
  params: ConfigureModelFlowParams,
): Promise<ConfigureModelFlowResult> {
  const { prompter, runtime, cfg } = params;
  const opts = params.opts;
  const includeFallbacks = params.includeFallbacks ?? true;
  const includeSkip = params.includeSkip ?? true;
  let next: OpenClawConfig = cfg;

  const authChoiceFromPrompt = params.authChoice === undefined;
  let addProviderConfigured: OpenClawConfig | null = null;
  const authChoice =
    params.authChoice ??
    (await promptAuthChoiceGrouped({
      prompter,
      store: ensureAuthProfileStore(undefined, { allowKeychainPrompt: false }),
      includeSkip,
      runtime,
      config: cfg,
      // Add provider 完整配置完成后：接管 config，跳过 applyAuthChoice
      onAddProviderConfigured: (configured) => {
        addProviderConfigured = configured;
        return true;
      },
    }));

  // Add provider 已完整配置（含新厂商 + 主模型）：直接走备用模型收尾。
  if (addProviderConfigured) {
    let customNext = addProviderConfigured;
    if (authChoiceFromPrompt && includeFallbacks) {
      const chosenDefaultModel = resolveAgentModelPrimaryValue(customNext.agents?.defaults?.model);
      if (chosenDefaultModel) {
        customNext = applyModelAllowlist(customNext, [chosenDefaultModel]);
        const fallbackSelection = await promptModelFallbacks({
          config: customNext,
          prompter,
          allowEmpty: true,
        });
        if (fallbackSelection.models) {
          customNext = applyModelFallbacks(customNext, fallbackSelection.models);
        }
      }
    }
    if (params.warnIfOff) {
      await warnIfModelConfigLooksOff(customNext, prompter);
    }
    return { config: customNext };
  }

  // 自定义 API key：单独流程（不配置具体厂商）。
  if (authChoice === "custom-api-key") {
    const customResult = await promptCustomApiConfig({ prompter, runtime, config: next });
    if (params.warnIfOff) {
      await warnIfModelConfigLooksOff(customResult.config, prompter);
    }
    return { config: customResult.config };
  }

  // Skip：保留现有认证，仅让用户选择/保留主模型名称。
  if (authChoice === "skip") {
    const existingModel = resolveAgentModelPrimaryValue(next.agents?.defaults?.model);
    const currentProvider = existingModel?.split("/")[0]?.trim();
    const modelSelection = await promptDefaultModel({
      config: next,
      prompter,
      allowKeep: true,
      ignoreAllowlist: true,
      preferredProvider:
        resolvePreferredProviderForAuthChoice(authChoice) ?? (currentProvider || undefined),
    });
    if (modelSelection.config) {
      next = modelSelection.config;
    }
    if (modelSelection.model) {
      next = applyPrimaryModel(next, modelSelection.model);
    }
    if (params.warnIfOff) {
      await warnIfModelConfigLooksOff(next, prompter);
    }
    return { config: next };
  }

  // 常规厂商配置。
  // 1) 配置 provider + 存 key；defer note，避免在选具体模型前就宣告"模型配置完成"。
  const authResult = await applyAuthChoice({
    authChoice,
    config: next,
    prompter,
    runtime,
    setDefaultModel: true,
    deferModelConfiguredNote: true,
    opts: {
      tokenProvider: opts?.tokenProvider,
      token: opts?.authChoice === "apiKey" && opts?.token ? opts.token : undefined,
    },
  });
  next = authResult.config;

  // 2) 验证 + 拉取真实模型（GET {baseUrl}/models）。失败不阻断（内部处理重输 key/跳过）。
  //    仅当用户从提示里选厂商（而非预设 authChoice）时才做交互式验证？
  //    —— 预设 authChoice（quickstart/脚本）也应验证，但为对齐原行为，这里与原有条件一致：
  //    原 onboard 无条件验证（预设也验证）；原 configure 也是。此处保持无条件验证。
  const verifyProviderId = resolveAuthChoiceProviderId(authChoice);
  if (verifyProviderId) {
    try {
      await verifyProviderInteractive({
        providerId: verifyProviderId,
        methodId: authChoice,
        prompter,
        cfg: next,
      });
    } catch {
      // 静默：verify 意外失败（网络异常等）不阻断向导
    }
  }

  // 3) 选择主模型名称（verify 已拉取真实模型，列表含真实模型而非旧硬编码别名）。
  //    仅当用户从提示里选厂商时弹模型选择（保留 onboard 的 authChoiceFromPrompt 语义）。
  if (authChoiceFromPrompt) {
    const modelSelection = await promptDefaultModel({
      config: next,
      prompter,
      allowKeep: true,
      ignoreAllowlist: true,
      includeVllm: true,
      preferredProvider: resolvePreferredProviderForAuthChoice(authChoice),
    });
    if (modelSelection.config) {
      next = modelSelection.config;
    }
    if (modelSelection.model) {
      next = applyPrimaryModel(next, modelSelection.model);
    }

    // 4) 备用模型与 allowlist（与 configure 一致）。
    if (includeFallbacks) {
      if (isAnthropicOAuth(authChoice)) {
        // Anthropic OAuth：展示受限 allowlist。
        const allowlistSelection = await promptModelAllowlist({
          config: next,
          prompter,
          allowedKeys: ANTHROPIC_OAUTH_MODEL_KEYS,
          initialSelections: ["anthropic/claude-sonnet-4-6"],
          message: getText(
            "configure.gateway-auth.anthropic_oauth_models",
            "Anthropic OAuth models",
          ),
        });
        if (allowlistSelection.models) {
          next = applyModelAllowlist(next, allowlistSelection.models);
          next = applyModelFallbacksFromSelection(next, allowlistSelection.models);
        }
      } else {
        // API-key 厂商：主模型自动进 allowlist，备用模型让用户管理。
        const chosenDefaultModel = resolveAgentModelPrimaryValue(next.agents?.defaults?.model);
        if (chosenDefaultModel) {
          next = applyModelAllowlist(next, [chosenDefaultModel]);
        }
        const fallbackSelection = await promptModelFallbacks({
          config: next,
          prompter,
          preferredProvider: chosenDefaultModel
            ? chosenDefaultModel.split("/")[0]?.trim()
            : undefined,
        });
        if (fallbackSelection.mode === "set") {
          next = applyModelFallbacks(next, fallbackSelection.fallbacks);
        } else if (fallbackSelection.mode === "clear") {
          next = applyModelFallbacks(next, []);
        }
      }
    }

    // 5) 模型名称已确认，此时才宣告"模型配置完成"（见 applyAuthChoice 的 defer）。
    const finalPrimary = resolveAgentModelPrimaryValue(next.agents?.defaults?.model);
    if (finalPrimary) {
      await prompter.note(
        getText("configure.model.kept_existing", "Default model kept ({model})", {
          model: finalPrimary,
        }),
        getText("configure.model.configured", "Model configured"),
      );
    }
  }

  if (params.warnIfOff) {
    await warnIfModelConfigLooksOff(next, prompter);
  }

  return { config: next };
}

// Anthropic OAuth 受限模型清单（单一来源，configure.gateway-auth.ts 引用本导出）。
export const ANTHROPIC_OAUTH_MODEL_KEYS = [
  "anthropic/claude-sonnet-4-6",
  "anthropic/claude-opus-4-6",
  "anthropic/claude-opus-4-5",
  "anthropic/claude-sonnet-4-5",
  "anthropic/claude-haiku-4-5",
];
