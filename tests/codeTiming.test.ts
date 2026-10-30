import { describe, expect, it } from "vitest";
import {
  activeHighlightStep,
  highlightFocus,
  typingEndFrame,
  visibleCharCount,
} from "../src/components/timing";

describe("activeHighlightStep", () => {
  it("spreads steps evenly across the duration", () => {
    // 90 frames, 3 steps: [0, 30), [30, 60), [60, 90)
    expect(activeHighlightStep(0, 90, 3)).toBe(0);
    expect(activeHighlightStep(29, 90, 3)).toBe(0);
    expect(activeHighlightStep(30, 90, 3)).toBe(1);
    expect(activeHighlightStep(59, 90, 3)).toBe(1);
    expect(activeHighlightStep(60, 90, 3)).toBe(2);
    expect(activeHighlightStep(89, 90, 3)).toBe(2);
  });

  it("handles durations that do not divide evenly", () => {
    // 100 frames, 3 steps: boundaries at 33.3 and 66.6
    expect(activeHighlightStep(33, 100, 3)).toBe(0);
    expect(activeHighlightStep(34, 100, 3)).toBe(1);
    expect(activeHighlightStep(66, 100, 3)).toBe(1);
    expect(activeHighlightStep(67, 100, 3)).toBe(2);
  });

  it("clamps frames outside the scene", () => {
    expect(activeHighlightStep(-5, 90, 3)).toBe(0);
    expect(activeHighlightStep(500, 90, 3)).toBe(2);
  });

  it("returns -1 with no steps and 0 with one", () => {
    expect(activeHighlightStep(10, 90, 0)).toBe(-1);
    expect(activeHighlightStep(80, 90, 1)).toBe(0);
  });
});

describe("highlightFocus", () => {
  const ranges = [
    { from: 2, to: 2 },
    { from: 4, to: 5 },
  ];

  it("starts on the whole code with no dimming", () => {
    expect(highlightFocus(0, 100, ranges, 6)).toEqual({
      step: 0,
      top: 0,
      bottom: 6,
      strength: 0,
    });
  });

  it("settles on each range after the transition", () => {
    expect(highlightFocus(20, 100, ranges, 6, 12)).toEqual({
      step: 0,
      top: 1,
      bottom: 2,
      strength: 1,
    });
    expect(highlightFocus(99, 100, ranges, 6, 12)).toEqual({
      step: 1,
      top: 3,
      bottom: 5,
      strength: 1,
    });
  });

  it("moves smoothly between ranges", () => {
    const mid = highlightFocus(56, 100, ranges, 6, 12);
    expect(mid.step).toBe(1);
    expect(mid.top).toBeGreaterThan(1);
    expect(mid.top).toBeLessThan(3);
    expect(mid.bottom).toBeGreaterThan(2);
    expect(mid.bottom).toBeLessThan(5);
    // Stays fully dimmed while moving between steps.
    expect(mid.strength).toBe(1);
  });

  it("never moves backwards within a step", () => {
    let last = -Infinity;
    for (let f = 50; f < 100; f++) {
      const { top } = highlightFocus(f, 100, ranges, 6, 12);
      expect(top).toBeGreaterThanOrEqual(last);
      last = top;
    }
  });
});

describe("visibleCharCount", () => {
  it("finishes typing at 60 percent of the scene", () => {
    expect(typingEndFrame(100)).toBe(60);
    expect(visibleCharCount(60, 120, 100)).toBe(120);
    expect(visibleCharCount(59, 120, 100)).toBeLessThan(120);
    expect(visibleCharCount(99, 120, 100)).toBe(120);
  });

  it("reveals characters linearly from zero", () => {
    expect(visibleCharCount(0, 120, 100)).toBe(0);
    expect(visibleCharCount(15, 120, 100)).toBe(30);
    expect(visibleCharCount(30, 120, 100)).toBe(60);
  });

  it("is monotonic and stays within bounds", () => {
    let last = 0;
    for (let f = -10; f < 120; f++) {
      const n = visibleCharCount(f, 77, 90);
      expect(n).toBeGreaterThanOrEqual(last);
      expect(n).toBeLessThanOrEqual(77);
      last = n;
    }
    expect(last).toBe(77);
  });

  it("accepts a custom finish point and empty code", () => {
    expect(visibleCharCount(50, 10, 100, 0.5)).toBe(10);
    expect(visibleCharCount(50, 0, 100)).toBe(0);
  });

  it("works for very short scenes", () => {
    expect(typingEndFrame(1)).toBe(1);
    expect(visibleCharCount(1, 40, 1)).toBe(40);
  });
});
