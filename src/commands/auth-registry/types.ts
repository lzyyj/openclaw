/**
 * AuthRegistry — 动态可维护的厂商/认证方式注册表
 *
 * 目标：将 AuthChoice 从拍平硬编码联合类型改造为本地持久化注册表，
 * 支持新增/淘汰厂商与认证方式（软删除），并记录厂商通道健康状态。
 */

/** 认证方式类型归类（用于规范化命名，而非每家厂商自造名字） */
export type AuthMethodType =
  | "api-key" // 纯 API key
  | "oauth" // OAuth / 设备码登录
  | "setup-token" // 一次性 token（如 Anthropic setup-token）
  | "subscription" // 订阅制（如 Kimi Code / GLM Coding Plan / Copilot）
  | "cli" // CLI 插件认证（如 Gemini CLI、Codex CLI）
  | "proxy"; // 本地代理（如 Copilot Proxy）

/** 厂商通道健康状态 */
export type ChannelStatus = "ok" | "suspect" | "down" | "unknown";

/**
 * 认证方式（AuthMethod）
 * - id 保留旧 AuthChoice 字符串值做兼容（存量配置/脚本依赖）
 * - name/type 为新增规范化字段，作用于展示层与新逻辑
 */
export type AuthMethod = {
  /** 旧 AuthChoice id，保留兼容（如 "deepseek-api-key"） */
  id: string;
  /** 规范化展示名（用户可读，如 "千问网页验证"） */
  name: string;
  /** 认证类型归类 */
  type: AuthMethodType;
  /** 归属厂商 id（反查/分组） */
  vendor: string;
  /** 英文/技术标签 */
  label?: string;
  /** 说明 */
  hint?: string;
  /** CLI flag（--xxx） */
  cliFlag?: string;
  /** CLI option（--xxx <key>） */
  cliOption?: string;
  /** OnboardOptions 键名 */
  optionKey?: string;
  /** 软删除标记（用户主动禁用） */
  disabled?: boolean;

  // —— 通道健康状态 ——
  /** 通道健康：ok | suspect | down | unknown */
  channelStatus?: ChannelStatus;
  /** 最近通道检查时间（ISO） */
  channelCheckedAt?: string;
  /** 通道备注（如"网页验证模式；登录回调异常"） */
  channelNote?: string;
  /** 最近一次认证成功时间 */
  lastSuccessAt?: string;
  /** 最近一次认证失败时间 */
  lastFailureAt?: string;
};

/** 厂商（Provider） */
export type AuthProvider = {
  /** 厂商 id（如 "deepseek"、"qwen"） */
  id: string;
  /** 厂商展示名（如 "千问/Qwen"） */
  name: string;
  /** 说明 */
  hint?: string;
  /** 软删除标记 */
  disabled?: boolean;
  /** 排序权重（越小越靠前） */
  order?: number;
  /** 该厂商的认证方式列表 */
  authMethods: AuthMethod[];
};

/** 注册表文件结构 */
export type AuthRegistry = {
  /** 注册表版本号（用于迁移） */
  version: number;
  /** 厂商列表 */
  providers: AuthProvider[];
};
