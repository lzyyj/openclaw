import { formatCliCommand } from "../cli/command-format.js";
import { getText } from "../cli/i18n.js";
import type { OpenClawConfig } from "../config/config.js";
import { readConfigFileSnapshot, resolveGatewayPort, writeConfigFile } from "../config/config.js";
import { logConfigUpdated } from "../config/logging.js";
import { ensureControlUiAssetsBuilt } from "../infra/control-ui-assets.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { note } from "../terminal/note.js";
import { resolveUserPath } from "../utils.js";
import { createClackPrompter } from "../wizard/clack-prompter.js";
import { WizardCancelledError } from "../wizard/prompts.js";
import { removeChannelConfigWizard } from "./configure.channels.js";
import { maybeInstallDaemon } from "./configure.daemon.js";
import { promptAuthConfig } from "./configure.gateway-auth.js";
import { promptGatewayConfig } from "./configure.gateway.js";
import type {
  ChannelsWizardMode,
  ConfigureWizardParams,
  WizardSection,
} from "./configure.shared.js";
import {
  CONFIGURE_SECTION_OPTIONS,
  confirm,
  intro,
  outro,
  select,
  text,
} from "./configure.shared.js";
import { formatHealthCheckFailure } from "./health-format.js";
import { healthCommand } from "./health.js";
import { noteChannelStatus, setupChannels } from "./onboard-channels.js";
import {
  applyWizardMetadata,
  DEFAULT_WORKSPACE,
  ensureWorkspaceAndSessions,
  guardCancel,
  printWizardHeader,
  probeGatewayReachable,
  resolveControlUiLinks,
  summarizeExistingConfig,
  waitForGatewayReachable,
} from "./onboard-helpers.js";
import { promptRemoteGatewayConfig } from "./onboard-remote.js";
import { setupSkills } from "./onboard-skills.js";

type ConfigureSectionChoice = WizardSection | "__continue";

async function runGatewayHealthCheck(params: {
  cfg: OpenClawConfig;
  runtime: RuntimeEnv;
  port: number;
}): Promise<void> {
  const localLinks = resolveControlUiLinks({
    bind: params.cfg.gateway?.bind ?? "loopback",
    port: params.port,
    customBindHost: params.cfg.gateway?.customBindHost,
    basePath: undefined,
  });
  const remoteUrl = params.cfg.gateway?.remote?.url?.trim();
  const wsUrl = params.cfg.gateway?.mode === "remote" && remoteUrl ? remoteUrl : localLinks.wsUrl;
  const token = params.cfg.gateway?.auth?.token ?? process.env.OPENCLAW_GATEWAY_TOKEN;
  const password = params.cfg.gateway?.auth?.password ?? process.env.OPENCLAW_GATEWAY_PASSWORD;

  await waitForGatewayReachable({
    url: wsUrl,
    token,
    password,
    deadlineMs: 15_000,
  });

  try {
    await healthCommand({ json: false, timeoutMs: 10_000 }, params.runtime);
  } catch (err) {
    params.runtime.error(formatHealthCheckFailure(err));
    note(
      [
        getText("configure.health_check.docs_link", "Docs:"),
        "https://docs.openclaw.ai/gateway/health",
        "https://docs.openclaw.ai/gateway/troubleshooting",
      ].join("\n"),
      getText("configure.health_check.note_title", "Health check help"),
    );
  }
}

async function promptConfigureSection(
  runtime: RuntimeEnv,
  hasSelection: boolean,
): Promise<ConfigureSectionChoice> {
  const doneHint = getText("configure.section.continue_done", "Done");
  const skipHint = getText("configure.section.continue_skip", "Skip for now");
  return guardCancel(
    await select<ConfigureSectionChoice>({
      message: getText("configure.section_select.message", "Select sections to configure"),
      options: [
        ...CONFIGURE_SECTION_OPTIONS,
        {
          value: "__continue",
          label: getText("configure.section.continue", "Continue"),
          hint: hasSelection ? doneHint : skipHint,
        },
      ],
      initialValue: CONFIGURE_SECTION_OPTIONS[0]?.value,
    }),
    runtime,
  );
}

async function promptChannelMode(runtime: RuntimeEnv): Promise<ChannelsWizardMode> {
  return guardCancel(
    await select({
      message: getText("configure.channels.message", "Channels"),
      options: [
        {
          value: "configure",
          label: getText("configure.channels.configure.label", "Configure/link"),
          hint: getText("configure.channels.configure.hint", "Add/update channels; disable unselected accounts"),
        },
        {
          value: "remove",
          label: getText("configure.channels.remove.label", "Remove channel config"),
          hint: getText("configure.channels.remove.hint", "Delete channel tokens/settings from openclaw.json"),
        },
      ],
      initialValue: "configure",
    }),
    runtime,
  ) as ChannelsWizardMode;
}

