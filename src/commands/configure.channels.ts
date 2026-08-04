import { getChannelPlugin, listChannelPlugins } from "../channels/plugins/index.js";
import { formatCliCommand } from "../cli/command-format.js";
import { getText } from "../cli/i18n.js";
import type { OpenClawConfig } from "../config/config.js";
import { CONFIG_PATH } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { note } from "../terminal/note.js";
import { shortenHomePath } from "../utils.js";
import { confirm, select } from "./configure.shared.js";
import { guardCancel } from "./onboard-helpers.js";

export async function removeChannelConfigWizard(
  cfg: OpenClawConfig,
  runtime: RuntimeEnv,
): Promise<OpenClawConfig> {
  let next = { ...cfg };

  const listConfiguredChannels = () =>
    listChannelPlugins()
      .map((plugin) => plugin.meta)
      .filter((meta) => next.channels?.[meta.id] !== undefined);

  while (true) {
    const configured = listConfiguredChannels();
    if (configured.length === 0) {
      note(
        [
          getText("configure.channels.none_found", "No channel config found in openclaw.json."),
          getText("configure.channels.tip", `Tip: \`${formatCliCommand("openclaw channels status")}\` shows what is configured and enabled.`, { cmd: formatCliCommand("openclaw channels status") }),
        ].join("\n"),
        getText("configure.channels.remove.title", "Remove channel"),
      );
      return next;
    }

    const channel = guardCancel(
      await select({
        message: getText("configure.channels.remove_which.message", "Remove which channel config?"),
        options: [
          ...configured.map((meta) => ({
            value: meta.id,
            label: meta.label,
            hint: getText("configure.channels.remove.hint", "Deletes tokens + settings from config (credentials stay on disk)"),
          })),
          { value: "done", label: getText("configure.channels.done", "Done") },
        ],
      }),
      runtime,
    );

    if (channel === "done") {
      return next;
    }

    const label = getChannelPlugin(channel)?.meta.label ?? channel;
    const confirmed = guardCancel(
      await confirm({
        message: getText("configure.channels.confirm_delete.message", "Delete {label} configuration from {path}?", {
          label,
          path: shortenHomePath(CONFIG_PATH),
        }),
        initialValue: false,
      }),
      runtime,
    );
    if (!confirmed) {
      continue;
    }

    const nextChannels: Record<string, unknown> = { ...next.channels };
    delete nextChannels[channel];
    next = {
      ...next,
      channels: Object.keys(nextChannels).length
        ? (nextChannels as OpenClawConfig["channels"])
        : undefined,
    };

    note(
      [
        getText("configure.channels.removed.body", "{label} removed from config.", { label }),
        getText("configure.channels.removed.note", "Note: credentials/sessions on disk are unchanged."),
      ].join("\n"),
      getText("configure.channels.removed.title", "Channel removed"),
    );
  }
}
