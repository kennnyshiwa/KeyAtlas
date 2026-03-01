/**
 * Migrate existing local uploads to Cloudflare Images.
 * Run on prod host: docker compose exec -T app npx tsx scripts/migrate-uploads-to-cf.ts
 */
import { readFile, readdir } from "fs/promises";
import path from "path";
import { PrismaClient } from "../src/generated/prisma/client.js";
import crypto from "crypto";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_HASH = process.env.CLOUDFLARE_ACCOUNT_HASH;

if (!ACCOUNT_ID || !API_TOKEN || !ACCOUNT_HASH) {
  console.error("Missing CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, or CLOUDFLARE_ACCOUNT_HASH");
  process.exit(1);
}

const prisma = new PrismaClient();
const UPLOAD_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR ?? "public/uploads");

async function uploadToCF(buffer: Buffer, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([buffer]), filename);
  form.append("metadata", JSON.stringify({ source: "migration", originalFilename: filename }));

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/images/v1`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${API_TOKEN}` },
      body: form,
    }
  );

  const json = await res.json() as { success: boolean; result?: { id: string }; errors?: { message: string }[] };
  if (!json.success || !json.result?.id) {
    throw new Error(json.errors?.[0]?.message ?? "CF upload failed");
  }

  return `https://imagedelivery.net/${ACCOUNT_HASH}/${json.result.id}/public`;
}

async function main() {
  const files = await readdir(UPLOAD_DIR);
  const imageFiles = files.filter((f) => /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(f));

  console.log(`Found ${imageFiles.length} images to migrate`);

  for (const filename of imageFiles) {
    const localUrl = `/uploads/${filename}`;
    const filePath = path.join(UPLOAD_DIR, filename);

    try {
      const buffer = await readFile(filePath);
      const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

      // Check dedup
      const existing = await prisma.imageAsset.findUnique({ where: { sha256 } });
      if (existing) {
        console.log(`[dedup] ${filename} → ${existing.url}`);
        await updateAllReferences(localUrl, existing.url);
        continue;
      }

      console.log(`[upload] ${filename} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)...`);
      const cfUrl = await uploadToCF(buffer, filename);

      // Store in dedup table
      await prisma.imageAsset.create({
        data: {
          sha256,
          url: cfUrl,
          bytes: buffer.length,
          contentType: guessContentType(filename),
          uploaderId: await getFirstAdminId(),
        },
      });

      await updateAllReferences(localUrl, cfUrl);
      console.log(`[done] ${filename} → ${cfUrl}`);
    } catch (err) {
      console.error(`[error] ${filename}:`, err);
    }
  }

  console.log("Migration complete!");
  await prisma.$disconnect();
}

async function updateAllReferences(oldUrl: string, newUrl: string) {
  // Update hero images
  await prisma.project.updateMany({ where: { heroImage: oldUrl }, data: { heroImage: newUrl } });
  // Update gallery images
  await prisma.projectImage.updateMany({ where: { url: oldUrl }, data: { url: newUrl } });
  // Update vendor logos
  await prisma.vendor.updateMany({ where: { logoUrl: oldUrl }, data: { logoUrl: newUrl } });
}

function guessContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif",
  };
  return map[ext] ?? "image/jpeg";
}

let _adminId: string | null = null;
async function getFirstAdminId(): Promise<string> {
  if (_adminId) return _adminId;
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("No admin user found");
  _adminId = admin.id;
  return _adminId;
}

main();
