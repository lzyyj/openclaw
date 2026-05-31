import {
  defaultTitle,
  normalizeToolName,
  normalizeVerb,
  resolveActionSpec,
  resolveDetailFromKeys,
  resolveExecDetail,
  resolveReadDetail,
  resolveWebFetchDetail,
  resolveWebSearchDetail,
  resolveWriteDetail,
  type ToolDisplaySpec as ToolDisplaySpecBase,
} from "../../../src/agents/tool-display-common.js";
import { t } from "../i18n/index.ts";
import type { IconName } from "./icons.ts";
import rawConfig from "./tool-display.json" with { type: "json" };

type ToolDisplaySpec = ToolDisplaySpecBase & {
  icon?: string;
};

type ToolDisplayConfig = {
  version?: number;
  fallback?: ToolDisplaySpec;
  tools?: Record<string, ToolDisplaySpec>;
};

export type ToolDisplay = {
  name: string;
  icon: IconName;
  title: string;
  label: string;
  verb?: string;
  detail?: string;
};

const TOOL_DISPLAY_CONFIG = rawConfig as ToolDisplayConfig;
const FALLBACK = TOOL_DISPLAY_CONFIG.fallback ?? { icon: "puzzle" };
const TOOL_MAP = TOOL_DISPLAY_CONFIG.tools ?? {};

function shortenHomeInString(input: string): string {
  if (!input) {
    return input;
  }

  // Browser-safe home shortening: avoid importing Node-only helpers (keeps Vite builds working in Docker/CI).
  const patterns = [
    { re: /^\/Users\/[^/]+(\/|$)/, replacement: "~$1" }, // macOS
    { re: /^\/home\/[^/]+(\/|$)/, replacement: "~$1" }, // Linux
    { re: /^C:\\Users\\[^\\]+(\\|$)/i, replacement: "~$1" }, // Windows
  ] as const;

  for (const pattern of patterns) {
    if (pattern.re.test(input)) {
      return input.replace(pattern.re, pattern.replacement);
    }
  }

  return input;
}

export function resolveToolDisplay(params: {
  name?: string;
  args?: unknown;
  meta?: string;
}): ToolDisplay {
  const name = normalizeToolName(params.name);
  const key = name.toLowerCase();
  const spec = TOOL_MAP[key];
  const icon = (spec?.icon ?? FALLBACK.icon ?? "puzzle") as IconName;
  const title = spec?.title ?? defaultTitle(name);
  const label = spec?.label ?? title;
  // Try translating the label; fall back to original English label if no translation key exists
  const toolKey = `tool.${key}`;
  const translatedLabelRaw = t(toolKey);
  const finalLabel = translatedLabelRaw !== toolKey ? translatedLabelRaw : label;
  const actionRaw =
    params.args && typeof params.args === "object"
      ? ((params.args as Record<string, unknown>).action as string | undefined)
      : undefined;
  const action = typeof actionRaw === "string" ? actionRaw.trim() : undefined;
  const actionSpec = resolveActionSpec(spec, action);
  const fallbackVerb =
    key === "web_search"
      ? "search"
      : key === "web_fetch"
        ? "fetch"
        : key.replace(/_/g, " ").replace(/\./g, " ");
  const verb = normalizeVerb(actionSpec?.label ?? action ?? fallbackVerb);
  const translatedVerb = verb
    ? (() => {
        const verbKey = `toolVerb.${verb.replace(/\s+/g, "_").toLowerCase()}`;
        const translated = t(verbKey);
        return translated !== verbKey ? translated : verb;
      })()
    : undefined;

  let detail: string | undefined;
  if (key === "exec") {
    const rawDetail = resolveExecDetail(params.args);
    if (rawDetail) {
      // Translate the summary part (before optional "in /cwd")
      const execMatch = rawDetail.match(/^(.+) \(in (.+)\)$/);
      if (execMatch) {
        detail = t("toolDetail.execWithCwd", {
          summary: translateExecSummary(execMatch[1]),
          cwd: execMatch[2],
        });
      } else {
        detail = translateExecSummary(rawDetail);
      }
    }
  }
  if (!detail && key === "read") {
    detail = resolveReadDetail(params.args);
  }
  if (!detail && (key === "write" || key === "edit" || key === "attach")) {
    detail = resolveWriteDetail(key, params.args);
  }

  if (!detail && key === "web_search") {
    detail = resolveWebSearchDetail(params.args);
  }

  if (!detail && key === "web_fetch") {
    detail = resolveWebFetchDetail(params.args);
  }

  const detailKeys = actionSpec?.detailKeys ?? spec?.detailKeys ?? FALLBACK.detailKeys ?? [];
  if (!detail && detailKeys.length > 0) {
    detail = resolveDetailFromKeys(params.args, detailKeys, {
      mode: "first",
      coerce: { includeFalse: true, includeZero: true },
    });
  }

  if (!detail && params.meta) {
    detail = params.meta;
  }

  if (detail) {
    detail = shortenHomeInString(detail);
    // Translate known detail patterns for non-exec tools
    if (key !== "exec") {
      detail = translateDetail(detail, key);
    }
  }

  return {
    name,
    icon,
    title,
    label: finalLabel,
    verb: translatedVerb,
    detail,
  };
}

export function formatToolDetail(display: ToolDisplay): string | undefined {
  if (!display.detail) {
    return undefined;
  }
  if (display.detail.includes(" · ")) {
    const compact = display.detail
      .split(" · ")
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .join(", ");
    return compact ? t("toolDetail.withPrefix", { detail: compact }) : undefined;
  }
  return display.detail;
}

export function formatToolSummary(display: ToolDisplay): string {
  const detail = formatToolDetail(display);
  return detail ? `${display.label}: ${detail}` : display.label;
}

