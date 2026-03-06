import { describe, expect, it } from "vitest";
import { inferDates, inferStatus } from "@/lib/import/url-prefill";

describe("url prefill parsing", () => {
  it("infers GROUP_BUY status from common keywords", () => {
    expect(inferStatus("This board is now live for Group Buy")).toBe("GROUP_BUY");
    expect(inferStatus("Pre-order starts soon")).toBe("GROUP_BUY");
  });

  it("falls back to INTEREST_CHECK when no clear signal", () => {
    expect(inferStatus("Interest check thread for a new keyset")).toBe("INTEREST_CHECK");
  });

  it("extracts first two ISO-like dates", () => {
    const parsed = inferDates("GB starts 2026-05-01 and closes 2026/05/20");
    expect(parsed.gbStartDate).toContain("2026-05-01");
    expect(parsed.gbEndDate).toContain("2026-05-20");
  });
});
