import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScriptYaml } from "../src/cli/loadScript";
import {
  buildRows,
  layoutCode,
  lineRangesToRows,
  normalizeCode,
  rowsForLine,
  segmentStarts,
  sliceTokens,
  type CodeToken,
} from "../src/components/codeLayout";
import { previewCodeScenes } from "../src/scenes/codeScenePreview";

/** A line of `n` characters with no spaces. */
const x = (n: number) => "x".repeat(n);

describe("layoutCode", () => {
  const base = { baseFontSize: 40, minFontSize: 34 };

  it("keeps the base size when the code fits", () => {
    const layout = layoutCode({ ...base, lines: [x(10), x(20)], width: 1000, height: 1000 });
    expect(layout.fontSize).toBe(40);
    expect(layout.totalRows).toBe(2);
    expect(layout.contentWidth).toBeCloseTo(20 * 24);
  });

  it("scales down long lines before wrapping", () => {
    // 50 chars at 40px is 1200px wide; fits 1100px at 36.67px.
    const layout = layoutCode({ ...base, lines: [x(50)], width: 1100, height: 1000 });
    expect(layout.fontSize).toBeCloseTo(1100 / 30);
    expect(layout.totalRows).toBe(1);
  });

  it("wraps once it reaches the minimum size, and never overflows", () => {
    const layout = layoutCode({ ...base, lines: [x(120), x(5)], width: 840, height: 1000 });
    expect(layout.fontSize).toBe(34);
    expect(layout.rowCounts[0]).toBeGreaterThan(1);
    expect(layout.cols * layout.charWidth).toBeLessThanOrEqual(840);
    expect(layout.contentWidth).toBeLessThanOrEqual(840);
    expect(layout.contentHeight).toBeLessThanOrEqual(1000);
  });

  it("shrinks further when the rows are too tall", () => {
    const lines = Array.from({ length: 40 }, () => x(20));
    const layout = layoutCode({ ...base, lines, width: 1000, height: 600 });
    expect(layout.fontSize).toBeLessThan(34);
    expect(layout.contentHeight).toBeLessThanOrEqual(600);
  });
});

describe("rowsForLine and segmentStarts", () => {
  it("hard-wraps lines with no spaces, indenting continuation rows", () => {
    expect(rowsForLine("", 10)).toBe(1);
    expect(rowsForLine(x(10), 10)).toBe(1);
    expect(rowsForLine(x(11), 10)).toBe(2);
    expect(rowsForLine(x(18), 10)).toBe(2); // 10 + 8
    expect(rowsForLine(x(19), 10)).toBe(3);
  });

  it("breaks after the last space that fits", () => {
    expect(segmentStarts("const value = items.length", 16)).toEqual([0, 14]);
  });

  it("does not break at a space too close to the row start", () => {
    expect(segmentStarts("a bcdefghijklmnop", 10)).toEqual([0, 10]);
  });
});

describe("lineRangesToRows", () => {
  it("maps source lines to the rows they occupy", () => {
    const layout = { rowStarts: [0, 1, 3], rowCounts: [1, 2, 1] };
    expect(lineRangesToRows([{ from: 2, to: 2 }], layout)).toEqual([{ from: 2, to: 3 }]);
    expect(lineRangesToRows([{ from: 1, to: 3 }], layout)).toEqual([{ from: 1, to: 4 }]);
  });
});

describe("sliceTokens and buildRows", () => {
  const line: CodeToken[] = [
    { content: "const", color: "#a" },
    { content: " x = ", color: "#b" },
    { content: "1;", color: "#c" },
  ];
  const text = (tokens: CodeToken[]) => tokens.map((t) => t.content).join("");

  it("slices across token boundaries and keeps colors", () => {
    expect(sliceTokens(line, 3, 8)).toEqual([
      { content: "st", color: "#a" },
      { content: " x ", color: "#b" },
    ]);
  });

  it("wraps long lines into rows", () => {
    const { rows } = buildRows([line], 6);
    expect(rows.map((r) => text(r.tokens))).toEqual(["const ", "x = ", "1;"]);
    const { rows: hard } = buildRows([[{ content: x(9) }]], 6);
    expect(hard.map((r) => text(r.tokens))).toEqual([x(6), x(3)]);
    expect(rows.map((r) => r.continuation)).toEqual([false, true, true]);
  });

  it("reveals characters across lines, counting newlines", () => {
    const lines = [[{ content: "ab" }], [{ content: "cd" }]];
    expect(buildRows(lines, 10, 1).rows.map((r) => text(r.tokens))).toEqual(["a", ""]);
    expect(buildRows(lines, 10, 3).rows.map((r) => text(r.tokens))).toEqual(["ab", ""]);
    expect(buildRows(lines, 10, 4).rows.map((r) => text(r.tokens))).toEqual(["ab", "c"]);
  });

  it("places the cursor after the last visible character", () => {
    const lines = [[{ content: "ab" }], [{ content: "cd" }]];
    expect(buildRows(lines, 10, 1).cursor).toEqual({ row: 0, col: 1 });
    expect(buildRows(lines, 10, 3).cursor).toEqual({ row: 1, col: 0 });
    expect(buildRows(lines, 10).cursor).toEqual({ row: 1, col: 2 });
    // Inside a wrapped row, after the hanging indent.
    expect(buildRows([line], 6, 8).cursor).toEqual({ row: 1, col: 4 });
  });
});

describe("CodeScene preview data", () => {
  it("matches the code scenes in scripts/example-usememo.yaml", () => {
    const yaml = readFileSync(join(__dirname, "..", "scripts", "example-usememo.yaml"), "utf8");
    const result = parseScriptYaml(yaml);
    if (!result.success) throw new Error(result.errors.join("\n"));
    const codeScenes = result.data.scenes.filter((s) => s.type === "code");
    expect([previewCodeScenes.highlight.scene, previewCodeScenes.typing.scene]).toEqual(
      codeScenes,
    );
  });

  it("normalizes trailing newlines away", () => {
    expect(normalizeCode("a\n\tb\n\n")).toBe("a\n  b");
  });
});