/**
 * Translate known tool detail patterns from tool-display-common into the current locale.
 * Falls back to the original string if no pattern matches.
 */
function translateDetail(detail: string, key: string): string {
  // Read: "lines N-M from /path" -> t("toolDetail.linesRange", { from, to, path })
  const linesRange = detail.match(/^lines (\d+)-(\d+) from (.+)$/);
  if (linesRange) {
    return t("toolDetail.linesRange", {
      from: linesRange[1],
      to: linesRange[2],
      path: linesRange[3],
    });
  }

  // Read: "from line N in /path"
  const fromLine = detail.match(/^from line (\d+) in (.+)$/);
  if (fromLine) {
    return t("toolDetail.fromLine", { line: fromLine[1], path: fromLine[2] });
  }

  // Read: "first N lines of /path" or "first N line of /path"
  const firstLines = detail.match(/^first (\d+) (lines|line) of (.+)$/);
  if (firstLines) {
    return firstLines[2] === "line"
      ? t("toolDetail.firstLine", { count: firstLines[1], path: firstLines[3] })
      : t("toolDetail.firstLines", { count: firstLines[1], path: firstLines[3] });
  }

  // Web Fetch: "from url (suffix)" - must match BEFORE plain "from" patterns
  const fromUrlWith = detail.match(/^from (.+) \((.+)\)$/);
  if (fromUrlWith) {
    return t("toolDetail.fromUrlWith", { url: fromUrlWith[1], suffix: fromUrlWith[2] });
  }

  // Web Fetch: "from url"
  if (key === "web_fetch") {
    const fromUrl = detail.match(/^from (.+)$/);
    if (fromUrl) {
      return t("toolDetail.fromUrl", { url: fromUrl[1] });
    }
  }

  // Read: "from /path/to/file" -> t("toolDetail.fromPath", { path: "/path/to/file" })
  const fromMatch = detail.match(/^from (.+)$/);
  if (fromMatch) {
    return t("toolDetail.fromPath", { path: fromMatch[1] });
  }

  // Write/Edit: "to /path (N chars)" or "in /path (N chars)"
  const toChars = detail.match(/^(to|in) (.+) \((\d+) chars\)$/);
  if (toChars) {
    if (toChars[1] === "to") {
      return t("toolDetail.toPath", { path: toChars[2], chars: toChars[3] });
    }
    return t("toolDetail.inPathChars", { path: toChars[2], chars: toChars[3] });
  }

  // Write/Edit: "to /path" or "in /path"
  const toPath = detail.match(/^(to|in) (.+)$/);
  if (toPath) {
    if (toPath[1] === "to") {
      return t("toolDetail.toPath", { path: toPath[2], chars: "0" });
    }
    return t("toolDetail.inPath", { path: toPath[2] });
  }

  // Web Search: 'for "query" (top N)'
  const searchTop = detail.match(/^for "(.+)" \(top (\d+)\)$/);
  if (searchTop) {
    return t("toolDetail.searchQueryTop", { query: searchTop[1], count: searchTop[2] });
  }

  // Web Search: 'for "query"'
  const searchBasic = detail.match(/^for "(.+)"$/);
  if (searchBasic) {
    return t("toolDetail.searchQuery", { query: searchBasic[1] });
  }

  return detail;
}

function translateExecSummary(summary: string): string {
  const execMap: Record<string, string> = {
    "run command": "toolDetail.run.command",
    "run git command": "toolDetail.run.gitCommand",
    "search text": "toolDetail.search.text",
    "check git status": "toolDetail.checkGitStatus",
    "check git diff": "toolDetail.checkGitDiff",
    "view git history": "toolDetail.viewGitHistory",
    "show git object": "toolDetail.showGitObject",
    "list git branches": "toolDetail.listGitBranches",
    "switch git branch": "toolDetail.switchGitBranch",
    "create git commit": "toolDetail.createGitCommit",
    "pull git changes": "toolDetail.pullGitChanges",
    "push git changes": "toolDetail.pushGitChanges",
    "fetch git changes": "toolDetail.fetchGitChanges",
    "merge git changes": "toolDetail.mergeGitChanges",
    "rebase git branch": "toolDetail.rebaseGitBranch",
    "stage git changes": "toolDetail.stageGitChanges",
    "restore git files": "toolDetail.restoreGitFiles",
    "reset git state": "toolDetail.resetGitState",
    "stash git changes": "toolDetail.stashGitChanges",
    "list files": "toolDetail.listFiles",
    "install dependencies": "toolDetail.installDeps",
    "run tests": "toolDetail.runTests",
    "run build": "toolDetail.runBuild",
    "start app": "toolDetail.startApp",
    "run lint": "toolDetail.runLint",
  };
  const key = execMap[summary];
  if (key) {
    return t(key as const);
  }

  // git <sub> pattern: "run git sub"
  const gitMatch = summary.match(/^run git (.+)$/);
  if (gitMatch) {
    return t("toolDetail.run.git", { sub: gitMatch[1] });
  }

  // "list files in /path"
  const listIn = summary.match(/^list files in (.+)$/);
  if (listIn) {
    return t("toolDetail.listFilesIn", { path: listIn[1] });
  }

  // "find files in /path"
  const findIn = summary.match(/^find files in (.+)$/);
  if (findIn) {
    return t("toolDetail.findFilesIn", { path: findIn[1] });
  }

  // 'find files named "name" in /path'
  const findNamed = summary.match(/^find files named "(.+)" in (.+)$/);
  if (findNamed) {
    return t("toolDetail.findFilesNamed", { name: findNamed[1], path: findNamed[2] });
  }

  return summary;
}
