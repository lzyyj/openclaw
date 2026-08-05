import type { AuthProfileStore } from "../agents/auth-profiles.js";
import { getText } from "../cli/i18n.js";
import type { OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { buildAuthChoiceGroupsFromRegistry, PROVIDER_TO_GROUP_ID } from "./auth-choice-options.js";
import { addAuthMethod } from "./auth-registry/index.js";
import type { AuthMethodType } from "./auth-registry/types.js";
import {
  buildEndpointIdFromUrl,
  findExistingProviderByBaseUrl,
  promptCustomApiCore,
} from "./onboard-custom.js";
import type { AuthChoice } from "./onboard-types.js";

const BACK_VALUE = "__back";
const ADD_PROVIDER_VALUE = "__add_provider";

/** Infer the group value from a model key (e.g. "deepseek/deepseek-chat" -> "deepseek"). */
function resolveGroupFromModel(modelKey: string): string | undefined {
  // Model keys are typically "provider/model-name" — the part before "/" is the provider.
  const slashIdx = modelKey.indexOf("/");
  if (slashIdx === -1) {
    return undefined;
  }
  const providerId = modelKey.slice(0, slashIdx);
  // 归一化：provider id 与分组 id 不一致时，映射到 UI 分组（如 "qwen-portal" -> group "qwen"）。
  return PROVIDER_TO_GROUP_ID[providerId] ?? providerId;
}

/** Resolve the initial group value for the provider selection based on existing config model. */
export function resolveInitialGroupFromConfig(modelKey: string | undefined): string | undefined {
  if (!modelKey) {
    return undefined;
  }
  return resolveGroupFromModel(modelKey);
}

/** 认证类型 → 可选列表（供新增厂商时选择） */
const AUTH_METHOD_TYPE_OPTIONS: Array<{ value: AuthMethodType; label: string }> = [
  { value: "api-key", label: "API Key" },
  { value: "oauth", label: "OAuth / Device code" },
  { value: "setup-token", label: "Setup Token" },
  { value: "subscription", label: "Subscription (Coding Plan / Copilot)" },
  { value: "cli", label: "CLI plugin" },
  { value: "proxy", label: "Local proxy" },
];

/**
 * 新增厂商完整流程：
 * 1) API Base URL（用户最确定的，可能不知道厂商名）→ 按 baseUrl 检索已有数据
 * 2) 命中已有厂商 → 复用（合并，不重复注册）
 * 3) 未命中 → 厂商名（可选）+ 官网（可选）→ 注册表写入（含 baseUrl/website）
 * 4) 有 runtime+config 时走完整配置（key/兼容性/model/验证/写 config）
 *
 * 返回认证方式 id（AuthChoice）；取消返回 null。
 */
async function promptAddProvider(params: {
  prompter: WizardPrompter;
  runtime?: RuntimeEnv;
  config?: OpenClawConfig;
  onAddProviderConfigured?: (config: OpenClawConfig) => boolean;
}): Promise<AuthChoice | null> {
  const { prompter, runtime, config } = params;

  await prompter.note(
    getText(
      "configure.model.add_provider.intro",
      "Add a new provider. This writes to the local auth registry (~/.openclaw/auth-registry.json).\nYou can edit that file directly later to add more auth methods or mark them unavailable.",
    ),
    getText("configure.model.add_provider.title", "Add provider"),
  );

  // 1) 先问 API Base URL —— 这是用户最确定的信息；用它检索已有厂商避免重复注册。
  const baseUrlInput = (
    await prompter.text({
      message: getText("configure.model.add_provider.base_url", "API Base URL"),
      placeholder: "https://api.example.com/v1",
      validate: (val) => {
        try {
          new URL(val);
          return undefined;
        } catch {
          return getText(
            "configure.model.add_provider.base_url_invalid",
            "Please enter a valid URL (e.g. https://api.example.com/v1)",
          );
        }
      },
    })
  ).trim();

  if (!baseUrlInput) {
    await prompter.note(
      getText("configure.model.add_provider.cancelled", "Base URL empty — cancelled."),
      getText("configure.model.choice_title", "Model/auth choice"),
    );
    return null;
  }

  // 2) 按 baseUrl 检索已有厂商（config providers + 注册表）→ 命中则复用
  const existing = config ? findExistingProviderByBaseUrl({ config, baseUrl: baseUrlInput }) : null;
  if (existing) {
    await prompter.note(
      getText(
        "configure.model.add_provider.existing",
        'Found existing provider "{{name}}" ({{id}}) with the same base URL — reusing it instead of creating a duplicate.',
        { name: existing.name, id: existing.providerId },
      ),
      getText("configure.model.add_provider.title", "Add provider"),
    );
    // 复用已有 providerId，继续走完整配置（key/model 等）
    if (runtime && config) {
      const coreResult = await runCustomApiCoreForProvider({
        prompter,
        runtime,
        config,
        baseUrl: baseUrlInput,
        providerId: existing.providerId,
      });
      if (coreResult && params.onAddProviderConfigured?.(coreResult.config)) {
        // 调用方已接管最终 config，不再走 applyAuthChoice
        return null;
      }
      return coreResult?.methodId ?? null;
    }
    // 无 runtime/config（旧调用方）：仅提示，返回 null 让用户重新选择
    await prompter.note(
      getText(
        "configure.model.add_provider.reuse_hint",
        'Provider "{{id}}" already configured. Pick it from the list above to continue.',
        { id: existing.providerId },
      ),
      getText("configure.model.choice_title", "Model/auth choice"),
    );
    return null;
  }

  // 3) 未命中：问厂商名（可选）+ 官网（可选），注册表写入
  const suggestedId = buildEndpointIdFromUrl(baseUrlInput);
  const providerName = (
    await prompter.text({
      message: getText(
        "configure.model.add_provider.name",
        "Provider name (optional, default from URL)",
      ),
      placeholder: suggestedId,
      initialValue: "",
    })
  ).trim();
  const resolvedName = providerName || suggestedId;

  const providerId = resolvedName.toLowerCase().replace(/\s+/g, "-");
  if (!/^[a-z0-9-]+$/.test(providerId)) {
    await prompter.note(
      getText(
        "configure.model.add_provider.invalid_id",
        'Invalid provider id (use letters/numbers/hyphens): "{{id}}"',
        { id: providerId },
      ),
      getText("configure.model.choice_title", "Model/auth choice"),
    );
    return null;
  }

  const website = (
    await prompter.text({
      message: getText("configure.model.add_provider.website", "Provider website (optional)"),
      placeholder: "https://example.com",
      initialValue: "",
    })
  ).trim();

  const methodName = (
    await prompter.text({
      message: getText(
        "configure.model.add_provider.method_name",
        "Auth method name (e.g. API Key)",
      ),
      placeholder: "API Key",
    })
  ).trim();
  if (!methodName) {
    await prompter.note(
      getText("configure.model.add_provider.cancelled", "Auth method name empty — cancelled."),
      getText("configure.model.choice_title", "Model/auth choice"),
    );
    return null;
  }

  const methodType = await prompter.select({
    message: getText("configure.model.add_provider.method_type", "Auth method type"),
    options: AUTH_METHOD_TYPE_OPTIONS,
  });

  // method id = providerId + 类型后缀
  const methodId = `${providerId}-${methodType === "api-key" ? "api-key" : methodType}`;
  const methodLabel = `${resolvedName} ${methodName}`;

  const added = addAuthMethod({
    providerId,
    providerName: resolvedName,
    providerBaseUrl: baseUrlInput,
    ...(website ? { providerWebsite: website } : {}),
    method: {
      id: methodId,
      name: methodName,
      type: methodType,
      label: methodLabel,
      channelStatus: "unknown",
    },
  });

  if (!added) {
    await prompter.note(
      getText(
        "configure.model.add_provider.exists",
        'Auth method "{{id}}" already exists in the registry.',
        { id: methodId },
      ),
      getText("configure.model.choice_title", "Model/auth choice"),
    );
    return null;
  }

  await prompter.note(
    getText("configure.model.add_provider.done", 'Added "{{id}}" to the auth registry.', {
      id: methodId,
    }),
    getText("configure.model.add_provider.title", "Add provider"),
  );

  // 4) 有 runtime+config：继续完整配置（key/兼容性/model/验证/写 config）
  if (runtime && config) {
    const coreResult = await runCustomApiCoreForProvider({
      prompter,
      runtime,
      config,
      baseUrl: baseUrlInput,
      providerId,
    });
    if (coreResult && params.onAddProviderConfigured?.(coreResult.config)) {
      // 调用方已接管最终 config，不再走 applyAuthChoice
      return null;
    }
    return coreResult?.methodId ?? null;
  }

  // 无 runtime/config（旧调用方）：仅注册，返回 methodId
  return methodId as AuthChoice;
}

/** 复用 providerId 走自定义厂商核心配置流程（key/兼容性/model/验证/写 config）。 */
async function runCustomApiCoreForProvider(params: {
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  config: OpenClawConfig;
  baseUrl: string;
  providerId: string;
}): Promise<{ methodId: AuthChoice; config: OpenClawConfig } | null> {
  const { prompter, runtime, config, baseUrl, providerId } = params;

  // 问 API key（可留空）——复用核心流程前先收集 key
  const apiKeyInput = (
    await prompter.text({
      message: getText(
        "configure.model.add_provider.api_key",
        "API Key (leave blank if not required)",
      ),
      placeholder: "sk-...",
      initialValue: "",
    })
  ).trim();

  const result = await promptCustomApiCore({
    prompter,
    runtime,
    config,
    baseUrl,
    apiKey: apiKeyInput,
    providerId,
    askAlias: false,
  });

  if (!result.config) {
    return null;
  }

  // 配置写入成功，返回认证方式 id（与注册表 methodId 一致）+ 最终 config
  return {
    methodId: `${providerId}-api-key` as AuthChoice,
    config: result.config,
  };
}

export async function promptAuthChoiceGrouped(params: {
  prompter: WizardPrompter;
  store: AuthProfileStore;
  includeSkip: boolean;
  /** Initial group to pre-select (e.g. "deepseek" for current model "deepseek/deepseek-chat"). */
  initialGroupValue?: string;
  /** 提供时，Add provider 走完整配置流程（key/兼容性/model/验证/写 config） */
  runtime?: RuntimeEnv;
  config?: OpenClawConfig;
  /**
   * Add provider 完整配置完成后回调（携带最终 config）。
   * 返回 true 表示调用方已接管（不再返回 methodId 给 applyAuthChoice）。
   */
  onAddProviderConfigured?: (config: OpenClawConfig) => boolean;
}): Promise<AuthChoice> {
  // 方案 A：优先从注册表构建分组（动态可维护）；注册表为空时退回旧逻辑由调用方兜底。
  const { groups, skipOption } = buildAuthChoiceGroupsFromRegistry({
    includeSkip: params.includeSkip,
    excludeCustom: true,
  });
  const availableGroups = groups.filter((group) => group.options.length > 0);

  while (true) {
    // 只有可用认证方式的厂商才展示（disabled 的厂商/方式已被过滤）
    const providerOptions = [
      ...availableGroups.map((group) => ({
        value: group.value,
        label: group.label,
        hint: group.hint,
      })),
      // 新增厂商入口
      {
        value: ADD_PROVIDER_VALUE,
        label: getText("configure.model.add_provider.option", "➕ Add provider"),
        hint: getText(
          "configure.model.add_provider.option_hint",
          "Register a new vendor / auth method",
        ),
      },
      ...(skipOption ? [skipOption] : []),
    ];

    const providerSelection = (await params.prompter.select({
      message: getText("configure.model.auth_provider", "Model/auth provider"),
      options: providerOptions,
      initialValue: params.initialGroupValue as unknown,
    })) as string;

    if (providerSelection === "skip") {
      return "skip";
    }

    // 新增厂商流程
    if (providerSelection === ADD_PROVIDER_VALUE) {
      const added = await promptAddProvider({
        prompter: params.prompter,
        runtime: params.runtime,
        config: params.config,
        onAddProviderConfigured: params.onAddProviderConfigured,
      });
      if (added) {
        return added;
      }
      continue;
    }

    const group = availableGroups.find((candidate) => candidate.value === providerSelection);

    if (!group || group.options.length === 0) {
      await params.prompter.note(
        getText("configure.model.no_auth_methods", "No auth methods available for that provider."),
        getText("configure.model.choice_title", "Model/auth choice"),
      );
      continue;
    }

    if (group.options.length === 1) {
      return group.options[0].value;
    }

    const methodSelection = await params.prompter.select({
      message: `${group.label} ${getText("configure.model.auth_method", "auth method")}`,
      options: [...group.options, { value: BACK_VALUE, label: getText("configure.back", "Back") }],
    });

    if (methodSelection === BACK_VALUE || methodSelection === ADD_PROVIDER_VALUE) {
      continue;
    }

    return methodSelection as AuthChoice;
  }
}
