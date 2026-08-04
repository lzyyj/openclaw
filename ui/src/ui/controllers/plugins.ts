import type { GatewayBrowserClient } from "../gateway.ts";
import type { PluginStatusReport } from "../types.ts";

export type PluginsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  pluginsLoading: boolean;
  pluginsReport: PluginStatusReport | null;
  pluginsError: string | null;
  pluginsBusyKey: string | null;
  pluginsMessages: PluginMessageMap;
};

export type PluginMessage = {
  kind: "success" | "error";
  message: string;
};

export type PluginMessageMap = Record<string, PluginMessage>;

type LoadPluginsOptions = {
  clearMessages?: boolean;
};

function setPluginMessage(state: PluginsState, key: string, message?: PluginMessage) {
  if (!key.trim()) {
    return;
  }
  const next = { ...state.pluginsMessages };
  if (message) {
    next[key] = message;
  } else {
    delete next[key];
  }
  state.pluginsMessages = next;
}

function getErrorMessage(err: unknown) {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export async function loadPlugins(state: PluginsState, options?: LoadPluginsOptions) {
  if (options?.clearMessages && Object.keys(state.pluginsMessages).length > 0) {
    state.pluginsMessages = {};
  }
  if (!state.client || !state.connected) {
    return;
  }
  if (state.pluginsLoading) {
    return;
  }
  state.pluginsLoading = true;
  state.pluginsError = null;
  try {
    const res = await state.client.request<PluginStatusReport | undefined>("plugins.status", {});
    if (res) {
      state.pluginsReport = res;
    }
  } catch (err) {
    state.pluginsError = getErrorMessage(err);
  } finally {
    state.pluginsLoading = false;
  }
}

export async function updatePluginEnabled(state: PluginsState, pluginId: string, enabled: boolean) {
  if (!state.client || !state.connected) {
    return;
  }
  state.pluginsBusyKey = pluginId;
  state.pluginsError = null;
  try {
    const res = await state.client.request<{
      ok?: boolean;
      message?: string;
      snapshot?: PluginStatusReport;
    }>("plugins.update", { id: pluginId, enabled });
    if (res?.snapshot) {
      state.pluginsReport = res.snapshot;
    } else {
      await loadPlugins(state);
    }
    setPluginMessage(state, pluginId, {
      kind: "success",
      message: res?.message ?? (enabled ? "Plugin enabled" : "Plugin disabled"),
    });
  } catch (err) {
    const message = getErrorMessage(err);
    state.pluginsError = message;
    setPluginMessage(state, pluginId, {
      kind: "error",
      message,
    });
  } finally {
    state.pluginsBusyKey = null;
  }
}
