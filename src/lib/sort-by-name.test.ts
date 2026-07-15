import { describe, expect, it } from "vitest";
import { sortByNameCaseInsensitive } from "@/lib/sort-by-name";

describe("sortByNameCaseInsensitive", () => {
  it("sorts names without pushing lowercase entries after uppercase ones", () => {
    const items = sortByNameCaseInsensitive([
      { name: "ZFrontier" },
      { name: "iLumKB" },
      { name: "CandyKeys" },
    ]);

    expect(items.map((item) => item.name)).toEqual([
      "CandyKeys",
      "iLumKB",
      "ZFrontier",
    ]);
  });

  it("keeps a stable lexical fallback when names only differ by case", () => {
    const items = sortByNameCaseInsensitive([
      { name: "shark" },
      { name: "Shark" },
    ]);

    expect(items.map((item) => item.name)).toEqual(["shark", "Shark"]);
  });
});
