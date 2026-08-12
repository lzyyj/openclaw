import { beforeAll, describe, expect, it } from "vitest";
import { i18n } from "../i18n/index.ts";
import type { RunFailureNotice } from "./app-gateway.ts";
import { isLastErrorCoveredByNotice, noticeText, parseBillingLabel } from "./notice-text.ts";

function notice(
  overrides: Partial<RunFailureNotice> & { kind: RunFailureNotice["kind"] },
): RunFailureNotice {
  return { text: "", ts: 0, sessionKey: "main", ...overrides };
}

beforeAll(async () => {
  await i18n.setLocale("zh-CN");
});

/* ================================================================
 *  parseBillingLabel – backend billing error shape → label/provider
 * ================================================================ */

describe("parseBillingLabel", () => {
  const billingText =
    "⚠️ deepseek (deepseek-v4-flash) returned a billing error — your API key has run out of credits or has an insufficient balance. Check your deepseek billing dashboard and top up or switch to a different API key.";

  it("extracts provider label and provider name", () => {
    expect(parseBillingLabel(billingText)).toEqual({
      label: "deepseek (deepseek-v4-flash)",
      provider: "deepseek",
    });
  });

  it("handles a provider without a model", () => {
    expect(
      parseBillingLabel(
        "⚠️ openai returned a billing error — your API key has run out of credits.",
      ),
    ).toEqual({ label: "openai", provider: "openai" });
  });

  it("returns null for the generic (provider-less) billing shape", () => {
    expect(
      parseBillingLabel(
        "⚠️ API provider returned a billing error — your API key has run out of credits.",
      ),
    ).toBeNull();
  });

  it("returns null for unrelated text", () => {
    expect(parseBillingLabel("context window exceeded")).toBeNull();
    expect(parseBillingLabel("")).toBeNull();
  });
});

/* ================================================================
 *  noticeText – localized notice body per kind
 * ================================================================ */

describe("noticeText (zh-CN)", () => {
  it("localizes billing notices and keeps the provider/model label", () => {
    const result = noticeText(
      notice({
        kind: "billing",
        text: "⚠️ deepseek (deepseek-v4-flash) returned a billing error — your API key has run out of credits.",
      }),
    );
    expect(result).toContain("deepseek（deepseek-v4-flash）");
    expect(result).toContain("返回计费错误");
    expect(result).toContain("API Key 余额不足或已用完");
    expect(result).not.toContain("returned a billing error");
  });

  it("falls back to a generic Chinese billing message when the shape is unknown", () => {
    const result = noticeText(notice({ kind: "billing", text: "402 payment required" }));
    expect(result).toContain("计费错误");
    expect(result).toContain("充值");
  });

  it("localizes timeout / rate_limit / auth / network kinds", () => {
    expect(noticeText(notice({ kind: "timeout", text: "LLM request timed out." }))).toContain(
      "请求超时",
    );
    expect(noticeText(notice({ kind: "rate_limit", text: "429 too many requests" }))).toContain(
      "请求频率受限",
    );
    expect(noticeText(notice({ kind: "auth", text: "401 unauthorized" }))).toContain("认证失败");
    expect(noticeText(notice({ kind: "network", text: "fetch failed" }))).toContain("网络连接失败");
  });

  it("keeps unclassified ('other') text verbatim", () => {
    const raw = "some provider-specific detail";
    expect(noticeText(notice({ kind: "other", text: raw }))).toBe(raw);
  });
});

describe("noticeText (en)", () => {
  beforeAll(async () => {
    await i18n.setLocale("en");
  });

  it("renders English billing text with the original label shape", () => {
    const result = noticeText(
      notice({
        kind: "billing",
        text: "⚠️ deepseek (deepseek-v4-flash) returned a billing error — your API key has run out of credits.",
      }),
    );
    expect(result).toContain("deepseek (deepseek-v4-flash)");
    expect(result).toContain("returned a billing error");
  });

  it("renders generic English billing text when the shape is unknown", () => {
    expect(noticeText(notice({ kind: "billing", text: "402 payment required" }))).toContain(
      "API provider returned a billing error",
    );
  });
});

/* ================================================================
 *  isLastErrorCoveredByNotice – dedup raw lastError pill vs notice
 * ================================================================ */

describe("isLastErrorCoveredByNotice", () => {
  const n = notice({
    kind: "billing",
    text: "⚠️ deepseek (deepseek-v4-flash) returned a billing error — out of credits.",
  });

  it("suppresses lastError when its text matches the notice text", () => {
    expect(isLastErrorCoveredByNotice(n.text, "billing", n)).toBe(true);
  });

  it("suppresses lastError when its kind matches the notice kind", () => {
    expect(isLastErrorCoveredByNotice("another billing-shaped message", "billing", n)).toBe(true);
  });

  it("keeps lastError when no notice is present", () => {
    expect(isLastErrorCoveredByNotice(n.text, "billing", null)).toBe(false);
  });

  it("keeps lastError when it is a different kind from the notice", () => {
    expect(isLastErrorCoveredByNotice("fetch failed", "network", n)).toBe(false);
  });

  it("keeps lastError when the notice kind is unknown but text differs", () => {
    const other = notice({ kind: "other", text: "unrelated" });
    expect(isLastErrorCoveredByNotice("something else", null, other)).toBe(false);
  });
});
