import type { OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { applyAuthChoiceAnthropic } from "./auth-choice.apply.anthropic.js";
import { applyAuthChoiceApiProviders } from "./auth-choice.apply.api-providers.js";
import { applyAuthChoiceBytePlus } from "./auth-choice.apply.byteplus.js";
import { applyAuthChoiceCopilotProxy } from "./auth-choice.apply.copilot-proxy.js";
import { applyAuthChoiceGitHubCopilot } from "./auth-choice.apply.github-copilot.js";
import { applyAuthChoiceGoogleGeminiCli } from "./auth-choice.apply.google-gemini-cli.js";
import { applyAuthChoiceMiniMax } from "./auth-choice.apply.minimax.js";
import { applyAuthChoiceOAuth } from "./auth-choice.apply.oauth.js";
import { applyAuthChoiceOpenAI } from "./auth-choice.apply.openai.js";
import { applyAuthChoiceQwenPortal } from "./auth-choice.apply.qwen-portal.js";
import { applyAuthChoiceVllm } from "./auth-choice.apply.vllm.js";
import { applyAuthChoiceVolcengine } from "./auth-choice.apply.volcengine.js";
import { applyAuthChoiceXAI } from "./auth-choice.apply.xai.js";
import { updateAuthMethodChannelStatus } from "./auth-registry/index.js";
import type { AuthChoice, OnboardOptions } from "./onboard-types.js";

export type ApplyAuthChoiceParams = {
  authChoice: AuthChoice;
  config: OpenClawConfig;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  agentDir?: string;
  setDefaultModel: boolean;
  agentId?: string;
  opts?: Partial<OnboardOptions>;
};

export type ApplyAuthChoiceResult = {
  config: OpenClawConfig;
  agentModelOverride?: string;
};

export async function applyAuthChoice(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult> {
  const handlers: Array<(p: ApplyAuthChoiceParams) => Promise<ApplyAuthChoiceResult | null>> = [
    applyAuthChoiceAnthropic,
    applyAuthChoiceVllm,
    applyAuthChoiceOpenAI,
    applyAuthChoiceOAuth,
    applyAuthChoiceApiProviders,
    applyAuthChoiceMiniMax,
    applyAuthChoiceGitHubCopilot,
    applyAuthChoiceGoogleGeminiCli,
    applyAuthChoiceCopilotProxy,
    applyAuthChoiceQwenPortal,
    applyAuthChoiceXAI,
    applyAuthChoiceVolcengine,
    applyAuthChoiceBytePlus,
  ];

  for (const handler of handlers) {
    const result = await handler(params);
    if (result) {
      // onboarding 埋点：认证方式已配置成功（本地凭据已存），但尚未经真实 API 验证。
      // 标记为 suspect（存疑），后续运行时 markAuthProfileGood/Failure 会进一步演进状态。
      markOnboardedAuthMethod(params.authChoice);
      return result;
    }
  }

  return { config: params.config };
}

/**
 * onboarding 认证配置成功后，将对应注册表认证方式标记为 suspect（存疑）。
 * 静默执行：失败不影响主流程（比如注册表文件不可写、authMethod 不存在等）。
 */
function markOnboardedAuthMethod(authChoice: string) {
  try {
    updateAuthMethodChannelStatus({
      methodId: authChoice,
      status: "suspect",
      note: "configured during onboarding; awaiting real API verification",
    });
  } catch {
    // 静默：注册表更新失败不应中断 onboarding
  }
}
