export { AUTH_REGISTRY_FILENAME, resolveAuthRegistryPath } from "./constants.js";
export { AUTH_REGISTRY_SEED, AUTH_REGISTRY_VERSION } from "./seed.js";
export { authRegistryFileExists, loadAuthRegistry, saveAuthRegistry } from "./store.js";
export type {
  AuthMethod,
  AuthMethodType,
  AuthProvider,
  AuthRegistry,
  ChannelStatus,
} from "./types.js";
export { AUTH_METHOD_TYPE_LABELS } from "./seed.js";

import { loadAuthRegistry, saveAuthRegistry } from "./store.js";
import type { AuthMethod, AuthProvider, AuthRegistry, ChannelStatus } from "./types.js";

/**
 * 查询某个认证方式（按 id）。
 * 返回 { provider, method }，若不存在返回 undefined。
 */
export function findAuthMethod(
  registry: AuthRegistry,
  methodId: string,
): { provider: AuthProvider; method: AuthMethod } | undefined {
  for (const provider of registry.providers) {
    const method = provider.authMethods.find((m) => m.id === methodId);
    if (method) {
      return { provider, method };
    }
  }
  return undefined;
}

/** 获取某厂商下所有启用（非 disabled）的认证方式 */
export function listEnabledAuthMethods(provider: AuthProvider): AuthMethod[] {
  return provider.authMethods.filter((m) => !m.disabled);
}

/** 获取所有启用（非 disabled）的厂商 */
export function listEnabledProviders(registry: AuthRegistry): AuthProvider[] {
  return registry.providers.filter((p) => !p.disabled);
}

/**
 * 更新某个认证方式的通道健康状态，并持久化。
 * 遵循状态机规则：ok 只被明确的 down 推翻，存疑不降级。
 */
export function updateAuthMethodChannelStatus(params: {
  methodId: string;
  status: ChannelStatus;
  note?: string;
  /** 本次是否为一次成功的认证 */
  success?: boolean;
}): boolean {
  const registry = loadAuthRegistry();
  const found = findAuthMethod(registry, params.methodId);
  if (!found) {
    return false;
  }
  const method = found.method;

  const now = new Date().toISOString();
  let nextStatus = params.status;
  let note = params.note ?? method.channelNote;

  if (params.success) {
    // 一次成功 → 升为 ok，且记录 lastSuccessAt
    nextStatus = "ok";
    method.lastSuccessAt = now;
    note = method.channelNote; // 成功不清除备注（保留历史）
  }

  // 状态机核心：ok 只被 down 推翻，存疑不降级
  if (method.channelStatus === "ok" && nextStatus === "suspect") {
    nextStatus = "ok";
    method.lastFailureAt = now;
  } else {
    method.channelStatus = nextStatus;
    method.channelCheckedAt = now;
    if (nextStatus === "down" || nextStatus === "suspect") {
      method.lastFailureAt = now;
    }
    if (note !== undefined) {
      method.channelNote = note;
    }
  }

  saveAuthRegistry(registry);
  return true;
}

/**
 * 软删除一个认证方式（disabled: true）。
 * 不硬删数据，只标记，保证存量配置兼容。
 */
export function disableAuthMethod(methodId: string): boolean {
  const registry = loadAuthRegistry();
  const found = findAuthMethod(registry, methodId);
  if (!found) {
    return false;
  }
  found.method.disabled = true;
  saveAuthRegistry(registry);
  return true;
}

/**
 * 新增一个认证方式到指定厂商。若厂商不存在则创建。
 * 返回是否成功。
 */
export function addAuthMethod(params: {
  providerId: string;
  providerName?: string;
  method: Omit<AuthMethod, "vendor"> & { vendor?: string };
}): boolean {
  const registry = loadAuthRegistry();
  let provider = registry.providers.find((p) => p.id === params.providerId);

  if (!provider) {
    provider = {
      id: params.providerId,
      name: params.providerName ?? params.providerId,
      authMethods: [],
      order: registry.providers.length + 1,
    };
    registry.providers.push(provider);
  }

  if (provider.authMethods.some((m) => m.id === params.method.id)) {
    return false;
  }

  provider.authMethods.push({
    ...params.method,
    vendor: params.method.vendor ?? params.providerId,
  });
  saveAuthRegistry(registry);
  return true;
}
