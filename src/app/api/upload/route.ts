import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/storage";
import { validateImageBuffer } from "@/lib/security/upload-validation";
import crypto from "crypto";
import path from "path";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB (Cloudflare Images limit)

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF, AVIF" },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 20MB" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Validate magic bytes — don't trust client MIME alone
  const validation = validateImageBuffer(buffer, ALLOWED_TYPES);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 }
    );
  }

  // Content-hash dedup: if we've seen this exact image before, return existing URL
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const existing = await prisma.imageAsset.findUnique({ where: { sha256 } });
  if (existing) {
    return NextResponse.json({ url: existing.url, deduplicated: true });
  }

  const ext = path.extname(file.name) || ".jpg";
  const filename = `${crypto.randomUUID()}${ext}`;

  const storage = getStorageProvider();
  const url = await storage.upload(buffer, filename, file.type, {
    userId: session.user.id,
    originalFilename: file.name,
  });

  // Store hash → URL mapping for future dedup
  await prisma.imageAsset.create({
    data: {
      sha256,
      url,
      bytes: buffer.length,
      contentType: file.type,
      uploaderId: session.user.id,
    },
  });

  return NextResponse.json({ url });
}
