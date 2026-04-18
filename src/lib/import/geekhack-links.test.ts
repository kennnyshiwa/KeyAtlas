import { describe, expect, it } from "vitest";
import {
  inferGeekhackLinkLabel,
  selectCanonicalGeekhackLink,
} from "./geekhack-links";

describe("inferGeekhackLinkLabel", () => {
  it("uses IC label for interest checks", () => {
    expect(inferGeekhackLinkLabel("INTEREST_CHECK")).toBe("Geekhack IC");
  });

  it("uses GB label for later lifecycle statuses", () => {
    expect(inferGeekhackLinkLabel("GROUP_BUY")).toBe("Geekhack GB");
    expect(inferGeekhackLinkLabel("IN_STOCK")).toBe("Geekhack GB");
  });
});

describe("selectCanonicalGeekhackLink", () => {
  it("prefers a GB link for group buys when both IC and GB threads exist", () => {
    const chosen = selectCanonicalGeekhackLink("GROUP_BUY", [
      { label: "Geekhack IC", url: "https://geekhack.org/index.php?topic=126466.0" },
      { label: "Geekhack GB", url: "https://geekhack.org/index.php?topic=126611.0" },
    ]);

    expect(chosen?.url).toBe("https://geekhack.org/index.php?topic=126611.0");
  });

  it("prefers an IC link for interest checks when both IC and GB threads exist", () => {
    const chosen = selectCanonicalGeekhackLink("INTEREST_CHECK", [
      { label: "Geekhack GB", url: "https://geekhack.org/index.php?topic=126536.0" },
      { label: "Geekhack IC", url: "https://geekhack.org/index.php?topic=125738.0" },
    ]);

    expect(chosen?.url).toBe("https://geekhack.org/index.php?topic=125738.0");
  });

  it("falls back to the newest topic id when labels do not break the tie", () => {
    const chosen = selectCanonicalGeekhackLink("GROUP_BUY", [
      { label: "Geekhack GB", url: "https://geekhack.org/index.php?topic=126531.0" },
      { label: "Geekhack GB", url: "https://geekhack.org/index.php?topic=122907.0" },
    ]);

    expect(chosen?.url).toBe("https://geekhack.org/index.php?topic=126531.0");
  });
});
