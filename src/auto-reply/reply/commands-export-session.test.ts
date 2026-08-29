import { describe, expect, it } from "vitest";
import { parseExportArgs } from "./commands-export-session.js";

describe("parseExportArgs", () => {
  it("defaults to html with no args", () => {
    expect(parseExportArgs("/export")).toEqual({});
    expect(parseExportArgs("/export-session")).toEqual({});
  });

  it("parses a positional output path", () => {
    expect(parseExportArgs("/export out/export.html")).toEqual({
      outputPath: "out/export.html",
    });
  });

  it("parses a positional format", () => {
    expect(parseExportArgs("/export json")).toEqual({ format: "json" });
    expect(parseExportArgs("/export jsonl")).toEqual({ format: "jsonl" });
    expect(parseExportArgs("/export html")).toEqual({ format: "html" });
  });

  it("parses --format=value", () => {
    expect(parseExportArgs("/export --format=jsonl out.jsonl")).toEqual({
      outputPath: "out.jsonl",
      format: "jsonl",
    });
    expect(parseExportArgs("/export --format=html")).toEqual({ format: "html" });
  });

  it("parses --format value with a path", () => {
    expect(parseExportArgs("/export --format json out.json")).toEqual({
      outputPath: "out.json",
      format: "json",
    });
  });

  it("ignores an unknown format value and falls back to html", () => {
    expect(parseExportArgs("/export --format=pdf out")).toEqual({
      outputPath: "out",
      format: undefined,
    });
  });
});
