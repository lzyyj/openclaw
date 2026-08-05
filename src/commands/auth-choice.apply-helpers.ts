import { listProfilesForProvider } from "../agents/auth-profiles/profiles.js";
import { ensureAuthProfileStore } from "../agents/auth-profiles/store.js";
import { resolveEnvApiKey } from "../agents/model-auth.js";
import { getText } from "../cli/i18n.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { formatApiKeyPreview } from "./auth-choice.api-key.js";
import type { ApplyAuthChoiceParams } from "./auth-choice.apply.js";
import { applyDefaultModelChoice } from "./auth-choice.default-model.js";

export function createAuthChoiceAgentModelNoter(
  params: ApplyAuthChoiceParams,
): (model: string) => Promise<void> {
  return async (model: string) => {
    if (!params.agentId) {
      return;
    }
    await params.prompter.note(
      getText(
        "configure.model.default_set_agent",
        `Default model set to ${model} for agent "${params.agentId}".`,
        { model, agentId: params.agentId },
      ),
      getText("configure.model.configured", "Model configured"),
    );
  };
}

export interface ApplyAuthChoiceModelState {
  config: ApplyAuthChoiceParams["config"];
  agentModelOverride: string | undefined;
}

export function createAuthChoiceModelStateBridge(bindings: {
  getConfig: () => ApplyAuthChoiceParams["config"];
  setConfig: (config: ApplyAuthChoiceParams["config"]) => void;
  getAgentModelOverride: () => string | undefined;
  setAgentModelOverride: (model: string | undefined) => void;
}): ApplyAuthChoiceModelState {
  return {
    get config() {
      return bindings.getConfig();
    },
    set config(config) {
      bindings.setConfig(config);
    },
    get agentModelOverride() {
      return bindings.getAgentModelOverride();
    },
    set agentModelOverride(model) {
      bindings.setAgentModelOverride(model);
    },
  };
}

export function createAuthChoiceDefaultModelApplier(
  params: ApplyAuthChoiceParams,
  state: ApplyAuthChoiceModelState,
): (
  options: Omit<
    Parameters<typeof applyDefaultModelChoice>[0],
    "config" | "setDefaultModel" | "noteAgentModel" | "prompter"
  >,
) => Promise<void> {
  const noteAgentModel = createAuthChoiceAgentModelNoter(params);

  return async (options) => {
    const applied = await applyDefaultModelChoice({
      config: state.config,
      setDefaultModel: params.setDefaultModel,
      noteAgentModel,
      prompter: params.prompter,
      deferModelConfiguredNote: params.deferModelConfiguredNote,
      ...options,
    });
    state.config = applied.config;
    state.agentModelOverride = applied.agentModelOverride ?? state.agentModelOverride;
  };
}

export function normalizeTokenProviderInput(
  tokenProvider: string | null | undefined,
): string | undefined {
  const normalized = String(tokenProvider ?? "")
    .trim()
    .toLowerCase();
  return normalized || undefined;
}

export async function maybeApplyApiKeyFromOption(params: {
  token: string | undefined;
  tokenProvider: string | undefined;
  expectedProviders: string[];
  normalize: (value: string) => string;
  setCredential: (apiKey: string) => Promise<void>;
}): Promise<string | undefined> {
  const tokenProvider = normalizeTokenProviderInput(params.tokenProvider);
  const expectedProviders = params.expectedProviders
    .map((provider) => normalizeTokenProviderInput(provider))
    .filter((provider): provider is string => Boolean(provider));
  if (!params.token || !tokenProvider || !expectedProviders.includes(tokenProvider)) {
    return undefined;
  }
  const apiKey = params.normalize(params.token);
  await params.setCredential(apiKey);
  return apiKey;
}

export async function ensureApiKeyFromOptionEnvOrPrompt(params: {
  token: string | undefined;
  tokenProvider: string | undefined;
  expectedProviders: string[];
  provider: string;
  envLabel: string;
  promptMessage: string;
  normalize: (value: string) => string;
  validate: (value: string) => string | undefined;
  prompter: WizardPrompter;
  setCredential: (apiKey: string) => Promise<void>;
  noteMessage?: string;
  noteTitle?: string;
}): Promise<string> {
  const optionApiKey = await maybeApplyApiKeyFromOption({
    token: params.token,
    tokenProvider: params.tokenProvider,
    expectedProviders: params.expectedProviders,
    normalize: params.normalize,
    setCredential: params.setCredential,
  });
  if (optionApiKey) {
    return optionApiKey;
  }

  if (params.noteMessage) {
    await params.prompter.note(params.noteMessage, params.noteTitle);
  }

  return await ensureApiKeyFromEnvOrPrompt({
    provider: params.provider,
    envLabel: params.envLabel,
    promptMessage: params.promptMessage,
    normalize: params.normalize,
    validate: params.validate,
    prompter: params.prompter,
    setCredential: params.setCredential,
  });
}

export async function ensureApiKeyFromEnvOrPrompt(params: {
  provider: string;
  envLabel: string;
  promptMessage: string;
  normalize: (value: string) => string;
  validate: (value: string) => string | undefined;
  prompter: WizardPrompter;
  setCredential: (apiKey: string) => Promise<void>;
}): Promise<string> {
  const envKey = resolveEnvApiKey(params.provider);
  if (envKey) {
    const useExisting = await params.prompter.confirm({
      message: getText(
        "configure.model.use_existing_key",
        `Use existing ${params.envLabel} (${envKey.source}, ${formatApiKeyPreview(envKey.apiKey)})?`,
        {
          envLabel: params.envLabel,
          source: envKey.source,
          preview: formatApiKeyPreview(envKey.apiKey),
        },
      ),
      initialValue: true,
    });
    if (useExisting) {
      await params.setCredential(envKey.apiKey);
      return envKey.apiKey;
    }
  }

  // 已保存的凭据（auth.json / auth-profiles.json）里若已有该 provider 的 key，
  // 提示用户沿用，避免重配时误以为 key 丢失而被迫重输。
  const savedKey = readSavedProviderApiKey(params.provider);
  if (savedKey) {
    const useSaved = await params.prompter.confirm({
      message: getText(
        "configure.model.use_saved_key",
        "Saved {provider} key found ({preview}). Use it or enter a new one?",
        { provider: params.provider, preview: formatApiKeyPreview(savedKey) },
      ),
      initialValue: true,
    });
    if (useSaved) {
      await params.setCredential(savedKey);
      return savedKey;
    }
  }

  const key = await params.prompter.text({
    message: params.promptMessage,
    initialValue: savedKey ?? "",
    validate: params.validate,
  });
  const apiKey = params.normalize(String(key ?? ""));
  await params.setCredential(apiKey);
  return apiKey;
}

/**
 * 读取本地 auth store（auth.json / auth-profiles.json）里已保存的 provider api_key。
 * 无则返回 undefined。仅用于 configure 重配时回显/沿用提示，不含环境变量。
 */
function readSavedProviderApiKey(provider: string): string | undefined {
  try {
    const store = ensureAuthProfileStore();
    const profileIds = listProfilesForProvider(store, provider);
    for (const id of profileIds) {
      const cred = store.profiles[id];
      if (cred?.type === "api_key" && cred.key) {
        return cred.key;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}
