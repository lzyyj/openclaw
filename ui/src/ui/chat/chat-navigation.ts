import { html, nothing } from "lit";
import { ref } from "lit/directives/ref.js";
import { t } from "../../i18n/index.ts";
import type { ChatItem, MessageGroup } from "../types/chat-types.ts";
import { extractText } from "./message-extract.ts";

export type NavEntry = {
  key: string;
  role: "user" | "assistant" | "tool" | "divider";
  label: string;
  excerpt: string;
  timestamp: number;
};

/**
 * Build scroll-mark entries for USER messages only — the user's own turns
 * act as position anchors in the thread. Assistant / tool / system messages
 * are deliberately excluded (they follow user turns anyway).
 *
 * Messages injected by the system (exec result echoes beginning with
 * "System: [...]") are excluded as pure noise.
 */
export function buildNavEntries(items: Array<ChatItem | MessageGroup>): NavEntry[] {
  const entries: NavEntry[] = [];

  for (const item of items) {
    if (item.kind === "reading-indicator" || item.kind === "stream" || item.kind === "divider") {
      continue;
    }

    if (item.kind === "message" || item.kind === "group") {
      const messages =
        item.kind === "group" ? item.messages : [{ message: item.message, key: item.key }];
      const firstMsg = messages[0];
      if (!firstMsg) {
        continue;
      }

      const m = firstMsg.message as Record<string, unknown> | undefined;
      if (!m) {
        continue;
      }

      const role = ((m.role as string) ?? "").toLowerCase();
      if (role !== "user") {
        continue;
      }

      // Get cleaned text for excerpt
      const text = extractText(m);
      if (!text) {
        continue;
      }
      const trimmed = text.trim();
      if (!trimmed) {
        continue;
      }

      // Skip system-injected exec echoes (pure noise, no user words)
      if (/^System:\s*\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(trimmed)) {
        continue;
      }

      const excerpt = cleanExcerpt(trimmed);
      if (!excerpt) {
        continue;
      }

      const key = item.key;
      const timestamp =
        item.kind === "group" ? item.timestamp : ((m.timestamp as number) ?? Date.now());

      entries.push({
        key,
        role: "user",
        label: t("chat.you"),
        excerpt,
        timestamp,
      });
    }
  }
  return entries;
}

/** Extract a readable excerpt, stripping exec-noise while preserving user speech. */
function cleanExcerpt(text: string): string {
  // Normalize
  const clean = text
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) {
    return "";
  }

  // If it has System: [timestamp] prefixes, strip them all.
  // The pattern: "System: [timestamp] Exec... :: output... [timestamp] user words"
  // Strategy: remove all System: [...] blocks and keep what remains.
  const cleaned = clean
    .replace(
      /System:\s*\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}[^\]]*\]\s*Exec\s+(?:failed|completed)\s*\([^)]*\)[^[]*/gi,
      "",
    )
    .replace(/\[\w+\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}[^\]]*\]\s*/g, "")
    .replace(/^\s*::\s*[-a-zA-Z0-9_,\s]+\s*/, "") // drop leading continuation noise
    .trim();

  if (cleaned.length > 0) {
    return cleaned.slice(0, 60);
  }

  // Fallback: first 60 chars
  return clean.slice(0, 60);
}

/**
 * Render a scrollbar position-mark track (VS Code overview-ruler style).
 * Each mark sits at the message's proportional position in the thread and
 * jumps to that message on click; hovering shows the excerpt tooltip.
 */
export function renderScrollMarks(
  entries: NavEntry[],
  activeKey: string | null,
  onJump: (key: string) => void,
) {
  if (entries.length <= 1) {
    return nothing;
  }

  return html`
    <div
      class="chat-scrollmarks"
      role="navigation"
      aria-label=${t("chat.navigation")}
      ${ref((el) => {
        if (el) {
          positionScrollMarks(el as HTMLElement, entries);
        }
      })}
    >
      ${entries.map((entry) => {
        const isActive = entry.key === activeKey;
        return html`
          <button
            class="chat-scrollmarks__mark chat-scrollmarks__mark--${entry.role} ${isActive ? "chat-scrollmarks__mark--active" : ""}"
            data-mark-key=${entry.key}
            data-excerpt=${entry.excerpt || entry.label}
            @click=${() => onJump(entry.key)}
            aria-label=${entry.excerpt || entry.label}
          ></button>
        `;
      })}
    </div>
  `;
}

/**
 * Position each mark at the message's proportional offset within the
 * scrollable thread (content-relative, so it behaves like a scrollbar track).
 * Re-runs on every render via the ref callback.
 */
function positionScrollMarks(marksEl: HTMLElement, entries: NavEntry[]): void {
  const threadEl = marksEl
    .closest<HTMLElement>(".chat-thread-container")
    ?.querySelector<HTMLElement>(".chat-thread");
  if (!threadEl) {
    return;
  }
  const scrollHeight = threadEl.scrollHeight;
  if (scrollHeight <= 0) {
    return;
  }

  const threadRect = threadEl.getBoundingClientRect();
  const markEls = marksEl.querySelectorAll<HTMLElement>("[data-mark-key]");

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const markEl = markEls[i];
    if (!markEl) {
      continue;
    }
    const msgEl = threadEl.querySelector<HTMLElement>(`[data-key="${CSS.escape(entry.key)}"]`);
    if (!msgEl) {
      continue;
    }
    const msgRect = msgEl.getBoundingClientRect();
    // Content-relative position: scrollTop + viewport offset, normalized.
    const top = ((threadEl.scrollTop + msgRect.top - threadRect.top) / scrollHeight) * 100;
    markEl.style.top = `${Math.max(0, Math.min(100, top))}%`;
  }
}

/**
 * Given the chat-thread element, find which message key is closest to the top
 * of the scrollable area. Returns the key or null.
 */
export function findVisibleKey(threadEl: HTMLElement | null): string | null {
  if (!threadEl) {
    return null;
  }

  const items = threadEl.querySelectorAll<HTMLElement>("[data-key]");
  if (items.length === 0) {
    return null;
  }

  const threadRect = threadEl.getBoundingClientRect();
  const viewTop = threadRect.top;

  let closestKey: string | null = null;
  let closestDist = Infinity;

  for (const el of items) {
    const rect = el.getBoundingClientRect();
    // Distance from the top of the viewport
    const dist = Math.abs(rect.top - viewTop);
    if (dist < closestDist) {
      closestDist = dist;
      closestKey = el.getAttribute("data-key");
    }
  }

  return closestKey;
}

/**
 * Scroll the chat-thread to bring an element with the given data-key into view.
 */
export function scrollToKey(threadEl: HTMLElement | null, key: string): void {
  if (!threadEl) {
    return;
  }

  const el = threadEl.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
