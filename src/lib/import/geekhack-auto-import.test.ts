import { describe, it, expect } from "vitest";
import {
  buildLifecycleStableTitleKey,
  buildGeekhackTitleFingerprint,
  isConservativeLifecycleDuplicate,
  findHardDuplicateMatch,
  stripBrokenImageBlocksFromHtml,
} from "./geekhack-auto-import";

describe("buildLifecycleStableTitleKey", () => {
  it("matches IC/GB lifecycle title churn for same set", () => {
    const ic = buildLifecycleStableTitleKey("[IC] GMK Bordeaux - Final IC Update");
    const gb = buildLifecycleStableTitleKey("[GB] GMK Bordeaux - GB Live 03/09/2026");
    const shipping = buildLifecycleStableTitleKey("[GB] GMK Bordeaux [Now Shipping]");

    expect(ic).toBe("gmk bordeaux");
    expect(gb).toBe("gmk bordeaux");
    expect(shipping).toBe("gmk bordeaux");
  });

  it("keeps profile/manufacturer differences (GMK vs SA)", () => {
    const gmk = buildLifecycleStableTitleKey("[IC] GMK Cosmos - Final IC");
    const sa = buildLifecycleStableTitleKey("[IC] SA Cosmos - Final IC");

    expect(gmk).not.toBe(sa);
  });

  it("keeps materially distinct variants", () => {
    const pbt = buildLifecycleStableTitleKey("[IC] KKB Aurora PBT - GB starts May");
    const abs = buildLifecycleStableTitleKey("[IC] KKB Aurora ABS - GB starts May");

    expect(pbt).not.toBe(abs);
  });

  it("normalizes Key Kobo aliases for duplicate detection", () => {
    const spaced = buildLifecycleStableTitleKey("[GB] Key Kobo Nori Keycap Set");
    const collapsed = buildLifecycleStableTitleKey("[IC] KeyKobo Nori Keycap Set");
    const short = buildLifecycleStableTitleKey("[IC] KKB Nori Keycap Set");

    expect(spaced).toBe(collapsed);
    expect(collapsed).toBe(short);
  });

  it("keeps round/version token", () => {
    const r1 = buildLifecycleStableTitleKey("[IC] GMK Blossom R1");
    const r2 = buildLifecycleStableTitleKey("[IC] GMK Blossom R2 - GB Live");

    expect(r1).not.toBe(r2);
  });
});

describe("isConservativeLifecycleDuplicate", () => {
  it("matches same project lifecycle churn", () => {
    expect(
      isConservativeLifecycleDuplicate(
        "[IC] GMK Bordeaux - Final IC Update",
        "[GB] GMK Bordeaux - GB Live 03/09/2026"
      )
    ).toBe(true);
  });

  it("does not merge different profile families", () => {
    expect(
      isConservativeLifecycleDuplicate("[IC] GMK Cosmos", "[IC] SA Cosmos")
    ).toBe(false);
  });

  it("does not merge different materials", () => {
    expect(
      isConservativeLifecycleDuplicate("[IC] KKB Aurora PBT", "[IC] KKB Aurora ABS")
    ).toBe(false);
  });

  it("does not merge different rounds", () => {
    expect(
      isConservativeLifecycleDuplicate("[IC] GMK Blossom R1", "[IC] GMK Blossom R2")
    ).toBe(false);
  });

  it("merges Key Kobo alias churn for the same set", () => {
    expect(
      isConservativeLifecycleDuplicate(
        "[GB] Key Kobo Nori Keycap Set",
        "[IC] KeyKobo Nori Keycap Set"
      )
    ).toBe(true);
  });

  it("merges lifecycle title churn for WIND X98 R2", () => {
    expect(
      isConservativeLifecycleDuplicate(
        "WIND X98 R2,Southpaw available,GB 28th Dec to 11th Jan",
        "【IC】WIND X98 R2"
      )
    ).toBe(true);
  });

  it("merges product-family headline churn for Zoom75", () => {
    expect(
      isConservativeLifecycleDuplicate(
        "Zoom75 Update - GB ends on April 20",
        "ZOOM75 TIGA & PAD - Redefining Sound and Customization, GB Live!"
      )
    ).toBe(true);
  });
});