async function promptWebToolsConfig(
  nextConfig: OpenClawConfig,
  runtime: RuntimeEnv,
): Promise<OpenClawConfig> {
  const existingSearch = nextConfig.tools?.web?.search;
  const existingFetch = nextConfig.tools?.web?.fetch;
  const hasSearchKey = Boolean(existingSearch?.apiKey);

  note(
    getText(
      "configure.web_search.note_body",
      [
        "Web search lets your agent look things up online using the `web_search` tool.",
        "It requires a Brave Search API key (you can store it in the config or set BRAVE_API_KEY in the Gateway environment).",
        "Docs: https://docs.openclaw.ai/tools/web",
      ].join("\n"),
    ),
    getText("configure.web_search.note_title", "Web search"),
  );

  const enableSearch = guardCancel(
    await confirm({
      message: getText("configure.web_search.enable.message", "Enable web_search (Brave Search)?"),
      initialValue: existingSearch?.enabled ?? hasSearchKey,
    }),
    runtime,
  );

  let nextSearch = {
    ...existingSearch,
    enabled: enableSearch,
  };

  if (enableSearch) {
    const keyInput = guardCancel(
      await text({
        message: hasSearchKey
          ? "Brave Search API key (leave blank to keep current or use BRAVE_API_KEY)"
          : "Brave Search API key (paste it here; leave blank to use BRAVE_API_KEY)",
        placeholder: hasSearchKey ? "Leave blank to keep current" : "BSA...",
      }),
      runtime,
    );
    const key = String(keyInput ?? "").trim();
    if (key) {
      nextSearch = { ...nextSearch, apiKey: key };
    } else if (!hasSearchKey) {
      note(
        getText(
          "configure.web_search.no_key.body",
          [
            "No key stored yet, so web_search will stay unavailable.",
            "Store a key here or set BRAVE_API_KEY in the Gateway environment.",
            "Docs: https://docs.openclaw.ai/tools/web",
          ].join("\n"),
        ),
        getText("configure.web_search.no_key.title", "Web search"),
      );
    }
  }

  const enableFetch = guardCancel(
    await confirm({
      message: getText("configure.web_fetch.enable.message", "Enable web_fetch (keyless HTTP fetch)?"),
      initialValue: existingFetch?.enabled ?? true,
    }),
    runtime,
  );

  const nextFetch = {
    ...existingFetch,
    enabled: enableFetch,
  };

  return {
    ...nextConfig,
    tools: {
      ...nextConfig.tools,
      web: {
        ...nextConfig.tools?.web,
        search: nextSearch,
        fetch: nextFetch,
      },
    },
  };
}

