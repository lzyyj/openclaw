import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import { formatRelativeTimestamp } from "../format.ts";
import { pathForTab } from "../navigation.ts";
import { formatSessionTokens } from "../presenter.ts";
import type { GatewaySessionRow, SessionsListResult } from "../types.ts";

export type SessionsProps = {
  loading: boolean;
  result: SessionsListResult | null;
  error: string | null;
  activeMinutes: string;
  limit: string;
  includeGlobal: boolean;
  includeUnknown: boolean;
  includeArchived: boolean;
  basePath: string;
  search?: string;
  onSearchChange?: (query: string) => void;
  onFiltersChange: (next: {
    activeMinutes: string;
    limit: string;
    includeGlobal: boolean;
    includeUnknown: boolean;
    includeArchived: boolean;
  }) => void;
  onRefresh: () => void;
  onPatch: (
    key: string,
    patch: {
      label?: string | null;
      thinkingLevel?: string | null;
      verboseLevel?: string | null;
      reasoningLevel?: string | null;
    },
  ) => void;
  onDelete: (key: string) => void;
  onArchive?: (key: string) => void;
  onRestore?: (key: string) => void;
};

const THINK_LEVELS = ["", "off", "minimal", "low", "medium", "high", "xhigh"] as const;
const BINARY_THINK_LEVELS = ["", "off", "on"] as const;
const VERBOSE_LEVELS = [
  { value: "", label: "inherit" },
  { value: "off", label: "off (explicit)" },
  { value: "on", label: "on" },
  { value: "full", label: "full" },
] as const;
const REASONING_LEVELS = ["", "off", "on", "stream"] as const;

function getVerboseLabel(value: string): string {
  if (value === "") {
    return t("sessionsPage.inherit");
  }
  if (value === "off") {
    return t("sessionsPage.verboseOff");
  }
  if (value === "on") {
    return t("sessionsPage.verboseOn");
  }
  if (value === "full") {
    return t("sessionsPage.verboseFull");
  }
  return value;
}

function normalizeProviderId(provider?: string | null): string {
  if (!provider) {
    return "";
  }
  const normalized = provider.trim().toLowerCase();
  if (normalized === "z.ai" || normalized === "z-ai") {
    return "zai";
  }
  return normalized;
}

function isBinaryThinkingProvider(provider?: string | null): boolean {
  return normalizeProviderId(provider) === "zai";
}

function resolveThinkLevelOptions(provider?: string | null): readonly string[] {
  return isBinaryThinkingProvider(provider) ? BINARY_THINK_LEVELS : THINK_LEVELS;
}

function withCurrentOption(options: readonly string[], current: string): string[] {
  if (!current) {
    return [...options];
  }
  if (options.includes(current)) {
    return [...options];
  }
  return [...options, current];
}

function withCurrentLabeledOption(
  options: readonly { value: string; label: string }[],
  current: string,
): Array<{ value: string; label: string }> {
  if (!current) {
    return [...options];
  }
  if (options.some((option) => option.value === current)) {
    return [...options];
  }
  return [...options, { value: current, label: `${current} (custom)` }];
}

function resolveThinkLevelDisplay(value: string, isBinary: boolean): string {
  if (!isBinary) {
    return value;
  }
  if (!value || value === "off") {
    return value;
  }
  return "on";
}

function resolveThinkLevelPatchValue(value: string, isBinary: boolean): string | null {
  if (!value) {
    return null;
  }
  if (!isBinary) {
    return value;
  }
  if (value === "on") {
    return "low";
  }
  return value;
}

/**
 * Client-side session filter over the already-loaded rows. Searches the
 * human-facing title plus the raw identity fields, so a query matches both
 * derived titles (first user message) and routing keys. Case-insensitive.
 */
export function filterSessionRows(
  rows: readonly GatewaySessionRow[],
  query: string,
): GatewaySessionRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [...rows];
  }
  return rows.filter((row) => {
    const fields = [
      sessionRowTitle(row),
      row.label,
      row.displayName,
      row.subject,
      row.sessionId,
      row.key,
    ];
    return fields.some(
      (field) => typeof field === "string" && field.toLowerCase().includes(needle),
    );
  });
}

/** Human-facing title for one session row: label > derived title > group name > key. */
export function sessionRowTitle(row: GatewaySessionRow): string {
  const label = typeof row.label === "string" ? row.label.trim() : "";
  if (label) {
    return label;
  }
  const derived = typeof row.derivedTitle === "string" ? row.derivedTitle.trim() : "";
  if (derived) {
    return derived;
  }
  const displayName = typeof row.displayName === "string" ? row.displayName.trim() : "";
  if (displayName) {
    return displayName;
  }
  return row.key;
}