describe("buildGeekhackTitleFingerprint", () => {
  it("captures profile/material/round in fingerprint", () => {
    const fp = buildGeekhackTitleFingerprint("[IC] GMK Blossom ABS R2 - Final IC");
    expect(fp.brandOrProfile).toEqual(["abs", "gmk"]);
    expect(fp.productFamilyKey).toBe("gmk blossom abs r2");
    expect(fp.rounds).toEqual(["r2"]);
    expect(fp.tokens).toContain("blossom");
  });
});

describe("findHardDuplicateMatch", () => {
  it("blocks by Geekhack topic lineage even with URL variants", () => {
    const match = findHardDuplicateMatch(
      {
        topicId: "12345",
        title: "[GB] GMK Bordeaux",
        sourceUrls: ["https://geekhack.org/index.php?topic=12345.0"],
      },
      [
        {
          id: "p1",
          title: "[IC] GMK Bordeaux",
          links: [{ url: "https://geekhack.org/index.php?topic=12345.25" }],
        },
      ]
    );

    expect(match).toEqual({ projectId: "p1", reason: "topic-lineage" });
  });

  it("falls back to conservative title fingerprint match", () => {
    const match = findHardDuplicateMatch(
      {
        topicId: "77777",
        title: "[GB] GMK Bordeaux - GB Live 03/09/2026",
        sourceUrls: ["https://geekhack.org/index.php?topic=77777.0"],
      },
      [
        {
          id: "p2",
          title: "[IC] GMK Bordeaux - Final IC Update",
          links: [{ url: "https://geekhack.org/index.php?topic=55555.0" }],
        },
      ]
    );

    expect(match).toEqual({ projectId: "p2", reason: "title-fingerprint" });
  });

  it("blocks against a manual KeyAtlas project with no Geekhack link", () => {
    const match = findHardDuplicateMatch(
      {
        topicId: "126526",
        title: "DSS Distortion 40s",
        sourceUrls: ["https://geekhack.org/index.php?topic=126526.0"],
      },
      [
        {
          id: "manual-project",
          title: "DSS Distortion 40s",
          links: [],
        },
      ]
    );

    expect(match).toEqual({ projectId: "manual-project", reason: "title-fingerprint" });
  });

  it("stays conservative for distinct projects", () => {
    const match = findHardDuplicateMatch(
      {
        topicId: "11111",
        title: "[IC] SA Cosmos",
        sourceUrls: ["https://geekhack.org/index.php?topic=11111.0"],
      },
      [
        {
          id: "p3",
          title: "[IC] GMK Cosmos",
          links: [{ url: "https://geekhack.org/index.php?topic=22222.0" }],
        },
      ]
    );

    expect(match).toBeNull();
  });
});

describe("stripBrokenImageBlocksFromHtml", () => {
  it("removes unreachable gallery-style images but keeps nearby text", async () => {
    const html =
      '<strong>Kits</strong><br /><a href="https://example.com/kit.png"><img src="https://example.com/kit.png" class="bbc_img" /></a><br /><br /><strong>Renders</strong><br /><a href="https://example.com/render.png"><img src="https://example.com/render.png" class="bbc_img" /></a><br />Amano by h40';

    const cleaned = await stripBrokenImageBlocksFromHtml(html, async () => false);

    expect(cleaned).toContain("<strong>Kits</strong>");
    expect(cleaned).toContain("<strong>Renders</strong>");
    expect(cleaned).toContain("Amano by h40");
    expect(cleaned).not.toContain("https://example.com/kit.png");
    expect(cleaned).not.toContain("https://example.com/render.png");
  });

  it("keeps trusted postimg embeds even if server-side reachability checks fail", async () => {
    const html =
      '<strong>Kits</strong><br /><a href="https://i.postimg.cc/example/kit.png"><img src="https://i.postimg.cc/example/kit.png" class="bbc_img" /></a>';

    const cleaned = await stripBrokenImageBlocksFromHtml(html, async () => false);

    expect(cleaned).toContain("https://i.postimg.cc/example/kit.png");
  });
});
