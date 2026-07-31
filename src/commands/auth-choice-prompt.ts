import type { AuthProfileStore } from "../agents/auth-profiles.js";
import { getText } from "../cli/i18n.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { buildAuthChoiceGroupsFromRegistry } from "./auth-choice-options.js";
import { addAuthMethod } from "./auth-registry/index.js";
import type { AuthMethodType } from "./auth-registry/types.js";
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
  return modelKey.slice(0, slashIdx);
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
 * 新增厂商交互流程：依次询问厂商名、认证方式名、认证类型，写入注册表。
 * 返回新增的认证方式 id（AuthChoice）。
 */
async function promptAddProvider(prompter: WizardPrompter): Promise<AuthChoice | null> {
  await prompter.note(
    getText(
      "configure.model.add_provider.intro",
      "Add a new provider. This writes to the local auth registry (~/.openclaw/auth-registry.json).\nYou can edit that file directly later to add more auth methods or mark them unavailable.",
    ),
    getText("configure.model.add_provider.title", "Add provider"),
  );

  const providerName = (
    await prompter.text({
      message: getText("configure.model.add_provider.name", "Provider name (e.g. MyAI)"),
      placeholder: "MyAI",
    })
  ).trim();

  if (!providerName) {
    await prompter.note(
      getText("configure.model.add_provider.cancelled", "Provider name empty — cancelled."),
      getText("configure.model.choice_title", "Model/auth choice"),
    );
    return null;
  }

  // provider id = 小写、去空格、取首段
  const providerId = providerName.toLowerCase().replace(/\s+/g, "-");
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
  const methodLabel = `${providerName} ${methodName}`;

  const added = addAuthMethod({
    providerId,
    providerName,
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

  return methodId as AuthChoice;
}

export async function promptAuthChoiceGrouped(params: {
  prompter: WizardPrompter;
  store: AuthProfileStore;
  includeSkip: boolean;
  /** Initial group to pre-select (e.g. "deepseek" for current model "deepseek/deepseek-chat"). */
  initialGroupValue?: string;
}): Promise<AuthChoice> {
  // 方案 A：优先从注册表构建分组（动态可维护）；注册表为空时退回旧逻辑由调用方兜底。
  const { groups, skipOption } = buildAuthChoiceGroupsFromRegistry({
    includeSkip: params.includeSkip,
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
      const added = await promptAddProvider(params.prompter);
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
