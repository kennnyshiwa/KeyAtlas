/**
 * GET /api/cron/geekhack-scan
 *
 * Cron endpoint: triggers an automated Geekhack board scan and imports
 * new IC/GB topics as published KeyAtlas projects.
 *
 * Protection: requires a valid CRON_SECRET in the Authorization header.
 *
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Intended to be called by Vercel Cron, GitHub Actions, or any scheduler.
 */

import { NextRequest, NextResponse } from "next/server";
import { runGeekhackAutoImport } from "@/lib/import/geekhack-auto-import";

export const runtime = "nodejs"; // needs Node APIs (crypto, fs for storage, etc.)
export const maxDuration = 300; // 5-minute cap for Vercel Pro; adjust as needed

export async function GET(req: NextRequest) {
  // ── Auth check ────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[cron/geekhack-scan] CRON_SECRET env var is not set");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (token !== cronSecret) {
    console.warn("[cron/geekhack-scan] Unauthorized request — invalid or missing token");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Run import ────────────────────────────────────────────────────────────
  // Optional query params for testing: ?maxImports=2&maxPages=1
  const { searchParams } = new URL(req.url);
  const maxImports = searchParams.get("maxImports") ? Number(searchParams.get("maxImports")) : undefined;
  const maxPages = searchParams.get("maxPages") ? Number(searchParams.get("maxPages")) : undefined;
  const minTopicIdExclusive = searchParams.get("minTopicIdExclusive")
    ? Number(searchParams.get("minTopicIdExclusive"))
    : undefined;

  console.log(
    `[cron/geekhack-scan] Triggered — starting auto-import (maxImports=${maxImports ?? "∞"}, maxPages=${maxPages ?? 3}, minTopicIdExclusive=${minTopicIdExclusive ?? "latest-imported"})`
  );

  const startedAt = Date.now();

  try {
    const summary = await runGeekhackAutoImport({ maxImports, maxPages, minTopicIdExclusive });

    const durationMs = Date.now() - startedAt;

    console.log(
      `[cron/geekhack-scan] Complete in ${durationMs}ms — ` +
        `scanned=${summary.scanned} imported=${summary.imported} ` +
        `skipped=${summary.skipped} errors=${summary.errors.length}`
    );

    return NextResponse.json({
      ok: true,
      durationMs,
      ...summary,
    });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);

    console.error(`[cron/geekhack-scan] Fatal error after ${durationMs}ms:`, err);

    return NextResponse.json(
      {
        ok: false,
        durationMs,
        error: message,
      },
      { status: 500 }
    );
  }
}
