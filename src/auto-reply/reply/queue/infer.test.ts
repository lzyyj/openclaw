import { describe, expect, it } from "vitest";
import { inferQueueModeFromMessage } from "./infer.js";

describe("inferQueueModeFromMessage", () => {
  it("infers interrupt for urgent/stop phrasing (zh + en)", () => {
    expect(inferQueueModeFromMessage("立刻停止！")).toBe("interrupt");
    expect(inferQueueModeFromMessage("马上取消这个任务")).toBe("interrupt");
    expect(inferQueueModeFromMessage("别做了，重新来")).toBe("interrupt");
    expect(inferQueueModeFromMessage("stop now")).toBe("interrupt");
    expect(inferQueueModeFromMessage("abort everything")).toBe("interrupt");
    expect(inferQueueModeFromMessage("紧急！")).toBe("interrupt");
  });

  it("infers steer for short corrections/supplements", () => {
    expect(inferQueueModeFromMessage("补充：文件在D盘")).toBe("steer");
    expect(inferQueueModeFromMessage("改成红色")).toBe("steer");
    expect(inferQueueModeFromMessage("另外，注意格式")).toBe("steer");
    expect(inferQueueModeFromMessage("还有这个也加上")).toBe("steer");
    expect(inferQueueModeFromMessage("also add this")).toBe("steer");
  });

  it("returns undefined for neutral or new-task messages", () => {
    expect(inferQueueModeFromMessage("今天天气怎么样")).toBeUndefined();
    expect(
      inferQueueModeFromMessage(
        "帮我写一份完整的市场分析报告，需要包含数据对比和未来趋势预测，大约5000字",
      ),
    ).toBeUndefined();
    expect(inferQueueModeFromMessage("")).toBeUndefined();
    expect(inferQueueModeFromMessage("   ")).toBeUndefined();
  });

  it("avoids ambiguous single-char false positives", () => {
    expect(inferQueueModeFromMessage("再见")).toBeUndefined();
    expect(inferQueueModeFromMessage("好的再见")).toBeUndefined();
    expect(inferQueueModeFromMessage("再一次")).toBeUndefined();
    expect(inferQueueModeFromMessage("再三确认")).toBeUndefined();
  });
});
