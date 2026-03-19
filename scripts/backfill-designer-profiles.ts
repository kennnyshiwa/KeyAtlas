import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const args = process.argv.slice(2);
const hasFlag = (flag: string) => args.includes(flag);
const readNumArg = (flag: string, fallback: number) => {
  const idx = args.indexOf(flag);
  if (idx === -1) return fallback;
  const raw = args[idx + 1];
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : fallback;
};

const dryRun = hasFlag("--dry-run");
const limit = readNumArg("--limit", 50);
const minCount = readNumArg("--min-count", 2);

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

async function buildUniqueSlug(baseName: string): Promise<string> {
  const base = slugify(baseName) || "designer";

  const direct = await prisma.designer.findUnique({ where: { slug: base } });
  if (!direct) return base;

  let i = 2;
  while (i < 10_000) {
    const candidate = `${base}-${i}`;
    const existing = await prisma.designer.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
    i += 1;
  }

  throw new Error(`Unable to create unique slug for ${baseName}`);
}

async function main() {
  const grouped = await prisma.project.groupBy({
    by: ["designer"],
    where: {
      designer: { not: null },
      NOT: { designer: "" },
    },
    _count: { designer: true },
    orderBy: { _count: { designer: "desc" } },
    take: limit,
  });

  const candidates = grouped.filter(
    (entry): entry is { designer: string; _count: { designer: number } } =>
      !!entry.designer && entry._count.designer >= minCount
  );

  console.log(`Found ${candidates.length} candidate designer names (limit=${limit}, minCount=${minCount}).`);

  for (const candidate of candidates) {
    const name = candidate.designer.trim();

    const existing = await prisma.designer.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });

    let designerId = existing?.id;

    if (!designerId) {
      const slug = await buildUniqueSlug(name);
      console.log(`${dryRun ? "[dry-run] " : ""}create designer: ${name} (${slug})`);

      if (!dryRun) {
        const created = await prisma.designer.create({
          data: { name, slug },
          select: { id: true },
        });
        designerId = created.id;
      }
    }

    if (!designerId) continue;

    if (dryRun) {
      const count = await prisma.project.count({ where: { designer: name, designerId: null } });
      console.log(`[dry-run] link projects -> ${name}: ${count}`);
      continue;
    }

    const updated = await prisma.project.updateMany({
      where: { designer: name, designerId: null },
      data: { designerId },
    });

    console.log(`linked projects -> ${name}: ${updated.count}`);
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error("Failed to backfill designer profiles", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
