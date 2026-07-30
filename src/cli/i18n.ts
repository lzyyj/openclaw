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
  "configure.channels.tip": "提示：运行 {cmd} 查看已配置和已启用的信道。",

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

  // ---- Configure wizard ----
  "configure.intro": "OpenClaw 配置向导",
  "configure.existing.title": "检测到已有配置",
  "configure.invalid.title": "配置无效",
  "configure.config_issues.title": "配置问题",
  "configure.invalid.outro": "配置无效。请先运行 `{command}` 修复后再重新运行配置。",
  "configure.section_select.message": "选择要配置的模块",
  "configure.section.continue": "继续",
  "configure.section.continue_done": "已完成",
  "configure.section.continue_skip": "暂不配置",
  "configure.channels.message": "信道",
  "configure.channels.configure.label": "配置/关联",
  "configure.channels.configure.hint": "添加/更新信道；禁用未选择的账号",
  "configure.channels.remove.label": "移除信道配置",
  "configure.channels.remove.hint": "从 openclaw.json 中删除信道令牌/设置",
  "configure.web_search.note_title": "Web 搜索",
  "configure.web_search.note_body": "Web 搜索让代理可以使用 `web_search` 工具在线查询信息。\n需要 Brave Search API 密钥（可存入配置或设置 BRAVE_API_KEY 环境变量）。\n文档：https://docs.openclaw.ai/tools/web",
  "configure.web_search.enable.message": "启用 web_search（Brave Search）？",
  "configure.web_search.no_key.title": "Web 搜索",
  "configure.web_search.no_key.body": "未存储密钥，web_search 将保持不可用。\n在此存储密钥或设置 BRAVE_API_KEY 环境变量。\n文档：https://docs.openclaw.ai/tools/web",
  "configure.web_fetch.enable.message": "启用 web_fetch（无密钥 HTTP 抓取）？",
  "configure.mode_select.message": "网关运行位置",
  "configure.mode.local.label": "本地（本机）",
  "configure.mode.remote.label": "远程（仅信息）",
  "configure.workspace.message": "工作区目录",
  "configure.gateway_port.message": "网关端口（服务安装时使用）",
  "configure.gateway.port.message": "网关端口",
  "configure.gateway.bind.message": "网关绑定模式",
  "configure.gateway.bind.loopback": "回环（仅本地）",
  "configure.gateway.bind.loopback.hint": "绑定到 127.0.0.1 — 安全，仅本地访问",
  "configure.gateway.bind.tailnet": "Tailnet（Tailscale IP）",
  "configure.gateway.bind.tailnet.hint": "仅绑定到您的 Tailscale IP（100.x.x.x）",
  "configure.gateway.bind.auto": "自动（回环 → LAN）",
  "configure.gateway.bind.auto.hint": "优先使用回环地址；不可用时回退到所有接口",
  "configure.gateway.bind.lan": "LAN（所有接口）",
  "configure.gateway.bind.lan.hint": "绑定到 0.0.0.0 — 网络中任意设备均可访问",
  "configure.gateway.bind.custom": "自定义 IP",
  "configure.gateway.bind.custom.hint": "指定具体 IP 地址，不可用时回退到 0.0.0.0",
  "configure.gateway.custom_ip.message": "自定义 IP 地址",
  "configure.gateway.auth.message": "网关认证方式",
  "configure.gateway.auth.token": "令牌",
  "configure.gateway.auth.token.hint": "推荐默认值",
  "configure.gateway.auth.password": "密码",
  "configure.gateway.auth.trusted_proxy": "受信代理",
  "configure.gateway.auth.trusted_proxy.hint": "位于反向代理之后（Pomerium、Caddy、Traefik 等）",
  "configure.gateway.tailscale.message": "Tailscale 暴露方式",
  "configure.gateway.tailscale.reset.message": "退出时重置 Tailscale serve/funnel？",
  "configure.gateway.tailscale.conflict_auth": "受信代理认证与 Tailscale serve/funnel 不兼容，已禁用 Tailscale。",
  "configure.gateway.token.message": "网关令牌（留空自动生成）",
  "configure.gateway.password.message": "网关密码",
  "configure.gateway.trusted_proxy.note_title": "受信代理认证",
  "configure.gateway.trusted_proxy.note_body": "受信代理模式：OpenClaw 信任来自反向代理的用户身份。\n代理必须认证用户并通过请求头传递身份信息。\n仅来自指定代理 IP 的请求会被信任。\n\n常见用途：Pomerium、Caddy + OAuth、Traefik + forward auth\n文档：https://docs.openclaw.ai/gateway/trusted-proxy-auth",
  "configure.gateway.trusted_proxy.header.message": "用户身份标识请求头",
  "configure.gateway.trusted_proxy.headers.message": "必需请求头（逗号分隔，可选）",
  "configure.gateway.trusted_proxy.users.message": "允许的用户（逗号分隔，留空=所有认证用户）",
  "configure.gateway.trusted_proxy.ips.message": "受信代理 IP（逗号分隔）",
  "configure.gateway.tailscale.conflict_bind": "Tailscale 要求 bind=loopback。已将绑定模式调整为回环。",
  "configure.gateway.tailscale.funnel_password": "Tailscale funnel 需使用密码认证。",

  // ---- Mode select hints ----
  "configure.mode.local.hint.reachable": "网关可达（{url}）",
  "configure.mode.local.hint.unreachable": "未检测到网关（{url}）",
  "configure.mode.remote.hint.empty": "尚未配置远程网关 URL",
  "configure.mode.remote.hint.reachable": "网关可达（{url}）",
  "configure.mode.remote.hint.unreachable": "已配置但无法连接（{url}）",

  // ---- Configure section labels ----
  "configure.section.workspace.label": "工作区",
  "configure.section.workspace.hint": "设置工作区 + 会话目录",
  "configure.section.model.label": "模型",
  "configure.section.model.hint": "选择提供商 + 配置凭据",
  "configure.section.web.label": "Web 工具",
  "configure.section.web.hint": "配置 Brave 搜索 + 抓取",
  "configure.section.gateway.label": "网关",
  "configure.section.gateway.hint": "端口、绑定、认证、Tailscale",
  "configure.section.daemon.label": "后台服务",
  "configure.section.daemon.hint": "安装/管理后台服务",
  "configure.section.channels.label": "信道",
  "configure.section.channels.hint": "关联 WhatsApp/Telegram 等并设置默认值",
  "configure.section.skills.label": "技能",
  "configure.section.skills.hint": "安装/启用工作区技能",
  "configure.section.health.label": "健康检查",
  "configure.section.health.hint": "运行网关 + 信道检查",

  // ---- Onboard summary labels ----
  "onboarding.summary.workspace": "工作区",
  "onboarding.summary.model": "模型",
  "onboarding.summary.gateway.mode": "网关模式",
  "onboarding.summary.gateway.port": "网关端口",
  "onboarding.summary.gateway.bind": "网关绑定",
  "onboarding.summary.gateway.remote.url": "远程网关 URL",
  "onboarding.summary.skills.nodeManager": "技能Node管理器",

  // ---- Configure wizard - Health check help ----
  "configure.health_check.note_title": "健康检查帮助",
  "configure.health_check.docs_link": "文档：",

  // ---- Configure wizard - Control UI ----
  "configure.control_ui.note_title": "控制界面",
  "configure.control_ui.web_ui": "Web UI：",
  "configure.control_ui.web_ui_token": "Web UI（带令牌）：",
  "configure.control_ui.gateway_ws": "网关 WS：",
  "configure.control_ui.docs_link": "文档：https://docs.openclaw.ai/web/control-ui",

  // ---- Model/Auth provider configuration ----
  "configure.model.auth_provider": "模型/认证提供商",
  "configure.model.auth_method": "认证方式",
  "configure.model.choice_title": "模型/认证选择",
  "configure.model.no_auth_methods": "该提供商没有可用的认证方式。",
  "configure.model.api_key": "API 密钥",
  "configure.model.api_key_prompt": "输入 API 密钥",
  "configure.model.configured": "模型配置完成",
  "configure.model.default_set": "默认模型已设为 {model}",
  "configure.model.default_set_agent": "默认模型已设为 {model}（代理 {agentId}）",
  "configure.model.multiselect": "模型多选",
  "configure.model.items_selected": "{count} 项已选择",
  "configure.model.use_existing_key": "使用现有 {envLabel}（{source}，{preview}）？",
  "configure.back": "返回",
  "configure.skip_for_now": "暂不配置",

  // ---- Provider auth labels/prompts ----
  "configure.provider.kimi_api_key_ai": "Kimi API 密钥（.ai）",
  "configure.provider.kimi_api_key_cn": "Kimi API 密钥（.cn）",
  "configure.provider.kimi_code_api_key": "Kimi Code API 密钥（订阅）",
  "configure.provider.moonshot_api_key.prompt": "输入 Moonshot API 密钥",
  "configure.provider.moonshot_api_key_cn.prompt": "输入 Moonshot API 密钥（.cn）",
  "configure.provider.kimi_code_api_key.prompt": "输入 Kimi Coding API 密钥",
  "configure.provider.kimi_code.title": "Kimi Coding",
  "configure.provider.kimi_code.note": "Kimi Coding 使用独立端点和 API 密钥。\n获取 API 密钥：https://www.kimi.com/code/en",

  // ---- Provider auth group hints (auth-choice-options.ts) ----
  "configure.provider.openai.hint": "Codex OAuth + API 密钥",
  "configure.provider.anthropic.hint": "设置令牌 + API 密钥",
  "configure.provider.chutes.hint": "OAuth 授权",
  "configure.provider.vllm.hint": "本地/自托管 OpenAI 兼容",
  "configure.provider.minimax.hint": "M2.5（推荐）",
  "configure.provider.moonshot.hint": "Kimi K2.5 + Kimi 编程",
  "configure.provider.google.hint": "Gemini API 密钥 + OAuth",
  "configure.provider.xai.hint": "API 密钥",
  "configure.provider.mistral.hint": "API 密钥",
  "configure.provider.volcengine.hint": "API 密钥",
  "configure.provider.byteplus.hint": "API 密钥",
  "configure.provider.openrouter.hint": "API 密钥",
  "configure.provider.kilocode.hint": "API 密钥（兼容 OpenRouter）",
  "configure.provider.qwen.hint": "编程模型（推荐）",
  "configure.provider.zai.hint": "GLM 编程计划 / 全球 / 国内",
  "configure.provider.qianfan.hint": "API 密钥",
  "configure.provider.deepseek.hint": "API 密钥（deepseek-chat / deepseek-reasoner）",
  "configure.provider.copilot.hint": "GitHub + 本地代理",
  "configure.provider.vercel_ai_gateway.hint": "API 密钥",
  "configure.provider.opencode_zen.hint": "API 密钥",
  "configure.provider.xiaomi.hint": "API 密钥",
  "configure.provider.synthetic.hint": "兼容 Anthropic（多模型）",
  "configure.provider.together.hint": "API 密钥",
  "configure.provider.huggingface.hint": "推理 API（HF 令牌）",
  "configure.provider.venice.hint": "隐私优先（无审查模型）",
  "configure.provider.litellm.hint": "统一 LLM 网关（100+ 提供商）",
  "configure.provider.cloudflare_ai_gateway.hint": "账户 ID + 网关 ID + API 密钥",
  "configure.provider.custom.hint": "任意 OpenAI 或 Anthropic 兼容端点",

  // ---- Provider auth promptMessages ----
  "configure.provider.vercel_ai_gateway.prompt": "输入 Vercel AI Gateway API 密钥",
  "configure.provider.deepseek.prompt": "输入 DeepSeek API 密钥",
  "configure.provider.xiaomi.prompt": "输入小米 API 密钥",
  "configure.provider.mistral.prompt": "输入 Mistral API 密钥",
  "configure.provider.venice.prompt": "输入 Venice AI API 密钥",
  "configure.provider.opencode_zen.prompt": "输入 OpenCode Zen API 密钥",
  "configure.provider.together.prompt": "输入 Together AI API 密钥",
  "configure.provider.qianfan.prompt": "输入千帆 API 密钥",
  "configure.provider.kilocode.prompt": "输入 Kilo Gateway API 密钥",
  "configure.provider.synthetic.prompt": "输入合成 API 密钥",
  "configure.provider.litellm.prompt": "输入 LiteLLM API 密钥",
  "configure.provider.cloudflare_ai_gateway.prompt": "输入 Cloudflare AI Gateway API 密钥",
  "configure.provider.gemini.prompt": "输入 Gemini API 密钥",
  "configure.provider.zai.prompt": "输入 Z.AI API 密钥",

  // ---- Provider auth noteTitles ----
  "configure.provider.deepseek.title": "DeepSeek",
  "configure.provider.venice.title": "Venice AI",
  "configure.provider.opencode_zen.title": "OpenCode Zen",
  "configure.provider.together.title": "Together AI",
  "configure.provider.qianfan.title": "千帆",
  "configure.provider.litellm.title": "LiteLLM",
  "configure.provider.cloudflare_ai_gateway.title": "Cloudflare AI Gateway",

  // ---- Provider auth noteMessages ----
  "configure.provider.deepseek.note": "DeepSeek API 提供 deepseek-chat（V3.2）和 deepseek-reasoner（思考模式）。\n获取 API 密钥：https://platform.deepseek.com\n定价说明：https://api-docs.deepseek.com/zh-cn/quick_start/pricing",
  "configure.provider.venice.note": "Venice AI 提供隐私优先的推理服务，支持无审查模型。\n获取 API 密钥：https://venice.ai/settings/api\n支持「私有」（完全私密）和「匿名」（代理）模式。",
  "configure.provider.opencode_zen.note": "OpenCode Zen 提供对 Claude、GPT、Gemini 等模型的访问。\n获取 API 密钥：https://opencode.ai/auth\nOpenCode Zen 按请求计费。详情请查看 OpenCode 控制台。",
  "configure.provider.together.note": "Together AI 提供对 Llama、DeepSeek、Qwen 等领先开源模型的访问。\n获取 API 密钥：https://api.together.xyz/settings/api-keys",
  "configure.provider.qianfan.note": "获取 API 密钥：https://console.bce.baidu.com/qianfan/ais/console/apiKey\nAPI 密钥格式：bce-v3/ALTAK-...",
  "configure.provider.litellm.note": "LiteLLM 提供统一 API 接入 100+ LLM 提供商。\n从你的 LiteLLM 代理或 https://litellm.ai 获取 API 密钥。\n默认代理运行在 http://localhost:4000",

  // ---- Cloudflare AI Gateway prompts ----
  "configure.provider.cloudflare_account_id.prompt": "输入 Cloudflare 账户 ID",
  "configure.provider.cloudflare_account_id.required": "账户 ID 是必填项",
  "configure.provider.cloudflare_gateway_id.prompt": "输入 Cloudflare AI 网关 ID",
  "configure.provider.cloudflare_gateway_id.required": "网关 ID 是必填项",

  // ---- Configure wizard misc ----
  "configure.gateway.mode_set_local": "网关模式已设为 local。",
  "configure.remote.configured": "远程网关配置完成。",
  "configure.no_changes_selected": "未选择任何修改。",

  // ---- Config update messages ----
  "configure.config.overwrite": "配置覆盖",
  "configure.config.updated": "已更新 {path}",
  "configure.complete": "配置完成",
  "configure.complete.outro": "配置完成。",
  "config.io.overwrite": "配置覆盖：{path}（sha256 {previousHash} -> {nextHash}，backup={backup}{changeSummary}）",
  "config.logging.updated": "已更新 {path}{suffix}",

  // ---- Gateway status ----
  "gateway.status.reachable": "网关：可连接",
  "gateway.status.not_detected": "网关：未检测到",

  // ---- Clack prompt internals ----
  "clack.no_matches": "未找到匹配项",
  "clack.search": "搜索：",
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
