import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import type { PluginMessageMap } from "../controllers/plugins.ts";
import { clampText } from "../format.ts";
import type { PluginStatusEntry, PluginStatusReport } from "../types.ts";

export type PluginsProps = {
  loading: boolean;
  report: PluginStatusReport | null;
  error: string | null;
  filter: string;
  busyKey: string | null;
  messages: PluginMessageMap;
  onFilterChange: (next: string) => void;
  onRefresh: () => void;
  onToggle: (pluginId: string, enabled: boolean) => void;
};

function renderStatusChip(status: PluginStatusEntry["status"]) {
  switch (status) {
    case "loaded":
      return html`<span class="chip chip-success">${t("plugins.statusLoaded")}</span>`;
    case "disabled":
      return html`<span class="chip chip-muted">${t("plugins.statusDisabled")}</span>`;
    case "error":
      return html`<span class="chip chip-danger">${t("plugins.statusError")}</span>`;
    default:
      return nothing;
  }
}

export function renderPlugins(props: PluginsProps) {
  const plugins = props.report?.plugins ?? [];
  const filter = props.filter.trim().toLowerCase();
  const filtered = filter
    ? plugins.filter((p) =>
        [p.id, p.name, p.description ?? "", p.source].join(" ").toLowerCase().includes(filter),
      )
    : plugins;

  const diagnostics = props.report?.diagnostics ?? [];

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">${t("plugins.cardTitle")}</div>
          <div class="card-sub">${t("plugins.cardSub")}</div>
        </div>
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? t("common.loading") : t("common.refresh")}
        </button>
      </div>

      <div class="filters" style="margin-top: 14px;">
        <label class="field" style="flex: 1;">
          <span>${t("plugins.filter")}</span>
          <input
            .value=${props.filter}
            @input=${(e: Event) => props.onFilterChange((e.target as HTMLInputElement).value)}
            placeholder=${t("plugins.searchPlaceholder")}
          />
        </label>
        <div class="muted">${t("plugins.shown", { count: String(filtered.length) })}</div>
      </div>

      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing
      }

      ${
        diagnostics.length > 0
          ? html`
            <div style="margin-top: 14px;">
              ${diagnostics.map(
                (d) => html`
                  <div
                    class="callout ${d.level === "error" ? "danger" : "warning"}"
                    style="margin-top: 6px;"
                  >
                    ${d.pluginId ? `${d.pluginId}: ` : ""}${d.message}
                  </div>
                `,
              )}
            </div>
          `
          : nothing
      }

      ${
        filtered.length === 0
          ? html`
              <div class="muted" style="margin-top: 16px">${t("plugins.noPlugins")}</div>
            `
          : html`
            <div class="list" style="margin-top: 16px;">
              ${filtered.map((plugin) => renderPlugin(plugin, props))}
            </div>
          `
      }
    </section>
  `;
}

function renderPlugin(plugin: PluginStatusEntry, props: PluginsProps) {
  const busy = props.busyKey === plugin.id;
  const message = props.messages[plugin.id] ?? null;
  const enabled = plugin.enabled && plugin.status !== "error";

  const meta: string[] = [];
  if (plugin.channelIds.length > 0) {
    meta.push(plugin.channelIds.join(", "));
  }
  if (plugin.toolNames.length > 0) {
    meta.push(`${plugin.toolNames.length} tools`);
  }
  if (plugin.hookNames.length > 0) {
    meta.push(`${plugin.hookNames.length} hooks`);
  }
  if (plugin.providerIds.length > 0) {
    meta.push(plugin.providerIds.join(", "));
  }
  if (plugin.services.length > 0) {
    meta.push(`${plugin.services.length} services`);
  }

  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${plugin.name || plugin.id}</div>
        ${
          plugin.id !== plugin.name
            ? html`<div class="list-sub">${clampText(plugin.description ?? "", 140)} · ${plugin.id}</div>`
            : html`<div class="list-sub">${clampText(plugin.description ?? "", 140)}</div>`
        }
        <div style="margin-top: 6px;">
          ${renderStatusChip(plugin.status)}
          ${
            plugin.version
              ? html`<span class="muted" style="margin-left: 8px;">v${plugin.version}</span>`
              : nothing
          }
        </div>
        ${
          meta.length > 0
            ? html`<div class="muted" style="margin-top: 6px;">${meta.join(" · ")}</div>`
            : nothing
        }
        ${
          plugin.error
            ? html`<div class="muted" style="margin-top: 6px; color: var(--danger-color, #d14343);">
                ${plugin.error}
              </div>`
            : nothing
        }
      </div>
      <div class="list-meta">
        <div class="row" style="justify-content: flex-end; flex-wrap: wrap; gap: 8px;">
          <button
            class="btn"
            ?disabled=${busy || plugin.status === "error"}
            @click=${() => props.onToggle(plugin.id, !enabled)}
          >
            ${enabled ? t("plugins.disable") : t("plugins.enable")}
          </button>
        </div>
        ${
          message
            ? html`<div
              class="muted"
              style="margin-top: 8px; color: ${
                message.kind === "error"
                  ? "var(--danger-color, #d14343)"
                  : "var(--success-color, #0a7f5a)"
              };"
            >
              ${message.message}
            </div>`
            : nothing
        }
      </div>
    </div>
  `;
}