export function renderSessions(props: SessionsProps) {
  const allRows = props.result?.sessions ?? [];
  const rows = filterSessionRows(allRows, props.search ?? "");
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">${t("sessionsPage.cardTitle")}</div>
          <div class="card-sub">${t("sessionsPage.cardSub")}</div>
        </div>
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? t("common.loading") : t("common.refresh")}
        </button>
      </div>

      <div class="filters" style="margin-top: 14px;">
        <label class="field sessions-search">
          <span>${t("sessionsPage.search")}</span>
          <input
            type="search"
            .value=${props.search ?? ""}
            placeholder=${t("sessionsPage.searchPlaceholder")}
            @input=${(e: Event) => props.onSearchChange?.((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>${t("sessionsPage.activeWithin")}</span>
          <input
            .value=${props.activeMinutes}
            @input=${(e: Event) =>
              props.onFiltersChange({
                activeMinutes: (e.target as HTMLInputElement).value,
                limit: props.limit,
                includeGlobal: props.includeGlobal,
                includeUnknown: props.includeUnknown,
                includeArchived: props.includeArchived,
              })}
          />
        </label>
        <label class="field">
          <span>${t("sessionsPage.limit")}</span>
          <input
            .value=${props.limit}
            @input=${(e: Event) =>
              props.onFiltersChange({
                activeMinutes: props.activeMinutes,
                limit: (e.target as HTMLInputElement).value,
                includeGlobal: props.includeGlobal,
                includeUnknown: props.includeUnknown,
                includeArchived: props.includeArchived,
              })}
          />
        </label>
        <label class="field checkbox">
          <span>${t("sessionsPage.includeGlobal")}</span>
          <input
            type="checkbox"
            .checked=${props.includeGlobal}
            @change=${(e: Event) =>
              props.onFiltersChange({
                activeMinutes: props.activeMinutes,
                limit: props.limit,
                includeGlobal: (e.target as HTMLInputElement).checked,
                includeUnknown: props.includeUnknown,
                includeArchived: props.includeArchived,
              })}
          />
        </label>
        <label class="field checkbox">
          <span>${t("sessionsPage.includeUnknown")}</span>
          <input
            type="checkbox"
            .checked=${props.includeUnknown}
            @change=${(e: Event) =>
              props.onFiltersChange({
                activeMinutes: props.activeMinutes,
                limit: props.limit,
                includeGlobal: props.includeGlobal,
                includeUnknown: (e.target as HTMLInputElement).checked,
                includeArchived: props.includeArchived,
              })}
          />
        </label>
        <label class="field checkbox">
          <span>${t("sessionsPage.includeArchived")}</span>
          <input
            type="checkbox"
            .checked=${props.includeArchived}
            @change=${(e: Event) =>
              props.onFiltersChange({
                activeMinutes: props.activeMinutes,
                limit: props.limit,
                includeGlobal: props.includeGlobal,
                includeUnknown: props.includeUnknown,
                includeArchived: (e.target as HTMLInputElement).checked,
              })}
          />
        </label>
      </div>

      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing
      }

      <div class="muted" style="margin-top: 12px;">
        ${props.result ? `${t("sessionsPage.store")}: ${props.result.path}` : ""}
      </div>

      <div class="table" style="margin-top: 16px;">
        <div class="table-head">
          <div>${t("sessionsPage.key")}</div>
          <div>${t("sessionsPage.label")}</div>
          <div>${t("sessionsPage.kind")}</div>
          <div>${t("sessionsPage.updated")}</div>
          <div>${t("sessionsPage.tokens")}</div>
          <div>${t("sessionsPage.thinking")}</div>
          <div>${t("sessionsPage.verbose")}</div>
          <div>${t("sessionsPage.reasoning")}</div>
          <div>${t("sessionsPage.actions")}</div>
        </div>
        ${
          rows.length === 0
            ? html`
                <div class="muted">${t("sessionsPage.noSessions")}</div>
              `
            : rows.map((row) =>
                renderRow(row, props.basePath, props.onPatch, props.onDelete, props.loading, {
                  archived: Boolean(row.archivedAt),
                  onArchive: props.onArchive,
                  onRestore: props.onRestore,
                }),
              )
        }
      </div>
    </section>
  `;
}

function renderRow(
  row: GatewaySessionRow,
  basePath: string,
  onPatch: SessionsProps["onPatch"],
  onDelete: SessionsProps["onDelete"],
  disabled: boolean,
  actions: {
    archived: boolean;
    onArchive?: (key: string) => void;
    onRestore?: (key: string) => void;
  },
) {
  const updated = row.updatedAt ? formatRelativeTimestamp(row.updatedAt) : t("common.na");
  const rawThinking = row.thinkingLevel ?? "";
  const isBinaryThinking = isBinaryThinkingProvider(row.modelProvider);
  const thinking = resolveThinkLevelDisplay(rawThinking, isBinaryThinking);
  const thinkLevels = withCurrentOption(resolveThinkLevelOptions(row.modelProvider), thinking);
  const verbose = row.verboseLevel ?? "";
  const verboseLevels = withCurrentLabeledOption(VERBOSE_LEVELS, verbose);
  const reasoning = row.reasoningLevel ?? "";
  const reasoningLevels = withCurrentOption(REASONING_LEVELS, reasoning);
  const title = sessionRowTitle(row);
  const canLink = row.kind !== "global";
  const chatUrl = canLink
    ? `${pathForTab("chat", basePath)}?session=${encodeURIComponent(row.key)}`
    : null;
  const showKeyMeta = title !== row.key;
  const stats = row.stats;
  const statsLabel =
    stats && stats.messages > 0
      ? t("sessionsPage.turnsLabel", {
          turns: String(stats.turns),
          messages: String(stats.messages),
        })
      : null;

  return html`
    <div class="table-row">
      <div class="session-key-cell">
        <div class="session-title">
          ${canLink ? html`<a href=${chatUrl} class="session-link">${title}</a>` : title}
          ${
            showKeyMeta || statsLabel
              ? html`<span class="muted session-key-display-name">
                  ${showKeyMeta ? row.key : ""}${showKeyMeta && statsLabel ? " · " : ""}${statsLabel ?? ""}
                </span>`
              : nothing
          }
        </div>
      </div>
      <div>
        <input
          .value=${row.label ?? ""}
          ?disabled=${disabled}
          placeholder=${t("sessionsPage.optionalPlaceholder")}
          @change=${(e: Event) => {
            const value = (e.target as HTMLInputElement).value.trim();
            onPatch(row.key, { label: value || null });
          }}
        />
      </div>
      <div>${row.kind}</div>
      <div>${updated}</div>
      <div>${formatSessionTokens(row)}</div>
      <div>
        <select
          ?disabled=${disabled}
          @change=${(e: Event) => {
            const value = (e.target as HTMLSelectElement).value;
            onPatch(row.key, {
              thinkingLevel: resolveThinkLevelPatchValue(value, isBinaryThinking),
            });
          }}
        >
          ${thinkLevels.map(
            (level) =>
              html`<option value=${level} ?selected=${thinking === level}>
                ${level || t("sessionsPage.inherit")}
              </option>`,
          )}
        </select>
      </div>
      <div>
        <select
          ?disabled=${disabled}
          @change=${(e: Event) => {
            const value = (e.target as HTMLSelectElement).value;
            onPatch(row.key, { verboseLevel: value || null });
          }}
        >
          ${verboseLevels.map(
            (level) =>
              html`<option value=${level.value} ?selected=${verbose === level.value}>
                ${getVerboseLabel(level.value)}
              </option>`,
          )}
        </select>
      </div>
      <div>
        <select
          ?disabled=${disabled}
          @change=${(e: Event) => {
            const value = (e.target as HTMLSelectElement).value;
            onPatch(row.key, { reasoningLevel: value || null });
          }}
        >
          ${reasoningLevels.map(
            (level) =>
              html`<option value=${level} ?selected=${reasoning === level}>
                ${level || "inherit"}
              </option>`,
          )}
        </select>
      </div>
      <div>
        ${
          actions.archived
            ? html`
                <button
                  class="btn"
                  ?disabled=${disabled}
                  @click=${() => actions.onRestore?.(row.key)}
                >
                  ${t("sessionsPage.restore")}
                </button>
              `
            : html`
                <button
                  class="btn"
                  ?disabled=${disabled}
                  @click=${() => actions.onArchive?.(row.key)}
                >
                  ${t("sessionsPage.archive")}
                </button>
              `
        }
      </div>
      <div>
        <button class="btn danger" ?disabled=${disabled} @click=${() => onDelete(row.key)}>
          ${t("sessionsPage.delete")}
        </button>
      </div>
    </div>
  `;
}
