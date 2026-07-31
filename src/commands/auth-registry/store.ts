import fs from "node:fs";
import { loadJsonFile, saveJsonFile } from "../../infra/json-file.js";
import { AUTH_REGISTRY_FILENAME, resolveAuthRegistryPath } from "./constants.js";
import { AUTH_REGISTRY_SEED } from "./seed.js";
import type { AuthMethod, AuthProvider, AuthRegistry } from "./types.js";

/**
 * 注册表持久化存储
 *
 * 规则：
 * - 运行时 = seed（内置默认值） + 本地文件合并
 * - 本地优先：用户对某条目的修改覆盖 seed 的同 id 条目
 * - seed 补齐：本地缺失的条目由 seed 补上（保证新版本新增的厂商/认证方式可用）
 * - 软删除：用户禁用某条目（disabled:true），不硬删数据
 */

/** 从 seed 构建一个可变的注册表副本（避免污染 seed 常量） */
function cloneSeed(): AuthRegistry {
  return structuredClone(AUTH_REGISTRY_SEED);
}

/**
 * 合并两个注册表：target（本地）优先覆盖，seed 补齐缺失。
 * 合并单位为 provider/authMethod 的 id。
 */
function mergeRegistry(seed: AuthRegistry, local: AuthRegistry | undefined): AuthRegistry {
  if (!local || local.providers.length === 0) {
    return seed;
  }

  const seedProviders = new Map(seed.providers.map((p) => [p.id, p]));
  const localProviders = new Map(local.providers.map((p) => [p.id, p]));
  const mergedProviders: AuthProvider[] = [];

  // 先合并所有 seed providers（保持 seed 顺序），本地有同名则覆盖
  for (const seedProvider of seed.providers) {
    const localProvider = localProviders.get(seedProvider.id);
    if (!localProvider) {
      mergedProviders.push(seedProvider);
      continue;
    }
    // 合并 authMethods
    const mergedMethods = mergeAuthMethods(seedProvider, localProvider);
    mergedProviders.push({
      ...seedProvider,
      ...localProvider,
      authMethods: mergedMethods,
    });
  }

  // 追加本地独有的 providers（用户新增的厂商）
  for (const localProvider of local.providers) {
    if (!seedProviders.has(localProvider.id)) {
      mergedProviders.push(localProvider);
    }
  }

  // 按 order 排序（undefined 排最后）
  mergedProviders.sort((a, b) => {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order ?? Number.MAX_SAFE_INTEGER;
    return ao - bo;
  });

  return {
    version: Math.max(seed.version, local.version ?? seed.version),
    providers: mergedProviders,
  };
}

/** 合并单个 provider 的 authMethods（本地优先，seed 补齐） */
function mergeAuthMethods(seedProvider: AuthProvider, localProvider: AuthProvider): AuthMethod[] {
  const seedMethods = new Map(seedProvider.authMethods.map((m) => [m.id, m]));
  const localMethods = new Map(localProvider.authMethods.map((m) => [m.id, m]));
  const merged: AuthMethod[] = [];

  for (const seedMethod of seedProvider.authMethods) {
    const localMethod = localMethods.get(seedMethod.id);
    if (!localMethod) {
      merged.push(seedMethod);
      continue;
    }
    merged.push({
      ...seedMethod,
      ...localMethod,
    });
  }

  for (const localMethod of localProvider.authMethods) {
    if (!seedMethods.has(localMethod.id)) {
      merged.push(localMethod);
    }
  }

  return merged;
}

/**
 * 加载注册表（合并 seed + 本地文件）。
 * 如果本地文件不存在，写入 seed 作为初始文件。
 */
export function loadAuthRegistry(): AuthRegistry {
  const registryPath = resolveAuthRegistryPath();
  const raw = loadJsonFile(registryPath);

  let local: AuthRegistry | undefined;
  if (raw && typeof raw === "object" && Array.isArray((raw as AuthRegistry).providers)) {
    local = raw as AuthRegistry;
  }

  const merged = mergeRegistry(cloneSeed(), local);

  // 首次运行：写入 seed 作为初始注册表文件
  if (!local) {
    saveAuthRegistry(merged);
  }

  return merged;
}

/** 保存注册表到本地文件 */
export function saveAuthRegistry(registry: AuthRegistry): void {
  const registryPath = resolveAuthRegistryPath();
  saveJsonFile(registryPath, registry);
}

/** 检查注册表文件是否存在 */
export function authRegistryFileExists(): boolean {
  return fs.existsSync(resolveAuthRegistryPath());
}

/** 兼容：返回注册表路径（供展示/诊断用） */
export { AUTH_REGISTRY_FILENAME };
