#!/usr/bin/env node

/**
 * 新增 NODEJS 版的 A2UI 模块打包脚本，兼容 Windows、macOS、Linux，替代 bundle-a2ui.sh
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// 路径定义
const hashFile = path.join(rootDir, "src", "canvas-host", "a2ui", ".bundle.hash");
const outputFile = path.join(rootDir, "src", "canvas-host", "a2ui", "a2ui.bundle.js");
const a2UIRendererDir = path.join(rootDir, "vendor", "a2ui", "renderers", "lit");
const a2UIAppDir = path.join(rootDir, "apps", "shared", "OpenClawKit", "Tools", "CanvasA2UI");

/**
 * 查找 Node.js 可执行文件
 */
async function findNodeExecutable() {
    // 1. 尝试从 .openclaw-node-path 读取
    const pathFile = path.join(rootDir, ".openclaw-node-path");
    let nodeDir = null;

    try {
        if (await fs.access(pathFile).then(() => true).catch(() => false)) {
            const content = await fs.readFile(pathFile, "utf-8");
            nodeDir = content.trim();
        }
    } catch (_e) {
        // Ignore
    }

    if (nodeDir) {
        const candidates = [
            path.join(nodeDir, "node.exe"),
            path.join(nodeDir, "node"),
        ];
        for (const candidate of candidates) {
            try {
                await fs.access(candidate);
                return candidate;
            } catch {
                continue;
            }
        }
    }

    // 2. 使用当前运行的 node
    return process.execPath;
}

/**
 * 错误处理
 */
function onError(error) {
    console.error("A2UI bundling failed. Re-run with: pnpm canvas:a2ui:bundle");
    console.error("If this persists, verify pnpm deps and try again.");
    if (error) {
        console.error("Error:", error.message || error);
    }
    process.exit(1);
}

/**
 * 检查目录是否存在
 */
async function checkDirectories() {
    try {
        await fs.access(a2UIRendererDir);
        await fs.access(a2UIAppDir);
        return true;
    } catch {
        return false;
    }
}

/**
 * 计算输入文件的哈希值
 */
async function computeHash(nodeCmd, inputPaths) {
    const script = `
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const rootDir = process.env.ROOT_DIR ?? process.cwd();
const inputs = process.argv.slice(2);
const files = [];

async function walk(entryPath) {
  const st = await fs.stat(entryPath);
  if (st.isDirectory()) {
    const entries = await fs.readdir(entryPath);
    for (const entry of entries) {
      await walk(path.join(entryPath, entry));
    }
    return;
  }
  files.push(entryPath);
}

for (const input of inputs) {
  await walk(input);
}

function normalize(p) {
  return p.split(path.sep).join("/");
}

files.sort((a, b) => normalize(a).localeCompare(normalize(b)));

const hash = createHash("sha256");
for (const filePath of files) {
  const rel = normalize(path.relative(rootDir, filePath));
  hash.update(rel);
  hash.update("\\0");
  hash.update(await fs.readFile(filePath));
  hash.update("\\0");
}

process.stdout.write(hash.digest("hex"));
`;

    const result = spawnSync(nodeCmd, ["--input-type=module", "-", ...inputPaths], {
        input: script,
        encoding: "utf-8",
        env: { ...process.env, ROOT_DIR: rootDir },
        stdio: ["pipe", "pipe", "inherit"],
    });

    if (result.status !== 0) {
        throw new Error("Failed to compute hash");
    }

    return result.stdout.trim();
}

/**
 * 执行 TypeScript 编译
 */
async function compileTypeScript(nodeCmd) {
    const tscConfig = path.join(a2UIRendererDir, "tsconfig.json");

    console.log("Compiling TypeScript...");

    // Windows 上需要找到正确的 tsc 可执行文件
    const isWindows = process.platform === "win32";
    let tscExecutable;

    if (isWindows) {
        // 优先使用 .cmd 文件
        const tscCmd = path.join(rootDir, "node_modules", ".bin", "tsc.cmd");
        const tscJs = path.join(rootDir, "node_modules", "typescript", "bin", "tsc.js");

        try {
            await fs.access(tscCmd);
            // 有 .cmd 文件，直接执行
            const result = spawnSync(tscCmd, ["-p", tscConfig], {
                stdio: "inherit",
                shell: true,
            });

            if (result.status !== 0) {
                throw new Error("TypeScript compilation failed");
            }
            return;
        } catch {
            // .cmd 不存在，尝试 tsc.js
            try {
                await fs.access(tscJs);
                tscExecutable = tscJs;
            } catch {
                throw new Error("Cannot find TypeScript compiler");
            }
        }
    } else {
        // Unix-like 系统使用原来的方式
        tscExecutable = path.join(rootDir, "node_modules", ".bin", "tsc");
    }

    const result = spawnSync(nodeCmd, [tscExecutable, "-p", tscConfig], {
        stdio: "inherit",
        shell: false,
    });

    if (result.status !== 0) {
        throw new Error("TypeScript compilation failed");
    }
}

