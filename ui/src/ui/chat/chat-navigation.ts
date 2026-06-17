import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import { icons } from "../icons.ts";
import type { ChatItem, MessageGroup } from "../types/chat-types.ts";

export type NavEntry = {
  key: string;
  role: "user" | "assistant" | "system" | "tool" | "divider";
  label: string;
  excerpt: string;
  timestamp: number;
};

/** Extract readable text from a NormalizedMessage or unknown message object */
function extractMessageText(msg: unknown): string {
  if (!msg) return "";
  const m = msg as Record<string, unknown>;
  // NormalizedMessage has content: MessageContentItem[]
  const content = m.content;
  if (Array.isArray(content)) {
    return content
      .map((item: Record<string, unknown>) => {
        if (item.type === "text" && typeof item.text === "string") return item.text;
        if (item.type === "tool_call" && typeof item.name === "string") return `🔧 ${item.name}`;
        if (item.type === "tool_result" && typeof item.text === "string") return `📎 ${item.text}`;
        return "";
      })
      .filter(Boolean)
      .join(" | ");
  }
  // Plain string
  if (typeof content === "string") return content;
  return "";
}

export function buildNavEntries(items: Array<ChatItem | MessageGroup>): NavEntry[] {
  const entries: NavEntry[] = [];

  // Track consecutive user/assistant to skip assistant follow-ups (only first message per group)
  for (const item of items) {
    // Skip transient items
    if (item.kind === "reading-indicator" || item.kind === "stream") continue;

    if (item.kind === "divider") {
      entries.push({
        key: item.key,
        role: "divider",
        label: item.label || "compacted",
        excerpt: "",
        timestamp: item.timestamp,
      });
      continue;
    }

    if (item.kind === "message" || item.kind === "group") {
      const messages = item.kind === "group"
        ? item.messages
        : [{ message: item.message, key: item.key }];
      const firstMsg = messages[0];
      if (!firstMsg) continue;

      const m = firstMsg.message as Record<string, unknown> | undefined;
      if (!m) continue;

      const role = (m.role as string) ?? "system";
      const rawText = extractMessageText(m);
      // Clean up HTML tags
      const excerpt = rawText
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .slice(0, 60)
        .trim();

      const key = item.key;
      const timestamp = item.kind === "group"
        ? item.timestamp
        : ((m.timestamp as number) ?? Date.now());

      entries.push({
        key,
        role: role as NavEntry["role"],
        label:
          role === "user"
            ? t("chat.you")
            : role === "assistant"
              ? t("chat.assistant")
              : role === "system"
                ? "System"
                : t("chat.tool"),
        excerpt,
        timestamp,
      });
    }
  }
  return entries;
}

export function renderChatNav(
  entries: NavEntry[],
  activeKey: string | null,
  onJump: (key: string) => void,
) {
  if (entries.length <= 1) return nothing;

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
                ${entry.role === "divider" ? "📦"
                  : entry.role === "user" || entry.role === "assistant"
                    ? icons.brain ?? "💬"
                    : entry.role === "tool" ? "🔧" : "⚙"}
              </span>
              <span class="chat-nav__excerpt">${entry.role === "divider" ? t("chat.compacted") : (entry.excerpt || entry.label)}</span>
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
  if (!threadEl) return null;

  const items = threadEl.querySelectorAll<HTMLElement>("[data-key]");
  if (items.length === 0) return null;

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
  if (!threadEl) return;

  const el = threadEl.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
