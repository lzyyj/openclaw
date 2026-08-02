import type { QueueMode } from "./types.js";

/**
 * Heuristic inference of a per-message queue mode from the inbound message text.
 *
 * This is the "smart" middle layer: when the user has NOT explicitly chosen a
 * mode (no UI selector) and there is NO `/queue` directive, we try to guess the
 * most human-appropriate handling based on the message's apparent urgency and
 * whether it looks like a short steer/correction to the running task.
 *
 * It deliberately errs on the side of caution: we only return a concrete mode
 * when the signal is fairly unambiguous, otherwise `undefined` so the normal
 * session default (collect) applies.
 */

// Phrases that strongly signal "stop what you're doing / handle this now".
const INTERRUPT_MARKERS: ReadonlyArray<string> = [
  // Chinese
  "停",
  "停止",
  "停下",
  "立刻",
  "立即",
  "马上",
  "赶紧",
  "取消",
  "中止",
  "打断",
  "别做了",
  "不要做了",
  "先别",
  "别继续",
  "不要继续",
  "别管",
  "紧急",
  // English
  "stop",
  "abort",
  "cancel",
  "urgent",
  "immediately",
  "right now",
  "asap",
];

// Short correction / supplement signals that suggest steering the running task
// rather than queueing a brand-new one. Avoid single-character markers that are
// too ambiguous (e.g. "再" appears in "再见"/"再一次" which are not steers).
const STEER_MARKERS: ReadonlyArray<string> = [
  // Chinese
  "补充",
  "补充一下",
  "另外",
  "其实",
  "改成",
  "改为",
  "加上",
  "去掉",
  "忽略",
  "注意",
  "对了",
  "还有个",
  "顺便",
  "还有",
  // English
  "also",
  "plus",
  "instead",
  "actually",
  "change",
  "add",
  "remove",
  "note",
  "by the way",
  "btw",
  "follow",
];

const STEER_MAX_LENGTH = 40; // long messages are usually new tasks, not steers

function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Infer a queue mode for the given message text.
 *
 * @returns a concrete QueueMode when a confident signal exists, else undefined.
 */
export function inferQueueModeFromMessage(text: string): QueueMode | undefined {
  const normalized = normalize(text);
  if (!normalized) {
    return undefined;
  }

  // 1) Explicit interrupt / urgency → interrupt (most aggressive signal).
  if (INTERRUPT_MARKERS.some((m) => normalized.includes(m))) {
    return "interrupt";
  }

  // 2) Short steer/correction → steer.
  //    Only trust steer for short messages; long ones are usually new tasks.
  const isShort = normalized.length <= STEER_MAX_LENGTH;
  if (isShort && STEER_MARKERS.some((m) => normalized.includes(m))) {
    return "steer";
  }

  // 3) No confident signal → let the session default decide (collect).
  return undefined;
}
