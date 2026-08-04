import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { formatCliCommand } from "../cli/command-format.js";
import { getText } from "../cli/i18n.js";
import type { OpenClawConfig } from "../config/config.js";
import { buildWorkspaceHookStatus } from "../hooks/hooks-status.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";

export async function setupInternalHooks(
  cfg: OpenClawConfig,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<OpenClawConfig> {
  await prompter.note(
    getText(
      "onboarding.hooks.intro.body",
      [
        "Hooks let you automate actions when agent commands are issued.",
        "Example: Save session context to memory when you issue /new or /reset.",
        "",
        "Learn more: https://docs.openclaw.ai/automation/hooks",
      ].join("\n"),
    ),
    getText("onboarding.hooks.intro.title", "Hooks"),
  );

  // Discover available hooks using the hook discovery system
  const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
  const report = buildWorkspaceHookStatus(workspaceDir, { config: cfg });

  // Show every eligible hook so users can opt in during onboarding.
  const eligibleHooks = report.hooks.filter((h) => h.eligible);

  if (eligibleHooks.length === 0) {
    await prompter.note(
      getText("onboarding.hooks.none.body", "No eligible hooks found. You can configure hooks later in your config."),
      getText("onboarding.hooks.none.title", "No Hooks Available"),
    );
    return cfg;
  }

  const toEnable = await prompter.multiselect({
    message: getText("onboarding.hooks.enablePrompt", "Enable hooks?"),
    options: [
      { value: "__skip__", label: getText("onboarding.hooks.skipNow", "Skip for now") },
      ...eligibleHooks.map((hook) => ({
        value: hook.name,
        label: `${hook.emoji ?? "🔗"} ${hook.name}`,
        hint: hook.description,
      })),
    ],
  });

  const selected = toEnable.filter((name) => name !== "__skip__");
  if (selected.length === 0) {
    return cfg;
  }

  // Enable selected hooks using the new entries config format
  const entries = { ...cfg.hooks?.internal?.entries };
  for (const name of selected) {
    entries[name] = { enabled: true };
  }

  const next: OpenClawConfig = {
    ...cfg,
    hooks: {
      ...cfg.hooks,
      internal: {
        enabled: true,
        entries,
      },
    },
  };

  await prompter.note(
    getText(
      "onboarding.hooks.configured.body",
      [
        "Enabled {count} hook{s}: {names}",
        "",
        "You can manage hooks later with:",
        "  {listCmd}",
        "  {enableCmd}",
        "  {disableCmd}",
      ].join("\n"),
      {
        count: selected.length,
        s: selected.length > 1 ? "s" : "",
        names: selected.join(", "),
        listCmd: formatCliCommand("openclaw hooks list"),
        enableCmd: formatCliCommand("openclaw hooks enable <name>"),
        disableCmd: formatCliCommand("openclaw hooks disable <name>"),
      },
    ),
    getText("onboarding.hooks.configured.title", "Hooks Configured"),
  );

  return next;
}
