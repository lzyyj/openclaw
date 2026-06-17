import fs from "node:fs/promises";
import path from "node:path";
import {
  resolveControlUiDistIndexHealth,
  resolveControlUiDistIndexPathForRoot,
} from "../infra/control-ui-assets.js";
import { resolveOpenClawPackageRoot } from "../infra/openclaw-root.js";
import { runCommandWithTimeout } from "../process/exec.js";
import type { RuntimeEnv } from "../runtime.js";
import { getText } from "../cli/i18n.js";
import { note } from "../terminal/note.js";
import type { DoctorPrompter } from "./doctor-prompter.js";

export async function maybeRepairUiProtocolFreshness(
  _runtime: RuntimeEnv,
  prompter: DoctorPrompter,
) {
  const root = await resolveOpenClawPackageRoot({
    moduleUrl: import.meta.url,
    argv1: process.argv[1],
    cwd: process.cwd(),
  });

  if (!root) {
    return;
  }

  const schemaPath = path.join(root, "src/gateway/protocol/schema.ts");
  const uiHealth = await resolveControlUiDistIndexHealth({
    root,
    argv1: process.argv[1],
  });
  const uiIndexPath = uiHealth.indexPath ?? resolveControlUiDistIndexPathForRoot(root);

  try {
    const [schemaStats, uiStats] = await Promise.all([
      fs.stat(schemaPath).catch(() => null),
      fs.stat(uiIndexPath).catch(() => null),
    ]);

    if (schemaStats && !uiStats) {
      note(getText("doctor.ui.missing", ["- Control UI assets are missing.", "- Run: pnpm ui:build"].join("\n")), "UI");

      // In slim/docker environments we may not have the UI source tree. Trying
      // to build would fail (and spam logs), so skip the interactive repair.
      const uiSourcesPath = path.join(root, "ui/package.json");
      const uiSourcesExist = await fs.stat(uiSourcesPath).catch(() => null);
      if (!uiSourcesExist) {
        note(getText("doctor.ui.skipped_no_sources", "Skipping UI build: ui/ sources not present."), "UI");
        return;
      }

      const shouldRepair = await prompter.confirmRepair({
        message: getText("doctor.ui.build_confirm", "Build Control UI assets now?"),
        initialValue: true,
      });

      if (shouldRepair) {
        note(getText("doctor.ui.building", "Building Control UI assets... (this may take a moment)"), "UI");
        const uiScriptPath = path.join(root, "scripts/ui.js");
        const buildResult = await runCommandWithTimeout([process.execPath, uiScriptPath, "build"], {
          cwd: root,
          timeoutMs: 120_000,
          env: { ...process.env, FORCE_COLOR: "1" },
        });
        if (buildResult.code === 0) {
          note(getText("doctor.ui.build_complete", "UI build complete."), "UI");
        } else {
          const details = [
            getText("doctor.ui.build_failed", `UI build failed (exit ${buildResult.code ?? "unknown"}).`, { code: String(buildResult.code ?? "unknown") }),
            buildResult.stderr.trim() ? buildResult.stderr.trim() : null,
          ]
            .filter(Boolean)
            .join("\n");
          note(details, "UI");
        }
      }
      return;
    }

    if (!schemaStats || !uiStats) {
      return;
    }

    if (schemaStats.mtime > uiStats.mtime) {
      const uiMtimeIso = uiStats.mtime.toISOString();
      // Find changes since the UI build
      const gitLog = await runCommandWithTimeout(
        [
          "git",
          "-C",
          root,
          "log",
          `--since=${uiMtimeIso}`,
          "--format=%h %s",
          "src/gateway/protocol/schema.ts",
        ],
        { timeoutMs: 5000 },
      ).catch(() => null);

      if (gitLog && gitLog.code === 0 && gitLog.stdout.trim()) {
        note(
          `UI assets are older than the protocol schema.\nFunctional changes since last build:\n${gitLog.stdout
            .trim()
            .split("\n")
            .map((l) => `- ${l}`)
            .join("\n")}`,
          "UI Freshness",
        );

        const shouldRepair = await prompter.confirmAggressive({
          message: getText("doctor.ui.rebuild_confirm", "Rebuild UI now? (Detected protocol mismatch requiring update)"),
          initialValue: true,
        });

        if (shouldRepair) {
          const uiSourcesPath = path.join(root, "ui/package.json");
          const uiSourcesExist = await fs.stat(uiSourcesPath).catch(() => null);
          if (!uiSourcesExist) {
            note(getText("doctor.ui.skipped_no_sources_rebuild", "Skipping UI rebuild: ui/ sources not present."), "UI");
            return;
          }

          note(getText("doctor.ui.rebuilding", "Rebuilding stale UI assets... (this may take a moment)"), "UI");
          // Use scripts/ui.js to build, assuming node is available as we are running in it.
          // We use the same node executable to run the script.
          const uiScriptPath = path.join(root, "scripts/ui.js");
          const buildResult = await runCommandWithTimeout(
            [process.execPath, uiScriptPath, "build"],
            {
              cwd: root,
              timeoutMs: 120_000,
              env: { ...process.env, FORCE_COLOR: "1" },
            },
          );
          if (buildResult.code === 0) {
            note(getText("doctor.ui.rebuild_complete", "UI rebuild complete."), "UI");
          } else {
            const details = [
              getText("doctor.ui.rebuild_failed", `UI rebuild failed (exit ${buildResult.code ?? "unknown"}).`, { code: String(buildResult.code ?? "unknown") }),
              buildResult.stderr.trim() ? buildResult.stderr.trim() : null,
            ]
              .filter(Boolean)
              .join("\n");
            note(details, "UI");
          }
        }
      }
    }
  } catch {
    // If files don't exist, we can't check.
    // If git fails, we silently skip.
    // runtime.debug(`UI freshness check failed: ${String(err)}`);
  }
}
