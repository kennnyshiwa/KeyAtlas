import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requestIdentity } from "@/lib/users/request-identity";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/storage";
import { validateImageBuffer } from "@/lib/security/upload-validation";
import { rateLimit, RATE_LIMIT_KEY_MGMT } from "@/lib/rate-limit";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/gif": "gif", "image/avif": "avif",
};
const MAX_SIZE = 2 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const user = await requestIdentity(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(user.id, "v1:users:me:avatar", RATE_LIMIT_KEY_MGMT);
  if (limited) return limited;
  let form: FormData;
  try {
    // Bound total multipart bytes too (including untrusted extra fields), before parsing.
    const reader = req.body?.getReader();
    if (!reader) throw new Error("Missing body");
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_SIZE + 64 * 1024) {
          await reader.cancel();
          return NextResponse.json({ error: "Multipart body too large" }, { status: 400 });
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": req.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!Object.hasOwn(EXTENSIONS, file.type)) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large. Maximum size is 2MB" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = validateImageBuffer(buffer, Object.keys(EXTENSIONS));
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  // Installed iOS labels raw PhotosPicker data JPEG, even for PNG/WebP/etc.
  // Both declared and actual types must be allowed; only detected bytes set the extension/MIME.
  const id = randomUUID();
  const filename = `avatar-${id}.${EXTENSIONS[validation.detectedMime]}`;
  let storage: ReturnType<typeof getStorageProvider>;
  let url: string;
  try {
    storage = getStorageProvider();
    url = await storage.upload(buffer, filename, validation.detectedMime, {
      userId: user.id, originalFilename: filename,
    });
  } catch {
    return NextResponse.json({ error: "Avatar storage failed" }, { status: 502 });
  }
  try {
    // Never accept userId, URL or paths from the multipart body. No cross-user dedup.
    await prisma.user.update({ where: { id: user.id }, data: { image: url } });
  } catch {
    try {
      await storage.delete(url);
    } catch {
      // Keep exact object identity in server logs for operational cleanup, no credentials.
      console.error("Avatar cleanup failed", { userId: user.id, url });
    }
    return NextResponse.json({ error: "Avatar save failed" }, { status: 500 });
  }
  // Do not delete a previous URL: it may be an OAuth image or shared legacy asset.
  return NextResponse.json({ url, id });
}
