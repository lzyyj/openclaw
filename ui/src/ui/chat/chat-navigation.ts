import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import { icons } from "../icons.ts";
import type { ChatItem, MessageGroup } from "../types/chat-types.ts";
import { extractText } from "./message-extract.ts";

export type NavEntry = {
  key: string;
  role: "user" | "assistant" | "system" | "tool" | "divider";
  label: string;
  excerpt: string;
  timestamp: number;
};

/**
 * Build navigation entries — only real user speech, with a clean excerpt.
 *
 * Messages injected by the system (exec result echoes beginning with
 * "System: [...]") are excluded entirely. Concatenated messages
 * (user copied exec output then typed their own words) have the noise
 * stripped from the excerpt.
 */
export function buildNavEntries(items: Array<ChatItem | MessageGroup>): NavEntry[] {
  const entries: NavEntry[] = [];

  for (const item of items) {
    if (item.kind === "reading-indicator" || item.kind === "stream") {
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

      const role = (m.role as string) ?? "";
      // Only user messages
      if (role.toLowerCase() !== "user") {
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

      // Clean the excerpt — strip leading System: noise while keeping user words
      const excerpt = cleanExcerpt(trimmed);

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

export function renderChatNav(
  entries: NavEntry[],
  activeKey: string | null,
  onJump: (key: string) => void,
) {
  if (entries.length <= 1) {
    return nothing;
  }

  return html`
    <nav class="chat-nav" aria-label=${t("chat.navigation")}>
      <div class="chat-nav__header">${t("chat.navigation")}</div>
      <div class="chat-nav__list">
        ${entries.map((entry) => {
          const isActive = entry.key === activeKey;
          return html`
            <button
              class="chat-nav__item ${isActive ? "chat-nav__item--active" : ""} ${entry.role === "divider" ? "chat-nav__item--divider" : ""}"
              data-nav-key=${entry.key}
              @click=${() => onJump(entry.key)}
              title=${entry.excerpt || entry.label}
            >
              <span class="chat-nav__role chat-nav__role--${entry.role}">
                ${
                  entry.role === "divider"
                    ? "📦"
                    : entry.role === "user" || entry.role === "assistant"
                      ? (icons.brain ?? "💬")
                      : entry.role === "tool"
                        ? "🔧"
                        : "⚙"
                }
              </span>
              <span class="chat-nav__excerpt">${entry.role === "divider" ? t("chat.compacted") : entry.excerpt || entry.label}</span>
            </button>
          `;
        })}
      </div>
    </nav>
  `;
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
