import { withProgress } from "../cli/progress.js";
import { getText } from "../cli/i18n.js";
import { loadConfig } from "../config/config.js";
import { resolveGatewayService } from "../daemon/service.js";
import type { RuntimeEnv } from "../runtime.js";
import { note } from "../terminal/note.js";
import { confirm, select } from "./configure.shared.js";
import { buildGatewayInstallPlan, gatewayInstallErrorHint } from "./daemon-install-helpers.js";
import {
  DEFAULT_GATEWAY_DAEMON_RUNTIME,
  GATEWAY_DAEMON_RUNTIME_OPTIONS,
  type GatewayDaemonRuntime,
} from "./daemon-runtime.js";
import { guardCancel } from "./onboard-helpers.js";
import { ensureSystemdUserLingerInteractive } from "./systemd-linger.js";

export async function maybeInstallDaemon(params: {
  runtime: RuntimeEnv;
  port: number;
  gatewayToken?: string;
  daemonRuntime?: GatewayDaemonRuntime;
}) {
  const service = resolveGatewayService();
  const loaded = await service.isLoaded({ env: process.env });
  let shouldCheckLinger = false;
  let shouldInstall = true;
  let daemonRuntime = params.daemonRuntime ?? DEFAULT_GATEWAY_DAEMON_RUNTIME;
  if (loaded) {
    const action = guardCancel(
      await select({
        message: getText("configure.daemon.already_installed.message", "Gateway service already installed"),
        options: [
          { value: "restart", label: getText("configure.daemon.action.restart", "Restart") },
          { value: "reinstall", label: getText("configure.daemon.action.reinstall", "Reinstall") },
          { value: "skip", label: getText("configure.daemon.action.skip", "Skip") },
        ],
      }),
      params.runtime,
    );
    if (action === "restart") {
      await withProgress(
        { label: getText("configure.daemon.progress.service", "Gateway service"), indeterminate: true, delayMs: 0 },
        async (progress) => {
          progress.setLabel(getText("configure.daemon.progress.restarting", "Restarting Gateway service…"));
          await service.restart({
            env: process.env,
            stdout: process.stdout,
          });
          progress.setLabel(getText("configure.daemon.progress.restarted", "Gateway service restarted."));
        },
      );
      shouldCheckLinger = true;
      shouldInstall = false;
    }
    if (action === "skip") {
      return;
    }
    if (action === "reinstall") {
      await withProgress(
        { label: getText("configure.daemon.progress.service", "Gateway service"), indeterminate: true, delayMs: 0 },
        async (progress) => {
          progress.setLabel(getText("configure.daemon.progress.uninstalling", "Uninstalling Gateway service…"));
          await service.uninstall({ env: process.env, stdout: process.stdout });
          progress.setLabel(getText("configure.daemon.progress.uninstalled", "Gateway service uninstalled."));
        },
      );
    }
  }

  if (shouldInstall) {
    let installError: string | null = null;
    if (!params.daemonRuntime) {
      if (GATEWAY_DAEMON_RUNTIME_OPTIONS.length === 1) {
        daemonRuntime = GATEWAY_DAEMON_RUNTIME_OPTIONS[0]?.value ?? DEFAULT_GATEWAY_DAEMON_RUNTIME;
      } else {
        daemonRuntime = guardCancel(
          await select({
            message: getText("configure.daemon.runtime_select.message", "Gateway service runtime"),
            options: GATEWAY_DAEMON_RUNTIME_OPTIONS,
            initialValue: DEFAULT_GATEWAY_DAEMON_RUNTIME,
          }),
          params.runtime,
        ) as GatewayDaemonRuntime;
      }
    }
    await withProgress(
      { label: getText("configure.daemon.progress.service", "Gateway service"), indeterminate: true, delayMs: 0 },
      async (progress) => {
        progress.setLabel(getText("configure.daemon.progress.preparing", "Preparing Gateway service…"));

        const cfg = loadConfig();
        const { programArguments, workingDirectory, environment } = await buildGatewayInstallPlan({
          env: process.env,
          port: params.port,
          token: params.gatewayToken,
          runtime: daemonRuntime,
          warn: (message, title) => note(message, title),
          config: cfg,
        });

        progress.setLabel(getText("configure.daemon.progress.installing", "Installing Gateway service…"));
        try {
          await service.install({
            env: process.env,
            stdout: process.stdout,
            programArguments,
            workingDirectory,
            environment,
          });
          progress.setLabel(getText("configure.daemon.progress.installed", "Gateway service installed."));
        } catch (err) {
          installError = err instanceof Error ? err.message : String(err);
          progress.setLabel(getText("configure.daemon.progress.install_failed", "Gateway service install failed."));
        }
      },
    );
    if (installError) {
      note(getText("configure.daemon.install_failed.body", "Gateway service install failed: ") + installError, getText("configure.daemon.title", "Gateway"));
      note(gatewayInstallErrorHint(), getText("configure.daemon.title", "Gateway"));
      return;
    }
    shouldCheckLinger = true;
  }

  if (shouldCheckLinger) {
    await ensureSystemdUserLingerInteractive({
      runtime: params.runtime,
      prompter: {
        confirm: async (p) => guardCancel(await confirm(p), params.runtime),
        note,
      },
      reason: getText(
        "configure.daemon.linger.reason",
        "Linux installs use a systemd user service. Without lingering, systemd stops the user session on logout/idle and kills the Gateway.",
      ),
      requireConfirm: true,
    });
  }
}
