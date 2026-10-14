/**
 * GET /api/cron/image-mirror-retry
 *
 * Retries import images whose mirror to KeyAtlas storage failed at import time
 * (recorded in image_mirror_failures; the project hotlinks the original URL
 * meanwhile). On success, rewrites hero/gallery/description references that
 * still point at the source URL. See docs/image-mirror-retry.md.
 *
 * Query params:
 *   ?limit=25   Max due rows to attempt this run (default 25, max 100)
 *
 * Protection: requires CRON_SECRET in Authorization header.
 *
 *   Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from "next/server";
import {
  clampImageMirrorRetryLimit,
  getImageMirrorFailureCounts,
  retryFailedImageMirrors,
} from "@/lib/import/image-mirror-retry";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // --- Auth ---
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/image-mirror-retry] CRON_SECRET env var is not set");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token !== cronSecret) {
    console.warn("[cron/image-mirror-retry] Unauthorized request — invalid or missing token");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Params ---
  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get("limit");
  const limit = clampImageMirrorRetryLimit(limitParam ?? undefined);

  console.log(`[cron/image-mirror-retry] Triggered — limit=${limit}`);
  const startedAt = Date.now();

  try {
    const summary = await retryFailedImageMirrors({ limit });
    const counts = await getImageMirrorFailureCounts();
    const durationMs = Date.now() - startedAt;

    console.log(
      `[cron/image-mirror-retry] Complete in ${durationMs}ms — ` +
        `scanned=${summary.scanned} resolved=${summary.resolved} failed=${summary.failed} ` +
        `gaveUp=${summary.gaveUp} errors=${summary.errors.length} ` +
        `pending=${counts.pending} due=${counts.due} gaveUpTotal=${counts.gaveUp}`,
    );

    return NextResponse.json({ ok: true, durationMs, limit, ...summary, counts });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron/image-mirror-retry] Fatal error after ${durationMs}ms:`, err);
    return NextResponse.json({ ok: false, durationMs, error: message }, { status: 500 });
  }
}
