import { render } from "lit";
import { describe, expect, it } from "vitest";
import type { SessionsListResult } from "../types.ts";
import {
  filterSessionRows,
  renderSessions,
  sessionRowTitle,
  type SessionsProps,
} from "./sessions.ts";

function buildResult(session: SessionsListResult["sessions"][number]): SessionsListResult {
  return {
    ts: Date.now(),
    path: "(multiple)",
    count: 1,
    defaults: { model: null, contextTokens: null },
    sessions: [session],
  };
}

function buildProps(result: SessionsListResult): SessionsProps {
  return {
    loading: false,
    result,
    error: null,
    activeMinutes: "",
    limit: "120",
    includeGlobal: false,
    includeUnknown: false,
    includeArchived: false,
    basePath: "",
    onFiltersChange: () => undefined,
    onRefresh: () => undefined,
    onPatch: () => undefined,
    onDelete: () => undefined,
  };
}

describe("sessions view", () => {
  it("renders verbose=full without falling back to inherit", async () => {
    const container = document.createElement("div");
    render(
      renderSessions(
        buildProps(
          buildResult({
            key: "agent:main:main",
            kind: "direct",
            updatedAt: Date.now(),
            verboseLevel: "full",
          }),
        ),
      ),
      container,
    );
    await Promise.resolve();

    const selects = container.querySelectorAll("select");
    const verbose = selects[1] as HTMLSelectElement | undefined;
    expect(verbose?.value).toBe("full");
    expect(Array.from(verbose?.options ?? []).some((option) => option.value === "full")).toBe(true);
  });

  it("keeps unknown stored values selectable instead of forcing inherit", async () => {
    const container = document.createElement("div");
    render(
      renderSessions(
        buildProps(
          buildResult({
            key: "agent:main:main",
            kind: "direct",
            updatedAt: Date.now(),
            reasoningLevel: "custom-mode",
          }),
        ),
      ),
      container,
    );
    await Promise.resolve();

    const selects = container.querySelectorAll("select");
    const reasoning = selects[2] as HTMLSelectElement | undefined;
    expect(reasoning?.value).toBe("custom-mode");
    expect(
      Array.from(reasoning?.options ?? []).some((option) => option.value === "custom-mode"),
    ).toBe(true);
  });
});

describe("sessionRowTitle", () => {
  const base = { key: "agent:main:main", kind: "direct" as const, updatedAt: 0 };

  it("prefers the user label over derived titles", () => {
    expect(
      sessionRowTitle({
        ...base,
        label: "My label",
        derivedTitle: "Derived",
        displayName: "Group",
      }),
    ).toBe("My label");
  });

  it("falls back to the derived title (first user message)", () => {
    expect(sessionRowTitle({ ...base, derivedTitle: "Hello world", displayName: "Group" })).toBe(
      "Hello world",
    );
  });

  it("falls back to the group display name", () => {
    expect(sessionRowTitle({ ...base, displayName: "Dev Team Chat" })).toBe("Dev Team Chat");
  });

  it("falls back to the routing key", () => {
    expect(sessionRowTitle(base)).toBe("agent:main:main");
  });
});

describe("filterSessionRows", () => {
  const rows = [
    {
      key: "agent:main:main",
      kind: "direct" as const,
      updatedAt: 1,
      derivedTitle: "Fix the login flow",
    },
    {
      key: "agent:main:telegram:direct:123",
      kind: "direct" as const,
      updatedAt: 2,
      label: "Deploy notes",
    },
    {
      key: "agent:main:discord:group:g1",
      kind: "group" as const,
      updatedAt: 3,
      displayName: "g-engineering",
    },
  ];

  it("matches derived titles and labels case-insensitively", () => {
    expect(filterSessionRows(rows, "login")).toHaveLength(1);
    expect(filterSessionRows(rows, "deploy")).toHaveLength(1);
    expect(filterSessionRows(rows, "ENGINEERING")).toHaveLength(1);
  });

  it("matches routing keys", () => {
    expect(filterSessionRows(rows, "telegram")).toHaveLength(1);
    expect(filterSessionRows(rows, "g1")).toHaveLength(1);
  });

  it("returns all rows for an empty query", () => {
    expect(filterSessionRows(rows, "")).toHaveLength(3);
    expect(filterSessionRows(rows, "   ")).toHaveLength(3);
  });

  it("returns no rows when nothing matches", () => {
    expect(filterSessionRows(rows, "zzz-nothing")).toHaveLength(0);
  });
});

describe("sessions view stats", () => {
  it("renders turn and message counts in the row subtitle", async () => {
    const container = document.createElement("div");
    render(
      renderSessions(
        buildProps(
          buildResult({
            key: "agent:main:main",
            kind: "direct",
            updatedAt: Date.now(),
            derivedTitle: "Fix login",
            stats: { turns: 3, messages: 12, toolCalls: 4, wallMs: 60_000 },
          }),
        ),
      ),
      container,
    );
    await Promise.resolve();

    const cell = container.querySelector(".session-key-cell");
    expect(cell?.textContent).toContain("3 turns");
    expect(cell?.textContent).toContain("12 messages");
  });

  it("omits the stats line when stats are absent", async () => {
    const container = document.createElement("div");
    render(
      renderSessions(
        buildProps(
          buildResult({
            key: "agent:main:main",
            kind: "direct",
            updatedAt: Date.now(),
          }),
        ),
      ),
      container,
    );
    await Promise.resolve();

    const cell = container.querySelector(".session-key-cell");
    expect(cell?.textContent).not.toContain("turns");
  });
});
