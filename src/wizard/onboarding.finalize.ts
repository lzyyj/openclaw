import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_BOOTSTRAP_FILENAME } from "../agents/workspace.js";
import { formatCliCommand } from "../cli/command-format.js";
import { getText } from "../cli/i18n.js";
import {
  buildGatewayInstallPlan,
  gatewayInstallErrorHint,
} from "../commands/daemon-install-helpers.js";
import {
  DEFAULT_GATEWAY_DAEMON_RUNTIME,
  GATEWAY_DAEMON_RUNTIME_OPTIONS,
} from "../commands/daemon-runtime.js";
import { formatHealthCheckFailure } from "../commands/health-format.js";
import { healthCommand } from "../commands/health.js";
import {
  detectBrowserOpenSupport,
  formatControlUiSshHint,
  openUrl,
  probeGatewayReachable,
  waitForGatewayReachable,
  resolveControlUiLinks,
} from "../commands/onboard-helpers.js";
import type { OnboardOptions } from "../commands/onboard-types.js";
import type { OpenClawConfig } from "../config/config.js";
import { resolveGatewayService } from "../daemon/service.js";
import { isSystemdUserServiceAvailable } from "../daemon/systemd.js";
import { ensureControlUiAssetsBuilt } from "../infra/control-ui-assets.js";
import type { RuntimeEnv } from "../runtime.js";
import { restoreTerminalState } from "../terminal/restore.js";
import { runTui } from "../tui/tui.js";
import { resolveUserPath } from "../utils.js";
import { setupOnboardingShellCompletion } from "./onboarding.completion.js";
import type { GatewayWizardSettings, WizardFlow } from "./onboarding.types.js";
import type { WizardPrompter } from "./prompts.js";

type FinalizeOnboardingOptions = {
  flow: WizardFlow;
  opts: OnboardOptions;
  baseConfig: OpenClawConfig;
  nextConfig: OpenClawConfig;
  workspaceDir: string;
  settings: GatewayWizardSettings;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
};

