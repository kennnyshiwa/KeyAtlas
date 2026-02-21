#!/usr/bin/env npx tsx
import assert from "node:assert/strict";
import { followTargetExists } from "@/lib/follow/targets";

type FindUnique = (_args: unknown) => Promise<{ id: string } | null>;

function model(fn: FindUnique) {
  return { findUnique: fn };
}

const fakePrisma = {
  user: model(async () => null),
  project: model(async () => ({ id: "project-1" })),
  vendor: model(async () => null),
  forumThread: model(async () => null),
  forumCategory: model(async () => null),
} as const;

async function main() {
  const missingUser = await followTargetExists(fakePrisma as never, "USER", "missing");
  assert.equal(missingUser, false, "missing follow target should resolve as false (route can return 404, not 500)");

  const existingProject = await followTargetExists(fakePrisma as never, "PROJECT", "project-1");
  assert.equal(existingProject, true, "existing follow target should resolve as true");

  console.log("PASS qa-follow-target-validation");
}

main().catch((error) => {
  console.error("FAIL qa-follow-target-validation");
  console.error(error);
  process.exit(1);
});
