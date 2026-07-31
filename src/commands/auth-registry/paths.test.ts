import path from "node:path";
/**
 * resolveAuthRegistryPath 路径解析测试
 *
 * 验证：注册表文件路径必须尊重 OPENCLAW_STATE_DIR（--profile 参数设置的目录），
 * 而不是硬编码 ~/.openclaw/。这是 --profile lzyyj 等非标准配置路径的关键保障。
 */
import { afterEach, describe, expect, it } from "vitest";
import { resolveAuthRegistryPath } from "./constants.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("resolveAuthRegistryPath with --profile (OPENCLAW_STATE_DIR)", () => {
  it("respects OPENCLAW_STATE_DIR when set (profile scenario)", async () => {
    // 模拟 --profile lzyyj：applyCliProfileEnv 会设置 OPENCLAW_STATE_DIR=~/.openclaw-lzyyj
    const stateDir = path.join("home", "user", ".openclaw-lzyyj");
    process.env.OPENCLAW_STATE_DIR = stateDir;
    delete process.env.CLAWDBOT_STATE_DIR;

    const p = resolveAuthRegistryPath();
    // 落点必须包含 profile 目录 + 文件名（跨平台，不硬编码分隔符/盘符）
    expect(p).toContain(".openclaw-lzyyj");
    expect(p.toLocaleLowerCase().endsWith(`${path.sep}auth-registry.json`)).toBe(true);
  });

  it("falls back to OPENCLAW_STATE_DIR default value without profile", async () => {
    // 无 profile：按 home dir 解析（.openclaw）
    delete process.env.OPENCLAW_STATE_DIR;
    delete process.env.CLAWDBOT_STATE_DIR;

    const p = resolveAuthRegistryPath();
    // 路径应落在 home 下的 .openclaw 目录（具体 home 由环境决定，这里只断言包含目录名）
    expect(p).toContain(".openclaw");
    expect(p.toLocaleLowerCase().endsWith(`${path.sep}auth-registry.json`)).toBe(true);
  });

  it("imports and is a function", () => {
    expect(typeof resolveAuthRegistryPath).toBe("function");
  });
});
