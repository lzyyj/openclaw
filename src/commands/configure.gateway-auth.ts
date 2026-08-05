import type { OpenClawConfig, GatewayAuthConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { configureModelFlow } from "./model.configure-flow.js";
import { randomToken } from "./onboard-helpers.js";

export type { ConfigureModelFlowParams } from "./model.configure-flow.js";

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

type GatewayAuthChoice = "token" | "password" | "trusted-proxy";

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

/**
 * 模型/厂商配置入口（configure / config 向导的 "model" 区块）。
 *
 * 完整流程（厂商认证 → 验证拉真实模型 → 选主模型 → 选备用/allowlist → 完成 note）
 * 已抽到共享函数 configureModelFlow（model.configure-flow.ts），与 onboard 共用一份
 * 逻辑，避免重复实现导致行为漂移。本函数仅作薄封装保持原有签名（OpenClawConfig）。
 */
export async function promptAuthConfig(
  cfg: OpenClawConfig,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<OpenClawConfig> {
  const result = await configureModelFlow({
    prompter,
    runtime,
    cfg,
    includeFallbacks: true,
  });
  return result.config;
}
