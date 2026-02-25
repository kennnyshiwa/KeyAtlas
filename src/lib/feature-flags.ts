/**
 * Centralized feature flags.
 *
 * To re-enable project review requirement, set REQUIRE_PROJECT_REVIEW=true
 * in your environment or change the default below.
 */

/** When false, user-submitted projects are auto-published without admin review. */
export const REQUIRE_PROJECT_REVIEW =
  process.env.REQUIRE_PROJECT_REVIEW === "true";
