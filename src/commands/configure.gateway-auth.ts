import { ensureAuthProfileStore } from "../agents/auth-profiles.js";
import type { OpenClawConfig, GatewayAuthConfig } from "../config/config.js";
import { resolveAgentModelPrimaryValue } from "../config/model-input.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
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
      const chosenDefaultModel = next.models?.primary;
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
    }
  }

  return next;
}
