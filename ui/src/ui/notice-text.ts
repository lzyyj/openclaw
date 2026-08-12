import { i18n, t } from "../i18n/index.ts";
import type { RunFailureNotice } from "./app-gateway.ts";

const GENERIC_BILLING_PROVIDER_LABEL = "api provider";

/**
 * Extract the provider label ("deepseek (deepseek-v4-flash)") from the
 * backend billing error shape produced by formatBillingErrorMessage():
 *
 *   ⚠️ deepseek (deepseek-v4-flash) returned a billing error — your API key ...
 *
 * Returns null when the text is not that known shape (e.g. the generic
 * provider-less message or unrelated text), so callers can fall back to a
 * generic message.
 */
export function parseBillingLabel(text: string): { label: string; provider: string } | null {
  const match = /^⚠️\s+([^\n]+?)\s+returned a billing error(?:\s+—|$)/.exec(text.trim());
  if (!match) {
    return null;
  }
  const label = match[1].trim();
  // The backend generic message uses the literal placeholder "API provider" —
  // that is not a real provider, treat it as the provider-less shape.
  if (label.toLowerCase() === GENERIC_BILLING_PROVIDER_LABEL) {
    return null;
  }
  const provider = label.split(/\s+\(/)[0].trim();
  if (!label || !provider) {
    return null;
  }
  return { label, provider };
}

/**
 * Localize the notice body. The category label is rendered separately via
 * noticeLabel(); this helper localizes the descriptive text for the
 * classified kinds, and keeps unclassified ("other") text verbatim since it
 * carries arbitrary provider details that cannot be translated.
 */
export function noticeText(notice: RunFailureNotice): string {
  switch (notice.kind) {
    case "billing": {
      const parsed = parseBillingLabel(notice.text);
      if (parsed) {
        // Use full-width parens in CJK locales for the provider label.
        const useCjkParens = i18n.getLocale().startsWith("zh");
        const localizedLabel = useCjkParens
          ? parsed.label.replace(/\s*\(([^)]+)\)$/, "（$1）")
          : parsed.label;
        return t("notice.billingText", {
          label: localizedLabel,
          provider: parsed.provider,
        });
      }
      return t("notice.billingTextGeneric");
    }
    case "timeout":
      return t("notice.timeoutText");
    case "rate_limit":
      return t("notice.rateLimitText");
    case "auth":
      return t("notice.authText");
    case "network":
      return t("notice.networkText");
    default:
      return notice.text;
  }
}

/**
 * The `notice` pill (structured, localized) and the raw `lastError` pill are
 * both fed by the same backend chat-run failure (the error event carries both
 * the chat `error` payload and the `notice` broadcast). Don't render the raw
 * text twice — suppress the `lastError` pill when a notice covers the same
 * failure (same text, or same classified kind).
 */
export function isLastErrorCoveredByNotice(
  lastError: string,
  lastErrorKind: string | null,
  notice: RunFailureNotice | null,
): boolean {
  if (!notice) {
    return false;
  }
  if (lastError === notice.text) {
    return true;
  }
  return lastErrorKind !== null && lastErrorKind === notice.kind;
}
