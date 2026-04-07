import { NextResponse } from "next/server";

// Direct upload bypasses content-hash dedup (the server never sees the bytes),
// which caused duplicate Cloudflare images. All clients should use /api/upload
// instead, which hashes, deduplicates, and records every image in ImageAsset.
// This endpoint is intentionally disabled.
export async function POST() {
  return NextResponse.json(
    { error: "Direct upload is disabled. Use /api/upload instead." },
    { status: 410 }
  );
}
