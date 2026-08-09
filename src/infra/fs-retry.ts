import fs from "node:fs";

/**
 * Transient filesystem error codes worth retrying.
 *
 * On Windows these are commonly produced when another process briefly holds an
 * exclusive handle on the file (editor, AV scanner, sync tool, backup agent).
 * The lock usually clears within milliseconds, so a short retry avoids failing
 * whole operations (config load, models.json sync, ...) over a hiccup.
 */
const TRANSIENT_ERROR_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);

export type FsRetryOptions = {
  /** Total attempts including the first try. Default: 3 */
  attempts?: number;
  /** Delay between attempts in ms. Default: 200 */
  delayMs?: number;
};

export const FS_RETRY_DEFAULT_ATTEMPTS = 3;
export const FS_RETRY_DEFAULT_DELAY_MS = 200;

function isTransientFsError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  return typeof code === "string" && TRANSIENT_ERROR_CODES.has(code);
}

function sleepSync(ms: number): void {
  // Blocking sleep for the synchronous retry path (config loading is sync).
  // Atomics.wait is the standard way to block the main thread in Node.
  const shared = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(shared, 0, 0, ms);
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Synchronous readFile with short retries for transient errors
 * (EPERM/EBUSY/EACCES). Non-transient errors are rethrown immediately.
 */
export function readFileSyncWithRetry(
  fsLike: Pick<typeof fs, "readFileSync">,
  file: string,
  encoding: BufferEncoding,
  options: FsRetryOptions = {},
): string {
  const attempts = options.attempts ?? FS_RETRY_DEFAULT_ATTEMPTS;
  const delayMs = options.delayMs ?? FS_RETRY_DEFAULT_DELAY_MS;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return fsLike.readFileSync(file, encoding);
    } catch (err) {
      lastError = err;
      if (!isTransientFsError(err) || attempt === attempts - 1) {
        throw err;
      }
      sleepSync(delayMs);
    }
  }
  throw lastError;
}

/** Async readFile with short retries for transient errors. */
export async function readFileWithRetry(
  fsLike: Pick<typeof fs.promises, "readFile">,
  file: string,
  encoding: BufferEncoding,
  options: FsRetryOptions = {},
): Promise<string> {
  const attempts = options.attempts ?? FS_RETRY_DEFAULT_ATTEMPTS;
  const delayMs = options.delayMs ?? FS_RETRY_DEFAULT_DELAY_MS;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fsLike.readFile(file, encoding);
    } catch (err) {
      lastError = err;
      if (!isTransientFsError(err) || attempt === attempts - 1) {
        throw err;
      }
      await sleep(delayMs);
    }
  }
  throw lastError;
}

/** Async writeFile with short retries for transient errors. */
export async function writeFileWithRetry(
  fsLike: Pick<typeof fs.promises, "writeFile">,
  file: string,
  data: string | Uint8Array,
  options: FsRetryOptions & { mode?: number } = {},
): Promise<void> {
  const attempts = options.attempts ?? FS_RETRY_DEFAULT_ATTEMPTS;
  const delayMs = options.delayMs ?? FS_RETRY_DEFAULT_DELAY_MS;
  const { mode } = options;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await fsLike.writeFile(file, data, mode !== undefined ? { mode } : undefined);
      return;
    } catch (err) {
      lastError = err;
      if (!isTransientFsError(err) || attempt === attempts - 1) {
        throw err;
      }
      await sleep(delayMs);
    }
  }
  throw lastError;
}
