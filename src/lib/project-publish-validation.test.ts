import { describe, expect, it } from "vitest";
import { getProjectPublishValidationErrors } from "@/lib/project-publish-validation";

describe("getProjectPublishValidationErrors", () => {
  const baseProject = {
    title: "KKB Cross Impact",
    slug: "kkb-cross-impact",
    description: "<p>Live now.</p>",
    heroImage: "https://example.com/hero.jpg",
    status: "GROUP_BUY" as const,
    gbStartDate: new Date("2026-08-12"),
    projectVendors: [{ vendorId: "vendor_1", region: "", storeLink: "" }],
  };

  it("allows publishing a group buy without a gb end date", () => {
    expect(getProjectPublishValidationErrors(baseProject)).toEqual([]);
  });

  it("still requires a gb start date for group buys", () => {
    expect(
      getProjectPublishValidationErrors({
        ...baseProject,
        gbStartDate: null,
      })
    ).toContainEqual({
      id: "gbStartDate",
      message: "GB start date is required for Group Buy",
    });
  });

  it("still requires at least one vendor for group buys", () => {
    expect(
      getProjectPublishValidationErrors({
        ...baseProject,
        projectVendors: [],
      })
    ).toContainEqual({
      id: "vendors",
      message: "At least one vendor is required for Group Buy",
    });
  });
});
