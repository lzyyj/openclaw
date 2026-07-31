import { buildProviderAuthFlagsFromRegistry } from "../../auth-registry/index.js";
import type { AuthChoice, OnboardOptions } from "../../onboard-types.js";

type AuthChoiceFlag = {
  optionKey: string;
  authChoice: AuthChoice;
  label: string;
};

export type AuthChoiceInference = {
  choice?: AuthChoice;
  matches: AuthChoiceFlag[];
};

function hasStringValue(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

// Infer auth choice from explicit provider API key flags.
export function inferAuthChoiceFromFlags(opts: OnboardOptions): AuthChoiceInference {
  const optsRecord = opts as unknown as Record<string, unknown>;
  const matches: AuthChoiceFlag[] = buildProviderAuthFlagsFromRegistry()
    .filter(({ optionKey }) => hasStringValue(optsRecord[optionKey]))
    .map((flag) => ({
      optionKey: flag.optionKey,
      authChoice: flag.authChoice as AuthChoice,
      label: flag.cliFlag,
    }));

  if (
    hasStringValue(opts.customBaseUrl) ||
    hasStringValue(opts.customModelId) ||
    hasStringValue(opts.customApiKey)
  ) {
    matches.push({
      optionKey: "customBaseUrl",
      authChoice: "custom-api-key",
      label: "--custom-base-url/--custom-model-id/--custom-api-key",
    });
  }

  return {
    choice: matches[0]?.authChoice,
    matches,
  };
}
