import { describe, expect, it } from "vitest";
import { HEARTBREAKER_SLUG_REPAIR as repair, isReservedProjectSlug, projectSlugCandidates, projectSlugWhere } from "./project-slug-aliases";
describe("bounded project legacy slug alias", () => {
  it("resolves the old link by identity before/after repair and on rollback", () => {
    expect(projectSlugWhere(repair.oldSlug)).toEqual({ id: repair.id });
    expect(projectSlugWhere(repair.newSlug)).toEqual({ id: repair.id });
    expect(projectSlugWhere("%6E" + repair.oldSlug.slice(1))).toEqual({ id: repair.id });
  });
  it("does not rewrite intentional custom slugs", () => {
    for (const slug of ["my-intentional-custom-url"]) expect(projectSlugWhere(slug)).toEqual({ slug: { in: [slug] } });
  });
  it("reserves the old link against reassignment", () => {
    expect(isReservedProjectSlug(repair.oldSlug)).toBe(true);
    expect(isReservedProjectSlug(repair.oldSlug, "another")).toBe(true);
    expect(isReservedProjectSlug(repair.oldSlug, repair.id)).toBe(false);
    expect(isReservedProjectSlug("custom-url")).toBe(false);
  });
  it("retains Unicode lookup and malformed encoding tolerance", () => {
    expect(projectSlugCandidates("caf%C3%A9")).toContain("café");
    expect(projectSlugCandidates("café")).toContain("cafe\u0301");
    expect(projectSlugCandidates("bad%xx")).toEqual(["bad%xx"]);
  });
});
