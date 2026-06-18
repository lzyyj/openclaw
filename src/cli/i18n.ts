/**
 * CLI i18n: resolve locale from OPENCLAW_LANG or LANG or system UI language.
 * Use getText(key, fallbackEn, params?) so upstream can stay English-only;
 * zh-CN bundle is maintained separately for easy merge.
 */

import { detectOsLanguage } from "../infra/detect-language.js";

export type CliLocale = "en" | "zh-CN";

let cachedLocale: CliLocale | null = null;
let cachedCanDisplayChinese: boolean | null = null;

/**
 * On Windows, LANG may not be set but the system UI language is zh-CN.
 * We do NOT gate on terminal code page — both 936 (GBK) and 65001 (UTF-8)
 * can render Chinese characters; encoding is a separate concern from locale.
 */
function windowsCanDisplayChinese(): boolean {
  return true;
}

export function resolveCliLocale(): CliLocale {
  if (cachedLocale !== null) {
    return cachedLocale;
  }
  // 1. Process env (explicit override from config or command line)
  const raw =
    process.env.OPENCLAW_LANG?.trim() ||
    process.env.LANG?.trim() ||
    process.env.LC_ALL?.trim() ||
    "";
  const lower = raw.toLowerCase();
  if (lower.startsWith("zh_cn") || lower.startsWith("zh-cn") || lower === "zh") {
    if (cachedCanDisplayChinese === null) {
      cachedCanDisplayChinese = windowsCanDisplayChinese();
    }
    cachedLocale = cachedCanDisplayChinese ? "zh-CN" : "en";
    return cachedLocale;
  }
  if (lower.startsWith("zh_tw") || lower.startsWith("zh-tw")) {
    cachedLocale = "en";
    return "en";
  }
  // 2. System UI language detection
  const osLang = detectOsLanguage();
  if (osLang === "zh-CN") {
    if (cachedCanDisplayChinese === null) {
      cachedCanDisplayChinese = windowsCanDisplayChinese();
    }
    cachedLocale = cachedCanDisplayChinese ? "zh-CN" : "en";
    return cachedLocale;
  }
  cachedLocale = "en";
  return "en";
}

function interpolate(template: string, params?: Record<string, string>): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
}

