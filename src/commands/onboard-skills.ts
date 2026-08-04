import { installSkill } from "../agents/skills-install.js";
import { buildWorkspaceSkillStatus } from "../agents/skills-status.js";
import { getText } from "../cli/i18n.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { normalizeSecretInput } from "../utils/normalize-secret-input.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { detectBinary, resolveNodeManagerOptions } from "./onboard-helpers.js";

function summarizeInstallFailure(message: string): string | undefined {
  const cleaned = message.replace(/^Install failed(?:\s*\([^)]*\))?\s*:?\s*/i, "").trim();
  if (!cleaned) {
    return undefined;
  }
  const maxLen = 140;
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
}

function formatSkillHint(skill: {
  description?: string;
  install: Array<{ label: string }>;
}): string {
  const desc = skill.description?.trim();
  const installLabel = skill.install[0]?.label?.trim();
  const combined = desc && installLabel ? `${desc} — ${installLabel}` : desc || installLabel;
  if (!combined) {
    return getText("onboarding.skills.hint.install", "install");
  }
  const maxLen = 90;
  return combined.length > maxLen ? `${combined.slice(0, maxLen - 1)}…` : combined;
}

function upsertSkillEntry(
  cfg: OpenClawConfig,
  skillKey: string,
  patch: { apiKey?: string },
): OpenClawConfig {
  const entries = { ...cfg.skills?.entries };
  const existing = (entries[skillKey] as { apiKey?: string } | undefined) ?? {};
  entries[skillKey] = { ...existing, ...patch };
  return {
    ...cfg,
    skills: {
      ...cfg.skills,
      entries,
    },
  };
}

