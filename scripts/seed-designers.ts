import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  // Get all distinct designer names from projects
  const rows = await prisma.project.findMany({
    where: {
      designer: { not: null },
      NOT: { designer: "" },
    },
    select: { designer: true },
    distinct: ["designer"],
  });

  const uniqueDesigners = rows
    .map((r) => r.designer!)
    .filter(Boolean);

  console.log(`Found ${uniqueDesigners.length} unique designer names in projects`);

  let created = 0;
  let skipped = 0;
  let linked = 0;

  for (const name of uniqueDesigners) {
    const slug = slugify(name);

    if (!slug) {
      console.warn(`  ⚠ Skipping "${name}" — slug is empty after sanitization`);
      skipped++;
      continue;
    }

    // Check if designer already exists
    const existing = await prisma.designer.findUnique({ where: { slug } });

    let designerId: string;

    if (existing) {
      console.log(`  ⏭ "${name}" (${slug}) already exists, skipping creation`);
      designerId = existing.id;
      skipped++;
    } else {
      const designer = await prisma.designer.create({
        data: { name, slug },
      });
      designerId = designer.id;
      created++;
    }

    // Link projects with this designer name to the Designer record
    const result = await prisma.project.updateMany({
      where: { designer: name, designerId: null },
      data: { designerId },
    });

    if (result.count > 0) {
      linked += result.count;
      console.log(`  ✓ "${name}" → linked ${result.count} project(s)`);
    }
  }

  console.log(`\nDone!`);
  console.log(`  Created: ${created} designers`);
  console.log(`  Skipped: ${skipped} (already existed or invalid slug)`);
  console.log(`  Linked:  ${linked} projects`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
