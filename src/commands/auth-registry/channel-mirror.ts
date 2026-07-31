/**
 * AuthRegistry 通道状态镜像
 *
 * 将 auth-profiles 的运行时认证结果（成功/失败）轻量镜像到注册表 channelStatus。
 * 纯异步 fire-and-forget，不阻塞模型调用热路径；任何错误静默吞掉。
 *
 * 语义（与状态机一致）：
 * - 认证成功（markAuthProfileGood）→ 升 ok
 * - 认证失败：
 *   - auth / billing / rate_limit / format / model_not_found → suspect（通道可达，凭据/配额/模型问题）
 *   - timeout → down（网络级不可达）
 *   - unknown → 不改变（信息不足，保留现状态）
 */
import { loadAuthRegistry, saveAuthRegistry } from "./store.js";
import type { ChannelStatus } from "./types.js";

/** auth-profiles 的 credential.type → 注册表 AuthMethodType */
type CredentialType = "api_key" | "token" | "oauth";

const CREDENTIAL_TYPE_TO_METHOD_TYPE: Record<CredentialType, string> = {
  api_key: "api-key",
  token: "setup-token",
  oauth: "oauth",
};

/**
 * 把 provider + credentialType 映射到注册表中的 authMethod id。
 * 规则：找注册表里 vendor === provider 且 type === methodType 的认证方式。
 * 若该 provider 只有一个认证方式，直接用它（更宽松）。
 */
function resolveAuthMethodId(params: {
  provider: string;
  credentialType?: string;
  registry: ReturnType<typeof loadAuthRegistry>;
}): string | undefined {
  const { provider, credentialType, registry } = params;
  const providerEntry = registry.providers.find((p) => p.id === provider);
  if (!providerEntry) {
    return undefined;
  }

  const methods = providerEntry.authMethods.filter((m) => !m.disabled);

  // 优先按 credentialType 精确匹配
  if (credentialType) {
    const methodType = CREDENTIAL_TYPE_TO_METHOD_TYPE[credentialType as CredentialType];
    if (methodType) {
      const byType = methods.find((m) => m.type === methodType);
      if (byType) {
        return byType.id;
      }
    }
  }

  // 该 provider 只有一个认证方式 → 直接用它
  if (methods.length === 1) {
    return methods[0].id;
  }

  return undefined;
}

/**
 * 镜像一条认证结果到注册表。
 * 静默执行：不抛错、不阻塞调用方。内部异步写盘。
 *
 * 失败 reason 语义（仅通道相关问题会上报，其余忽略防污染）：
 * - timeout → down（网络级不可达）
 * - auth / billing / rate_limit → suspect（通道可达，凭据/配额/限流问题）
 * - format / model_not_found / unknown / 无 reason → 忽略（非通道问题，信息不足，不改状态）
 */
export function mirrorAuthChannelResult(params: {
  provider: string;
  credentialType?: string;
  success: boolean;
  reason?: string;
}): void {
  try {
    const registry = loadAuthRegistry();
    const methodId = resolveAuthMethodId({
      provider: params.provider,
      credentialType: params.credentialType,
      registry,
    });
    if (!methodId) {
      return;
    }

    const method = registry.providers.flatMap((p) => p.authMethods).find((m) => m.id === methodId);
    if (!method || method.disabled) {
      return;
    }

    const now = new Date().toISOString();
    let nextStatus: ChannelStatus | undefined;

    if (params.success) {
      nextStatus = "ok";
      method.lastSuccessAt = now;
    } else {
      // 仅通道相关 reason 才降级；format/model_not_found/unknown/无 reason 忽略（不改状态）
      const reason = params.reason;
      if (reason === "timeout") {
        nextStatus = "down";
      } else if (reason === "auth" || reason === "billing" || reason === "rate_limit") {
        nextStatus = "suspect";
      }
      if (nextStatus !== undefined) {
        method.lastFailureAt = now;
        if (reason) {
          // 失败原因简短追加到备注（保留历史，不覆盖已有人工备注）
          method.channelNote = method.channelNote ? `${method.channelNote} | ${reason}` : reason;
        }
      }
    }

    if (nextStatus === undefined) {
      // 无状态变化（如 unknown reason 失败）：仅更新检查时间，不降级
      method.channelCheckedAt = now;
      saveAuthRegistry(registry);
      return;
    }

    // 状态机核心：ok 只被 down 推翻，suspect 不降级
    if (method.channelStatus === "ok" && nextStatus === "suspect") {
      // 保持 ok，仅记录失败时间
      method.channelStatus = "ok";
    } else {
      method.channelStatus = nextStatus;
    }
    method.channelCheckedAt = now;

    saveAuthRegistry(registry);
  } catch {
    // 静默：镜像失败不影响主流程
  }
}
