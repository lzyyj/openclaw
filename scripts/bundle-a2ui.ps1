#!/usr/bin/env pwsh

/**
 * A2UI Bundle Script - Cross-platform replacement for bundle-a2ui.sh
 * Supports: Windows (PowerShell/CMD), macOS, Linux, WSL
 * 基于 bundle-a2ui.sh 的跨平台替代品，目前已被新的脚本 bundle-a2ui.mjs 替代，仅备用
 * Author: lzyyj
 */

param(
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

# 获取脚本目录和根目录
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Resolve-Path (Join-Path $ScriptDir "..")

# 定义路径
$HashFile = Join-Path $RootDir "src\canvas-host\a2ui\.bundle.hash"
$OutputFile = Join-Path $RootDir "src\canvas-host\a2ui\a2ui.bundle.js"
$A2UIRendererDir = Join-Path $RootDir "vendor\a2ui\renderers\lit"
$A2UIAppDir = Join-Path $RootDir "apps\shared\OpenClawKit\Tools\CanvasA2UI"

# 解析 node 路径文件
function Read-PathFile {
    $pathFile = Join-Path $RootDir ".openclaw-node-path"
    if (Test-Path $pathFile) {
        $nodeDir = Get-Content $pathFile | ForEach-Object { $_.Trim() }
        if ($nodeDir) {
            return $nodeDir
        }
    }
    return $null
}

# 尝试在指定目录找到 node
function Try-NodeAt {
    param([string]$dir)

    $exePaths = @(
        (Join-Path $dir "node.exe"),
        (Join-Path $dir "node")
    )

    foreach ($exe in $exePaths) {
        if (Test-Path $exe) {
            $env:PATH = "$dir;$env:PATH"
            return $exe
        }
    }
    return $null
}

# 查找 Node.js
$NodeCmd = $null

# 1. 尝试从路径文件读取
$nodeDir = Read-PathFile
if ($nodeDir) {
    $NodeCmd = Try-NodeAt $nodeDir
}

# 2. 尝试 PATH 中的 node
if (-not $NodeCmd) {
    $nodeInPath = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeInPath) {
        $NodeCmd = $nodeInPath.Source
    }
}

# 3. 尝试常见的 Windows 安装位置
if (-not $NodeCmd) {
    $commonPaths = @(
        "${env:ProgramFiles}\nodejs",
        "${env:ProgramFiles(x86)}\nodejs",
        "${env:LOCALAPPDATA}\Programs\node",
        "${env:APPDATA}\npm",
        "${env:USERPROFILE}\miniconda3\Library\bin",
        "${env:USERPROFILE}\anaconda3\Library\bin",
        "${env:USERPROFILE}\AppData\Roaming\nvm\current"
    )

    foreach ($path in $commonPaths) {
        if ($path -and (Test-Path $path)) {
            $NodeCmd = Try-NodeAt $path
            if ($NodeCmd) { break }
        }
    }
}

if (-not $NodeCmd) {
    Write-Error "node: command not found (tried .openclaw-node-path, PATH, and common Windows locations)`nOn Windows: run this installer from PowerShell so it can write the node path for bash."
    exit 1
}

Write-Host "Using Node: $NodeCmd"

# 错误处理
trap {
    Write-Error "A2UI bundling failed. Re-run with: pnpm canvas:a2ui:bundle"
    Write-Error "If this persists, verify pnpm deps and try again."
    exit 1
}

# 检查目录是否存在
if (-not (Test-Path $A2UIRendererDir) -or -not (Test-Path $A2UIAppDir)) {
    if (Test-Path $OutputFile) {
        Write-Host "A2UI sources missing; keeping prebuilt bundle."
        exit 0
    }
    Write-Error "A2UI sources missing and no prebuilt bundle found at: $OutputFile"
    exit 1
}

# 输入文件列表
$InputPaths = @(
    (Join-Path $RootDir "package.json"),
    (Join-Path $RootDir "pnpm-lock.yaml"),
    $A2UIRendererDir,
    $A2UIAppDir
)

# 计算哈希值的函数
function Compute-Hash {
    $inputPaths = $args

    $script = @'
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
  hash.update("\0");
  hash.update(await fs.readFile(filePath));
  hash.update("\0");
}

process.stdout.write(hash.digest("hex"));
'@

    $env:ROOT_DIR = $RootDir
    $output = & $NodeCmd --input-type=module - @inputPaths $script
    return $output
}

Write-Host "Computing hash..."
$currentHash = Compute-Hash @InputPaths

# 检查是否需要重新构建
$needRebuild = $true
if (Test-Path $HashFile) {
    $previousHash = Get-Content $HashFile
    if ($previousHash -eq $currentHash -and (Test-Path $OutputFile)) {
        Write-Host "A2UI bundle up to date; skipping."
        exit 0
    }
}

Write-Host "Building A2UI bundle..."

# 执行 TypeScript 编译
Write-Host "Compiling TypeScript..."
& $NodeCmd (Join-Path $RootDir "node_modules\.bin\tsc.ps1") -p (Join-Path $A2UIRendererDir "tsconfig.json")

# 执行 rolldown 打包
$rolldownConfig = Join-Path $A2UIAppDir "rolldown.config.mjs"
$rolldown = Get-Command rolldown -ErrorAction SilentlyContinue
if ($rolldown) {
    Write-Host "Running rolldown..."
    & rolldown -c $rolldownConfig
} else {
    Write-Host "Running rolldown via pnpm dlx..."
    & pnpm -s dlx rolldown -c $rolldownConfig
}

# 保存哈希值
$currentHash | Out-File -FilePath $HashFile -Encoding ascii -NoNewline

Write-Host "A2UI bundle created successfully: $OutputFile"