export async function setupSkills(
  cfg: OpenClawConfig,
  workspaceDir: string,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<OpenClawConfig> {
  const report = buildWorkspaceSkillStatus(workspaceDir, { config: cfg });
  const eligible = report.skills.filter((s) => s.eligible);
  const unsupportedOs = report.skills.filter(
    (s) => !s.disabled && !s.blockedByAllowlist && s.missing.os.length > 0,
  );
  const missing = report.skills.filter(
    (s) => !s.eligible && !s.disabled && !s.blockedByAllowlist && s.missing.os.length === 0,
  );
  const blocked = report.skills.filter((s) => s.blockedByAllowlist);

  await prompter.note(
    [
      getText("onboarding.skills.status.eligible", "Eligible: {count}", { count: eligible.length }),
      getText("onboarding.skills.status.missing", "Missing requirements: {count}", { count: missing.length }),
      getText("onboarding.skills.status.unsupported", "Unsupported on this OS: {count}", { count: unsupportedOs.length }),
      getText("onboarding.skills.status.blocked", "Blocked by allowlist: {count}", { count: blocked.length }),
    ].join("\n"),
    getText("onboarding.skills.status.title", "Skills status"),
  );

  const shouldConfigure = await prompter.confirm({
    message: getText("onboarding.skills.configurePrompt", "Configure skills now? (recommended)"),
    initialValue: true,
  });
  if (!shouldConfigure) {
    return cfg;
  }

  const installable = missing.filter(
    (skill) => skill.install.length > 0 && skill.missing.bins.length > 0,
  );
  let next: OpenClawConfig = cfg;
  if (installable.length > 0) {
    const toInstall = await prompter.multiselect({
      message: getText("onboarding.skills.installMissingPrompt", "Install missing skill dependencies"),
      options: [
        {
          value: "__skip__",
          label: getText("onboarding.skills.skipNow", "Skip for now"),
          hint: getText("onboarding.skills.installMissingSkipHint", "Continue without installing dependencies"),
        },
        ...installable.map((skill) => ({
          value: skill.name,
          label: `${skill.emoji ?? "🧩"} ${skill.name}`,
          hint: formatSkillHint(skill),
        })),
      ],
    });

    const selected = toInstall.filter((name) => name !== "__skip__");

    const selectedSkills = selected
      .map((name) => installable.find((s) => s.name === name))
      .filter((item): item is (typeof installable)[number] => Boolean(item));

    const needsBrewPrompt =
      process.platform !== "win32" &&
      selectedSkills.some((skill) => skill.install.some((option) => option.kind === "brew")) &&
      !(await detectBinary("brew"));

    if (needsBrewPrompt) {
      await prompter.note(
        [
          getText("onboarding.skills.brew.body1", "Many skill dependencies are shipped via Homebrew."),
          getText("onboarding.skills.brew.body2", "Without brew, you'll need to build from source or download releases manually."),
        ].join("\n"),
        getText("onboarding.skills.brew.title", "Homebrew recommended"),
      );
      const showBrewInstall = await prompter.confirm({
        message: getText("onboarding.skills.brew.showInstall", "Show Homebrew install command?"),
        initialValue: true,
      });
      if (showBrewInstall) {
        await prompter.note(
          [
            getText("onboarding.skills.brew.runLabel", "Run:"),
            '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
          ].join("\n"),
          getText("onboarding.skills.brew.installTitle", "Homebrew install"),
        );
      }
    }

    const needsNodeManagerPrompt = selectedSkills.some((skill) =>
      skill.install.some((option) => option.kind === "node"),
    );
    if (needsNodeManagerPrompt) {
      const nodeManager = (await prompter.select({
        message: getText("onboarding.skills.nodeManagerPrompt", "Preferred node manager for skill installs"),
        options: resolveNodeManagerOptions(),
      })) as "npm" | "pnpm" | "bun";
      next = {
        ...next,
        skills: {
          ...next.skills,
          install: {
            ...next.skills?.install,
            nodeManager,
          },
        },
      };
    }

    for (const name of selected) {
      const target = installable.find((s) => s.name === name);
      if (!target || target.install.length === 0) {
        continue;
      }
      const installId = target.install[0]?.id;
      if (!installId) {
        continue;
      }
      const spin = prompter.progress(getText("onboarding.skills.progress.installing", "Installing {name}…", { name }));
      const result = await installSkill({
        workspaceDir,
        skillName: target.name,
        installId,
        config: next,
      });
      const warnings = result.warnings ?? [];
      if (result.ok) {
        spin.stop(
          warnings.length > 0
            ? getText("onboarding.skills.progress.installedWarnings", "Installed {name} (with warnings)", { name })
            : getText("onboarding.skills.progress.installed", "Installed {name}", { name }),
        );
        for (const warning of warnings) {
          runtime.log(warning);
        }
        continue;
      }
      const code = result.code == null ? "" : getText("onboarding.skills.progress.exitCode", " (exit {code})", { code: result.code });
      const detail = summarizeInstallFailure(result.message);
      spin.stop(
        getText("onboarding.skills.progress.installFailed", "Install failed: {name}{code}{detail}", {
          name,
          code,
          detail: detail ? ` — ${detail}` : "",
        }),
      );
      for (const warning of warnings) {
        runtime.log(warning);
      }
      if (result.stderr) {
        runtime.log(result.stderr.trim());
      } else if (result.stdout) {
        runtime.log(result.stdout.trim());
      }
      runtime.log(
        getText("onboard.skills.tip", `Tip: run \`${formatCliCommand("openclaw doctor")}\` to review skills + requirements.`, { cmd: formatCliCommand("openclaw doctor") }),
      );
      runtime.log("Docs: https://docs.openclaw.ai/skills");
    }
  }

  for (const skill of missing) {
    if (!skill.primaryEnv || skill.missing.env.length === 0) {
      continue;
    }
    const wantsKey = await prompter.confirm({
      message: getText("onboarding.skills.env.setPrompt", "Set {env} for {name}?", { env: skill.primaryEnv, name: skill.name }),
      initialValue: false,
    });
    if (!wantsKey) {
      continue;
    }
    const apiKey = String(
      await prompter.text({
        message: getText("onboarding.skills.env.enter", "Enter {env}", { env: skill.primaryEnv }),
        validate: (value) => (value?.trim() ? undefined : getText("onboarding.skills.env.required", "Required")),
      }),
    );
    next = upsertSkillEntry(next, skill.skillKey, { apiKey: normalizeSecretInput(apiKey) });
  }

  return next;
}
