import path from "node:path";
import { resolveStateDir } from "../../config/paths.js";

/** 注册表文件名（存放于 StateDir，如 ~/.openclaw/auth-registry.json） */
export const AUTH_REGISTRY_FILENAME = "auth-registry.json";

/** 注册表文件路径 */
export function resolveAuthRegistryPath(): string {
  return path.join(resolveStateDir(), AUTH_REGISTRY_FILENAME);
}
