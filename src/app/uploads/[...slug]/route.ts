import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  if (!Array.isArray(slug) || slug.length === 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Prevent traversal
  if (slug.some((s) => s.includes("..") || s.includes("/"))) {
    return new NextResponse("Invalid path", { status: 400 });
  }

  const uploadDir = process.env.UPLOAD_DIR ?? "public/uploads";
  const filePath = path.join(process.cwd(), uploadDir, ...slug);

  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";

    const filename = slug[slug.length - 1];
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
