---
summary: "本地厂商元数据注册表（provider-meta.json）：维护厂商名/描述/官网，并标记删除过期模型"
title: "本地厂商注册表 (provider-meta.json)"
---

# 本地厂商注册表 (provider-meta.json)

`provider-meta.json` 是**本地厂商（provider）元数据注册表**，与 `models.json` 同目录
（`agents/<id>/agent/provider-meta.json`）。它把所有"展示类"厂商信息集中到一个
**独立、可维护**的文件里，避免散落在硬编码中；并提供 `removedModels` 手动标记删除
过期模型。

## 设计原则

- **硬编码 = 种子，本地注册 = 权威**：厂商/模型信息首次由硬编码导入；之后以本地文件为准。
- **显式配置优先**：`openclaw.json` 里用户**明确配置**的模型/字段，优先级高于本文件（本文件只做融合/剔除，不覆盖用户显式配置）。
- **独立文件**：不把厂商展示元数据塞进 `models.json` 的 provider 运行时配置，职责分离。

## 文件结构

```jsonc
{
  "version": 1,
  "providers": {
    "deepseek": {
      // provider id（匹配不区分大小写）
      "name": "DeepSeek", // 默认展示名（英文 / fallback）
      "nameZh": "深度求索", // 中文名（有才加，可选）
      "website": "https://www.deepseek.com", // 厂商官网（可选，可拉取描述）
      "description": "...", // 默认（英文）描述
      "descriptionZh": "...", // 中文描述（可选）
      "removedModels": ["deepseek-chat", "deepseek-reasoner"], // 标记删除的过期模型
    },
  },
}
```

## removedModels：删除过期模型

`removedModels` 列出的模型 id 会在生成 `models.json` 时**从对应 provider 的模型列表剔除**，
因此 runner 模型注册表和 webUI 模型目录都看不到它们。

典型用法——DeepSeek 已发 V4，旧别名 `deepseek-chat` / `deepseek-reasoner` 过时：

```jsonc
{
  "version": 1,
  "providers": {
    "deepseek": {
      "name": "DeepSeek",
      "nameZh": "深度求索",
      "website": "https://www.deepseek.com",
      "removedModels": ["deepseek-chat", "deepseek-reasoner"],
    },
  },
}
```

> 说明：旧版合并逻辑（`mergeProviderModels`）会把硬编码里的过期模型**重新加回**
> （"删不掉"）。本机制通过在写 `models.json` 前应用 `removedModels` 剔除，解决了这个问题。

## 覆盖范围

所有 vendor 级厂商（deepseek / qwen / moonshot / minimax / google / openai / anthropic /
xai / mistral / zai / copilot / openrouter / kilocode / together / qianfan / volcengine /
byteplus 等）。文件里能配多少配多少，未配置的厂商回退到硬编码/i18n。

## 相关代码

- `src/agents/provider-meta.ts`：读取、规范化、剔除逻辑；`loadProviderMeta()` 供展示层查询。
- `src/agents/models-config.ts`：`ensureOpenClawModelsJson()` 在生成 `models.json` 前调用
  `applyProviderMetaRemovals()` 应用剔除。
