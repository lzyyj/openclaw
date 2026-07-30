import { getText } from "../cli/i18n.js";
import type { AuthProfileStore } from "../agents/auth-profiles.js";
import { AUTH_CHOICE_LEGACY_ALIASES_FOR_CLI } from "./auth-choice-legacy.js";
import { ONBOARD_PROVIDER_AUTH_FLAGS } from "./onboard-provider-auth-flags.js";
import type { AuthChoice, AuthChoiceGroupId } from "./onboard-types.js";

export type { AuthChoiceGroupId };

export type AuthChoiceOption = {
  value: AuthChoice;
  label: string;
  hint?: string;
};
export type AuthChoiceGroup = {
  value: AuthChoiceGroupId;
  label: string;
  hint?: string;
  options: AuthChoiceOption[];
};

const hintApiKey = getText("configure.provider.hint.api_key", "API key");

const AUTH_CHOICE_GROUP_DEFS: {
  value: AuthChoiceGroupId;
  label: string;
  hint?: string;
  choices: AuthChoice[];
}[] = [
  {
    value: "openai",
    label: "OpenAI",
    hint: getText("configure.provider.openai.hint", "Codex OAuth + API key"),
    choices: ["openai-codex", "openai-api-key"],
  },
  {
    value: "anthropic",
    label: "Anthropic",
    hint: getText("configure.provider.anthropic.hint", "setup-token + API key"),
    choices: ["token", "apiKey"],
  },
  {
    value: "chutes",
    label: "Chutes",
    hint: getText("configure.provider.chutes.hint", "OAuth"),
    choices: ["chutes"],
  },
  {
    value: "vllm",
    label: "vLLM",
    hint: getText("configure.provider.vllm.hint", "Local/self-hosted OpenAI-compatible"),
    choices: ["vllm"],
  },
  {
    value: "minimax",
    label: "MiniMax",
    hint: getText("configure.provider.minimax.hint", "M2.5 (recommended)"),
    choices: ["minimax-portal", "minimax-api", "minimax-api-key-cn", "minimax-api-lightning"],
  },
  {
    value: "moonshot",
    label: "Moonshot AI (Kimi K2.5)",
    hint: getText("configure.provider.moonshot.hint", "Kimi K2.5 + Kimi Coding"),
    choices: ["moonshot-api-key", "moonshot-api-key-cn", "kimi-code-api-key"],
  },
  {
    value: "google",
    label: "Google",
    hint: getText("configure.provider.google.hint", "Gemini API key + OAuth"),
    choices: ["gemini-api-key", "google-gemini-cli"],
  },
  {
    value: "xai",
    label: "xAI (Grok)",
    hint: hintApiKey,
    choices: ["xai-api-key"],
  },
  {
    value: "mistral",
    label: "Mistral AI",
    hint: hintApiKey,
    choices: ["mistral-api-key"],
  },
  {
    value: "volcengine",
    label: "Volcano Engine",
    hint: hintApiKey,
    choices: ["volcengine-api-key"],
  },
  {
    value: "byteplus",
    label: "BytePlus",
    hint: hintApiKey,
    choices: ["byteplus-api-key"],
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    hint: hintApiKey,
    choices: ["openrouter-api-key"],
  },
  {
    value: "kilocode",
    label: "Kilo Gateway",
    hint: getText("configure.provider.kilocode.hint", "API key (OpenRouter-compatible)"),
    choices: ["kilocode-api-key"],
  },
  {
    value: "qwen",
    label: "Qwen",
    hint: getText("configure.provider.qwen.hint", "Coder model (recommended)"),
    choices: ["qwen-portal-api-key", "qwen-portal"],
  },
  {
    value: "zai",
    label: "Z.AI",
    hint: getText("configure.provider.zai.hint", "GLM Coding Plan / Global / CN"),
    choices: ["zai-coding-global", "zai-coding-cn", "zai-global", "zai-cn"],
  },
  {
    value: "qianfan",
    label: "Qianfan",
    hint: hintApiKey,
    choices: ["qianfan-api-key"],
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    hint: getText("configure.provider.deepseek.hint", "API key (deepseek-chat / deepseek-reasoner)"),
    choices: ["deepseek-api-key"],
  },
  {
    value: "copilot",
    label: "Copilot",
    hint: getText("configure.provider.copilot.hint", "GitHub + local proxy"),
    choices: ["github-copilot", "copilot-proxy"],
  },
  {
    value: "ai-gateway",
    label: "Vercel AI Gateway",
    hint: hintApiKey,
    choices: ["ai-gateway-api-key"],
  },
  {
    value: "opencode-zen",
    label: "OpenCode Zen",
    hint: hintApiKey,
    choices: ["opencode-zen"],
  },
  {
    value: "xiaomi",
    label: "Xiaomi",
    hint: hintApiKey,
    choices: ["xiaomi-api-key"],
  },
  {
    value: "synthetic",
    label: "Synthetic",
    hint: getText("configure.provider.synthetic.hint", "Anthropic-compatible (multi-model)"),
    choices: ["synthetic-api-key"],
  },
  {
    value: "together",
    label: "Together AI",
    hint: hintApiKey,
    choices: ["together-api-key"],
  },
  {
    value: "huggingface",
    label: "Hugging Face",
    hint: getText("configure.provider.huggingface.hint", "Inference API (HF token)"),
    choices: ["huggingface-api-key"],
  },
  {
    value: "venice",
    label: "Venice AI",
    hint: getText("configure.provider.venice.hint", "Privacy-focused (uncensored models)"),
    choices: ["venice-api-key"],
  },
  {
    value: "litellm",
    label: "LiteLLM",
    hint: getText("configure.provider.litellm.hint", "Unified LLM gateway (100+ providers)"),
    choices: ["litellm-api-key"],
  },
  {
    value: "cloudflare-ai-gateway",
    label: "Cloudflare AI Gateway",
    hint: getText("configure.provider.cloudflare_ai_gateway.hint", "Account ID + Gateway ID + API key"),
    choices: ["cloudflare-ai-gateway-api-key"],
  },
  {
    value: "custom",
    label: getText("configure.provider.custom.label", "Custom Provider"),
    hint: getText("configure.provider.custom.hint", "Any OpenAI or Anthropic compatible endpoint"),
    choices: ["custom-api-key"],
  },
];

