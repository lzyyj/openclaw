import { loadConfig, writeConfigFile } from "../../config/config.js";
import { enablePluginInConfig } from "../../plugins/enable.js";
import { buildPluginStatusReport, type PluginStatusReport } from "../../plugins/status.js";
import { setPluginEnabledInConfig } from "../../plugins/toggle-config.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export type PluginStatusSnapshot = {
  workspaceDir: string;
  plugins: Array<{
    id: string;
    name: string;
    version?: string;
    description?: string;
    source: string;
    origin: string;
    enabled: boolean;
    status: "loaded" | "disabled" | "error";
    error?: string;
    toolNames: string[];
    hookNames: string[];
    channelIds: string[];
    providerIds: string[];
    cliCommands: string[];
    services: string[];
  }>;
  diagnostics: Array<{
    level: "warn" | "error";
    message: string;
    pluginId?: string;
    source?: string;
  }>;
};

function toPluginStatusSnapshot(report: PluginStatusReport): PluginStatusSnapshot {
  return {
    workspaceDir: report.workspaceDir ?? "",
    plugins: report.plugins.map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description,
      source: p.source,
      origin: p.origin,
      enabled: p.enabled,
      status: p.status,
      error: p.error,
      toolNames: p.toolNames ?? [],
      hookNames: p.hookNames ?? [],
      channelIds: p.channelIds ?? [],
      providerIds: p.providerIds ?? [],
      cliCommands: p.cliCommands ?? [],
      services: p.services ?? [],
    })),
    diagnostics: (report.diagnostics ?? []).map((d) => ({
      level: d.level,
      message: d.message,
      pluginId: d.pluginId,
      source: d.source,
    })),
  };
}

export const pluginsHandlers: GatewayRequestHandlers = {
  "plugins.status": ({ respond }) => {
    const report = buildPluginStatusReport();
    respond(true, toPluginStatusSnapshot(report), undefined);
  },
  "plugins.update": async ({ params, respond }) => {
    if (!params || typeof params !== "object") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid plugins.update params"),
      );
      return;
    }
    const { id, enabled } = params as { id?: unknown; enabled?: unknown };
    if (typeof id !== "string" || !id.trim()) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid plugins.update params: id must be a string",
        ),
      );
      return;
    }
    if (typeof enabled !== "boolean") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid plugins.update params: enabled must be a boolean",
        ),
      );
      return;
    }
    const pluginId = id.trim();
    const cfg = loadConfig();
    let next = cfg;
    let ok = true;
    let message = "";
    if (enabled) {
      const result = enablePluginInConfig(cfg, pluginId);
      next = result.config;
      ok = result.enabled;
      message = result.enabled
        ? `Enabled plugin "${pluginId}". Restart the gateway to apply.`
        : `Plugin "${pluginId}" could not be enabled (${result.reason ?? "unknown reason"}).`;
    } else {
      next = setPluginEnabledInConfig(cfg, pluginId, false);
      message = `Disabled plugin "${pluginId}". Restart the gateway to apply.`;
    }
    await writeConfigFile(next);
    const report = buildPluginStatusReport({ config: next });
    respond(true, { ok, message, snapshot: toPluginStatusSnapshot(report) }, undefined);
  },
};
