#!/usr/bin/env node
/**
 * OpenClaw CN 发布脚本
 * ====================
 * 打包 npm tgz + 创建/更新 gitee Release + 上传附件
 *
 * 用法:
 *   node scripts/release-cn.mjs --pack-only          # 只打 tgz 包, 不上传
 *   node scripts/release-cn.mjs --dry-run            # 打包 + 演练 API(不真实调用)
 *   node scripts/release-cn.mjs --token <token>      # 打包 + 发布(推荐用环境变量)
 *   node scripts/release-cn.mjs --repo lzyyj/openclaw-cn --build
 *
 * 环境变量:
 *   GITEE_TOKEN   gitee 私人令牌(https://gitee.com/profile/personal_access_tokens)
 *                 需要 projects 权限(创建 release + 上传附件)
 *
 * 选项:
 *   --repo <owner/repo>  目标仓库, 默认 lzyyj/openclaw-cn
 *   --token <token>      gitee token(优先于环境变量)
 *   --pack-only          只执行 npm pack, 不碰 API
 *   --dry-run            打印将执行的 API 动作但不真实调用
 *   --build              先跑完整构建(pnpm build + ui:build), 默认跳过(用现有 dist)
 *   --body <text>        release 说明, 默认取最近 30 条 git log
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const GITEE_API = "https://gitee.com/api/v5";

function parseArgs(argv) {
  const args = { repo: "lzyyj/openclaw-cn", packOnly: false, dryRun: false, build: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pack-only") {
      args.packOnly = true;
    } else if (a === "--dry-run") {
      args.dryRun = true;
    } else if (a === "--build") {
      args.build = true;
    } else if (a === "--repo") {
      args.repo = argv[++i];
    } else if (a === "--token") {
      args.token = argv[++i];
    } else if (a === "--body") {
      args.body = argv[++i];
    } else {
      console.error(`Unknown option: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function readVersion() {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  return pkg.version;
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
}

function buildReleaseBody() {
  // 最近 30 条提交作为变更摘要(纯文本, 兼容 gitee markdown)
  const log = run("git", ["log", "--oneline", "-30"]);
  return log
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `- ${l}`)
    .join("\n");
}

async function giteeRequest(method, url, token, body, headers = {}) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON response
  }
  if (!res.ok) {
    const msg = json?.message || json?.error || text || res.statusText;
    throw new Error(`gitee API ${method} ${url} -> ${res.status}: ${msg}`);
  }
  return json;
}

async function uploadAttachment(token, repo, releaseId, filePath) {
  const url = `${GITEE_API}/repos/${repo}/releases/${releaseId}/attach_files`;
  const form = new FormData();
  form.append("access_token", token);
  const buf = readFileSync(filePath);
  form.append("file", new Blob([buf]), path.basename(filePath));
  const res = await fetch(url, { method: "POST", body: form });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON response
  }
  if (!res.ok) {
    const msg = json?.message || json?.error || text || res.statusText;
    throw new Error(`gitee upload ${filePath} -> ${res.status}: ${msg}`);
  }
  return json;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const version = readVersion();
  const tagName = `v${version}`;
  const tgzName = `openclaw-${version}.tgz`;
  const outDir = path.join(repoRoot, "releases");
  const tgzPath = path.join(outDir, tgzName);

  console.log(`OpenClaw CN release: version=${version} repo=${args.repo}`);
  console.log(`  tag: ${tagName}`);
  console.log(`  pack: ${tgzName}`);

  // 1. 构建(可选)
  if (args.build) {
    console.log(">> Building (pnpm build + ui:build)...");
    run("pnpm", ["build"]);
    console.log(">> Building UI...");
    run("pnpm", ["ui:build"]);
  }

  // 2. 确认 dist 存在(不构建时)
  if (!existsSync(path.join(repoRoot, "dist", "entry.js"))) {
    console.error("dist/entry.js not found. Run with --build first or build manually.");
    process.exit(1);
  }

  // 3. npm pack
  console.log(">> npm pack ...");
  mkdirSync(outDir, { recursive: true });
  run("npm", ["pack", "--pack-destination", outDir]);
  if (!existsSync(tgzPath)) {
    console.error(`pack failed: ${tgzPath} not produced.`);
    process.exit(1);
  }
  const sizeMb = (existsSync(tgzPath) ? readFileSync(tgzPath).length : 0) / 1024 / 1024;
  console.log(`  packed: ${tgzPath} (${sizeMb.toFixed(1)} MB)`);

  if (args.packOnly) {
    console.log("Pack only. Done.");
    return;
  }

  // 4. gitee release
  const token = args.token || process.env.GITEE_TOKEN;
  if (!token) {
    console.error("No gitee token. Set GITEE_TOKEN env or pass --token.");
    console.error(
      "Create one at https://gitee.com/profile/personal_access_tokens (projects scope).",
    );
    process.exit(1);
  }

  const body = args.body || buildReleaseBody();
  const createPayload = {
    access_token: token,
    tag_name: tagName,
    name: `OpenClaw CN ${version}`,
    body,
    target_commitish: "main",
    prerelease: false,
  };

  let releaseId;
  const findUrl = `${GITEE_API}/repos/${args.repo}/releases/tags/${encodeURIComponent(tagName)}`;
  console.log(`>> Checking existing release ${tagName} ...`);
  let existing = null;
  try {
    existing = await giteeRequest("GET", findUrl, token);
  } catch (err) {
    // 404 = 不存在, 继续创建; 其他错误抛出
    if (!String(err.message).includes("404")) {
      throw err;
    }
  }

  if (existing?.id) {
    console.log(`  release exists (id=${existing.id}), updating body ...`);
    if (!args.dryRun) {
      await giteeRequest(
        "PATCH",
        `${GITEE_API}/repos/${args.repo}/releases/${existing.id}`,
        token,
        {
          access_token: token,
          name: `OpenClaw CN ${version}`,
          body,
        },
      );
    }
    releaseId = existing.id;
  } else {
    console.log(`  creating release ${tagName} ...`);
    if (!args.dryRun) {
      const created = await giteeRequest(
        "POST",
        `${GITEE_API}/repos/${args.repo}/releases`,
        token,
        createPayload,
      );
      releaseId = created.id;
    } else {
      releaseId = "DRY_RUN";
    }
  }

  console.log(`>> Uploading attachment ${tgzName} ...`);
  if (!args.dryRun) {
    const uploaded = await uploadAttachment(token, args.repo, releaseId, tgzPath);
    const url = uploaded?.browser_download_url || uploaded?.url || "(see gitee release page)";
    console.log(`  uploaded: ${url}`);
  } else {
    console.log(`  [dry-run] would upload ${tgzPath}`);
  }

  console.log(`Done. Release page: https://gitee.com/${args.repo}/releases/tag/${tagName}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
