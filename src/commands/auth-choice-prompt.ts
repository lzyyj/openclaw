import { getText } from "../cli/i18n.js";
import type { AuthProfileStore } from "../agents/auth-profiles.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { buildAuthChoiceGroups } from "./auth-choice-options.js";
import type { AuthChoice } from "./onboard-types.js";

const BACK_VALUE = "__back";

/** Infer the group value from a model key (e.g. "deepseek/deepseek-chat" -> "deepseek"). */
function resolveGroupFromModel(modelKey: string): string | undefined {
  // Model keys are typically "provider/model-name" — the part before "/" is the provider.
  const slashIdx = modelKey.indexOf("/");
  if (slashIdx === -1) return undefined;
  return modelKey.slice(0, slashIdx);
}

/** Resolve the initial group value for the provider selection based on existing config model. */
export function resolveInitialGroupFromConfig(modelKey: string | undefined): string | undefined {
  if (!modelKey) return undefined;
  return resolveGroupFromModel(modelKey);
}

export async function promptAuthChoiceGrouped(params: {
  prompter: WizardPrompter;
  store: AuthProfileStore;
  includeSkip: boolean;
  /** Initial group to pre-select (e.g. "deepseek" for current model "deepseek/deepseek-chat"). */
  initialGroupValue?: string;
}): Promise<AuthChoice> {
  const { groups, skipOption } = buildAuthChoiceGroups(params);
  const availableGroups = groups.filter((group) => group.options.length > 0);

  while (true) {
    const providerOptions = [
      ...availableGroups.map((group) => ({
        value: group.value,
        label: group.label,
        hint: group.hint,
      })),
      ...(skipOption ? [skipOption] : []),
    ];

    const providerSelection = (await params.prompter.select({
      message: getText("configure.model.auth_provider", "Model/auth provider"),
      options: providerOptions,
      initialValue: params.initialGroupValue as any,
    })) as string;

    if (providerSelection === "skip") {
      return "skip";
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
      options: [
        ...group.options,
        { value: BACK_VALUE, label: getText("configure.back", "Back") },
      ],
    });

    if (methodSelection === BACK_VALUE) {
      continue;
    }

    return methodSelection as AuthChoice;
  }
}
