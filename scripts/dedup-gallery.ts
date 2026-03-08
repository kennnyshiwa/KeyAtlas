import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const dryRun = process.argv.includes("--dry-run");

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
      if (seen.has(img.url)) {
        dupeIds.push(img.id);
      } else {
        seen.add(img.url);
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
