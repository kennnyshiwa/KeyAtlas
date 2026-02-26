import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { looksLikeImageUrl, IMAGE_EXTENSIONS } from "@/lib/image-url";
import { safeFetch } from "@/lib/security/ssrf-guard";

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
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

  // Check that the URL path looks like an image file
  if (!looksLikeImageUrl(parsed.pathname)) {
    return NextResponse.json(
      {
        error:
          "URL does not look like an image. Supported extensions: " +
          IMAGE_EXTENSIONS.join(", "),
      },
      { status: 400 }
    );
  }

  // HEAD request to verify it's actually an image (with SSRF protection)
  try {
    const res = await safeFetch(url, { method: "HEAD", timeoutMs: 5000 });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Could not reach image URL" },
        { status: 400 }
      );
    }

    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim();
    if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: "URL does not point to a valid image (JPEG, PNG, WebP, GIF, AVIF)" },
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
