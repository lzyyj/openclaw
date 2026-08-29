import fs from "node:fs";
import path from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";

/**
 * Tool result spill: preserve `toolResult.details` to disk during compaction
 * instead of discarding it.
 *
 * Rationale (mirrors the dsh spill-policy idea): a tool's `details` payload can
 * be large and is never meant for the model context (it may carry untrusted or
 * verbose output), so `stripToolResultDetails` strips it before summarization.
 * But dropping it outright loses the ability to debug what a tool actually
 * returned. Spilling writes the stripped details to the session's spill
 * directory and folds a locator into the compaction summary, so the full tool
 * output stays retrievable on disk without ever entering the model context.
 *
 * Security: filenames are derived only from the tool `toolCallId` (a UUID),
 * never from tool output, so no path-injection surface is introduced. Total
 * spill is bounded to prevent unbounded disk growth.
 */

export interface SpillLimits {
  /** Per-file cap, in bytes. Larger payloads are truncated and annotated. */
  maxBytesPerFile?: number;
  /** Total cap across one spill pass, in bytes. Excess is skipped and counted. */
  maxTotalBytes?: number;
  /** Serialized details at or below this many bytes are kept inline (not spilled). */
  minInlineBytes?: number;
}

export interface SpillResult {
  /** Messages with spilled `details` replaced by a small locator marker. */
  messages: AgentMessage[];
  /** Absolute paths of files written during this pass. */
  spilledFiles: string[];
  /** Number of tool results spilled to disk. */
  spilledCount: number;
  /** Bytes written to disk. */
  spilledBytes: number;
  /** Bytes skipped because the pass exceeded `maxTotalBytes`. */
  skippedBytes: number;
}

const DEFAULT_MAX_BYTES_PER_FILE = 512 * 1024; // 512 KB
const DEFAULT_MAX_TOTAL_BYTES = 4 * 1024 * 1024; // 4 MB
const DEFAULT_MIN_INLINE_BYTES = 512;

/** Sanitize a tool name into a safe filename fragment (letters, digits, dash, underscore). */
function sanitizeFragment(value: string): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned.slice(0, 64) || "tool";
}

/** Serialize an arbitrary `details` value to a stable text form. */
function serializeDetails(details: unknown): string {
  if (typeof details === "string") {
    return details;
  }
  if (details === null || details === undefined) {
    return String(details);
  }
  try {
    // details may contain cycles or BigInt; fall back to a safe form on failure.
    return JSON.stringify(details, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
  } catch {
    if (typeof details === "bigint" || typeof details === "symbol") {
      return details.toString();
    }
    if (typeof details === "function") {
      return details.name || "function";
    }
    return "[unserializable]";
  }
}

/**
 * Spill oversized `toolResult.details` to `spillDir`, replacing each spilled
 * `details` on the message with a compact locator so downstream token
 * estimation and summarization see a small marker instead of the full payload.
 *
 * @param messages - transcript messages to process (mutated copies are returned).
 * @param spillDir - directory to write spill files into (created if missing).
 * @param limits - optional size limits.
 * @returns the spill result; `messages` always has the same length and order as
 * the input (messages without a spillable `details` are passed through).
 */
export function spillToolResultDetails(
  messages: AgentMessage[],
  spillDir: string,
  limits: SpillLimits = {},
): SpillResult {
  const maxBytesPerFile = limits.maxBytesPerFile ?? DEFAULT_MAX_BYTES_PER_FILE;
  const maxTotalBytes = limits.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const minInlineBytes = limits.minInlineBytes ?? DEFAULT_MIN_INLINE_BYTES;

  const spilledFiles: string[] = [];
  let spilledCount = 0;
  let spilledBytes = 0;
  let skippedBytes = 0;
  let touched = false;

  const out: AgentMessage[] = [];
  fs.mkdirSync(spillDir, { recursive: true });

  for (const msg of messages) {
    if (
      !msg ||
      typeof msg !== "object" ||
      (msg as { role?: unknown }).role !== "toolResult" ||
      !("details" in msg)
    ) {
      out.push(msg);
      continue;
    }
    const record = msg as unknown as Record<string, unknown>;
    const details = record.details;
    const text = serializeDetails(details);
    const bytes = Buffer.byteLength(text, "utf8");

    // Small details are fine to keep inline; they were stripped anyway for
    // safety, so only persist ones large enough to matter for retrieval.
    if (bytes <= minInlineBytes) {
      out.push(msg);
      continue;
    }

    // Total budget exhausted: skip spilling this payload (recorded as skipped).
    if (spilledBytes + bytes > maxTotalBytes) {
      skippedBytes += bytes;
      out.push(msg);
      continue;
    }

    const toolCallId = typeof record.toolCallId === "string" ? record.toolCallId : "unknown";
    const toolName = typeof record.toolName === "string" ? record.toolName : "tool";
    const fileName = `tool-${sanitizeFragment(toolName)}-${toolCallId}.txt`;
    const filePath = path.join(spillDir, fileName);

    let written = text;
    let truncated = false;
    if (bytes > maxBytesPerFile) {
      const keep = Math.max(0, maxBytesPerFile - 64);
      written = `${text.slice(0, keep)}\n\n...[truncated: ${bytes} bytes total]...`;
      truncated = true;
    }

    fs.writeFileSync(filePath, written, "utf8");
    spilledFiles.push(filePath);
    spilledCount += 1;
    spilledBytes += truncated ? maxBytesPerFile : bytes;
    touched = true;

    // Replace details with a compact locator; stripToolResultDetails will later
    // drop it from the model-facing path, but the summary can surface the path.
    out.push({
      ...record,
      details: {
        spilled: true,
        path: filePath,
        bytes,
        truncated,
      },
    } as unknown as AgentMessage);
  }

  return {
    messages: touched ? out : messages,
    spilledFiles,
    spilledCount,
    spilledBytes,
    skippedBytes,
  };
}

/** Render the spill index as a compact markdown section for the summary tail. */
export function formatSpillIndex(spilledFiles: string[]): string {
  if (spilledFiles.length === 0) {
    return "";
  }
  const lines = spilledFiles.map((file) => `- \`${file}\``);
  return `\n\n## Spilled Tool Details\n${lines.join("\n")}`;
}

export const __testing = {
  sanitizeFragment,
  serializeDetails,
  DEFAULT_MAX_BYTES_PER_FILE,
  DEFAULT_MAX_TOTAL_BYTES,
  DEFAULT_MIN_INLINE_BYTES,
} as const;
