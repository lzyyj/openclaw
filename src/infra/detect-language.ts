/**
 * Detect the host OS UI language when no LANG/LC_ALL env vars are set.
 * Falls back to English on failure.
 */

export type DetectedLanguage = "en" | "zh-CN" | "unknown";

/**
 * Returns the detected UI language of the host operating system.
 * On Windows reads the system locale; on POSIX reads locale settings.
 */
export function detectOsLanguage(): DetectedLanguage {
  const osLang = platformSpecificDetection();
  if (osLang === "zh-CN") {
    return "zh-CN";
  }
  return "en";
}

function platformSpecificDetection(): DetectedLanguage {
  try {
    if (process.platform === "win32") {
      return detectWindowsUILanguage();
    }
    return detectPosixUILanguage();
  } catch {
    return "unknown";
  }
}

/**
 * Windows: check GetUserDefaultLocaleName or fallback to
 * MUI_GetSystemPreferredUILanguages via chcp command output.
 */
function detectWindowsUILanguage(): DetectedLanguage {
  try {
    // ── Attempt via Windows API: PowerShell Get-Culture ──
    const { execSync } = requireNodeExecSync();
    if (execSync) {
      const out = execSync(
        'powershell -NoProfile -Command "[System.Globalization.CultureInfo]::CurrentUICulture.Name"',
        { timeout: 2000, stdio: ["ignore", "pipe", "ignore"] },
      );
      const name = (out as Buffer).toString("utf-8").trim();
      if (name.startsWith("zh-")) {
        return "zh-CN";
      }
    }
  } catch {
    // fall through
  }

  // ── Fallback: check process.env.LANG (already mostly checked, but here as safety net) ──
  const lang = process.env.LANG?.toLowerCase() ?? "";
  if (lang.startsWith("zh_") || lang.startsWith("zh-") || lang === "zh") {
    return "zh-CN";
  }
  return "en";
}

/**
 * POSIX: check LC_MESSAGES, LC_ALL, LANG etc.
 */
function detectPosixUILanguage(): DetectedLanguage {
  const locale = (
    process.env.LC_MESSAGES ||
    process.env.LC_ALL ||
    process.env.LANG ||
    ""
  ).toLowerCase();
  if (locale.startsWith("zh_") || locale.startsWith("zh-") || locale === "zh") {
    return "zh-CN";
  }
  return "en";
}

/**
 * Cautious require of child_process — this module may be imported by
 * bundlers that mock or stub child_process.
 */
function requireNodeExecSync(): {
  execSync: ((cmd: string, opts: object) => Buffer | string) | null;
} {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const cp = require("node:child_process") as {
      execSync?: (cmd: string, opts: object) => Buffer | string;
    };
    return { execSync: cp.execSync ?? null };
  } catch {
    return { execSync: null };
  }
}