const PROVIDER_AUTH_CHOICE_OPTION_HINTS: Partial<Record<AuthChoice, string>> = {
  "litellm-api-key": getText("configure.provider.litellm.hint", "Unified LLM gateway (100+ providers)"),
  "cloudflare-ai-gateway-api-key": getText("configure.provider.cloudflare_ai_gateway.hint", "Account ID + Gateway ID + API key"),
  "venice-api-key": getText("configure.provider.venice.hint", "Privacy-focused inference (uncensored models)"),
  "together-api-key": "Access to Llama, DeepSeek, Qwen, and more open models",
  "huggingface-api-key": getText("configure.provider.huggingface.hint", "Inference API (HF token)"),
};

const PROVIDER_AUTH_CHOICE_OPTION_LABELS: Partial<Record<AuthChoice, string>> = {
  "moonshot-api-key": getText("configure.provider.kimi_api_key_ai", "Kimi API key (.ai)"),
  "moonshot-api-key-cn": getText("configure.provider.kimi_api_key_cn", "Kimi API key (.cn)"),
  "kimi-code-api-key": getText("configure.provider.kimi_code_api_key", "Kimi Code API key (subscription)"),
  "cloudflare-ai-gateway-api-key": "Cloudflare AI Gateway",
};

function buildProviderAuthChoiceOptions(): AuthChoiceOption[] {
  return ONBOARD_PROVIDER_AUTH_FLAGS.map((flag) => ({
    value: flag.authChoice,
    label: PROVIDER_AUTH_CHOICE_OPTION_LABELS[flag.authChoice] ?? flag.description,
    ...(PROVIDER_AUTH_CHOICE_OPTION_HINTS[flag.authChoice]
      ? { hint: PROVIDER_AUTH_CHOICE_OPTION_HINTS[flag.authChoice] }
      : {}),
  }));
}

