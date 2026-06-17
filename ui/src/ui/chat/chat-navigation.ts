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

export function buildNavEntries(items: Array<ChatItem | MessageGroup>): NavEntry[] {
  const entries: NavEntry[] = [];
  for (const item of items) {
    if (item.kind === "divider") {
      entries.push({
        key: item.key,
        role: "divider",
        label: item.label,
        excerpt: "",
        timestamp: item.timestamp,
      });
      continue;
    }

    if (item.kind === "reading-indicator" || item.kind === "stream") {
      continue;
    }

    if (item.kind === "message" || item.kind === "group") {
      const messages = item.kind === "group" ? item.messages : [{ message: item.message, key: item.key }];
      for (const msgObj of messages) {
        const m = msgObj.message as Record<string, unknown>;
        const role = (m.role as string) ?? "system";
        const content = (m.content as string) ?? "";
        const excerpt = String(content)
          .replace(/<[^>]*>/g, "")
          .slice(0, 80)
          .trim();
        const key = item.key;
        const timestamp = item.kind === "group"
          ? (item.timestamp as number)
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
        break; // only first message per group
      }
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
              class="chat-nav__item ${isActive ? "chat-nav__item--active" : ""}"
              data-nav-key=${entry.key}
              @click=${() => onJump(entry.key)}
              title=${entry.excerpt || entry.label}
            >
              <span class="chat-nav__role chat-nav__role--${entry.role}">
                ${entry.role === "user" || entry.role === "assistant"
                  ? icons.brain
                  : entry.role === "divider"
                    ? "—"
                    : "⚙"}
              </span>
              <span class="chat-nav__excerpt">${entry.excerpt || entry.label}</span>
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
