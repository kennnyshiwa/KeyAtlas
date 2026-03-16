/**
 * GET /api/cron/geekhack-backfill
 *
 * Resumable historical backfill: crawls deeper into Geekhack board listings
 * to import older topics. Designed to be called repeatedly (e.g. every 30 min)
 * and pick up where it left off.
 *
 * Query params:
 *   ?maxImports=10    Max new topics to import per run (default 10)
 *   ?maxPages=50      Max listing pages per board (default 50, ~1000 topics)
 *
 * Protection: requires CRON_SECRET in Authorization header.
 */

import { NextRequest, NextResponse } from "next/server";
import { runGeekhackAutoImport } from "@/lib/import/geekhack-auto-import";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const maxImports = searchParams.get("maxImports")
    ? Number(searchParams.get("maxImports"))
    : 10;
  const maxPages = searchParams.get("maxPages")
    ? Number(searchParams.get("maxPages"))
    : 50;

  console.log(
    `[cron/geekhack-backfill] Triggered — deep scan (maxImports=${maxImports}, maxPages=${maxPages})`
  );

  const startedAt = Date.now();

  try {
    const summary = await runGeekhackAutoImport({ maxImports, maxPages });
    const durationMs = Date.now() - startedAt;

    console.log(
      `[cron/geekhack-backfill] Complete in ${durationMs}ms — ` +
        `scanned=${summary.scanned} imported=${summary.imported} ` +
        `skipped=${summary.skipped} errors=${summary.errors.length}`
    );

    return NextResponse.json({ ok: true, durationMs, ...summary });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron/geekhack-backfill] Fatal error after ${durationMs}ms:`, err);
    return NextResponse.json({ ok: false, durationMs, error: message }, { status: 500 });
  }
}
