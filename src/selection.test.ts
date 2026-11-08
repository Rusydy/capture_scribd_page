import { describe, expect, it } from "vitest";
import { parseSelection } from "./selection.ts";

describe("parseSelection", () => {
  it("selects one page, a prefix, a range, or the whole document", () => {
    expect(parseSelection([])).toEqual({ start: 1, end: 1 });
    expect(parseSelection(["--page", "3"])).toEqual({ start: 3, end: 3 });
    expect(parseSelection(["--to", "25"])).toEqual({ start: 1, end: 25 });
    expect(parseSelection(["--range", "9", "10"])).toEqual({
      start: 9,
      end: 10,
    });
    expect(parseSelection(["--all"])).toEqual({ start: 1 });
  });

  it("rejects an invalid or reversed range", () => {
    expect(() => parseSelection(["--page", "0"])).toThrow();
    expect(() => parseSelection(["--range", "10", "9"])).toThrow();
  });
});