export async function runConfigureWizard(
  opts: ConfigureWizardParams,
  runtime: RuntimeEnv = defaultRuntime,
) {
  try {
    printWizardHeader(runtime);
    intro(opts.command === "update" ? "OpenClaw update wizard" : getText("configure.intro", "OpenClaw configure"));
    const prompter = createClackPrompter();

    const snapshot = await readConfigFileSnapshot();
    const baseConfig: OpenClawConfig = snapshot.valid ? snapshot.config : {};

    if (snapshot.exists) {
      const title = snapshot.valid
        ? getText("configure.existing.title", "Existing config detected")
        : getText("configure.invalid.title", "Invalid config");
      note(summarizeExistingConfig(baseConfig), title);
      if (!snapshot.valid && snapshot.issues.length > 0) {
        note(
          [
            ...snapshot.issues.map((iss) => `- ${iss.path}: ${iss.message}`),
            "",
            getText("configure.config_issues.title", "Docs: https://docs.openclaw.ai/gateway/configuration"),
          ].join("\n"),
          getText("configure.config_issues.title", "Config issues"),
        );
      }
      if (!snapshot.valid) {
        outro(
          getText("configure.invalid.outro", "Config invalid. Run `{command}` to repair it, then re-run configure.", {
            command: formatCliCommand("openclaw doctor"),
          }),
        );
        runtime.exit(1);
        return;
      }
    }

    const localPort = resolveGatewayPort(baseConfig);
    const localUrl = `ws://127.0.0.1:${localPort}`;
    const localProbe = await probeGatewayReachable({
      url: localUrl,
      token: baseConfig.gateway?.auth?.token ?? process.env.OPENCLAW_GATEWAY_TOKEN,
      password: baseConfig.gateway?.auth?.password ?? process.env.OPENCLAW_GATEWAY_PASSWORD,
    });
    const remoteUrl = baseConfig.gateway?.remote?.url?.trim() ?? "";
    const remoteProbe = remoteUrl
      ? await probeGatewayReachable({
          url: remoteUrl,
          token: baseConfig.gateway?.remote?.token,
        })
      : null;

    const mode = guardCancel(
      await select({
        message: getText("configure.mode_select.message", "Where will the Gateway run?"),
        options: [
          {
            value: "local",
            label: getText("configure.mode.local.label", "Local (this machine)"),
            hint: localProbe.ok
              ? getText("configure.mode.local.hint.reachable", "Gateway reachable ({url})", { url: localUrl })
              : getText("configure.mode.local.hint.unreachable", "No gateway detected ({url})", { url: localUrl }),
          },
          {
            value: "remote",
            label: getText("configure.mode.remote.label", "Remote (info-only)"),
            hint: !remoteUrl
              ? getText("configure.mode.remote.hint.empty", "No remote URL configured yet")
              : remoteProbe?.ok
                ? getText("configure.mode.remote.hint.reachable", "Gateway reachable ({url})", { url: remoteUrl })
                : getText("configure.mode.remote.hint.unreachable", "Configured but unreachable ({url})", { url: remoteUrl }),
          },
        ],
      }),
      runtime,
    );

    if (mode === "remote") {
      let remoteConfig = await promptRemoteGatewayConfig(baseConfig, prompter);
      remoteConfig = applyWizardMetadata(remoteConfig, {
        command: opts.command,
        mode,
      });
      await writeConfigFile(remoteConfig);
      logConfigUpdated(runtime);
      outro(getText("configure.remote.configured", "Remote gateway configured."));
      return;
    }

    let nextConfig = { ...baseConfig };
    let didSetGatewayMode = false;
    if (nextConfig.gateway?.mode !== "local") {
      nextConfig = {
        ...nextConfig,
        gateway: {
          ...nextConfig.gateway,
          mode: "local",
        },
      };
      didSetGatewayMode = true;
    }
    let workspaceDir =
      nextConfig.agents?.defaults?.workspace ??
      baseConfig.agents?.defaults?.workspace ??
      DEFAULT_WORKSPACE;
    let gatewayPort = resolveGatewayPort(baseConfig);
    let gatewayToken: string | undefined =
      nextConfig.gateway?.auth?.token ??
      baseConfig.gateway?.auth?.token ??
      process.env.OPENCLAW_GATEWAY_TOKEN;

    const persistConfig = async () => {
      nextConfig = applyWizardMetadata(nextConfig, {
        command: opts.command,
        mode,
      });
      await writeConfigFile(nextConfig);
      logConfigUpdated(runtime);
    };

    const configureWorkspace = async () => {
      const workspaceInput = guardCancel(
        await text({
          message: getText("configure.workspace.message", "Workspace directory"),
          initialValue: workspaceDir,
        }),
        runtime,
      );
      workspaceDir = resolveUserPath(String(workspaceInput ?? "").trim() || DEFAULT_WORKSPACE);
      nextConfig = {
        ...nextConfig,
        agents: {
          ...nextConfig.agents,
          defaults: {
            ...nextConfig.agents?.defaults,
            workspace: workspaceDir,
          },
        },
      };
      await ensureWorkspaceAndSessions(workspaceDir, runtime);
    };

    const configureChannelsSection = async () => {
      await noteChannelStatus({ cfg: nextConfig, prompter });
      const channelMode = await promptChannelMode(runtime);
      if (channelMode === "configure") {
        nextConfig = await setupChannels(nextConfig, runtime, prompter, {
          allowDisable: true,
          allowSignalInstall: true,
          skipConfirm: true,
          skipStatusNote: true,
        });
      } else {
        nextConfig = await removeChannelConfigWizard(nextConfig, runtime);
      }
    };

    const promptDaemonPort = async () => {
      const portInput = guardCancel(
        await text({
          message: getText("configure.gateway_port.message", "Gateway port for service install"),
          initialValue: String(gatewayPort),
          validate: (value) => (Number.isFinite(Number(value)) ? undefined : "Invalid port"),
        }),
        runtime,
      );
      gatewayPort = Number.parseInt(String(portInput), 10);
    };

    if (opts.sections) {
      const selected = opts.sections;
      if (!selected || selected.length === 0) {
        outro("No changes selected.");
        return;
      }

      if (selected.includes("workspace")) {
        await configureWorkspace();
      }

      if (selected.includes("model")) {
        nextConfig = await promptAuthConfig(nextConfig, runtime, prompter);
      }

      if (selected.includes("web")) {
        nextConfig = await promptWebToolsConfig(nextConfig, runtime);
      }

      if (selected.includes("gateway")) {
        const gateway = await promptGatewayConfig(nextConfig, runtime);
        nextConfig = gateway.config;
        gatewayPort = gateway.port;
        gatewayToken = gateway.token;
      }

      if (selected.includes("channels")) {
        await configureChannelsSection();
      }

      if (selected.includes("skills")) {
        const wsDir = resolveUserPath(workspaceDir);
        nextConfig = await setupSkills(nextConfig, wsDir, runtime, prompter);
      }

      await persistConfig();

      if (selected.includes("daemon")) {
        if (!selected.includes("gateway")) {
          await promptDaemonPort();
        }

        await maybeInstallDaemon({ runtime, port: gatewayPort, gatewayToken });
      }

      if (selected.includes("health")) {
        await runGatewayHealthCheck({ cfg: nextConfig, runtime, port: gatewayPort });
      }
    } else {
      let ranSection = false;
      let didConfigureGateway = false;

      while (true) {
        const choice = await promptConfigureSection(runtime, ranSection);
        if (choice === "__continue") {
          break;
        }
        ranSection = true;

        if (choice === "workspace") {
          await configureWorkspace();
          await persistConfig();
        }

        if (choice === "model") {
          nextConfig = await promptAuthConfig(nextConfig, runtime, prompter);
          await persistConfig();
        }

        if (choice === "web") {
          nextConfig = await promptWebToolsConfig(nextConfig, runtime);
          await persistConfig();
        }

        if (choice === "gateway") {
          const gateway = await promptGatewayConfig(nextConfig, runtime);
          nextConfig = gateway.config;
          gatewayPort = gateway.port;
          gatewayToken = gateway.token;
          didConfigureGateway = true;
          await persistConfig();
        }

        if (choice === "channels") {
          await configureChannelsSection();
          await persistConfig();
        }

        if (choice === "skills") {
          const wsDir = resolveUserPath(workspaceDir);
          nextConfig = await setupSkills(nextConfig, wsDir, runtime, prompter);
          await persistConfig();
        }

        if (choice === "daemon") {
          if (!didConfigureGateway) {
            await promptDaemonPort();
          }
          await maybeInstallDaemon({
            runtime,
            port: gatewayPort,
            gatewayToken,
          });
        }

        if (choice === "health") {
          await runGatewayHealthCheck({ cfg: nextConfig, runtime, port: gatewayPort });
        }
      }

      if (!ranSection) {
        if (didSetGatewayMode) {
          await persistConfig();
          outro(getText("configure.gateway.mode_set_local", "Gateway mode set to local."));
          return;
        }
        outro(getText("configure.no_changes_selected", "No changes selected."));
        return;
      }
    }

    const controlUiAssets = await ensureControlUiAssetsBuilt(runtime);
    if (!controlUiAssets.ok && controlUiAssets.message) {
      runtime.error(controlUiAssets.message);
    }

    const bind = nextConfig.gateway?.bind ?? "loopback";
    const links = resolveControlUiLinks({
      bind,
      port: gatewayPort,
      customBindHost: nextConfig.gateway?.customBindHost,
      basePath: nextConfig.gateway?.controlUi?.basePath,
    });
    // Try both new and old passwords since gateway may still have old config.
    const newPassword = nextConfig.gateway?.auth?.password ?? process.env.OPENCLAW_GATEWAY_PASSWORD;
    const oldPassword = baseConfig.gateway?.auth?.password ?? process.env.OPENCLAW_GATEWAY_PASSWORD;
    const token = nextConfig.gateway?.auth?.token ?? process.env.OPENCLAW_GATEWAY_TOKEN;

    let gatewayProbe = await probeGatewayReachable({
      url: links.wsUrl,
      token,
      password: newPassword,
    });
    // If new password failed and it's different from old password, try old too.
    if (!gatewayProbe.ok && newPassword !== oldPassword && oldPassword) {
      gatewayProbe = await probeGatewayReachable({
        url: links.wsUrl,
        token,
        password: oldPassword,
      });
    }
    const gatewayStatusLine = gatewayProbe.ok
      ? getText("gateway.status.reachable", "Gateway: reachable")
      : `${getText("gateway.status.not_detected", "Gateway: not detected")}${gatewayProbe.detail ? ` (${gatewayProbe.detail})` : ""}`;

    note(
      [
        `${getText("configure.control_ui.web_ui", "Web UI:")} ${links.httpUrl}`,
        `${getText("configure.control_ui.gateway_ws", "Gateway WS:")} ${links.wsUrl}`,
        gatewayStatusLine,
        getText("configure.control_ui.docs_link", "Docs: https://docs.openclaw.ai/web/control-ui"),
      ].join("\n"),
      getText("configure.control_ui.note_title", "Control UI"),
    );

    outro(getText("configure.complete.outro", "Configure complete."));
  } catch (err) {
    if (err instanceof WizardCancelledError) {
      runtime.exit(1);
      return;
    }
    throw err;
  }
}
