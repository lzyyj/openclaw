import { getText } from "../cli/i18n.js";
import type { OpenClawConfig } from "../config/config.js";
import { resolveAgentModelPrimaryValue } from "../config/model-input.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { ensureModelAllowlistEntry } from "./model-allowlist.js";

export async function applyDefaultModelChoice(params: {
  config: OpenClawConfig;
  setDefaultModel: boolean;
  defaultModel: string;
  applyDefaultConfig: (config: OpenClawConfig) => OpenClawConfig;
  applyProviderConfig: (config: OpenClawConfig) => OpenClawConfig;
  noteDefault?: string;
  noteAgentModel: (model: string) => Promise<void>;
  prompter: WizardPrompter;
  /** 为 true 时推迟"模型配置完成"note 到后续模型选择之后（configure 场景）。 */
  deferModelConfiguredNote?: boolean;
}): Promise<{ config: OpenClawConfig; agentModelOverride?: string }> {
  if (params.setDefaultModel) {
    // 重配（configure）场景：如果配置里已有主模型（如 deepseek/deepseek-v4-pro），
    // 不应被 provider 的默认模型（如 deepseek-chat）无条件覆盖——否则用户已选好的
    // 模型会被悄悄重置。仅当尚无主模型时才应用默认模型（首次 onboard）。
    const existingPrimary = resolveAgentModelPrimaryValue(params.config.agents?.defaults?.model);
    if (existingPrimary) {
      const next = params.applyProviderConfig(params.config);
      // configure 场景推迟完成 note（用户还要选具体模型名称），避免"模型配置完成"
      // 早于模型选择出现造成顺序误导。
      if (!params.deferModelConfiguredNote) {
        await params.prompter.note(
          getText("configure.model.kept_existing", "Default model kept ({model})", {
            model: existingPrimary,
          }),
          getText("configure.model.configured", "Model configured"),
        );
      }
      return { config: next };
    }
    const next = params.applyDefaultConfig(params.config);
    if (params.noteDefault) {
      await params.prompter.note(
        getText("configure.model.default_set", `Default model set to ${params.noteDefault}`, {
          model: params.noteDefault,
        }),
        getText("configure.model.configured", "Model configured"),
      );
    }
    return { config: next };
  }

  const next = params.applyProviderConfig(params.config);
  const nextWithModel = ensureModelAllowlistEntry({
    cfg: next,
    modelRef: params.defaultModel,
  });
  await params.noteAgentModel(params.defaultModel);
  return { config: nextWithModel, agentModelOverride: params.defaultModel };
}
