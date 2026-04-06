import { describe, it, expect } from "vitest";
import { buildLifecycleStableTitleKey } from "./geekhack-auto-import";

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
