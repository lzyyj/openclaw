/**
 * CLI i18n: resolve locale from OPENCLAW_LANG or LANG or system UI language.
 * Use getText(key, fallbackEn, params?) so upstream can stay English-only;
 * zh-CN bundle is maintained separately for easy merge.
 */

import { detectOsLanguage } from "../infra/detect-language.js";

export type CliLocale = "en" | "zh-CN";

let cachedLocale: CliLocale | null = null;

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
    cachedLocale = "zh-CN";
    return "zh-CN";
  }
  if (lower.startsWith("zh_tw") || lower.startsWith("zh-tw")) {
    cachedLocale = "en";
    return "en";
  }
  // 2. System UI language detection
  const osLang = detectOsLanguage();
  if (osLang === "zh-CN") {
    cachedLocale = "zh-CN";
    return "zh-CN";
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
