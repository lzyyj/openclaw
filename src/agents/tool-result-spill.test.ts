import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { afterEach, describe, expect, it } from "vitest";
import { __testing, formatSpillIndex, spillToolResultDetails } from "./tool-result-spill.js";

const { sanitizeFragment } = __testing;

const tmpDirs: string[] = [];
function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-spill-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function toolResultMessage(overrides: Partial<Record<string, unknown>> = {}): AgentMessage {
  return {
    role: "toolResult",
    toolCallId: "call_abc123",
    toolName: "web_fetch",
    isError: false,
    content: [{ type: "text", text: "ok" }],
    timestamp: 1,
    ...overrides,
  } as unknown as AgentMessage;
}

describe("spillToolResultDetails", () => {
  it("spills oversized details to disk and replaces them with a locator", () => {
    const dir = makeTmpDir();
    const messages = [
      toolResultMessage({
        toolCallId: "call_1",
        toolName: "browser",
        details: { raw: "x".repeat(2000) },
      }),
    ];

    const result = spillToolResultDetails(messages, dir, { minInlineBytes: 512 });

    expect(result.spilledCount).toBe(1);
    expect(result.spilledFiles).toHaveLength(1);
    expect(result.spilledBytes).toBeGreaterThan(0);
    expect(fs.existsSync(result.spilledFiles[0])).toBe(true);

    const spilled = result.messages[0] as unknown as { details: Record<string, unknown> };
    expect(spilled.details).toMatchObject({ spilled: true, truncated: false });
    expect(typeof spilled.details.path).toBe("string");
  });

  it("keeps small details inline (does not spill)", () => {
    const dir = makeTmpDir();
    const messages = [toolResultMessage({ toolCallId: "call_2", details: { raw: "tiny" } })];

    const result = spillToolResultDetails(messages, dir, { minInlineBytes: 512 });

    expect(result.spilledCount).toBe(0);
    expect(result.spilledFiles).toHaveLength(0);
    expect(result.messages[0]).toBe(messages[0]);
  });

  it("truncates payloads over the per-file cap and annotates them", () => {
    const dir = makeTmpDir();
    const messages = [toolResultMessage({ toolCallId: "call_3", details: "z".repeat(2000) })];

    const result = spillToolResultDetails(messages, dir, {
      minInlineBytes: 0,
      maxBytesPerFile: 1024,
    });

    expect(result.spilledCount).toBe(1);
    const spilled = result.messages[0] as unknown as { details: { truncated: boolean } };
    expect(spilled.details.truncated).toBe(true);
    const onDisk = fs.readFileSync(result.spilledFiles[0], "utf8");
    expect(onDisk).toContain("truncated");
  });

  it("skips payloads once the total budget is exhausted", () => {
    const dir = makeTmpDir();
    const messages = [
      toolResultMessage({ toolCallId: "call_a", details: "a".repeat(1000) }),
      toolResultMessage({ toolCallId: "call_b", details: "b".repeat(1000) }),
    ];

    const result = spillToolResultDetails(messages, dir, {
      minInlineBytes: 0,
      maxTotalBytes: 1500,
    });

    expect(result.spilledCount).toBe(1);
    expect(result.skippedBytes).toBeGreaterThan(0);
    // The skipped message keeps its original (unspilled) details.
    expect(result.messages[1]).toBe(messages[1]);
  });

  it("passes through non-toolResult messages untouched", () => {
    const dir = makeTmpDir();
    const userMsg = { role: "user", content: "hi", timestamp: 0 } as unknown as AgentMessage;
    const result = spillToolResultDetails([userMsg], dir);
    expect(result.messages[0]).toBe(userMsg);
    expect(result.spilledCount).toBe(0);
  });

  it("creates the spill directory when missing", () => {
    const base = makeTmpDir();
    const nested = path.join(base, "nested", "spill");
    const messages = [toolResultMessage({ toolCallId: "call_4", details: "x".repeat(1000) })];
    const result = spillToolResultDetails(messages, nested, { minInlineBytes: 0 });
    expect(fs.existsSync(nested)).toBe(true);
    expect(fs.existsSync(result.spilledFiles[0])).toBe(true);
  });
});

describe("sanitizeFragment", () => {
  it("removes unsafe characters and collapses separators", () => {
    expect(sanitizeFragment("web_fetch")).toBe("web_fetch");
    expect(sanitizeFragment("../../etc/passwd")).toBe("etc_passwd");
    expect(sanitizeFragment("a b!c")).toBe("a_b_c");
    expect(sanitizeFragment("")).toBe("tool");
  });
});

describe("formatSpillIndex", () => {
  it("renders an empty string for no files", () => {
    expect(formatSpillIndex([])).toBe("");
  });

  it("renders a markdown list of paths", () => {
    const text = formatSpillIndex(["/a/b.txt", "/c/d.txt"]);
    expect(text).toContain("## Spilled Tool Details");
    expect(text).toContain("`/a/b.txt`");
    expect(text).toContain("`/c/d.txt`");
  });
});
