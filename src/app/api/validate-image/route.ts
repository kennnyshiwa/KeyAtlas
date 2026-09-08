import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { looksLikeImageUrl, IMAGE_EXTENSIONS } from "@/lib/image-url";
import { UrlSafetyError } from "@/lib/security/ssrf-guard";
import {
  ImageUrlValidationError,
  validateRemoteImage,
} from "@/lib/security/remote-image-validation";

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

  // Prefer HEAD, with one bounded Range GET fallback for hosts with flaky or
  // unsupported HEAD handling. safeFetch validates every redirect target.
  try {
    await validateRemoteImage(url);
    return NextResponse.json({ valid: true, url });
  } catch (error) {
    if (error instanceof ImageUrlValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof UrlSafetyError) {
      return NextResponse.json({ error: "Image URL is not allowed" }, { status: 400 });
    }
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return NextResponse.json({ error: "Image URL verification timed out" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Could not verify image URL" },
      { status: 400 }
    );
  }
}