/**
 * 执行 rolldown 打包
 */
async function runRolldown(nodeCmd) {
    const config = path.join(a2UIAppDir, "rolldown.config.mjs");

    console.log("Running rolldown...");

    // 尝试直接使用 rolldown 命令
    const isWindows = process.platform === "win32";
    let result;

    if (isWindows) {
        // Windows 上使用 pnpm dlx
        console.log("Running rolldown via pnpm dlx...");

        // 1. 优先使用全局 pnpm
        const globalPnpm = spawnSync("pnpm", [
            "-s",
            "dlx",
            "rolldown",
            "-c",
            config,
        ], {
            stdio: "inherit",
            shell: true,
        });

        if (globalPnpm.status === 0) {
            return;
        }

        // 2. 尝试找到 pnpm.cmd
        const pnpmCmd = path.join(rootDir, "node_modules", ".bin", "pnpm.cmd");

        try {
            await fs.access(pnpmCmd);
            result = spawnSync(pnpmCmd, [
                "-s",
                "dlx",
                "rolldown",
                "-c",
                config,
            ], {
                stdio: "inherit",
                shell: true,
            });

            if (result.status === 0) {
                return;
            }
        } catch {
            // .cmd 不存在
        }

        // 3. 尝试直接用 node 执行 pnpm.js
        const pnpmJs = path.join(rootDir, "node_modules", "pnpm", "bin", "pnpm.cjs");
        try {
            await fs.access(pnpmJs);
            result = spawnSync(nodeCmd, [
                pnpmJs,
                "-s",
                "dlx",
                "rolldown",
                "-c",
                config,
            ], {
                stdio: "inherit",
                shell: true,
            });

            if (result.status === 0) {
                return;
            }
        } catch {
            // pnpm.js 不存在
        }

        throw new Error("Cannot find pnpm executable");
    } else {
        result = spawnSync("rolldown", ["-c", config], {
            stdio: "inherit",
            shell: true,
        });

        if (result.status !== 0 && result.error) {
            console.log("Running rolldown via pnpm dlx...");
            result = spawnSync(nodeCmd, [
                path.join(rootDir, "node_modules", ".bin", "pnpm"),
                "-s",
                "dlx",
                "rolldown",
                "-c",
                config,
            ], {
                stdio: "inherit",
                shell: true,
            });
        }
    }

    if (result.status !== 0) {
        throw new Error("Rolldown failed");
    }
}

/**
 * 主函数
 */
async function main() {
    try {
        // 查找 node
        const nodeCmd = await findNodeExecutable();
        console.log(`Using Node: ${nodeCmd}`);

        // 检查目录
        const dirsExist = await checkDirectories();
        if (!dirsExist) {
            if (await fs.access(outputFile).then(() => true).catch(() => false)) {
                console.log("A2UI sources missing; keeping prebuilt bundle.");
                return;
            }
            throw new Error(`A2UI sources missing and no prebuilt bundle found at: ${outputFile}`);
        }

        // 输入文件列表
        const inputPaths = [
            path.join(rootDir, "package.json"),
            path.join(rootDir, "pnpm-lock.yaml"),
            a2UIRendererDir,
            a2UIAppDir,
        ];

        // 计算哈希
        console.log("Computing hash...");
        const currentHash = await computeHash(nodeCmd, inputPaths);

        // 检查是否需要重新构建
        let _needRebuild = true;
        try {
            const previousHash = await fs.readFile(hashFile, "utf-8");
            if (previousHash === currentHash) {
                try {
                    await fs.access(outputFile);
                    console.log("A2UI bundle up to date; skipping.");
                    return;
                } catch {
                    // File doesn't exist, need rebuild
                }
            }
        } catch {
            // Hash file doesn't exist, need rebuild
        }

        // 执行构建
        console.log("Building A2UI bundle...");

        // TypeScript 编译
        await compileTypeScript(nodeCmd);

        // Rolldown 打包
        await runRolldown(nodeCmd);

        // 保存哈希值
        await fs.writeFile(hashFile, currentHash, "utf-8");

        console.log(`A2UI bundle created successfully: ${outputFile}`);
    } catch (error) {
        onError(error);
    }
}

// 运行主函数
main().catch(onError);
