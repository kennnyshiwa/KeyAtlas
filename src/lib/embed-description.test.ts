import { describe, it, expect } from "vitest";
import { buildEmbedDescription } from "./embed-description";

describe("buildEmbedDescription", () => {
  it("formats status + category + profile", () => {
    expect(
      buildEmbedDescription({ status: "INTEREST_CHECK", category: "KEYCAPS", profile: "Cherry" })
    ).toBe("Interest Check - Keycaps - Cherry");
  });

  it("omits profile when null", () => {
    expect(
      buildEmbedDescription({ status: "GROUP_BUY", category: "KEYBOARDS", profile: null })
    ).toBe("Group Buy - Keyboards");
  });

  it("omits profile when undefined", () => {
    expect(
      buildEmbedDescription({ status: "COMPLETED", category: "DESKMATS" })
    ).toBe("Completed - Deskmats");
  });

  it("handles all status/category combos", () => {
    const result = buildEmbedDescription({ status: "EXTRAS", category: "ARTISANS", profile: "SA" });
    expect(result).toBe("Extras - Artisans - SA");
  });
});
