import { NextResponse } from "next/server";
import { readFile, realpath } from "fs/promises";
import path from "path";
import { detectImageType } from "@/lib/security/upload-validation";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  if (!Array.isArray(slug) || slug.length === 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Prevent traversal
  if (slug.some((s) => s.includes("..") || !/^[a-zA-Z0-9_.-]+$/.test(s))) {
    return new NextResponse("Invalid path", { status: 400 });
  }

  const uploadDir = process.env.UPLOAD_DIR ?? "public/uploads";
  const filePath = path.join(process.cwd(), uploadDir, ...slug);

  try {
    const root = await realpath(path.join(process.cwd(), uploadDir));
    const resolved = await realpath(filePath);
    if (!resolved.startsWith(root + path.sep)) {
      return new NextResponse("Invalid path", { status: 400 });
    }
    const data = await readFile(resolved);
    // Legacy /api/upload preserves filename extensions (e.g. .jfif). The
    // supported image signature, not the suffix, gates delivery and its MIME.
    const contentType = detectImageType(data);
    if (!contentType) return new NextResponse("Not found", { status: 404 });

    const filename = slug[slug.length - 1];
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
