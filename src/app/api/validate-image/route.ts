import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const ALLOWED_HOSTS = [
  "i.imgur.com",
  "imgur.com",
  "i.redd.it",
  "preview.redd.it",
  "cdn.discordapp.com",
  "media.discordapp.net",
  "pbs.twimg.com",
  "lh3.googleusercontent.com",
  "picsum.photos",
  "fastly.picsum.photos",
  "i.postimg.cc",
  "images.unsplash.com",
  "cdn.shopify.com",
];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { url } = await req.json();

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  // Validate URL format
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Only allow HTTPS
  if (parsed.protocol !== "https:") {
    return NextResponse.json(
      { error: "Only HTTPS URLs are allowed" },
      { status: 400 }
    );
  }

  // Check against allowlist
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return NextResponse.json(
      {
        error: `Host not allowed. Supported: ${ALLOWED_HOSTS.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // HEAD request to verify it's actually an image
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
      redirect: "follow",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Could not reach image URL" },
        { status: 400 }
      );
    }

    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim();
    if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: "URL does not point to a valid image (JPEG, PNG, WebP, GIF)" },
        { status: 400 }
      );
    }

    return NextResponse.json({ valid: true, url });
  } catch {
    return NextResponse.json(
      { error: "Could not verify image URL" },
      { status: 400 }
    );
  }
}