export async function finalizeOnboardingWizard(
  options: FinalizeOnboardingOptions,
): Promise<{ launchedTui: boolean }> {
  const { flow, opts, baseConfig, nextConfig, settings, prompter, runtime } = options;

  const withWizardProgress = async <T>(
    label: string,
    options: { doneMessage?: string },
    work: (progress: { update: (message: string) => void }) => Promise<T>,
  ): Promise<T> => {
    const progress = prompter.progress(label);
    try {
      return await work(progress);
    } finally {
      progress.stop(options.doneMessage);
    }
  };

  const systemdAvailable =
    process.platform === "linux" ? await isSystemdUserServiceAvailable() : true;
  if (process.platform === "linux" && !systemdAvailable) {
    await prompter.note(
      getText(
        "onboarding.finalize.systemd_unavailable",
        "Systemd user services are unavailable. Skipping lingering checks and service install.",
      ),
      getText("onboarding.finalize.systemd_title", "Systemd"),
    );
  }

  if (process.platform === "linux" && systemdAvailable) {
    const { ensureSystemdUserLingerInteractive } = await import("../commands/systemd-linger.js");
    await ensureSystemdUserLingerInteractive({
      runtime,
      prompter: {
        confirm: prompter.confirm,
        note: prompter.note,
      },
      reason: getText(
        "onboarding.finalize.linger_reason",
        "Linux installs use a systemd user service by default. Without lingering, systemd stops the user session on logout/idle and kills the Gateway.",
      ),
      requireConfirm: false,
    });
  }

  const explicitInstallDaemon =
    typeof opts.installDaemon === "boolean" ? opts.installDaemon : undefined;
  let installDaemon: boolean;
  if (explicitInstallDaemon !== undefined) {
    installDaemon = explicitInstallDaemon;
  } else if (process.platform === "linux" && !systemdAvailable) {
    installDaemon = false;
  } else if (flow === "quickstart") {
    installDaemon = true;
  } else {
    installDaemon = await prompter.confirm({
      message: getText("onboarding.finalize.install_service", "Install Gateway service (recommended)"),
      initialValue: true,
    });
  }

  if (process.platform === "linux" && !systemdAvailable && installDaemon) {
    await prompter.note(
      getText(
        "onboarding.finalize.systemd_skip_service",
        "Systemd user services are unavailable; skipping service install. Use your container supervisor or `docker compose up -d`.",
      ),
      getText("onboarding.finalize.service_title", "Gateway service"),
    );
    installDaemon = false;
  }

  if (installDaemon) {
    const daemonRuntime =
      flow === "quickstart"
        ? DEFAULT_GATEWAY_DAEMON_RUNTIME
        : await prompter.select({
            message: getText("onboarding.finalize.service_runtime", "Gateway service runtime"),
            options: GATEWAY_DAEMON_RUNTIME_OPTIONS,
            initialValue: opts.daemonRuntime ?? DEFAULT_GATEWAY_DAEMON_RUNTIME,
          });
    if (flow === "quickstart") {
      await prompter.note(
        getText(
          "onboarding.finalize.runtime_quickstart",
          "QuickStart uses Node for the Gateway service (stable + supported).",
        ),
        getText("onboarding.finalize.service_runtime", "Gateway service runtime"),
      );
    }
    const service = resolveGatewayService();
    const loaded = await service.isLoaded({ env: process.env });
    if (loaded) {
      const action = await prompter.select({
        message: getText("onboarding.finalize.service_installed", "Gateway service already installed"),
        options: [
          { value: "restart", label: getText("onboarding.finalize.service.restart", "Restart") },
          { value: "reinstall", label: getText("onboarding.finalize.service.reinstall", "Reinstall") },
          { value: "skip", label: getText("onboarding.finalize.service.skip", "Skip") },
        ],
      });
      if (action === "restart") {
        await withWizardProgress(
          getText("onboarding.finalize.service_title", "Gateway service"),
          { doneMessage: getText("onboarding.finalize.service.restarted", "Gateway service restarted.") },
          async (progress) => {
            progress.update(getText("onboarding.finalize.service.restarting", "Restarting Gateway service…"));
            await service.restart({
              env: process.env,
              stdout: process.stdout,
            });
          },
        );
      } else if (action === "reinstall") {
        await withWizardProgress(
          getText("onboarding.finalize.service_title", "Gateway service"),
          { doneMessage: getText("onboarding.finalize.service.uninstalled", "Gateway service uninstalled.") },
          async (progress) => {
            progress.update(getText("onboarding.finalize.service.uninstalling", "Uninstalling Gateway service…"));
            await service.uninstall({ env: process.env, stdout: process.stdout });
          },
        );
      }
    }

    if (!loaded || (loaded && !(await service.isLoaded({ env: process.env })))) {
      const progress = prompter.progress(getText("onboarding.finalize.service_title", "Gateway service"));
      let installError: string | null = null;
      try {
        progress.update(getText("onboarding.finalize.service.preparing", "Preparing Gateway service…"));
        const { programArguments, workingDirectory, environment } = await buildGatewayInstallPlan({
          env: process.env,
          port: settings.port,
          token: settings.gatewayToken,
          runtime: daemonRuntime,
          warn: (message, title) => prompter.note(message, title),
          config: nextConfig,
        });

        progress.update(getText("onboarding.finalize.service.installing", "Installing Gateway service…"));
        await service.install({
          env: process.env,
          stdout: process.stdout,
          programArguments,
          workingDirectory,
          environment,
        });
      } catch (err) {
        installError = err instanceof Error ? err.message : String(err);
      } finally {
        progress.stop(
          installError
            ? getText("onboarding.finalize.service.install_failed", "Gateway service install failed.")
            : getText("onboarding.finalize.service.installed", "Gateway service installed."),
        );
      }
      if (installError) {
        await prompter.note(
          getText(
            "onboarding.finalize.service.install_failed_detail",
            "Gateway service install failed: {error}",
            { error: installError },
          ),
          getText("onboarding.finalize.gateway_title", "Gateway"),
        );
        await prompter.note(gatewayInstallErrorHint(), getText("onboarding.finalize.gateway_title", "Gateway"));
      }
    }
  }

  if (!opts.skipHealth) {
    const probeLinks = resolveControlUiLinks({
      bind: nextConfig.gateway?.bind ?? "loopback",
      port: settings.port,
      customBindHost: nextConfig.gateway?.customBindHost,
      basePath: undefined,
    });
    // Daemon install/restart can briefly flap the WS; wait a bit so health check doesn't false-fail.
    await waitForGatewayReachable({
      url: probeLinks.wsUrl,
      token: settings.gatewayToken,
      deadlineMs: 15_000,
    });
    try {
      await healthCommand({ json: false, timeoutMs: 10_000 }, runtime);
    } catch (err) {
      runtime.error(formatHealthCheckFailure(err));
      await prompter.note(
        [
          getText("onboarding.finalize.docs_label", "Docs:"),
          "https://docs.openclaw.ai/gateway/health",
          "https://docs.openclaw.ai/gateway/troubleshooting",
        ].join("\n"),
        getText("onboarding.finalize.health_check_help", "Health check help"),
      );
    }
  }

  const controlUiEnabled =
    nextConfig.gateway?.controlUi?.enabled ?? baseConfig.gateway?.controlUi?.enabled ?? true;
  if (!opts.skipUi && controlUiEnabled) {
    const controlUiAssets = await ensureControlUiAssetsBuilt(runtime);
    if (!controlUiAssets.ok && controlUiAssets.message) {
      runtime.error(controlUiAssets.message);
    }
  }

  await prompter.note(
    [
      getText("onboarding.finalize.optional_apps.header", "Add nodes for extra features:"),
      getText("onboarding.finalize.optional_apps.macos", "- macOS app (system + notifications)"),
      getText("onboarding.finalize.optional_apps.ios", "- iOS app (camera/canvas)"),
      getText("onboarding.finalize.optional_apps.android", "- Android app (camera/canvas)"),
    ].join("\n"),
    getText("onboarding.finalize.optional_apps.title", "Optional apps"),
  );

  const controlUiBasePath =
    nextConfig.gateway?.controlUi?.basePath ?? baseConfig.gateway?.controlUi?.basePath;
  const links = resolveControlUiLinks({
    bind: settings.bind,
    port: settings.port,
    customBindHost: settings.customBindHost,
    basePath: controlUiBasePath,
  });
  const authedUrl =
    settings.authMode === "token" && settings.gatewayToken
      ? `${links.httpUrl}#token=${encodeURIComponent(settings.gatewayToken)}`
      : links.httpUrl;
  const gatewayProbe = await probeGatewayReachable({
    url: links.wsUrl,
    token: settings.authMode === "token" ? settings.gatewayToken : undefined,
    password: settings.authMode === "password" ? nextConfig.gateway?.auth?.password : "",
  });
  const gatewayStatusLine = gatewayProbe.ok
    ? getText("gateway.status.reachable", "Gateway: reachable")
    : `${getText("gateway.status.not_detected", "Gateway: not detected")}${gatewayProbe.detail ? ` (${gatewayProbe.detail})` : ""}`;
  const bootstrapPath = path.join(
    resolveUserPath(options.workspaceDir),
    DEFAULT_BOOTSTRAP_FILENAME,
  );
  const hasBootstrap = await fs
    .access(bootstrapPath)
    .then(() => true)
    .catch(() => false);

  await prompter.note(
    [
      `${getText("configure.control_ui.web_ui", "Web UI:")} ${links.httpUrl}`,
      settings.authMode === "token" && settings.gatewayToken
        ? `${getText("configure.control_ui.web_ui_token", "Web UI (with token):")} ${authedUrl}`
        : undefined,
      `${getText("configure.control_ui.gateway_ws", "Gateway WS:")} ${links.wsUrl}`,
      gatewayStatusLine,
      getText("configure.control_ui.docs_link", "Docs: https://docs.openclaw.ai/web/control-ui"),
    ]
      .filter(Boolean)
      .join("\n"),
    getText("configure.control_ui.note_title", "Control UI"),
  );

  let controlUiOpened = false;
  let controlUiOpenHint: string | undefined;
  let seededInBackground = false;
  let hatchChoice: "tui" | "web" | "later" | null = null;
  let launchedTui = false;

  if (!opts.skipUi && gatewayProbe.ok) {
    if (hasBootstrap) {
      await prompter.note(
        [
          getText("onboarding.finalize.tui.defining", "This is the defining action that makes your agent you."),
          getText("onboarding.finalize.tui.take_time", "Please take your time."),
          getText("onboarding.finalize.tui.more_tell", "The more you tell it, the better the experience will be."),
          getText("onboarding.finalize.tui.wake", 'We will send: "Wake up, my friend!"'),
        ].join("\n"),
        getText("onboarding.finalize.tui.title", "Start TUI (best option!)"),
      );
    }

    await prompter.note(
      [
        getText("onboarding.finalize.token.shared_auth", "Gateway token: shared auth for the Gateway + Control UI."),
        getText(
          "onboarding.finalize.token.stored",
          "Stored in: ~/.openclaw/openclaw.json (gateway.auth.token) or OPENCLAW_GATEWAY_TOKEN.",
        ),
        getText("onboarding.finalize.token.view", "View token: {command}", {
          command: formatCliCommand("openclaw config get gateway.auth.token"),
        }),
        getText("onboarding.finalize.token.generate", "Generate token: {command}", {
          command: formatCliCommand("openclaw doctor --generate-gateway-token"),
        }),
        getText(
          "onboarding.finalize.token.webui_copy",
          "Web UI stores a copy in this browser's localStorage (openclaw.control.settings.v1).",
        ),
        getText("onboarding.finalize.token.open_dashboard", "Open the dashboard anytime: {command}", {
          command: formatCliCommand("openclaw dashboard --no-open"),
        }),
        getText(
          "onboarding.finalize.token.paste",
          "If prompted: paste the token into Control UI settings (or use the tokenized dashboard URL).",
        ),
      ].join("\n"),
      getText("onboarding.finalize.token.title", "Token"),
    );

    hatchChoice = await prompter.select({
      message: getText("onboarding.finalize.hatch.message", "How do you want to hatch your bot?"),
      options: [
        { value: "tui", label: getText("onboarding.finalize.hatch.tui", "Hatch in TUI (recommended)") },
        { value: "web", label: getText("onboarding.finalize.hatch.web", "Open the Web UI") },
        { value: "later", label: getText("onboarding.finalize.hatch.later", "Do this later") },
      ],
      initialValue: "tui",
    });

    if (hatchChoice === "tui") {
      restoreTerminalState("pre-onboarding tui", { resumeStdinIfPaused: true });
      await runTui({
        url: links.wsUrl,
        token: settings.authMode === "token" ? settings.gatewayToken : undefined,
        password: settings.authMode === "password" ? nextConfig.gateway?.auth?.password : "",
        // Safety: onboarding TUI should not auto-deliver to lastProvider/lastTo.
        deliver: false,
        message: hasBootstrap ? getText("onboarding.finalize.tui.wake_message", "Wake up, my friend!") : undefined,
      });
      launchedTui = true;
    } else if (hatchChoice === "web") {
      const browserSupport = await detectBrowserOpenSupport();
      if (browserSupport.ok) {
        controlUiOpened = await openUrl(authedUrl);
        if (!controlUiOpened) {
          controlUiOpenHint = formatControlUiSshHint({
            port: settings.port,
            basePath: controlUiBasePath,
            token: settings.authMode === "token" ? settings.gatewayToken : undefined,
          });
        }
      } else {
        controlUiOpenHint = formatControlUiSshHint({
          port: settings.port,
          basePath: controlUiBasePath,
          token: settings.authMode === "token" ? settings.gatewayToken : undefined,
        });
      }
      await prompter.note(
        [
          getText("onboarding.finalize.dashboard.link", "Dashboard link (with token): {url}", { url: authedUrl }),
          controlUiOpened
            ? getText("onboarding.finalize.dashboard.opened", "Opened in your browser. Keep that tab to control OpenClaw.")
            : getText(
                "onboarding.finalize.dashboard.copy",
                "Copy/paste this URL in a browser on this machine to control OpenClaw.",
              ),
          controlUiOpenHint,
        ]
          .filter(Boolean)
          .join("\n"),
        getText("onboarding.finalize.dashboard.title", "Dashboard ready"),
      );
    } else {
      await prompter.note(
        getText("onboarding.finalize.later.when_ready", "When you're ready: {command}", {
          command: formatCliCommand("openclaw dashboard --no-open"),
        }),
        getText("onboarding.finalize.later.title", "Later"),
      );
    }
  } else if (opts.skipUi) {
    await prompter.note(
      getText("onboarding.finalize.skip_ui", "Skipping Control UI/TUI prompts."),
      getText("onboarding.finalize.control_ui_title", "Control UI"),
    );
  }

  await prompter.note(
    [
      getText("onboarding.finalize.workspace_backup.body", "Back up your agent workspace."),
      "Docs: https://docs.openclaw.ai/concepts/agent-workspace",
    ].join("\n"),
    getText("onboarding.finalize.workspace_backup.title", "Workspace backup"),
  );

  await prompter.note(
    getText(
      "onboarding.finalize.security.body",
      "Running agents on your computer is risky — harden your setup: https://docs.openclaw.ai/security",
    ),
    getText("onboarding.finalize.security.title", "Security"),
  );

  await setupOnboardingShellCompletion({ flow, prompter });

  const shouldOpenControlUi =
    !opts.skipUi &&
    settings.authMode === "token" &&
    Boolean(settings.gatewayToken) &&
    hatchChoice === null;
  if (shouldOpenControlUi) {
    const browserSupport = await detectBrowserOpenSupport();
    if (browserSupport.ok) {
      controlUiOpened = await openUrl(authedUrl);
      if (!controlUiOpened) {
        controlUiOpenHint = formatControlUiSshHint({
          port: settings.port,
          basePath: controlUiBasePath,
          token: settings.gatewayToken,
        });
      }
    } else {
      controlUiOpenHint = formatControlUiSshHint({
        port: settings.port,
        basePath: controlUiBasePath,
        token: settings.gatewayToken,
      });
    }

    await prompter.note(
      [
        getText("onboarding.finalize.dashboard.link", "Dashboard link (with token): {url}", { url: authedUrl }),
        controlUiOpened
          ? getText("onboarding.finalize.dashboard.opened", "Opened in your browser. Keep that tab to control OpenClaw.")
          : getText(
              "onboarding.finalize.dashboard.copy",
              "Copy/paste this URL in a browser on this machine to control OpenClaw.",
            ),
        controlUiOpenHint,
      ]
        .filter(Boolean)
        .join("\n"),
      getText("onboarding.finalize.dashboard.title", "Dashboard ready"),
    );
  }

  const webSearchKey = (nextConfig.tools?.web?.search?.apiKey ?? "").trim();
  const webSearchEnv = (process.env.BRAVE_API_KEY ?? "").trim();
  const hasWebSearchKey = Boolean(webSearchKey || webSearchEnv);
  await prompter.note(
    hasWebSearchKey
      ? [
          getText(
            "onboarding.finalize.web_search.enabled",
            "Web search is enabled, so your agent can look things up online when needed.",
          ),
          "",
          webSearchKey
            ? getText(
                "onboarding.finalize.web_search.key_config",
                "API key: stored in config (tools.web.search.apiKey).",
              )
            : getText(
                "onboarding.finalize.web_search.key_env",
                "API key: provided via BRAVE_API_KEY env var (Gateway environment).",
              ),
          "Docs: https://docs.openclaw.ai/tools/web",
        ].join("\n")
      : [
          getText(
            "onboarding.finalize.web_search.need_key",
            "If you want your agent to be able to search the web, you’ll need an API key.",
          ),
          "",
          getText(
            "onboarding.finalize.web_search.brave",
            "OpenClaw uses Brave Search for the `web_search` tool. Without a Brave Search API key, web search won’t work.",
          ),
          "",
          getText("onboarding.finalize.web_search.setup_interactive", "Set it up interactively:"),
          getText("onboarding.finalize.web_search.run", "- Run: {command}", {
            command: formatCliCommand("openclaw configure --section web"),
          }),
          getText(
            "onboarding.finalize.web_search.enable_paste",
            "- Enable web_search and paste your Brave Search API key",
          ),
          "",
          getText(
            "onboarding.finalize.web_search.alternative",
            "Alternative: set BRAVE_API_KEY in the Gateway environment (no config changes).",
          ),
          "Docs: https://docs.openclaw.ai/tools/web",
        ].join("\n"),
    getText("onboarding.finalize.web_search.title", "Web search (optional)"),
  );

  await prompter.note(
    getText(
      "onboarding.finalize.what_now.body",
      'What now: https://openclaw.ai/showcase ("What People Are Building").',
    ),
    getText("onboarding.finalize.what_now.title", "What now"),
  );

  await prompter.outro(
    controlUiOpened
      ? getText(
          "onboarding.finalize.outro.opened",
          "Onboarding complete. Dashboard opened; keep that tab to control OpenClaw.",
        )
      : seededInBackground
        ? getText(
            "onboarding.finalize.outro.seeded",
            "Onboarding complete. Web UI seeded in the background; open it anytime with the dashboard link above.",
          )
        : getText(
            "onboarding.finalize.outro.done",
            "Onboarding complete. Use the dashboard link above to control OpenClaw.",
          ),
  );

  return { launchedTui };
}
