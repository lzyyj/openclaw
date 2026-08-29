import { afterEach, describe, expect, it, vi } from "vitest";
import {
  archiveSession,
  archiveSessionAndRefresh,
  deleteSession,
  deleteSessionAndRefresh,
  loadSessions,
  patchSession,
  restoreSession,
  restoreSessionAndRefresh,
  type SessionsState,
} from "./sessions.ts";

type RequestFn = (method: string, params?: unknown) => Promise<unknown>;

function createState(request: RequestFn, overrides: Partial<SessionsState> = {}): SessionsState {
  return {
    client: { request } as unknown as SessionsState["client"],
    connected: true,
    sessionsLoading: false,
    sessionsResult: null,
    sessionsError: null,
    sessionsFilterActive: "0",
    sessionsFilterLimit: "0",
    sessionsIncludeGlobal: true,
    sessionsIncludeUnknown: true,
    sessionsIncludeArchived: false,
    sessionsFilterQuery: "",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("deleteSessionAndRefresh", () => {
  it("refreshes sessions after a successful delete", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "sessions.delete") {
        return { ok: true };
      }
      if (method === "sessions.list") {
        return undefined;
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = createState(request);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const deleted = await deleteSessionAndRefresh(state, "agent:main:test");

    expect(deleted).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenNthCalledWith(1, "sessions.delete", {
      key: "agent:main:test",
      deleteTranscript: true,
    });
    expect(request).toHaveBeenNthCalledWith(2, "sessions.list", {
      includeGlobal: true,
      includeUnknown: true,
      includeArchived: false,
      includeDerivedTitles: true,
    });
    expect(state.sessionsError).toBeNull();
    expect(state.sessionsLoading).toBe(false);
  });

  it("does not refresh sessions when user cancels delete", async () => {
    const request = vi.fn(async () => undefined);
    const state = createState(request, { sessionsError: "existing error" });
    vi.spyOn(window, "confirm").mockReturnValue(false);

    const deleted = await deleteSessionAndRefresh(state, "agent:main:test");

    expect(deleted).toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect(state.sessionsError).toBe("existing error");
    expect(state.sessionsLoading).toBe(false);
  });

  it("does not refresh sessions when delete fails and preserves the delete error", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "sessions.delete") {
        throw new Error("delete boom");
      }
      if (method === "sessions.list") {
        return undefined;
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = createState(request);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const deleted = await deleteSessionAndRefresh(state, "agent:main:test");

    expect(deleted).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("sessions.delete", {
      key: "agent:main:test",
      deleteTranscript: true,
    });
    expect(state.sessionsError).toContain("delete boom");
    expect(state.sessionsLoading).toBe(false);
  });
});

describe("deleteSession", () => {
  it("returns false when already loading", async () => {
    const request = vi.fn(async () => undefined);
    const state = createState(request, { sessionsLoading: true });

    const deleted = await deleteSession(state, "agent:main:test");

    expect(deleted).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("loadSessions", () => {
  it("requests archived sessions only when includeArchived is on", async () => {
    const request = vi.fn(async () => undefined);
    const state = createState(request, { sessionsIncludeArchived: true });

    await loadSessions(state);

    expect(request).toHaveBeenCalledWith("sessions.list", {
      includeGlobal: true,
      includeUnknown: true,
      includeArchived: true,
      includeDerivedTitles: true,
    });
  });

  it("omits includeStats unless explicitly requested", async () => {
    const request = vi.fn(async () => undefined);
    const state = createState(request);

    await loadSessions(state);

    expect(request).toHaveBeenCalledWith("sessions.list", {
      includeGlobal: true,
      includeUnknown: true,
      includeArchived: false,
      includeDerivedTitles: true,
    });
  });

  it("passes includeStats when the sessions page opts in", async () => {
    const request = vi.fn(async () => undefined);
    const state = createState(request);

    await loadSessions(state, { includeStats: true });

    expect(request).toHaveBeenCalledWith("sessions.list", {
      includeGlobal: true,
      includeUnknown: true,
      includeArchived: false,
      includeDerivedTitles: true,
      includeStats: true,
    });
  });
});

describe("archiveSession", () => {
  it("archives the session", async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const state = createState(request);

    const archived = await archiveSession(state, "agent:main:old");

    expect(archived).toBe(true);
    expect(request).toHaveBeenCalledWith("sessions.archive", { key: "agent:main:old" });
    expect(state.sessionsLoading).toBe(false);
  });

  it("returns false when already loading", async () => {
    const request = vi.fn();
    const state = createState(request, { sessionsLoading: true });

    const archived = await archiveSession(state, "agent:main:old");

    expect(archived).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("archiveSessionAndRefresh", () => {
  it("archives and refreshes the session list", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "sessions.archive") {
        return { ok: true };
      }
      if (method === "sessions.list") {
        return undefined;
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = createState(request);

    const archived = await archiveSessionAndRefresh(state, "agent:main:old");

    expect(archived).toBe(true);
    expect(request).toHaveBeenNthCalledWith(1, "sessions.archive", { key: "agent:main:old" });
    expect(request).toHaveBeenNthCalledWith(2, "sessions.list", expect.any(Object));
    expect(state.sessionsLoading).toBe(false);
  });
});

describe("restoreSession", () => {
  it("restores the session", async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const state = createState(request);

    const restored = await restoreSession(state, "agent:main:old");

    expect(restored).toBe(true);
    expect(request).toHaveBeenCalledWith("sessions.restore", { key: "agent:main:old" });
    expect(state.sessionsLoading).toBe(false);
  });
});

describe("restoreSessionAndRefresh", () => {
  it("restores and refreshes the session list", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "sessions.restore") {
        return { ok: true };
      }
      if (method === "sessions.list") {
        return undefined;
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = createState(request);

    const restored = await restoreSessionAndRefresh(state, "agent:main:old");

    expect(restored).toBe(true);
    expect(request).toHaveBeenNthCalledWith(1, "sessions.restore", { key: "agent:main:old" });
    expect(request).toHaveBeenNthCalledWith(2, "sessions.list", expect.any(Object));
    expect(state.sessionsLoading).toBe(false);
  });
});

describe("patchSession", () => {
  it("sends the pinned flag when provided", async () => {
    const request = vi.fn(async () => undefined);
    const state = createState(request);

    await patchSession(state, "agent:main:main", { pinned: true });

    expect(request).toHaveBeenCalledWith("sessions.patch", {
      key: "agent:main:main",
      pinned: true,
    });
  });

  it("sends pinned:false to unpin", async () => {
    const request = vi.fn(async () => undefined);
    const state = createState(request);

    await patchSession(state, "agent:main:main", { pinned: false });

    expect(request).toHaveBeenCalledWith("sessions.patch", {
      key: "agent:main:main",
      pinned: false,
    });
  });
});
