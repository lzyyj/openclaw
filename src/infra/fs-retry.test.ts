import { describe, expect, it, vi } from "vitest";
import {
  readFileSyncWithRetry,
  writeFileWithRetry,
  FS_RETRY_DEFAULT_ATTEMPTS,
} from "./fs-retry.js";

function makeErr(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: operation not permitted`), { code });
}

describe("fs-retry", () => {
  it("readFileSyncWithRetry retries transient errors and succeeds", () => {
    const readFileSync = vi
      .fn<string, [string, BufferEncoding]>()
      .mockImplementationOnce(() => {
        throw makeErr("EPERM");
      })
      .mockImplementationOnce(() => "ok");
    const result = readFileSyncWithRetry({ readFileSync } as never, "p", "utf-8");
    expect(result).toBe("ok");
    expect(readFileSync).toHaveBeenCalledTimes(2);
  });

  it("readFileSyncWithRetry throws after exhausting attempts", () => {
    const readFileSync = vi.fn(() => {
      throw makeErr("EBUSY");
    });
    expect(() => readFileSyncWithRetry({ readFileSync } as never, "p", "utf-8")).toThrow("EBUSY");
    expect(readFileSync).toHaveBeenCalledTimes(FS_RETRY_DEFAULT_ATTEMPTS);
  });

  it("readFileSyncWithRetry rethrows non-transient errors immediately", () => {
    const readFileSync = vi.fn(() => {
      throw makeErr("ENOENT");
    });
    expect(() => readFileSyncWithRetry({ readFileSync } as never, "p", "utf-8")).toThrow("ENOENT");
    expect(readFileSync).toHaveBeenCalledTimes(1);
  });

  it("writeFileWithRetry retries transient errors and succeeds", async () => {
    const writeFile = vi
      .fn()
      .mockRejectedValueOnce(makeErr("EACCES"))
      .mockResolvedValueOnce(undefined);
    await writeFileWithRetry({ writeFile } as never, "p", "data");
    expect(writeFile).toHaveBeenCalledTimes(2);
  });

  it("writeFileWithRetry honors custom attempts and delay", async () => {
    const writeFile = vi.fn().mockRejectedValue(makeErr("EPERM"));
    await expect(
      writeFileWithRetry({ writeFile } as never, "p", "data", {
        attempts: 2,
        delayMs: 1,
      }),
    ).rejects.toThrow("EPERM");
    expect(writeFile).toHaveBeenCalledTimes(2);
  });
});
