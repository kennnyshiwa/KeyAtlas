import { describe, expect, it, vi } from "vitest";
import {
  getProjectDesignerDisplay,
  normalizeDesignerName,
  resolveDesignerIdByName,
} from "@/lib/designer-profiles";

describe("normalizeDesignerName", () => {
  it("trims populated names", () => {
    expect(normalizeDesignerName("  Shark  ")).toBe("Shark");
  });

  it("collapses blank names to null", () => {
    expect(normalizeDesignerName("   ")).toBeNull();
    expect(normalizeDesignerName(null)).toBeNull();
  });
});

describe("resolveDesignerIdByName", () => {
  it("does a case-insensitive exact lookup for non-empty names", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "designer_123" });

    await expect(
      resolveDesignerIdByName(
        { designer: { findFirst } },
        "  shark "
      )
    ).resolves.toBe("designer_123");

    expect(findFirst).toHaveBeenCalledWith({
      where: { name: { equals: "shark", mode: "insensitive" } },
      select: { id: true },
    });
  });

  it("skips lookups for blank names", async () => {
    const findFirst = vi.fn();

    await expect(
      resolveDesignerIdByName(
        { designer: { findFirst } },
        "   "
      )
    ).resolves.toBeNull();

    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe("getProjectDesignerDisplay", () => {
  it("uses the linked profile when it matches the project designer name", () => {
    expect(
      getProjectDesignerDisplay({
        designer: "Shark",
        designerProfile: { name: "Shark", slug: "shark" },
      })
    ).toEqual({ name: "Shark", slug: "shark" });
  });

  it("prefers the raw project designer when the linked profile is stale", () => {
    expect(
      getProjectDesignerDisplay({
        designer: "Shark",
        designerProfile: { name: "Bord Designs", slug: "bord-designs" },
      })
    ).toEqual({ name: "Shark", slug: null });
  });

  it("falls back to the linked profile when no raw designer is stored", () => {
    expect(
      getProjectDesignerDisplay({
        designer: null,
        designerProfile: { name: "Shark", slug: "shark" },
      })
    ).toEqual({ name: "Shark", slug: "shark" });
  });
});
