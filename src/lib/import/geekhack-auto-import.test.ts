import { describe, it, expect } from "vitest";
import {
  buildLifecycleStableTitleKey,
  buildGeekhackTitleFingerprint,
  isConservativeLifecycleDuplicate,
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
});

describe("buildGeekhackTitleFingerprint", () => {
  it("captures profile/material/round in fingerprint", () => {
    const fp = buildGeekhackTitleFingerprint("[IC] GMK Blossom ABS R2 - Final IC");
    expect(fp.brandOrProfile).toEqual(["abs", "gmk"]);
    expect(fp.rounds).toEqual(["r2"]);
    expect(fp.tokens).toContain("blossom");
  });
});