/** zh-CN CLI strings (onboarding, wizard, help, banner, etc.). */
const ZH_CN: Record<string, string> = {
  // ---- Banner ----
  "banner.tagline": "一个 CLI 统治一切，" + "再重启一次因为改了端口。",

  // ---- Help ----
  "help.usage": "用法：",
  "help.options": "选项：",
  "help.commands": "命令：",
  "help.subcommands_hint": "提示：带 * 的命令有子命令。运行 <command> --help 查看详情。",
  "help.examples": "示例：",
  "help.docs": "文档：",
  "help.display_help": "显示命令帮助",
  "help.dev_profile":
    "开发模式：隔离状态至 ~/.openclaw-dev，默认网关端口 19001，同时迁移衍生端口（浏览器/面板）",

  // ---- Update ----
  "update.available": "有可用更新{suffix}。运行：{cmd}",
  "update.startup.notify": "有可用更新（{tag}）：{version}（当前 {currentVersion}）。运行：{command}",
  "help.profile":
    "使用指定配置文件（将 OPENCLAW_STATE_DIR/OPENCLAW_CONFIG_PATH 隔离至 ~/.openclaw-<name>）",
  "help.log_level": "文件和控制台的全局日志级别覆盖（{levels}）",
  "help.no_color": "禁用 ANSI 颜色",

  // ---- Help examples ----
  "help.example.show_model_help": "查看 models 命令的详细帮助。",
  "help.example.login_whatsapp": "关联个人 WhatsApp Web 并显示二维码 + 连接日志。",
  "help.example.send_json": "通过 Web 会话发送并打印 JSON 结果。",
  "help.example.run_gateway": "运行 WebSocket 网关。",
  "help.example.dev_gateway": "运行开发网关（隔离状态/配置），地址 ws://127.0.0.1:19001。",
  "help.example.force_gateway": "杀死绑定在默认网关端口的所有进程，然后启动。",
  "help.example.gateway_control": "通过 WebSocket 控制网关。",
  "help.example.agent_deliver": "使用网关直接与代理对话，可选发送 WhatsApp 回复。",
  "help.example.send_telegram": "通过 Telegram Bot 发送消息。",

  // ---- Onboarding / wizard (existing) ----
  "onboarding.intro": "OpenClaw 初始化向导",
  "onboarding.risk.title": "安全",
  "onboarding.risk.body": [
    "安全提示 — 请阅读。",
    "",
    "OpenClaw 为兴趣项目，目前仍为 beta 版本，可能存在不完善之处。",
    "启用工具后，本机器人可读取文件并执行操作。恶意提示可能诱导其执行危险操作。",
    "",
    "若您不熟悉基本安全与访问控制，请勿运行 OpenClaw。",
    "在启用工具或对外暴露前，建议请有经验者协助。",
    "",
    "建议基线：",
    "- 配对/白名单 + 提及门控。",
    "- 沙箱 + 最小权限工具。",
    "- 勿将密钥放在代理可访问的文件系统中。",
    "- 对具备工具或不可信收件箱的机器人使用当前最强模型。",
    "",
    "请定期执行：",
    "openclaw security audit --deep",
    "openclaw security audit --fix",
    "",
    "必读：https://docs.openclaw.ai/gateway/security",
  ].join("\n"),
  "onboarding.risk.continue": "我理解其功能强大且存在固有风险。是否继续？",
  "onboarding.config.invalid.title": "配置无效",
  "onboarding.config.issues.title": "配置问题",
  "onboarding.config.outro": "配置无效。请先执行 `{command}` 修复后再重新运行初始化。",
  "onboarding.flow.message": "初始化模式",
  "onboarding.flow.quickstart": "快速开始",
  "onboarding.flow.quickstart.hint": "后续可通过 {command} 配置细节。",
  "onboarding.flow.manual": "手动",
  "onboarding.flow.manual.hint": "配置端口、网络、Tailscale 与认证等。",
  "onboarding.flow.invalid": "无效的 --flow（请使用 quickstart、manual 或 advanced）。",
  "onboarding.quickstart.remote_switch": "快速开始仅支持本地网关，已切换为手动模式。",
  "onboarding.existing.title": "检测到已有配置",
  "onboarding.config_handling.message": "配置处理方式",
  "onboarding.config_handling.keep": "沿用现有值",
  "onboarding.config_handling.modify": "更新数值",
  "onboarding.config_handling.reset": "重置",
  "onboarding.reset_scope.message": "重置范围",
  "onboarding.reset_scope.config": "仅配置",
  "onboarding.reset_scope.config_creds_sessions": "配置 + 凭据 + 会话",
  "onboarding.reset_scope.full": "完全重置（配置 + 凭据 + 会话 + 工作区）",
  "onboarding.helpers.setup_cancelled": "初始化已取消。",
  "onboarding.helpers.no_settings": "未检测到关键设置。",
  "onboarding.helpers.gateway.port": "网关端口",
  "onboarding.helpers.gateway.mode": "网关模式",
  "onboarding.helpers.gateway.bind": "网关绑定",
  "onboarding.helpers.gateway.remote.url": "远程网关 URL",

  // ---- Health / error messages ----
  "health.failed": "健康检查失败：",
  "health.failed.short": "健康检查失败",

  // ---- Daemon install ----
  "daemon.install.gateway_check_failed": "网关服务检查失败：{error}",
  "daemon.install.already_installed": "网关服务已{status}。",
  "daemon.install.reinstall_hint": "如需重新安装：{cmd}",
  "daemon.install.invalid_port": "无效端口",
  "daemon.install.nix_detected": "检测到 Nix 模式；服务安装已禁用。",
  "daemon.install.invalid_runtime": "无效的 --runtime（使用 \"node\" 或 \"bun\"）",
  "daemon.install.no_token_warn": "未找到网关令牌。已自动生成并保存到配置。",
  "daemon.install.config_invalid_skip": "警告：配置文件存在但无效；跳过令牌持久化。",
  "daemon.install.persist_token_failed": "警告：无法将令牌持久化到配置：{error}",

  // ---- Daemon install error hint ----
  "daemon.install.hint.win32": "提示：请以管理员身份重新运行 PowerShell（开始 → 输入 PowerShell → 右键 → 以管理员身份运行），或跳过服务安装。",
  "daemon.install.hint.other": "提示：修复错误后重新运行 {cmd}。",

  // ---- Doctor UI ----
  "doctor.ui.missing": "- 控制界面资源缺失。\n- 运行：pnpm ui:build",
  "doctor.ui.skipped_no_sources": "跳过 UI 构建：ui/ 源码不存在。",
  "doctor.ui.build_confirm": "现在构建控制界面资源？",
  "doctor.ui.building": "正在构建控制界面资源...（可能需要一点时间）",
  "doctor.ui.build_complete": "UI 构建完成。",
  "doctor.ui.build_failed": "UI 构建失败（退出码 {code}）。",
  "doctor.ui.stale_header": "UI 资源比协议模式旧。\n上次构建以来的功能变更：",
  "doctor.ui.rebuild_confirm": "立即重新构建 UI？（检测到协议不匹配，需要更新）",
  "doctor.ui.skipped_no_sources_rebuild": "跳过 UI 重新构建：ui/ 源码不存在。",
  "doctor.ui.rebuilding": "正在重新构建过期的 UI 资源...（可能需要一点时间）",
  "doctor.ui.rebuild_complete": "UI 重新构建完成。",
  "doctor.ui.rebuild_failed": "UI 重新构建失败（退出码 {code}）。",

  // ---- Gateway control-ui ----
  "gateway.control_ui.not_found_at": "在 {path} 未找到控制界面资源。请运行 `pnpm ui:build` 构建（自动安装 UI 依赖），或更新 gateway.controlUi.root。",
  "gateway.control_ui.not_found": "未找到控制界面资源。请运行 `pnpm ui:build` 构建（自动安装 UI 依赖），或在开发时运行 `pnpm ui:dev`。",

  // ---- Skills CLI ----
  "skills.list.tip": "提示：使用 `npx clawhub` 搜索、安装和同步技能。",

  // ---- Configure channels ----
  "configure.channels.tip": "提示：运行 {cmd} 查看已配置和已启用的通道。",

  // ---- Doctor state integrity ----
  "doctor.state.backup_tip": "- 提示：将工作区备份到私有 git 仓库（GitHub 或 GitLab）。",

  // ---- Gateway status ----
  "gateway.status.mdns_tip": "提示：如果网关在远程，mDNS 无法跨网络工作；请使用 Wide-Area Bonjour（拆分 DNS）或 SSH 隧道。",

  // ---- Message format ----
  "message.format.json_tip": "提示：使用 --json 获取完整输出。",

  // ---- Onboard skills tip ----
  "onboard.skills.tip": "提示：运行 {cmd} 查看技能和要求。",

  // ---- Uninstall ----
  "uninstall.workspace_preserved": "提示：工作区已保留。如需删除请重新运行 --workspace。",

  // ---- Tailscale ----
  "tailscale.funnel_tip": "提示：Funnel 对于 OpenClaw 是可选的。您可以在没有 Funnel 的情况下继续运行 Web 网关：{cmd}",
};

/**
 * Return translated string for key when locale is zh-CN, otherwise fallbackEn.
 * params are used to replace {name} placeholders in the string.
 */
export function getText(key: string, fallbackEn: string, params?: Record<string, string>): string {
  const locale = resolveCliLocale();
  if (locale === "en") {
    return interpolate(fallbackEn, params);
  }
  const value = ZH_CN[key];
  if (typeof value === "string") {
    return interpolate(value, params);
  }
  return interpolate(fallbackEn, params);
}
