import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import path from "path";

const dryRun = process.argv.includes("--dry-run");

/** Extract the original filename from a mirrored upload URL.
 *  e.g. /uploads/uuid-uuid-uuid-uuid-uuid-OriginalName.jpeg → OriginalName.jpeg
 *  Falls back to full URL for non-upload paths. */
function imageKey(url: string): string {
  const base = path.basename(url);
  // UUID pattern: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx-OriginalFilename.ext
  const match = base.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(.+)$/i);
  return match ? match[1].toLowerCase() : url.toLowerCase();
}

async function main() {
  const projects = await prisma.project.findMany({
    include: { images: { orderBy: { order: "asc" } } },
  });

  let totalDupes = 0;

  for (const project of projects) {
    if (project.images.length < 2) continue;

    const seen = new Set<string>();
    const dupeIds: string[] = [];

    for (const img of project.images) {
      const key = imageKey(img.url);
      if (seen.has(key)) {
        dupeIds.push(img.id);
      } else {
        seen.add(key);
      }
    }

    if (dupeIds.length === 0) continue;

    totalDupes += dupeIds.length;
    console.log(
      `[${dryRun ? "dry-run" : "cleanup"}] ${project.slug}: ${project.images.length} images, removing ${dupeIds.length} duplicates`
    );

    if (!dryRun) {
      await prisma.projectImage.deleteMany({
        where: { id: { in: dupeIds } },
      });
    }
  }

  console.log(`Done. ${totalDupes} duplicate images ${dryRun ? "would be" : ""} removed.`);
}

main()
  .catch((e) => {
    console.error("Failed", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
