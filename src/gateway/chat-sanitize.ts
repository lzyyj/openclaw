import { stripInboundMetadata } from "../auto-reply/reply/strip-inbound-meta.js";
import { stripEnvelope, stripMessageIdHints } from "../shared/chat-envelope.js";

export { stripEnvelope };

/**
 * Strips the leading `System: [timestamp] ...` event block that
 * `prependSystemEvents` (auto-reply/reply/session-updates.ts) prepends to the
 * next stored user message so the agent can see exec completion / cron /
 * maintenance notifications. Those events are AI-facing only and must never
 * surface in user-visible chat history.
 *
 * Block shape (one event per line, followed by a blank line before the actual
 * user message):
 *   System: [2026-08-10 14:32:35 GMT+8] Exec failed (abc12345, code 1) :: ...
 *   System: [2026-08-10 14:36:58 GMT+8] Exec failed (def67890, code 1) :: ...
 *
 *   [Mon 2026-08-10 15:05 GMT+8] 如何了
 */
const SYSTEM_EVENT_PREFIX_RE = /^(?:System: \[[^\]]*\][^\n]*\n?)+\n*/;

/**
 * Strips the `[Mon 2026-08-10 15:05 GMT+8] ` timestamp prefix injected by
 * `injectTimestamp` (gateway/server-methods/agent-timestamp.ts) into the agent
 * body of user messages for date/time awareness. AI-facing only.
 */
const INJECTED_TIMESTAMP_PREFIX_RE = /^\[[A-Za-z]{3} \d{4}-\d{2}-\d{2} \d{2}:\d{2} [^\]]+\]\s*/;

export function stripSystemEventPrefix(text: string): string {
  return text.replace(SYSTEM_EVENT_PREFIX_RE, "");
}

export function stripInjectedTimestamp(text: string): string {
  return text.replace(INJECTED_TIMESTAMP_PREFIX_RE, "");
}

function stripEnvelopeFromContentWithRole(
  content: unknown[],
  stripUserEnvelope: boolean,
): { content: unknown[]; changed: boolean } {
  let changed = false;
  const next = content.map((item) => {
    if (!item || typeof item !== "object") {
      return item;
    }
    const entry = item as Record<string, unknown>;
    if (entry.type !== "text" || typeof entry.text !== "string") {
      return item;
    }
    const inboundStripped = stripInboundMetadata(entry.text);
    const stripped = stripUserEnvelope
      ? stripMessageIdHints(
          stripInjectedTimestamp(stripSystemEventPrefix(stripEnvelope(inboundStripped))),
        )
      : inboundStripped;
    if (stripped === entry.text) {
      return item;
    }
    changed = true;
    return {
      ...entry,
      text: stripped,
    };
  });
  return { content: next, changed };
}

export function stripEnvelopeFromMessage(message: unknown): unknown {
  if (!message || typeof message !== "object") {
    return message;
  }
  const entry = message as Record<string, unknown>;
  const role = typeof entry.role === "string" ? entry.role.toLowerCase() : "";
  const stripUserEnvelope = role === "user";

  let changed = false;
  const next: Record<string, unknown> = { ...entry };

  if (typeof entry.content === "string") {
    const inboundStripped = stripInboundMetadata(entry.content);
    const stripped = stripUserEnvelope
      ? stripMessageIdHints(
          stripInjectedTimestamp(stripSystemEventPrefix(stripEnvelope(inboundStripped))),
        )
      : inboundStripped;
    if (stripped !== entry.content) {
      next.content = stripped;
      changed = true;
    }
  } else if (Array.isArray(entry.content)) {
    const updated = stripEnvelopeFromContentWithRole(entry.content, stripUserEnvelope);
    if (updated.changed) {
      next.content = updated.content;
      changed = true;
    }
  } else if (typeof entry.text === "string") {
    const inboundStripped = stripInboundMetadata(entry.text);
    const stripped = stripUserEnvelope
      ? stripMessageIdHints(
          stripInjectedTimestamp(stripSystemEventPrefix(stripEnvelope(inboundStripped))),
        )
      : inboundStripped;
    if (stripped !== entry.text) {
      next.text = stripped;
      changed = true;
    }
  }

  return changed ? next : message;
}

export function stripEnvelopeFromMessages(messages: unknown[]): unknown[] {
  if (messages.length === 0) {
    return messages;
  }
  let changed = false;
  const next = messages.map((message) => {
    const stripped = stripEnvelopeFromMessage(message);
    if (stripped !== message) {
      changed = true;
    }
    return stripped;
  });
  return changed ? next : messages;
}