const BASE_AUTH_CHOICE_OPTIONS: ReadonlyArray<AuthChoiceOption> = [
  {
    value: "token",
    label: getText("configure.provider.anthropic.token", "Anthropic token (paste setup-token)"),
    hint: getText("configure.provider.anthropic.token.hint", "run `claude setup-token` elsewhere, then paste the token here"),
  },
  {
    value: "openai-codex",
    label: getText("configure.provider.openai.codex", "OpenAI Codex (ChatGPT OAuth)"),
  },
  { value: "chutes", label: "Chutes (OAuth)" },
  {
    value: "vllm",
    label: getText("configure.provider.vllm.label", "vLLM (custom URL + model)"),
    hint: getText("configure.provider.vllm.hint", "Local/self-hosted OpenAI-compatible server"),
  },
  ...(buildProviderAuthChoiceOptions() as AuthChoiceOption[]),
  {
    value: "moonshot-api-key-cn",
    label: getText("configure.provider.kimi_api_key_cn", "Kimi API key (.cn)"),
  },
  {
    value: "github-copilot",
    label: getText("configure.provider.github_copilot", "GitHub Copilot (GitHub device login)"),
    hint: getText("configure.provider.github_copilot.hint", "Uses GitHub device flow"),
  },
  { value: "gemini-api-key", label: getText("configure.provider.gemini_api_key", "Google Gemini API key") },
  {
    value: "google-gemini-cli",
    label: getText("configure.provider.google_gemini_cli", "Google Gemini CLI OAuth"),
    hint: getText("configure.provider.google_gemini_cli.hint", "Uses the bundled Gemini CLI auth plugin"),
  },
  { value: "zai-api-key", label: getText("configure.provider.zai_api_key", "Z.AI API key") },
  {
    value: "zai-coding-global",
    label: "Coding-Plan-Global",
    hint: getText("configure.provider.zai_coding_global.hint", "GLM Coding Plan Global (api.z.ai)"),
  },
  {
    value: "zai-coding-cn",
    label: "Coding-Plan-CN",
    hint: getText("configure.provider.zai_coding_cn.hint", "GLM Coding Plan CN (open.bigmodel.cn)"),
  },
  {
    value: "zai-global",
    label: "Global",
    hint: getText("configure.provider.zai_global.hint", "Z.AI Global (api.z.ai)"),
  },
  {
    value: "zai-cn",
    label: "CN",
    hint: getText("configure.provider.zai_cn.hint", "Z.AI CN (open.bigmodel.cn)"),
  },
  {
    value: "xiaomi-api-key",
    label: getText("configure.provider.xiaomi_api_key", "Xiaomi API key"),
  },
  {
    value: "minimax-portal",
    label: getText("configure.provider.minimax_portal", "MiniMax OAuth"),
    hint: getText("configure.provider.minimax_portal.hint", "Oauth plugin for MiniMax"),
  },
  { value: "qwen-portal-api-key", label: getText("configure.provider.qwen_api_key", "Qwen API key"), hint: getText("configure.provider.qwen_api_key.hint", "Portal API key") },
  { value: "qwen-portal", label: getText("configure.provider.qwen_oauth", "Qwen OAuth"), hint: getText("configure.provider.qwen_oauth.hint", "Device code login") },
  {
    value: "copilot-proxy",
    label: getText("configure.provider.copilot_proxy", "Copilot Proxy (local)"),
    hint: getText("configure.provider.copilot_proxy.hint", "Local proxy for VS Code Copilot models"),
  },
  { value: "apiKey", label: getText("configure.provider.anthropic_api_key", "Anthropic API key") },
  {
    value: "opencode-zen",
    label: getText("configure.provider.opencode_zen.label", "OpenCode Zen (multi-model proxy)"),
    hint: getText("configure.provider.opencode_zen.hint", "Claude, GPT, Gemini via opencode.ai/zen"),
  },
  { value: "minimax-api", label: "MiniMax M2.5" },
  {
    value: "minimax-api-key-cn",
    label: "MiniMax M2.5 (CN)",
    hint: "China endpoint (api.minimaxi.com)",
  },
  {
    value: "minimax-api-lightning",
    label: "MiniMax M2.5 Lightning",
    hint: getText("configure.provider.minimax_lightning.hint", "Faster, higher output cost"),
  },
  { value: "custom-api-key", label: getText("configure.provider.custom.label", "Custom Provider") },
];

export function formatAuthChoiceChoicesForCli(params?: {
  includeSkip?: boolean;
  includeLegacyAliases?: boolean;
}): string {
  const includeSkip = params?.includeSkip ?? true;
  const includeLegacyAliases = params?.includeLegacyAliases ?? false;
  const values = BASE_AUTH_CHOICE_OPTIONS.map((opt) => opt.value);

  if (includeSkip) {
    values.push("skip");
  }
  if (includeLegacyAliases) {
    values.push(...AUTH_CHOICE_LEGACY_ALIASES_FOR_CLI);
  }

  return values.join("|");
}

export function buildAuthChoiceOptions(params: {
  store: AuthProfileStore;
  includeSkip: boolean;
}): AuthChoiceOption[] {
  void params.store;
  const options: AuthChoiceOption[] = [...BASE_AUTH_CHOICE_OPTIONS];

  if (params.includeSkip) {
    options.push({ value: "skip", label: getText("configure.skip_for_now", "Skip for now") });
  }

  return options;
}

export function buildAuthChoiceGroups(params: { store: AuthProfileStore; includeSkip: boolean }): {
  groups: AuthChoiceGroup[];
  skipOption?: AuthChoiceOption;
} {
  const options = buildAuthChoiceOptions({
    ...params,
    includeSkip: false,
  });
  const optionByValue = new Map<AuthChoice, AuthChoiceOption>(
    options.map((opt) => [opt.value, opt]),
  );

  // Add options from ONBOARD_PROVIDER_AUTH_FLAGS that aren't already in BASE_AUTH_CHOICE_OPTIONS
  for (const flag of ONBOARD_PROVIDER_AUTH_FLAGS) {
    if (!optionByValue.has(flag.authChoice)) {
      optionByValue.set(flag.authChoice, {
        value: flag.authChoice,
        label: PROVIDER_AUTH_CHOICE_OPTION_LABELS[flag.authChoice] ?? flag.description,
        ...(PROVIDER_AUTH_CHOICE_OPTION_HINTS[flag.authChoice]
          ? { hint: PROVIDER_AUTH_CHOICE_OPTION_HINTS[flag.authChoice] }
          : {}),
      });
    }
  }

  const groups = AUTH_CHOICE_GROUP_DEFS.map((group) => ({
    ...group,
    options: group.choices
      .map((choice) => optionByValue.get(choice))
      .filter((opt): opt is AuthChoiceOption => Boolean(opt)),
  }));

  const skipOption = params.includeSkip
    ? ({ value: "skip", label: getText("configure.skip_for_now", "Skip for now") } satisfies AuthChoiceOption)
    : undefined;

  return { groups, skipOption };
}
